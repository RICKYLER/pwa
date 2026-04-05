import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@/lib/db/schema';
import { requireAuthenticatedUser } from '@/lib/server/auth-guards';
import { getSupabaseAdminClient, getSupabaseAdminConfig } from '@/lib/server/supabase-admin';
import { resolveSupabaseUserId } from '@/lib/server/supabase-user-ids';
import {
  SUPABASE_BOOTSTRAP_TABLES,
  type SupabaseBootstrapTable,
} from '@/lib/supabase/row-mapper';

export const runtime = 'nodejs';

type BootstrapPayload = Partial<Record<SupabaseBootstrapTable, unknown[]>>;
const VALID_BOOTSTRAP_TABLES = new Set<SupabaseBootstrapTable>(
  SUPABASE_BOOTSTRAP_TABLES.map((entry) => entry.table),
);

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
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

async function loadResidentsForHouseholds(householdIds: string[]) {
  if (!householdIds.length) return [];

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('residents')
    .select('*')
    .in('household_id', householdIds)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadVulnerabilityFlags(residentIds: string[], role: User['role']) {
  if (!residentIds.length || !['admin', 'encoder', 'health_worker', 'responder'].includes(role)) {
    return [];
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('vulnerability_flags')
    .select('*')
    .in('resident_id', residentIds)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
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

async function loadInventoryBundle() {
  const supabase = getSupabaseAdminClient();
  const [items, movements, templates] = await Promise.all([
    supabase.from('inventory_items').select('*').order('item_name', { ascending: true }),
    supabase.from('inventory_movements').select('*').order('timestamp', { ascending: false }),
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

async function loadDistributionEvents() {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('distribution_events')
    .select('*')
    .order('scheduled_date', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadDistributionRecords() {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('distribution_records')
    .select('*')
    .order('timestamp', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadIncidents() {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .order('reported_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
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

async function buildBootstrapPayload(
  user: User,
  requestedTables?: SupabaseBootstrapTable[],
): Promise<BootstrapPayload> {
  const payload: BootstrapPayload = {};
  const requestedTableSet = requestedTables?.length ? new Set(requestedTables) : null;
  const wants = (table: SupabaseBootstrapTable) => !requestedTableSet || requestedTableSet.has(table);
  const needsHouseholds = wants('households')
    || wants('residents')
    || wants('vulnerability_flags')
    || wants('beneficiaries');
  const needsResidents = wants('residents')
    || wants('vulnerability_flags')
    || wants('beneficiaries');
  const shouldResolveRemoteUserId = getSupabaseAdminConfig().isConfigured && (
    wants('audit_logs')
    || (needsHouseholds && user.role === 'resident')
  );
  const canReadInventory = user.role === 'admin' || user.role === 'encoder';
  const canReadDistributionEvents = user.role === 'admin' || user.role === 'encoder' || user.role === 'responder';
  const canReadDistributionRecords = user.role === 'admin' || user.role === 'encoder';
  const canReadIncidents = ['admin', 'encoder', 'health_worker', 'responder'].includes(user.role);
  const remoteUserId = shouldResolveRemoteUserId
    ? await resolveSupabaseUserId(user.id).catch(() => null)
    : null;
  const programsPromise = wants('programs') ? loadPrograms() : null;
  const locationMasterPromise = wants('location_master_lists') ? loadLocationMasters(user) : null;
  const auditLogsPromise = wants('audit_logs') ? loadAuditLogs(remoteUserId, user.role) : null;
  const incidentsPromise = wants('incidents') && canReadIncidents ? loadIncidents() : null;
  const distributionEventsPromise = wants('distribution_events') && canReadDistributionEvents
    ? loadDistributionEvents()
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

  const [vulnerabilityFlags, beneficiaries] = await Promise.all([
    wants('vulnerability_flags') ? loadVulnerabilityFlags(residentIds, user.role) : Promise.resolve([]),
    wants('beneficiaries') ? loadBeneficiaries(user, residentIds) : Promise.resolve([]),
  ]);

  if (wants('vulnerability_flags')) {
    payload.vulnerability_flags = vulnerabilityFlags;
  }

  if (wants('beneficiaries')) {
    payload.beneficiaries = beneficiaries;
  }

  if (programsPromise) {
    payload.programs = await programsPromise;
  }

  if (locationMasterPromise) {
    payload.location_master_lists = await locationMasterPromise;
  }

  if (auditLogsPromise) {
    payload.audit_logs = await auditLogsPromise;
  }

  if (inventoryBundlePromise) {
    const inventoryBundle = await inventoryBundlePromise;
    if (wants('inventory_items')) {
      payload.inventory_items = inventoryBundle.inventory_items;
    }
    if (wants('inventory_movements')) {
      payload.inventory_movements = inventoryBundle.inventory_movements;
    }
    if (wants('package_templates')) {
      payload.package_templates = inventoryBundle.package_templates;
    }
  }

  if (distributionEventsPromise) {
    payload.distribution_events = await distributionEventsPromise;
  }

  if (distributionRecordsPromise) {
    payload.distribution_records = await distributionRecordsPromise;
  }

  if (incidentsPromise) {
    payload.incidents = await incidentsPromise;
  }

  return payload;
}

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

    const payload = await buildBootstrapPayload(authResult.user, requestedTables ?? undefined);

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'no-store',
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
