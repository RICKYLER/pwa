import { NextRequest, NextResponse } from 'next/server';
import { evaluateHouseholdDistributionEligibility } from '@/lib/distribution-claims';
import { buildDistributionQrDeepLink } from '@/lib/distribution-qr';
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireAuthenticatedUser } from '@/lib/server/auth-guards';
import { createDistributionQrToken } from '@/lib/server/distribution-qr';
import { fetchDistributionVulnerabilityFlags } from '@/lib/server/distribution-vulnerability-flags';
import { requireSupabaseUserId } from '@/lib/server/supabase-user-ids';
import type {
  DistributionEventNotificationPayload,
  Resident,
} from '@/lib/db/schema';

export const runtime = 'nodejs';

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function getAppUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL
    || process.env.APP_URL
    || new URL(request.url).origin;
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthenticatedUser(request);
  if ('response' in authResult) {
    return authResult.response;
  }

  if (authResult.user.role !== 'resident') {
    return badRequest('Resident access is required to generate a household QR code.', 403);
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : '';
  if (!eventId) {
    return badRequest('eventId is required.');
  }

  const supabase = getSupabaseAdminClient();
  const remoteUserId = await requireSupabaseUserId(authResult.user);

  const { data: event, error: eventError } = await supabase
    .from('distribution_events')
    .select('id, event_name, target_scope, target_group, status')
    .eq('id', eventId)
    .maybeSingle();

  if (eventError) {
    return badRequest(eventError.message, 500);
  }

  if (!event) {
    return badRequest('Distribution event not found.', 404);
  }

  if (event.target_scope !== 'household') {
    return badRequest('QR claiming is currently available for household-based releases only.', 409);
  }

  if (event.status === 'completed') {
    return badRequest('This distribution event is already completed.', 409);
  }

  const { data: households, error: householdError } = await supabase
    .from('households')
    .select('id, head_name, status, registration_status, applicant_user_id, registration_reviewed_at, updated_at, created_at')
    .eq('applicant_user_id', remoteUserId)
    .eq('status', 'active')
    .eq('registration_status', 'approved')
    .order('registration_reviewed_at', { ascending: false })
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  if (householdError) {
    return badRequest(householdError.message, 500);
  }

  const household = households?.[0];
  if (!household) {
    return badRequest('No approved household account is linked to this resident user.', 404);
  }

  const { data: residents, error: residentError } = await supabase
    .from('residents')
    .select('id, household_id, full_name, birthdate, gender, relationship_to_head, status, income_level')
    .eq('household_id', household.id)
    .eq('status', 'active');

  if (residentError) {
    return badRequest(residentError.message, 500);
  }

  const residentIds = (residents ?? []).map((resident) => resident.id).filter(Boolean);
  let flagsByResidentId;
  try {
    flagsByResidentId = await fetchDistributionVulnerabilityFlags({
      supabase,
      residentIds,
    });
  } catch (flagsError) {
    return badRequest(
      flagsError instanceof Error ? flagsError.message : 'Unable to load vulnerability flags.',
      500,
    );
  }

  const eligibility = evaluateHouseholdDistributionEligibility({
    household,
    notification: {
      event_id: event.id,
      event_name: event.event_name,
      target_group: event.target_group,
      target_scope: event.target_scope,
      status: event.status,
      type: 'regular',
      scheduled_date: '',
      location: '',
    } as DistributionEventNotificationPayload,
    residents: (residents ?? []) as Resident[],
    flagsByResidentId,
  });

  if (!eligibility.eligible) {
    return badRequest('This household does not qualify for the selected distribution sector.', 403);
  }

  const token = createDistributionQrToken({
    eventId: event.id,
    householdId: household.id,
    userId: remoteUserId,
  });
  const deepLink = buildDistributionQrDeepLink(getAppUrl(request), event.id, token);

  return NextResponse.json({
    token,
    deepLink,
    householdId: household.id,
    householdName: household.head_name,
    matchedResidentNames: eligibility.matchedResidents.map((resident) => resident.full_name),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
