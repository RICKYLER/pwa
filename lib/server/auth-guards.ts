import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@/lib/db/schema';
import { AUTH_SESSION_COOKIE, verifySessionToken } from '@/lib/server/auth-session';
import { getStoredUserById } from '@/lib/server/auth-store';

export type SessionInspectionReason = 'account-removed' | 'account-deactivated';

type SessionInspectionResult = {
  user: User | null;
  reason?: SessionInspectionReason;
};

type GuardResult =
  | { user: User }
  | { response: NextResponse };

function unauthorized(message: string, status = 401) {
  return { response: NextResponse.json({ error: message }, { status }) } satisfies GuardResult;
}

export async function inspectSessionUser(request: NextRequest): Promise<SessionInspectionResult> {
  const cookie = request.cookies.get(AUTH_SESSION_COOKIE)?.value;
  if (!cookie) {
    return { user: null };
  }

  const session = verifySessionToken(cookie);
  if (!session) {
    return { user: null };
  }

  const user = await getStoredUserById(session.userId);
  if (!user) {
    return { user: null, reason: 'account-removed' };
  }

  if (user.status === 'inactive') {
    return { user: null, reason: 'account-deactivated' };
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      barangay_id: user.barangay_id,
      must_change_password: user.must_change_password,
      email_verification_required: user.email_verification_required,
      email_verified_at: user.email_verified_at ? new Date(user.email_verified_at) : undefined,
      createdAt: new Date(user.createdAt),
      updatedAt: new Date(user.updatedAt),
    },
  };
}

export async function getSessionUser(request: NextRequest): Promise<User | null> {
  const result = await inspectSessionUser(request);
  return result.user;
}

export async function requireAuthenticatedUser(request: NextRequest): Promise<GuardResult> {
  const user = await getSessionUser(request);
  if (!user) {
    return unauthorized('Authentication is required.');
  }

  return { user };
}

export async function requireAdminUser(request: NextRequest): Promise<GuardResult> {
  const result = await requireAuthenticatedUser(request);
  if ('response' in result) {
    return result;
  }

  if (result.user.role !== 'admin') {
    return unauthorized('Admin access is required.', 403);
  }

  return result;
}
