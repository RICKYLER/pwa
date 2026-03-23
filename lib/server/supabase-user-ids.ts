import 'server-only';

import type { User } from '@/lib/db/schema';
import { getStoredUserById } from '@/lib/server/auth-store';

export function isSupabaseUserId(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function resolveSupabaseUserId(
  userId: string | null | undefined,
  fallback?: string | null,
): Promise<string | null> {
  if (!userId) {
    return fallback ?? null;
  }

  if (isSupabaseUserId(userId)) {
    return userId;
  }

  const storedUser = await getStoredUserById(userId);
  if (storedUser && isSupabaseUserId(storedUser.id)) {
    return storedUser.id;
  }

  return fallback ?? null;
}

export async function requireSupabaseUserId(user: User): Promise<string> {
  const userId = await resolveSupabaseUserId(user.id);
  if (!userId) {
    throw new Error('The authenticated user does not have a Supabase user ID.');
  }

  return userId;
}
