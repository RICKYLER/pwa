import { NextRequest, NextResponse } from 'next/server';
import { evaluateHouseholdDistributionEligibility } from '@/lib/distribution-claims';
import { verifyDistributionQrToken } from '@/lib/server/distribution-qr';
import { writeQrScanLog } from '@/lib/server/distribution-qr-log';
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireAuthenticatedUser } from '@/lib/server/auth-guards';
import { fetchDistributionVulnerabilityFlags } from '@/lib/server/distribution-vulnerability-flags';
import type {
  DistributionEventNotificationPayload,
  Resident,
} from '@/lib/db/schema';

export const runtime = 'nodejs';

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthenticatedUser(request);
  if ('response' in authResult) {
    return authResult.response;
  }

  if (!['admin', 'encoder'].includes(authResult.user.role)) {
    return badRequest('Staff access is required to resolve a distribution QR code.', 403);
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const requestedEventId = typeof body?.eventId === 'string' ? body.eventId.trim() : '';
  const source = body?.source === 'camera' || body?.source === 'link' ? body.source : 'manual';
  const supabase = getSupabaseAdminClient();

  if (!token) {
    return badRequest('token is required.');
  }

  const claims = verifyDistributionQrToken(token);
  if (!claims) {
    await writeQrScanLog({
      supabase,
      eventId: requestedEventId || null,
      scannedBy: authResult.user.id,
      source,
      status: 'rejected',
      token,
      notes: 'Invalid or expired QR token.',
    });
    return badRequest('The scanned QR code is invalid or already expired.', 400);
  }

  if (requestedEventId && claims.eventId !== requestedEventId) {
    await writeQrScanLog({
      supabase,
      eventId: claims.eventId,
      householdId: claims.householdId,
      claimantUserId: claims.userId,
      scannedBy: authResult.user.id,
      source,
      status: 'rejected',
      token,
      notes: 'QR code belongs to a different event.',
    });
    return badRequest('This QR code belongs to a different distribution event.', 409);
  }
  const { data: event, error: eventError } = await supabase
    .from('distribution_events')
    .select('id, event_name, barangay_id, target_scope, target_group, status')
    .eq('id', claims.eventId)
    .maybeSingle();

  if (eventError) {
    return badRequest(eventError.message, 500);
  }

  if (!event) {
    return badRequest('Distribution event not found.', 404);
  }

  if (
    authResult.user.role === 'encoder'
    && authResult.user.barangay_id
    && authResult.user.barangay_id !== event.barangay_id
  ) {
    return badRequest('You can only scan QR codes for events inside your barangay.', 403);
  }

  if (event.target_scope !== 'household') {
    return badRequest('This event does not accept household QR claims.', 409);
  }

  if (event.status === 'completed') {
    await writeQrScanLog({
      supabase,
      eventId: event.id,
      householdId: claims.householdId,
      claimantUserId: claims.userId,
      scannedBy: authResult.user.id,
      source,
      status: 'rejected',
      token,
      notes: 'Attempted to scan against a completed event.',
    });
    return badRequest('This distribution event is already completed.', 409);
  }

  const { data: household, error: householdError } = await supabase
    .from('households')
    .select('id, head_name, barangay_id, purok_sitio, street_address, status, registration_status, applicant_user_id')
    .eq('id', claims.householdId)
    .eq('applicant_user_id', claims.userId)
    .eq('status', 'active')
    .eq('registration_status', 'approved')
    .maybeSingle();

  if (householdError) {
    return badRequest(householdError.message, 500);
  }

  if (!household) {
    await writeQrScanLog({
      supabase,
      eventId: event.id,
      householdId: claims.householdId,
      claimantUserId: claims.userId,
      scannedBy: authResult.user.id,
      source,
      status: 'rejected',
      token,
      notes: 'Household linked to QR is no longer active and approved.',
    });
    return badRequest('The household linked to this QR code is no longer active and approved.', 404);
  }

  const { data: existingRecord, error: existingRecordError } = await supabase
    .from('distribution_records')
    .select('id')
    .eq('event_id', event.id)
    .eq('household_id', household.id)
    .maybeSingle();

  if (existingRecordError) {
    return badRequest(existingRecordError.message, 500);
  }

  if (existingRecord) {
    await writeQrScanLog({
      supabase,
      eventId: event.id,
      householdId: household.id,
      claimantUserId: claims.userId,
      scannedBy: authResult.user.id,
      source,
      status: 'rejected',
      token,
      notes: 'Household already claimed this package.',
    });
    return badRequest('This household already claimed this package.', 409);
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
    await writeQrScanLog({
      supabase,
      eventId: event.id,
      householdId: household.id,
      claimantUserId: claims.userId,
      scannedBy: authResult.user.id,
      source,
      status: 'rejected',
      token,
      notes: 'Household no longer matches the selected event audience.',
    });
    return badRequest('This household no longer qualifies for the selected distribution sector.', 409);
  }

  await writeQrScanLog({
    supabase,
    eventId: event.id,
    householdId: household.id,
    claimantUserId: claims.userId,
    scannedBy: authResult.user.id,
    source,
    status: 'resolved',
    token,
    notes: 'QR code resolved successfully and is ready for release.',
  });

  return NextResponse.json({
    eventId: event.id,
    householdId: household.id,
    householdName: household.head_name,
    purokSitio: household.purok_sitio ?? null,
    streetAddress: household.street_address ?? null,
    receivedByName: household.head_name,
    matchedResidentNames: eligibility.matchedResidents.map((resident) => resident.full_name),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
