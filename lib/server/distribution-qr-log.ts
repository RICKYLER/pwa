import { createHash } from 'crypto';
import type { getSupabaseAdminClient } from '@/lib/server/supabase-admin';

export type QrScanSource = 'camera' | 'manual' | 'link';
export type QrScanStatus = 'resolved' | 'rejected' | 'released';

export interface QrScanLogInput {
  supabase: ReturnType<typeof getSupabaseAdminClient>;
  eventId?: string | null;
  householdId?: string | null;
  claimantUserId?: string | null;
  scannedBy?: string | null;
  source: QrScanSource;
  status: QrScanStatus;
  token?: string | null;
  notes?: string | null;
}

/**
 * QR tokens are HMAC-signed bearer tokens, so the scan log stores only a SHA-256
 * hash of the token — never the raw value. That keeps the audit trail complete
 * without persisting credentials that could be replayed.
 */
export function hashQrScanToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function buildQrScanLogRow(input: {
  eventId?: string | null;
  householdId?: string | null;
  claimantUserId?: string | null;
  scannedBy?: string | null;
  source: QrScanSource;
  status: QrScanStatus;
  token?: string | null;
  notes?: string | null;
}) {
  return {
    id: `qrlog_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    event_id: input.eventId ?? null,
    household_id: input.householdId ?? null,
    claimant_user_id: input.claimantUserId ?? null,
    scanned_by: input.scannedBy ?? null,
    source: input.source,
    status: input.status,
    token_hash: input.token ? hashQrScanToken(input.token) : null,
    notes: input.notes ?? null,
  };
}

/**
 * Fire-and-forget audit write for distribution QR scans. Failures are swallowed
 * (a missing/renamed table in an un-migrated deployment must never break the
 * scan flow), so callers treat this as best-effort.
 */
export async function writeQrScanLog(input: QrScanLogInput): Promise<void> {
  const { supabase, ...fields } = input;
  const { error } = await supabase
    .from('distribution_qr_scan_logs')
    .insert(buildQrScanLogRow(fields));

  if (error) {
    const message = (error.message ?? '').toLowerCase();
    if (
      message.includes('distribution_qr_scan_logs')
      && (
        message.includes('does not exist')
        || message.includes('schema cache')
        || message.includes('could not find')
      )
    ) {
      return;
    }
  }
}
