import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@/lib/db/schema';
import { requireAuthenticatedUser } from '@/lib/server/auth-guards';
import { getSupabaseAdminClient, getSupabaseAdminConfig } from '@/lib/server/supabase-admin';
import { mirrorAppUserToSupabase } from '@/lib/server/supabase-user-mirror';
import type { SupabaseBootstrapTable } from '@/lib/supabase/row-mapper';

export const runtime = 'nodejs';

type BootstrapPayload = Partial<Record<SupabaseBootstrapTable, unknown[]>>;

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
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

async function loadDistributionBundle() {
  const supabase = getSupabaseAdminClient();
  const [events, records] = await Promise.all([
    supabase.from('distribution_events').select('*').order('scheduled_date', { ascending: false }),
    supabase.from('distribution_records').select('*').order('timestamp', { ascending: false }),
  ]);

  const error = events.error || records.error;
  if (error) throw new Error(error.message);

  return {
    distribution_events: events.data ?? [],
    distribution_records: records.data ?? [],
  };
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

async function buildBootstrapPayload(user: User): Promise<BootstrapPayload> {
  const payload: BootstrapPayload = {};
  const remoteUserId = getSupabaseAdminConfig().isConfigured
    ? await mirrorAppUserToSupabase(user, {
        emailConfirmed: Boolean(user.email_verified_at || !user.email_verification_required),
      }).catch(() => null)
    : null;

  const households = await loadHouseholds(user, remoteUserId);
  const householdIds = households
    .map((household) => (typeof household.id === 'string' ? household.id : ''))
    .filter(Boolean);
  const residents = await loadResidentsForHouseholds(householdIds);
  const residentIds = residents
    .map((resident) => (typeof resident.id === 'string' ? resident.id : ''))
    .filter(Boolean);

  payload.households = households;
  payload.residents = residents;
  payload.vulnerability_flags = await loadVulnerabilityFlags(residentIds, user.role);
  payload.programs = await loadPrograms();
  payload.beneficiaries = await loadBeneficiaries(user, residentIds);
  payload.location_master_lists = await loadLocationMasters(user);
  payload.audit_logs = await loadAuditLogs(remoteUserId, user.role);

  if (user.role === 'admin' || user.role === 'encoder') {
    Object.assign(payload, await loadInventoryBundle());
    Object.assign(payload, await loadDistributionBundle());
  }

  if (['admin', 'encoder', 'health_worker', 'responder'].includes(user.role)) {
    payload.incidents = await loadIncidents();
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
    const payload = await buildBootstrapPayload(authResult.user);

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
