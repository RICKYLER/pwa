import { createHmac, timingSafeEqual } from 'crypto';
import {
  DISTRIBUTION_QR_PURPOSE,
  type DistributionQrClaims,
} from '@/lib/distribution-qr';

export const DEFAULT_DISTRIBUTION_QR_TTL_MS = 1000 * 60 * 60 * 24;
// Tokens may be extended to the end of the scheduled event day, but only when
// that day is close enough that the token still represents a live redemption
// window. This lets a household that screenshotted the QR when notified keep it
// valid on distribution day without minting long-lived tokens.
export const DEFAULT_DISTRIBUTION_QR_MAX_EVENT_EXTENSION_MS = 1000 * 60 * 60 * 24 * 14;

function getDistributionQrSecret() {
  return process.env.DISTRIBUTION_QR_SECRET
    || process.env.AUTH_SESSION_SECRET
    || 'dev-insecure-distribution-qr-secret-change-me';
}

function getDistributionQrDefaultTtlMs(): number {
  const raw = process.env.DISTRIBUTION_QR_TTL_MS;
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return DEFAULT_DISTRIBUTION_QR_TTL_MS;
}

/**
 * Computes a QR token expiry. Normally `now + defaultTtlMs`, but when the
 * event has a scheduled date within `maxEventExtensionMs` the expiry is pushed
 * out to the end of that event day, so a token generated during the notification
 * window is still valid when the household arrives on distribution day.
 *
 * Pure and deterministic so it can be unit tested without mocking the clock.
 */
export function computeDistributionQrExpiry(input: {
  nowMs: number;
  defaultTtlMs: number;
  eventScheduledDate?: string | null;
  maxEventExtensionMs?: number;
}): number {
  const baseExpiry = input.nowMs + input.defaultTtlMs;
  if (!input.eventScheduledDate) {
    return baseExpiry;
  }

  const scheduled = new Date(input.eventScheduledDate);
  if (Number.isNaN(scheduled.getTime())) {
    return baseExpiry;
  }

  const endOfEventDay = new Date(scheduled);
  endOfEventDay.setHours(23, 59, 59, 999);
  const eventEndMs = endOfEventDay.getTime();

  const maxExtensionMs = input.maxEventExtensionMs ?? DEFAULT_DISTRIBUTION_QR_MAX_EVENT_EXTENSION_MS;
  const canReachEventEnd = eventEndMs - input.nowMs <= maxExtensionMs;

  if (canReachEventEnd && eventEndMs > baseExpiry) {
    return eventEndMs;
  }

  return baseExpiry;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signDistributionQrPayload(payload: string) {
  return createHmac('sha256', getDistributionQrSecret())
    .update(payload)
    .digest('base64url');
}

export function createDistributionQrToken(input: {
  eventId: string;
  householdId: string;
  userId: string;
  ttlMs?: number;
  eventScheduledDate?: string | null;
}) {
  const ttlMs = input.ttlMs ?? getDistributionQrDefaultTtlMs();
  const exp = computeDistributionQrExpiry({
    nowMs: Date.now(),
    defaultTtlMs: ttlMs,
    eventScheduledDate: input.eventScheduledDate ?? null,
  });

  const claims: DistributionQrClaims = {
    purpose: DISTRIBUTION_QR_PURPOSE,
    eventId: input.eventId,
    householdId: input.householdId,
    userId: input.userId,
    scope: 'household',
    exp,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(claims));
  const signature = signDistributionQrPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifyDistributionQrToken(token: string): DistributionQrClaims | null {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signDistributionQrPayload(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length
    || !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as DistributionQrClaims;

    if (
      payload.purpose !== DISTRIBUTION_QR_PURPOSE
      || payload.scope !== 'household'
      || !payload.eventId
      || !payload.householdId
      || !payload.userId
      || payload.exp <= Date.now()
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
