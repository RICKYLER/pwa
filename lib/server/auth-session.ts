import { createHmac } from 'crypto';
import type { UserRole } from '@/lib/db/schema';

export const AUTH_SESSION_COOKIE = 'mswdo_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

interface SessionPayload {
  userId: string;
  role: UserRole;
  exp: number;
}

function getSessionSecret() {
  return process.env.AUTH_SESSION_SECRET || 'dev-insecure-auth-session-secret-change-me';
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(payload: string) {
  return createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url');
}

export function getSessionMaxAgeSeconds() {
  return Math.floor(SESSION_TTL_MS / 1000);
}

export function createSessionToken(params: { userId: string; role: UserRole }) {
  const payload: SessionPayload = {
    userId: params.userId,
    role: params.role,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = sign(encodedPayload);
  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    if (!payload.userId || !payload.role || payload.exp <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
