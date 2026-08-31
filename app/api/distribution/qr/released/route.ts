import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/server/auth-guards';
import { verifyDistributionQrToken } from '@/lib/server/distribution-qr';
import { writeQrScanLog, type QrScanSource } from '@/lib/server/distribution-qr-log';
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const authResult = await requireAuthenticatedUser(request);
  if ('response' in authResult) {
    return authResult.response;
  }

  if (!['admin', 'encoder'].includes(authResult.user.role)) {
    return NextResponse.json(
      { error: 'Staff access is required to record a QR release.' },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const requestedEventId = typeof body?.eventId === 'string' ? body.eventId.trim() : '';
  const source: QrScanSource = body?.source === 'camera' || body?.source === 'link'
    ? body.source
    : 'manual';

  if (!token) {
    return NextResponse.json({ error: 'token is required.' }, { status: 400 });
  }

  const claims = verifyDistributionQrToken(token);
  if (!claims) {
    return NextResponse.json({ error: 'The QR token is invalid or expired.' }, { status: 400 });
  }

  if (requestedEventId && claims.eventId !== requestedEventId) {
    return NextResponse.json(
      { error: 'This QR code belongs to a different distribution event.' },
      { status: 409 },
    );
  }

  // Best-effort audit entry; the actual release is committed by the RPC, so a
  // failure here must never surface as a failed release to the staff member.
  await writeQrScanLog({
    supabase: getSupabaseAdminClient(),
    eventId: claims.eventId,
    householdId: claims.householdId,
    claimantUserId: claims.userId,
    scannedBy: authResult.user.id,
    source,
    status: 'released',
    token,
    notes: 'QR release completed.',
  });

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
