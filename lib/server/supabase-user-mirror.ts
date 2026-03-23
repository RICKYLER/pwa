import 'server-only';

import { randomUUID } from 'node:crypto';
import type { User } from '@/lib/db/schema';
import { getStoredUserById } from '@/lib/server/auth-store';
import { getSupabaseAdminClient, getSupabaseAdminConfig } from '@/lib/server/supabase-admin';

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function toSupabaseUser(user: User) {
  return {
    email: normalizeEmail(user.email),
    name: user.name,
    role: user.role,
    barangay_id: user.barangay_id,
    must_change_password: user.must_change_password ?? false,
    email_verification_required: user.email_verification_required ?? false,
    email_verified_at: user.email_verified_at ? user.email_verified_at.toISOString() : null,
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
  };
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    throw new Error(`Failed to list Supabase auth users: ${error.message}`);
  }

  return data.users.find((entry) => entry.email?.toLowerCase() === email)?.id ?? null;
}

async function findProfileIdByEmail(email: string): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .limit(1);

  if (error) {
    throw new Error(`Failed to check Supabase user profile: ${error.message}`);
  }

  const profileId = data?.[0]?.id;
  return typeof profileId === 'string' && isUuid(profileId) ? profileId : null;
}

export async function mirrorAppUserToSupabase(
  user: User,
  options?: {
    password?: string;
    emailConfirmed?: boolean;
  },
): Promise<string | null> {
  if (!getSupabaseAdminConfig().isConfigured) {
    return null;
  }

  const supabase = getSupabaseAdminClient();
  const normalizedEmail = normalizeEmail(user.email);
  const emailConfirmed = options?.emailConfirmed ?? Boolean(user.email_verified_at || !user.email_verification_required);
  const metadata = {
    name: user.name,
    role: user.role,
    barangay_id: user.barangay_id,
  };

  let remoteUserId = await findAuthUserIdByEmail(normalizedEmail) ?? await findProfileIdByEmail(normalizedEmail);

  if (remoteUserId) {
    const updatePayload: {
      email: string;
      email_confirm: boolean;
      password?: string;
      user_metadata: typeof metadata;
    } = {
      email: normalizedEmail,
      email_confirm: emailConfirmed,
      user_metadata: metadata,
    };

    if (options?.password) {
      updatePayload.password = options.password;
    }

    const { error } = await supabase.auth.admin.updateUserById(remoteUserId, updatePayload);
    if (error && !/user not found/i.test(error.message)) {
      throw new Error(`Failed to update Supabase auth user: ${error.message}`);
    }

    if (error && /user not found/i.test(error.message)) {
      remoteUserId = null;
    }
  }

  if (!remoteUserId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: options?.password ?? randomUUID(),
      email_confirm: emailConfirmed,
      user_metadata: metadata,
    });

    if (error || !data.user?.id) {
      throw new Error(error?.message || 'Failed to create Supabase auth user.');
    }

    remoteUserId = data.user.id;
  }

  const { error: profileError } = await supabase
    .from('users')
    .upsert({
      id: remoteUserId,
      ...toSupabaseUser(user),
    }, {
      onConflict: 'id',
    });

  if (profileError) {
    throw new Error(`Failed to upsert Supabase user profile: ${profileError.message}`);
  }

  return remoteUserId;
}

export async function mirrorStoredUserIdToSupabase(localUserId: string): Promise<string | null> {
  const storedUser = await getStoredUserById(localUserId);
  if (!storedUser) {
    return null;
  }

  return mirrorAppUserToSupabase({
    id: storedUser.id,
    email: storedUser.email,
    name: storedUser.name,
    role: storedUser.role,
    barangay_id: storedUser.barangay_id,
    must_change_password: storedUser.must_change_password,
    email_verification_required: storedUser.email_verification_required,
    email_verified_at: storedUser.email_verified_at ? new Date(storedUser.email_verified_at) : undefined,
    createdAt: new Date(storedUser.createdAt),
    updatedAt: new Date(storedUser.updatedAt),
  });
}

export async function deleteMirroredUserFromSupabase(email: string): Promise<void> {
  if (!getSupabaseAdminConfig().isConfigured) {
    return;
  }

  const normalizedEmail = normalizeEmail(email);
  const remoteUserId = await findAuthUserIdByEmail(normalizedEmail) ?? await findProfileIdByEmail(normalizedEmail);
  if (!remoteUserId) {
    return;
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.auth.admin.deleteUser(remoteUserId);
  if (error) {
    console.warn(`[Supabase Mirror] Could not delete auth user for ${normalizedEmail}: ${error.message}`);
  }
}
