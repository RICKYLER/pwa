import { createHmac, timingSafeEqual } from 'crypto';
import {
  DISTRIBUTION_QR_PURPOSE,
  type DistributionQrClaims,
} from '@/lib/distribution-qr';

const DEFAULT_DISTRIBUTION_QR_TTL_MS = 1000 * 60 * 60 * 24;

function getDistributionQrSecret() {
  return process.env.DISTRIBUTION_QR_SECRET
    || process.env.AUTH_SESSION_SECRET
    || 'dev-insecure-distribution-qr-secret-change-me';
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
}) {
  const claims: DistributionQrClaims = {
    purpose: DISTRIBUTION_QR_PURPOSE,
    eventId: input.eventId,
    householdId: input.householdId,
    userId: input.userId,
    scope: 'household',
    exp: Date.now() + (input.ttlMs ?? DEFAULT_DISTRIBUTION_QR_TTL_MS),
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
