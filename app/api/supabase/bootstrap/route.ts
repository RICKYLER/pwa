import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@/lib/db/schema';
import { requireAuthenticatedUser } from '@/lib/server/auth-guards';
import { getSupabaseAdminClient, getSupabaseAdminConfig } from '@/lib/server/supabase-admin';
import { resolveSupabaseUserId } from '@/lib/server/supabase-user-ids';
import {
  listDisasterAlertRulesForUser,
  listDisasterAlertsForUser,
} from '@/lib/server/disaster-alerts';
import {
  SUPABASE_BOOTSTRAP_TABLES,
  type SupabaseBootstrapTable,
} from '@/lib/supabase/row-mapper';
import { buildDistributionNotificationBody } from '@/lib/distribution-notifications';
import {
  collectResidentAllowedBarangayIds,
  isDistributionEventVisibleToResident,
} from '@/lib/distribution-event-visibility';
import { isLegacySampleIncident } from '@/lib/incident-filters';

export const runtime = 'nodejs';

type BootstrapPayload = Partial<Record<SupabaseBootstrapTable, unknown[]>>;
const VALID_BOOTSTRAP_TABLES = new Set<SupabaseBootstrapTable>(
  SUPABASE_BOOTSTRAP_TABLES.map((entry) => entry.table),
);

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

function isMissingTableError(error: { message?: string | null } | null | undefined, tableName: string) {
  if (!error?.message) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes(tableName.toLowerCase())
    && (
      message.includes('does not exist')
      || message.includes('could not find the table')
      || message.includes('schema cache')
    )
  );
}

function isMissingColumnError(
  error: { message?: string | null } | null | undefined,
  tableName: string,
  columnName: string,
) {
  if (!error?.message) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes(tableName.toLowerCase())
    && message.includes(columnName.toLowerCase())
    && (
      message.includes('does not exist')
      || message.includes('schema cache')
      || message.includes('could not find')
    )
  );
}

function parseRequestedTables(request: NextRequest) {
  const rawTables = request.nextUrl.searchParams.get('tables');
  if (!rawTables) {
    return null;
  }

  const tables = uniqueStrings(rawTables.split(',').map((value) => value.trim()));
  return tables.filter((value): value is SupabaseBootstrapTable => (
    VALID_BOOTSTRAP_TABLES.has(value as SupabaseBootstrapTable)
  ));
}

async function loadHouseholds(user: User, remoteUserId: string | null) {
  const supabase = getSupabaseAdminClient();

  if (user.role === 'admin') {
    const { data, error } = await supabase
      .from('households')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  if (user.role === 'resident') {
    const residentFilters = uniqueStrings([
      remoteUserId ? `applicant_user_id.eq.${remoteUserId}` : null,
      user.email ? `applicant_email.eq.${user.email}` : null,
    ]);

    if (!residentFilters.length) {
      return [];
    }

    const { data, error } = await supabase
      .from('households')
      .select('*')
      .or(residentFilters.join(','))
      .order('updated_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  const { data, error } = await supabase
    .from('households')
    .select('*')
    .eq('barangay_id', user.barangay_id)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadAllResidents() {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('residents')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadResidentsForHouseholds(householdIds: string[]) {
  if (!householdIds.length) return [];

  const supabase = getSupabaseAdminClient();
  const CHUNK_SIZE = 200;
  if (householdIds.length <= CHUNK_SIZE) {
    const { data, error } = await supabase
      .from('residents')
      .select('*')
      .in('household_id', householdIds)
      .order('updated_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  const chunks: string[][] = [];
  for (let i = 0; i < householdIds.length; i += CHUNK_SIZE) {
    chunks.push(householdIds.slice(i, i + CHUNK_SIZE));
  }

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await supabase
        .from('residents')
        .select('*')
        .in('household_id', chunk);
      if (error) throw new Error(error.message);
      return data ?? [];
    }),
  );

  return results.flat().sort((a, b) => {
    const aTime = new Date((a.updated_at as string) || 0).getTime();
    const bTime = new Date((b.updated_at as string) || 0).getTime();
    return bTime - aTime;
  });
}

async function loadAllVulnerabilityFlags() {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('vulnerability_flags')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadVulnerabilityFlags(residentIds: string[]) {
  if (!residentIds.length) {
    return [];
  }

  const supabase = getSupabaseAdminClient();
  const CHUNK_SIZE = 200;
  if (residentIds.length <= CHUNK_SIZE) {
    const { data, error } = await supabase
      .from('vulnerability_flags')
      .select('*')
      .in('resident_id', residentIds)
      .order('updated_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  const chunks: string[][] = [];
  for (let i = 0; i < residentIds.length; i += CHUNK_SIZE) {
    chunks.push(residentIds.slice(i, i + CHUNK_SIZE));
  }

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await supabase
        .from('vulnerability_flags')
        .select('*')
        .in('resident_id', chunk);
      if (error) throw new Error(error.message);
      return data ?? [];
    }),
  );

  return results.flat().sort((a, b) => {
    const aTime = new Date((a.updated_at as string) || 0).getTime();
    const bTime = new Date((b.updated_at as string) || 0).getTime();
    return bTime - aTime;
  });
}

async function loadPrograms() {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('programs')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadBeneficiaries(user: User, residentIds: string[]) {
  const supabase = getSupabaseAdminClient();

  if (user.role !== 'admin' && residentIds.length === 0) {
    return [];
  }

  let query = supabase
    .from('beneficiaries')
    .select('*')
    .order('enrollment_date', { ascending: false });

  if (user.role !== 'admin') {
    query = query.in('resident_id', residentIds);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadLocationMasters(user: User) {
  const supabase = getSupabaseAdminClient();
  const query = supabase
    .from('location_master_lists')
    .select('*');

  const { data, error } = user.role === 'admin'
    ? await query.order('barangay_name', { ascending: true })
    : await query.eq('barangay_id', user.barangay_id).order('barangay_name', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadPurokRiskProfiles(user: User) {
  const supabase = getSupabaseAdminClient();
  const query = supabase
    .from('purok_risk_profiles')
    .select('*');

  const { data, error } = user.role === 'admin'
    ? await query.order('purok_sitio', { ascending: true })
    : await query.eq('barangay_id', user.barangay_id).order('purok_sitio', { ascending: true });

  if (error) {
    if (isMissingTableError(error, 'purok_risk_profiles')) {
      return [];
    }

    throw new Error(error.message);
  }

  return data ?? [];
}

async function loadEvacuationCenters(user: User) {
  const supabase = getSupabaseAdminClient();
  const query = supabase
    .from('evacuation_centers')
    .select('*');

  const { data, error } = user.role === 'admin'
    ? await query.order('name', { ascending: true })
    : await query.eq('barangay_id', user.barangay_id).order('name', { ascending: true });

  if (error) {
    if (isMissingTableError(error, 'evacuation_centers')) {
      return [];
    }

    throw new Error(error.message);
  }

  return data ?? [];
}

async function loadInventoryBundle() {
  const supabase = getSupabaseAdminClient();
  const [items, movements, templates] = await Promise.all([
    supabase.from('inventory_items').select('*').order('item_name', { ascending: true }),
    supabase.from('inventory_movements').select('*').order('timestamp', { ascending: false }).limit(300),
    supabase.from('package_templates').select('*').order('name', { ascending: true }),
  ]);

  const error = items.error || movements.error || templates.error;
  if (error) throw new Error(error.message);

  return {
    inventory_items: items.data ?? [],
    inventory_movements: movements.data ?? [],
    package_templates: templates.data ?? [],
  };
}

async function loadDistributionEvents(user: User) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('distribution_events')
    .select('*')
    .order('scheduled_date', { ascending: false });

  if (error) throw new Error(error.message);

  const events = data ?? [];
  const creatorIdsNeedingBarangay = uniqueStrings(events.map((event) => {
    const barangayId = typeof event.barangay_id === 'string' ? event.barangay_id.trim() : '';
    if (barangayId) {
      return null;
    }

    return typeof event.created_by === 'string' ? event.created_by : null;
  }));

  if (!creatorIdsNeedingBarangay.length) {
    return user.role === 'admin'
      ? events
      : events.filter((event) => (
        typeof event.barangay_id === 'string'
        && event.barangay_id.trim() === user.barangay_id
      ));
  }

  const { data: creatorProfiles, error: creatorProfilesError } = await supabase
    .from('users')
    .select('id, barangay_id')
    .in('id', creatorIdsNeedingBarangay);

  if (creatorProfilesError) {
    throw new Error(creatorProfilesError.message);
  }

  const creatorBarangayMap = new Map<string, string>();
  for (const profile of creatorProfiles ?? []) {
    if (typeof profile.id === 'string' && typeof profile.barangay_id === 'string' && profile.barangay_id.trim()) {
      creatorBarangayMap.set(profile.id, profile.barangay_id.trim());
    }
  }

  const hydratedEvents = events.map((event) => {
    const existingBarangayId = typeof event.barangay_id === 'string' ? event.barangay_id.trim() : '';
    if (existingBarangayId) {
      return event;
    }

    const createdBy = typeof event.created_by === 'string' ? event.created_by : '';
    const derivedBarangayId = creatorBarangayMap.get(createdBy) ?? '';

    return {
      ...event,
      barangay_id: derivedBarangayId,
    };
  });

  if (user.role === 'admin') {
    return hydratedEvents;
  }

  return hydratedEvents.filter((event) => (
    typeof event.barangay_id === 'string'
    && event.barangay_id.trim() === user.barangay_id
  ));
}

async function loadDistributionRecords() {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('distribution_records')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(600);

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadDistributionRecordsForResidentScope(householdIds: string[], residentIds: string[]) {
  if (!householdIds.length && !residentIds.length) {
    return [];
  }

  const supabase = getSupabaseAdminClient();
  const filters = [
    householdIds.length ? `household_id.in.(${householdIds.join(',')})` : '',
    residentIds.length ? `resident_id.in.(${residentIds.join(',')})` : '',
  ].filter(Boolean);

  const { data, error } = await supabase
    .from('distribution_records')
    .select('*')
    .or(filters.join(','))
    .order('timestamp', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadIncidents() {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .order('reported_at', { ascending: false })
    .limit(300);

  if (error) throw new Error(error.message);
  return (data ?? []).filter((incident) => !isLegacySampleIncident({
    id: typeof incident.id === 'string' ? incident.id : '',
    type: incident.type,
    location: incident.location,
    description: incident.description,
  }));
}

async function loadAuditLogs(remoteUserId: string | null, role: User['role']) {
  const supabase = getSupabaseAdminClient();
  const query = supabase
    .from('audit_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(250);

  if (role === 'admin') {
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  if (!remoteUserId) {
    return [];
  }

  const { data, error } = await query.eq('user_id', remoteUserId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadDerivedDistributionNotifications(
  user: User,
  notificationUserId: string | null,
  options?: {
    excludeEventIds?: string[];
  },
) {
  if (user.role !== 'resident' || !notificationUserId) {
    return [];
  }

  const supabase = getSupabaseAdminClient();

  // A resident should only see events for their own barangay: their user
  // profile's barangay plus any barangay they have an approved household in.
  // Without this filter, every resident (including brand-new accounts from
  // other barangays) receives a notification — and QR access — for every
  // event in the system.
  const { data: linkedHouseholds, error: linkedHouseholdsError } = await supabase
    .from('households')
    .select('barangay_id')
    .eq('applicant_user_id', notificationUserId)
    .eq('status', 'active')
    .eq('registration_status', 'approved');

  if (linkedHouseholdsError) {
    throw new Error(linkedHouseholdsError.message);
  }

  const allowedBarangayIds = collectResidentAllowedBarangayIds(
    user,
    (linkedHouseholds ?? []).map((household) => household.barangay_id),
  );

  const { data, error } = await supabase
    .from('distribution_events')
    .select('id,barangay_id,event_name,type,target_scope,target_group,location,scheduled_date,status,notes')
    .order('scheduled_date', { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  const excludedIds = new Set(options?.excludeEventIds ?? []);

  return (data ?? [])
    .filter((event) => (
      typeof event.id === 'string'
      && !excludedIds.has(event.id)
      && isDistributionEventVisibleToResident(event, allowedBarangayIds)
    ))
    .map((event) => ({
      id: `legacy_dist_notice_${event.id}`,
      user_id: notificationUserId,
      event_id: event.id,
      type: 'distribution_event',
      title: event.event_name,
      body: buildDistributionNotificationBody(event),
      payload: {
        event_id: event.id,
        event_name: event.event_name,
        type: event.type,
        status: event.status,
        target_scope: event.target_scope,
        target_group: event.target_group,
        scheduled_date: event.scheduled_date,
        location: event.location,
        ...(typeof event.notes === 'string' && event.notes.trim()
          ? { notes: event.notes.trim() }
          : {}),
      },
      read_at: null,
      created_at: typeof event.scheduled_date === 'string'
        ? new Date(`${event.scheduled_date}T00:00:00.000Z`).toISOString()
        : new Date().toISOString(),
      updated_at: typeof event.scheduled_date === 'string'
        ? new Date(`${event.scheduled_date}T00:00:00.000Z`).toISOString()
        : new Date().toISOString(),
    }));
}

async function loadUserNotifications(
  user: User,
  remoteUserId: string | null,
) {
  if (!['resident', 'admin', 'responder'].includes(user.role)) {
    return [];
  }

  const notificationUserId = remoteUserId ?? user.id;
  if (!remoteUserId) {
    return loadDerivedDistributionNotifications(user, notificationUserId);
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('user_notifications')
    .select('*')
    .eq('user_id', remoteUserId)
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingTableError(error, 'user_notifications')) {
      return loadDerivedDistributionNotifications(user, notificationUserId);
    }

    throw new Error(error.message);
  }

  const storedNotifications = data ?? [];
  const existingEventIds = uniqueStrings(storedNotifications.map((notification) => {
    if (!notification || typeof notification !== 'object' || !('payload' in notification)) {
      return null;
    }

    const payload = notification.payload;
    return payload && typeof payload === 'object' && 'event_id' in payload && typeof payload.event_id === 'string'
      ? payload.event_id
      : null;
  }));

  const derivedNotifications = await loadDerivedDistributionNotifications(user, remoteUserId, {
    excludeEventIds: existingEventIds,
  }).catch(() => []);

  return [...storedNotifications, ...derivedNotifications].sort((left, right) => {
    const leftDate = typeof left.created_at === 'string' ? new Date(left.created_at).getTime() : 0;
    const rightDate = typeof right.created_at === 'string' ? new Date(right.created_at).getTime() : 0;
    return rightDate - leftDate;
  });
}

async function loadSoloParents(user: User, residentIds: string[]) {
  const supabase = getSupabaseAdminClient();
  const query = supabase
    .from('solo_parents')
    .select('*')
    .order('created_at', { ascending: false });

  if (user.role === 'resident') {
    if (!residentIds.length) {
      return [];
    }
    const { data, error } = await query.in('resident_id', residentIds);
    if (error) {
      if (isMissingTableError(error, 'solo_parents')) {
        return [];
      }
      throw new Error(error.message);
    }
    return data ?? [];
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error, 'solo_parents')) {
      return [];
    }
    throw new Error(error.message);
  }
  return data ?? [];
}

async function loadCases(user: User) {
  if (user.role !== 'admin' && user.role !== 'social_worker') {
    return [];
  }
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('cases')
    .select('*')
    .order('reported_at', { ascending: false });

  if (error) {
    if (isMissingTableError(error, 'cases')) return [];
    throw new Error(error.message);
  }
  return data ?? [];
}

async function loadCaseNotes(user: User) {
  if (user.role !== 'admin' && user.role !== 'social_worker') {
    return [];
  }
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('case_notes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingTableError(error, 'case_notes')) return [];
    throw new Error(error.message);
  }
  return data ?? [];
}

async function loadCaseAttachments(user: User) {
  if (user.role !== 'admin' && user.role !== 'social_worker') {
    return [];
  }
  const supabase = getSupabaseAdminClient();
  // EXCLUDE the heavy file_url base64 blob from bulk bootstrap query
  const { data, error } = await supabase
    .from('case_attachments')
    .select('id, case_id, file_name, file_type, file_size, document_type, uploaded_by, uploaded_at')
    .order('uploaded_at', { ascending: false });

  if (error) {
    if (isMissingTableError(error, 'case_attachments')) return [];
    throw new Error(error.message);
  }

  // Provide lightweight on-demand URL for downloading/opening
  return (data ?? []).map((att) => ({
    ...att,
    file_url: `/api/cases/attachment-file?id=${att.id}`,
  }));
}

async function buildBootstrapPayload(
  user: User,
  requestedTables?: SupabaseBootstrapTable[],
): Promise<BootstrapPayload> {
  const payload: BootstrapPayload = {};
  const requestedTableSet = requestedTables?.length ? new Set(requestedTables) : null;
  const wants = (table: SupabaseBootstrapTable) => !requestedTableSet || requestedTableSet.has(table);
  const isAdmin = user.role === 'admin';
  const isResident = user.role === 'resident';

  const needsHouseholds = wants('households')
    || (!isAdmin && (wants('residents') || wants('vulnerability_flags') || wants('beneficiaries') || (wants('solo_parents') && isResident)));
  const needsResidents = wants('residents')
    || (!isAdmin && (wants('vulnerability_flags') || wants('beneficiaries') || (wants('solo_parents') && isResident)));

  const shouldResolveRemoteUserId = getSupabaseAdminConfig().isConfigured && (
    wants('audit_logs')
    || wants('user_notifications')
    || (needsHouseholds && isResident)
  );

  const canReadInventory = isAdmin || user.role === 'encoder';
  const canReadDistributionEvents = isAdmin || user.role === 'encoder' || user.role === 'responder';
  const canReadDistributionRecords = isAdmin || user.role === 'encoder';
  const canReadIncidents = ['admin', 'encoder', 'responder'].includes(user.role);
  const canReadDisasterAlertRules = ['admin', 'responder'].includes(user.role);
  const canReadDisasterAlerts = ['admin', 'responder'].includes(user.role);
  const canReadEvacuationCenters = ['admin', 'responder'].includes(user.role);

  const remoteUserId = shouldResolveRemoteUserId
    ? await resolveSupabaseUserId(user.id).catch(() => null)
    : null;

  // Independent queries fired concurrently from the start:
  const programsPromise = wants('programs') ? loadPrograms() : null;
  const locationMasterPromise = wants('location_master_lists') ? loadLocationMasters(user) : null;
  const purokRiskProfilesPromise = wants('purok_risk_profiles') ? loadPurokRiskProfiles(user) : null;
  const evacuationCentersPromise = wants('evacuation_centers') && canReadEvacuationCenters
    ? loadEvacuationCenters(user)
    : null;
  const auditLogsPromise = wants('audit_logs') ? loadAuditLogs(remoteUserId, user.role) : null;
  const incidentsPromise = wants('incidents') && canReadIncidents ? loadIncidents() : null;
  const disasterAlertRulesPromise = wants('disaster_alert_rules') && canReadDisasterAlertRules
    ? listDisasterAlertRulesForUser(user)
    : null;
  const disasterAlertsPromise = wants('disaster_alerts') && canReadDisasterAlerts
    ? listDisasterAlertsForUser(user)
    : null;
  const distributionEventsPromise = wants('distribution_events') && canReadDistributionEvents
    ? loadDistributionEvents(user)
    : null;
  const distributionRecordsPromise = wants('distribution_records') && canReadDistributionRecords
    ? loadDistributionRecords()
    : null;
  const inventoryBundlePromise = canReadInventory && (
    wants('inventory_items')
    || wants('inventory_movements')
    || wants('package_templates')
  )
    ? loadInventoryBundle()
    : null;
  const casesPromise = wants('cases') ? loadCases(user) : null;
  const caseNotesPromise = wants('case_notes') ? loadCaseNotes(user) : null;
  const caseAttachmentsPromise = wants('case_attachments') ? loadCaseAttachments(user) : null;

  // Solo parents for non-residents does not depend on residentIds:
  const soloParentsNonResidentPromise = wants('solo_parents') && !isResident
    ? loadSoloParents(user, [])
    : null;

  // For Admin: households, residents, vulnerability_flags, beneficiaries run simultaneously:
  const adminHouseholdsPromise = isAdmin && wants('households')
    ? loadHouseholds(user, remoteUserId)
    : null;
  const adminResidentsPromise = isAdmin && wants('residents')
    ? loadAllResidents()
    : null;
  const adminVulnerabilityFlagsPromise = isAdmin && wants('vulnerability_flags')
    ? loadAllVulnerabilityFlags()
    : null;
  const adminBeneficiariesPromise = isAdmin && wants('beneficiaries')
    ? loadBeneficiaries(user, [])
    : null;

  if (isAdmin) {
    const [
      adminHouseholds,
      adminResidents,
      adminVulnerabilityFlags,
      adminBeneficiaries,
    ] = await Promise.all([
      adminHouseholdsPromise ?? Promise.resolve([]),
      adminResidentsPromise ?? Promise.resolve([]),
      adminVulnerabilityFlagsPromise ?? Promise.resolve([]),
      adminBeneficiariesPromise ?? Promise.resolve([]),
    ]);

    if (wants('households')) payload.households = adminHouseholds;
    if (wants('residents')) payload.residents = adminResidents;
    if (wants('vulnerability_flags')) payload.vulnerability_flags = adminVulnerabilityFlags;
    if (wants('beneficiaries')) payload.beneficiaries = adminBeneficiaries;
  } else {
    let households: Record<string, unknown>[] = [];
    let householdIds: string[] = [];
    if (needsHouseholds) {
      households = await loadHouseholds(user, remoteUserId);
      householdIds = households
        .map((household) => (typeof household.id === 'string' ? household.id : ''))
        .filter(Boolean);
    }

    if (wants('households')) {
      payload.households = households;
    }

    let residents: Record<string, unknown>[] = [];
    let residentIds: string[] = [];
    if (needsResidents) {
      residents = await loadResidentsForHouseholds(householdIds);
      residentIds = residents
        .map((resident) => (typeof resident.id === 'string' ? resident.id : ''))
        .filter(Boolean);
    }

    if (wants('residents')) {
      payload.residents = residents;
    }

    const [
      vulnerabilityFlags,
      beneficiaries,
      residentSoloParents,
      residentDistributionRecords,
      userNotifications,
    ] = await Promise.all([
      wants('vulnerability_flags') ? loadVulnerabilityFlags(residentIds) : Promise.resolve([]),
      wants('beneficiaries') ? loadBeneficiaries(user, residentIds) : Promise.resolve([]),
      wants('solo_parents') && isResident ? loadSoloParents(user, residentIds) : Promise.resolve([]),
      wants('distribution_records') && isResident
        ? loadDistributionRecordsForResidentScope(householdIds, residentIds)
        : Promise.resolve([]),
      wants('user_notifications') && isResident
        ? loadUserNotifications(user, remoteUserId)
        : Promise.resolve([]),
    ]);

    if (wants('vulnerability_flags')) payload.vulnerability_flags = vulnerabilityFlags;
    if (wants('beneficiaries')) payload.beneficiaries = beneficiaries;
    if (wants('solo_parents') && isResident) payload.solo_parents = residentSoloParents;
    if (wants('distribution_records') && isResident) payload.distribution_records = residentDistributionRecords;
    if (wants('user_notifications') && isResident) payload.user_notifications = userNotifications;
  }

  // Resolve all concurrently running promises
  const [
    soloParentsNonResident,
    cases,
    caseNotes,
    caseAttachments,
    programs,
    locationMasters,
    purokRiskProfiles,
    evacuationCenters,
    auditLogs,
    inventoryBundle,
    distributionEvents,
    distributionRecords,
    incidents,
    disasterAlertRules,
    disasterAlerts,
  ] = await Promise.all([
    soloParentsNonResidentPromise ?? Promise.resolve(null),
    casesPromise ?? Promise.resolve(null),
    caseNotesPromise ?? Promise.resolve(null),
    caseAttachmentsPromise ?? Promise.resolve(null),
    programsPromise ?? Promise.resolve(null),
    locationMasterPromise ?? Promise.resolve(null),
    purokRiskProfilesPromise ?? Promise.resolve(null),
    evacuationCentersPromise ?? Promise.resolve(null),
    auditLogsPromise ?? Promise.resolve(null),
    inventoryBundlePromise ?? Promise.resolve(null),
    distributionEventsPromise ?? Promise.resolve(null),
    distributionRecordsPromise ?? Promise.resolve(null),
    incidentsPromise ?? Promise.resolve(null),
    disasterAlertRulesPromise ?? Promise.resolve(null),
    disasterAlertsPromise ?? Promise.resolve(null),
  ]);

  if (soloParentsNonResident !== null) payload.solo_parents = soloParentsNonResident;
  if (cases !== null) payload.cases = cases;
  if (caseNotes !== null) payload.case_notes = caseNotes;
  if (caseAttachments !== null) payload.case_attachments = caseAttachments;
  if (programs !== null) payload.programs = programs;
  if (locationMasters !== null) payload.location_master_lists = locationMasters;
  if (purokRiskProfiles !== null) payload.purok_risk_profiles = purokRiskProfiles;
  if (evacuationCenters !== null) payload.evacuation_centers = evacuationCenters;
  if (auditLogs !== null) payload.audit_logs = auditLogs;
  if (inventoryBundle !== null) {
    if (wants('inventory_items')) payload.inventory_items = inventoryBundle.inventory_items;
    if (wants('inventory_movements')) payload.inventory_movements = inventoryBundle.inventory_movements;
    if (wants('package_templates')) payload.package_templates = inventoryBundle.package_templates;
  }
  if (distributionEvents !== null) payload.distribution_events = distributionEvents;
  if (distributionRecords !== null) payload.distribution_records = distributionRecords;
  if (incidents !== null) payload.incidents = incidents;
  if (disasterAlertRules !== null) payload.disaster_alert_rules = disasterAlertRules;
  if (disasterAlerts !== null) payload.disaster_alerts = disasterAlerts;

  if (isAdmin && wants('user_notifications')) {
    payload.user_notifications = [];
  }

  return payload;
}

type ServerCacheEntry = {
  timestamp: number;
  payload: BootstrapPayload;
};

const SERVER_CACHE_TTL_MS = 6_000;
const serverBootstrapCache = new Map<string, ServerCacheEntry>();

export async function GET(request: NextRequest) {
  const authResult = await requireAuthenticatedUser(request);
  if ('response' in authResult) {
    return authResult.response;
  }

  if (!getSupabaseAdminConfig().isConfigured) {
    return NextResponse.json(
      { error: 'Supabase is not configured.' },
      { status: 503 },
    );
  }

  try {
    const requestedTables = parseRequestedTables(request);
    if (request.nextUrl.searchParams.has('tables') && requestedTables && requestedTables.length === 0) {
      return NextResponse.json(
        { error: 'No valid bootstrap tables were requested.' },
        { status: 400 },
      );
    }

    const cacheKey = `${authResult.user.id}:${authResult.user.role}:${requestedTables?.slice().sort().join(',') ?? 'ALL'}`;
    const now = Date.now();
    const cached = serverBootstrapCache.get(cacheKey);
    if (cached && now - cached.timestamp < SERVER_CACHE_TTL_MS) {
      return NextResponse.json(cached.payload, {
        headers: {
          'Cache-Control': 'private, max-age=5, stale-while-revalidate=30',
          'X-Bootstrap-Cache': 'HIT',
        },
      });
    }

    const payload = await buildBootstrapPayload(authResult.user, requestedTables ?? undefined);
    serverBootstrapCache.set(cacheKey, { timestamp: now, payload });

    if (serverBootstrapCache.size > 200) {
      for (const [k, v] of serverBootstrapCache.entries()) {
        if (now - v.timestamp > SERVER_CACHE_TTL_MS * 2) {
          serverBootstrapCache.delete(k);
        }
      }
    }

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'private, max-age=5, stale-while-revalidate=30',
        'X-Bootstrap-Cache': 'MISS',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to load Supabase bootstrap payload.',
      },
      { status: 500 },
    );
  }
}
