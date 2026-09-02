import 'server-only';

import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { User, UserAccountStatus, UserRole } from '@/lib/db/schema';
import { joinNameParts } from '@/lib/name-parts';
import type { AuthenticationResult, StoredUserRecord } from '@/lib/server/local-auth-store';
import { getSupabaseAdminClient, getSupabaseAdminConfig } from '@/lib/server/supabase-admin';

const PASSWORD_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 3;
const EMAIL_VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 3;
const PROFILE_SELECT_BASE = 'id, email, name, role, barangay_id, must_change_password, email_verification_required, email_verified_at, created_at, updated_at';
const PROFILE_SELECT_WITH_STATUS = 'id, email, name, role, status, barangay_id, must_change_password, email_verification_required, email_verified_at, created_at, updated_at';

type ProfileRow = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status?: UserAccountStatus | null;
  barangay_id: string;
  must_change_password: boolean;
  email_verification_required: boolean;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

type TokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  used_at: string | null;
};

type UserLinkedTableName =
  | 'password_setup_tokens'
  | 'email_verification_tokens'
  | 'audit_logs'
  | 'sync_backups';

type StatelessTokenKind = 'password_setup' | 'password_reset' | 'email_verification';

type StatelessTokenPayload = {
  exp: number;
  kind: StatelessTokenKind;
  user_id: string;
  version: number;
};

let userStatusColumnState: 'unknown' | 'available' | 'missing' = 'unknown';

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function createToken() {
  return randomBytes(32).toString('base64url');
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function getAuthTokenSecret() {
  return process.env.AUTH_TOKEN_SECRET?.trim()
    || process.env.AUTH_SESSION_SECRET
    || 'dev-insecure-auth-session-secret-change-me';
}

function encodeTokenPayload(payload: StatelessTokenPayload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeTokenPayload(value: string): StatelessTokenPayload | null {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as StatelessTokenPayload;
  } catch {
    return null;
  }
}

function signAuthToken(encodedPayload: string) {
  return createHmac('sha256', getAuthTokenSecret())
    .update(encodedPayload)
    .digest('base64url');
}

function getRecordVersion(record: Pick<StoredUserRecord, 'updatedAt'>) {
  return new Date(record.updatedAt).getTime();
}

function createStatelessToken(input: {
  kind: StatelessTokenKind;
  ttlMs: number;
  user: Pick<StoredUserRecord, 'id' | 'updatedAt'>;
}) {
  const encodedPayload = encodeTokenPayload({
    exp: Date.now() + input.ttlMs,
    kind: input.kind,
    user_id: input.user.id,
    version: getRecordVersion(input.user),
  });

  return `${encodedPayload}.${signAuthToken(encodedPayload)}`;
}

function parseStatelessToken(rawToken: string, kind: StatelessTokenKind): StatelessTokenPayload | null {
  const [encodedPayload, signature] = rawToken.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  if (signAuthToken(encodedPayload) !== signature) {
    return null;
  }

  const payload = decodeTokenPayload(encodedPayload);
  if (!payload) {
    return null;
  }

  if (
    payload.kind !== kind
    || typeof payload.user_id !== 'string'
    || typeof payload.version !== 'number'
    || typeof payload.exp !== 'number'
    || payload.exp <= Date.now()
  ) {
    return null;
  }

  return payload;
}

function isMissingTokenTableError(
  error: unknown,
  tableName: 'password_setup_tokens' | 'email_verification_tokens',
) {
  const message = typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof error.message === 'string'
    ? error.message.toLowerCase()
    : '';
  return message.includes('could not find the table')
    && message.includes(tableName);
}

function isMissingTableError(error: unknown, tableName: UserLinkedTableName) {
  const message = typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof error.message === 'string'
    ? error.message.toLowerCase()
    : '';
  return message.includes('could not find the table')
    && message.includes(tableName);
}

function isMissingUserStatusColumnError(error: unknown) {
  const message = typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof error.message === 'string'
    ? error.message.toLowerCase()
    : '';
  return message.includes('users.status')
    || (
      message.includes('status')
      && message.includes('users')
      && (
        message.includes('does not exist')
        || message.includes('schema cache')
        || message.includes('could not find the')
      )
    );
}

function createMissingUserStatusMigrationError() {
  return new Error(
    'Supabase users.status is missing. Run migration 20260404123000_user_account_status.sql before using staff deactivation.',
  );
}

function getSupabasePublicAuthConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  return {
    url,
    key,
    isConfigured: Boolean(url && key),
  };
}

function getSupabasePublicAuthClient() {
  const { url, key, isConfigured } = getSupabasePublicAuthConfig();
  if (!isConfigured || !url || !key) {
    throw new Error(
      'Supabase public auth client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function isSupabaseAuthStoreEnabled() {
  return getSupabaseAdminConfig().isConfigured;
}

function mapProfileRowToStoredUserRecord(row: ProfileRow): StoredUserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status === 'inactive' ? 'inactive' : 'active',
    barangay_id: row.barangay_id,
    must_change_password: Boolean(row.must_change_password),
    email_verification_required: Boolean(row.email_verification_required),
    email_verified_at: row.email_verified_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPublicUser(record: StoredUserRecord): User {
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    role: record.role,
    status: record.status,
    barangay_id: record.barangay_id,
    must_change_password: record.must_change_password,
    email_verification_required: record.email_verification_required,
    email_verified_at: record.email_verified_at ? new Date(record.email_verified_at) : undefined,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

async function runProfileQuery<T>(
  runner: (selectClause: string) => Promise<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const runLegacyQuery = async () => {
    const { data, error } = await runner(PROFILE_SELECT_BASE);
    if (error) {
      throw new Error(error.message);
    }

    userStatusColumnState = 'missing';
    return data;
  };

  if (userStatusColumnState === 'missing') {
    return runLegacyQuery();
  }

  const { data, error } = await runner(PROFILE_SELECT_WITH_STATUS);
  if (!error) {
    userStatusColumnState = 'available';
    return data;
  }

  if (isMissingUserStatusColumnError(error)) {
    return runLegacyQuery();
  }

  throw new Error(error.message);
}

async function getProfileById(userId: string): Promise<StoredUserRecord | null> {
  const supabase = getSupabaseAdminClient();
  try {
    const data = await runProfileQuery<ProfileRow | null>(async (selectClause) => {
      const result = await supabase
        .from('users')
        .select(selectClause)
        .eq('id', userId)
        .maybeSingle<ProfileRow>();

      return {
        data: (result.data as ProfileRow | null) ?? null,
        error: result.error ? { message: result.error.message } : null,
      };
    });

    return data ? mapProfileRowToStoredUserRecord(data) : null;
  } catch (error) {
    console.error('Supabase profile load error:', error);
    throw new Error(`Failed to load Supabase user profile: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

async function getProfileByEmail(email: string): Promise<StoredUserRecord | null> {
  const supabase = getSupabaseAdminClient();
  try {
    const data = await runProfileQuery<ProfileRow | null>(async (selectClause) => {
      const result = await supabase
        .from('users')
        .select(selectClause)
        .eq('email', normalizeEmail(email))
        .maybeSingle<ProfileRow>();

      return {
        data: (result.data as ProfileRow | null) ?? null,
        error: result.error ? { message: result.error.message } : null,
      };
    });

    return data ? mapProfileRowToStoredUserRecord(data) : null;
  } catch (error) {
    throw new Error(`Failed to load Supabase user profile by email: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

async function writeProfile(input: {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserAccountStatus;
  barangay_id: string;
  must_change_password: boolean;
  email_verification_required: boolean;
  email_verified_at?: string | null;
}): Promise<StoredUserRecord> {
  const supabase = getSupabaseAdminClient();
  const existing = await getProfileById(input.id);
  const timestamp = nowIso();
  // The users_sync_name_parts trigger splits `name` into first/middle/last on
  // the database side, so only the display name is written here.
  const baseRow = {
    id: input.id,
    email: normalizeEmail(input.email),
    name: input.name.trim(),
    role: input.role,
    barangay_id: input.barangay_id.trim(),
    must_change_password: input.must_change_password,
    email_verification_required: input.email_verification_required,
    email_verified_at: input.email_verified_at ?? null,
    created_at: existing?.createdAt ?? timestamp,
    updated_at: timestamp,
  };

  const runLegacyUpsert = async () => {
    if (input.status !== 'active') {
      throw createMissingUserStatusMigrationError();
    }

    const { data, error } = await supabase
      .from('users')
      .upsert(baseRow, {
        onConflict: 'id',
      })
      .select(PROFILE_SELECT_BASE)
      .single<ProfileRow>();

    if (error) {
      throw new Error(`Failed to upsert Supabase user profile: ${error.message}`);
    }

    userStatusColumnState = 'missing';
    return mapProfileRowToStoredUserRecord(data);
  };

  if (userStatusColumnState === 'missing') {
    return runLegacyUpsert();
  }

  const { data, error } = await supabase
    .from('users')
    .upsert({
      ...baseRow,
      status: input.status,
    }, {
      onConflict: 'id',
    })
    .select(PROFILE_SELECT_WITH_STATUS)
    .single<ProfileRow>();

  if (!error) {
    userStatusColumnState = 'available';
    return mapProfileRowToStoredUserRecord(data);
  }

  if (isMissingUserStatusColumnError(error)) {
    return runLegacyUpsert();
  }

  throw new Error(`Failed to upsert Supabase user profile: ${error.message}`);
}

async function deleteUnusedTokens(tableName: 'password_setup_tokens' | 'email_verification_tokens', userId: string) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from(tableName)
    .delete()
    .eq('user_id', userId)
    .is('used_at', null);

  if (error) {
    throw new Error(`Failed to clear existing ${tableName}: ${error.message}`);
  }
}

async function deleteRowsByUserReference(
  tableName: UserLinkedTableName,
  columnName: 'user_id' | 'synced_by',
  userId: string,
) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from(tableName)
    .delete()
    .eq(columnName, userId);

  if (error) {
    throw new Error(`Failed to clear ${tableName}: ${error.message}`);
  }
}

async function nullUserReferenceRows(
  tableName: UserLinkedTableName,
  columnName: 'user_id' | 'synced_by',
  userId: string,
) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from(tableName)
    .update({ [columnName]: null })
    .eq(columnName, userId);

  if (error) {
    throw new Error(`Failed to detach ${tableName}: ${error.message}`);
  }
}

async function clearLinkedHistoryForDeletedUser(userId: string) {
  const linkedTables: Array<{ tableName: UserLinkedTableName; columnName: 'user_id' | 'synced_by' }> = [
    { tableName: 'audit_logs', columnName: 'user_id' },
    { tableName: 'sync_backups', columnName: 'synced_by' },
  ];

  for (const { tableName, columnName } of linkedTables) {
    try {
      await nullUserReferenceRows(tableName, columnName, userId);
      continue;
    } catch (error) {
      if (isMissingTableError(error, tableName)) {
        continue;
      }
    }

    try {
      await deleteRowsByUserReference(tableName, columnName, userId);
    } catch (error) {
      if (!isMissingTableError(error, tableName)) {
        throw error;
      }
    }
  }
}

async function getTokenByHash(
  tableName: 'password_setup_tokens' | 'email_verification_tokens',
  rawToken: string,
): Promise<TokenRow | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(tableName)
    .select('id, user_id, token_hash, expires_at, created_at, used_at')
    .eq('token_hash', hashToken(rawToken))
    .maybeSingle<TokenRow>();

  if (error) {
    throw new Error(`Failed to load ${tableName}: ${error.message}`);
  }

  return data ?? null;
}

function isTokenUsable(token: TokenRow | null) {
  return Boolean(
    token
    && !token.used_at
    && new Date(token.expires_at).getTime() > Date.now(),
  );
}

async function markTokenUsed(tableName: 'password_setup_tokens' | 'email_verification_tokens', tokenId: string) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from(tableName)
    .update({
      used_at: nowIso(),
    })
    .eq('id', tokenId);

  if (error) {
    throw new Error(`Failed to update ${tableName}: ${error.message}`);
  }
}

export async function listUsers(): Promise<User[]> {
  const supabase = getSupabaseAdminClient();
  try {
    const data = await runProfileQuery<ProfileRow[] | null>(async (selectClause) => {
      const result = await supabase
        .from('users')
        .select(selectClause)
        .order('name', { ascending: true });

      return {
        data: (result.data as ProfileRow[] | null) ?? null,
        error: result.error ? { message: result.error.message } : null,
      };
    });

    return (data ?? []).map((row) => toPublicUser(mapProfileRowToStoredUserRecord(row)));
  } catch (error) {
    throw new Error(`Failed to list Supabase users: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

export async function getStoredUserById(userId: string): Promise<StoredUserRecord | null> {
  return getProfileById(userId);
}

export async function getStoredUserByEmail(email: string): Promise<StoredUserRecord | null> {
  return getProfileByEmail(email);
}

export async function createUserAccount(input: {
  name: string;
  email: string;
  role: UserRole;
  barangay_id: string;
}): Promise<User> {
  const normalizedEmail = normalizeEmail(input.email);
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password: randomUUID(),
    email_confirm: true,
    user_metadata: {
      name: input.name.trim(),
      role: input.role,
      barangay_id: input.barangay_id.trim(),
    },
  });

  if (error || !data.user?.id) {
    throw new Error(error?.message || 'Could not create the user account in Supabase.');
  }

  const profile = await writeProfile({
    id: data.user.id,
    email: normalizedEmail,
    name: input.name,
    role: input.role,
    status: 'active',
    barangay_id: input.barangay_id,
    must_change_password: true,
    email_verification_required: false,
    email_verified_at: data.user.email_confirmed_at ?? nowIso(),
  });

  return toPublicUser(profile);
}

export async function createResidentSelfServiceAccount(input: {
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
  password: string;
  barangay_id: string;
}): Promise<User> {
  const normalizedEmail = normalizeEmail(input.email);
  const firstName = input.first_name.trim();
  const middleName = (input.middle_name ?? '').trim();
  const lastName = input.last_name.trim();
  const fullName = joinNameParts(firstName, middleName, lastName);
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password: input.password,
    email_confirm: false,
    user_metadata: {
      name: fullName,
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      role: 'resident',
      barangay_id: input.barangay_id.trim(),
    },
  });

  if (error || !data.user?.id) {
    throw new Error(error?.message || 'Could not create the resident account in Supabase.');
  }

  const profile = await writeProfile({
    id: data.user.id,
    email: normalizedEmail,
    name: fullName,
    role: 'resident',
    status: 'active',
    barangay_id: input.barangay_id,
    must_change_password: false,
    email_verification_required: true,
    email_verified_at: null,
  });

  return toPublicUser(profile);
}

export async function updateUserAccount(
  userId: string,
  patch: Partial<Pick<User, 'name' | 'role' | 'status' | 'barangay_id'>>,
): Promise<User> {
  const existing = await getProfileById(userId);
  if (!existing) {
    throw new Error('User not found.');
  }

  const nextProfile = {
    id: existing.id,
    email: existing.email,
    name: patch.name?.trim() || existing.name,
    role: patch.role || existing.role,
    status: patch.status || existing.status,
    barangay_id: patch.barangay_id?.trim() || existing.barangay_id,
    must_change_password: existing.must_change_password,
    email_verification_required: existing.email_verification_required,
    email_verified_at: existing.email_verified_at ?? null,
  };

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      name: nextProfile.name,
      role: nextProfile.role,
      barangay_id: nextProfile.barangay_id,
    },
  });

  if (error) {
    throw new Error(`Failed to update the Supabase auth user: ${error.message}`);
  }

  const profile = await writeProfile(nextProfile);
  return toPublicUser(profile);
}

export type DeletedHouseholdSummary = {
  id: string;
  headName: string;
};

export type DeletedAccountSummary = {
  deletedHouseholds: DeletedHouseholdSummary[];
};

export type HouseholdCascadeDeletePlan = {
  deletedHouseholds: DeletedHouseholdSummary[];
  householdIds: string[];
  residentIds: string[];
  vulnerabilityFlagIds: string[];
  beneficiaryIds: string[];
  distributionRecordIds: string[];
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function chunkArray<T>(values: T[], size = 100) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function deleteRowsByIds(tableName: string, columnName: string, ids: string[]) {
  if (!ids.length) {
    return;
  }

  const supabase = getSupabaseAdminClient();
  for (const chunk of chunkArray(ids)) {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .in(columnName, chunk);

    if (error) {
      throw new Error(`Failed to delete ${tableName}: ${error.message}`);
    }
  }
}

async function deleteAuditLogsForEntities(entityType: string, entityIds: string[]) {
  if (!entityIds.length) {
    return;
  }

  const supabase = getSupabaseAdminClient();
  for (const chunk of chunkArray(entityIds)) {
    const { error } = await supabase
      .from('audit_logs')
      .delete()
      .eq('entity_type', entityType)
      .in('entity_id', chunk);

    if (error) {
      throw new Error(`Failed to delete audit logs for ${entityType}: ${error.message}`);
    }
  }
}

async function deleteSyncBackupsForEntities(entityType: string, entityIds: string[]) {
  if (!entityIds.length) {
    return;
  }

  const supabase = getSupabaseAdminClient();
  for (const chunk of chunkArray(entityIds)) {
    const { error } = await supabase
      .from('sync_backups')
      .delete()
      .eq('entity_type', entityType)
      .in('entity_id', chunk);

    if (error) {
      throw new Error(`Failed to delete sync backups for ${entityType}: ${error.message}`);
    }
  }
}

async function getRowsByIds(tableName: string, columnName: string, ids: string[], selectClause = 'id') {
  if (!ids.length) {
    return [] as Array<Record<string, unknown>>;
  }

  const supabase = getSupabaseAdminClient();
  const rows: Array<Record<string, unknown>> = [];
  for (const chunk of chunkArray(ids)) {
    const { data, error } = await supabase
      .from(tableName)
      .select(selectClause)
      .in(columnName, chunk);

    if (error) {
      throw new Error(`Failed to load ${tableName}: ${error.message}`);
    }

    rows.push(...((data ?? []) as unknown as Array<Record<string, unknown>>));
  }

  return rows;
}

async function buildHouseholdCascadeDeletePlan(
  householdRows: Array<{ id: string; head_name?: unknown }>,
): Promise<HouseholdCascadeDeletePlan> {
  const householdIds = uniqueStrings(householdRows.map((row) => row.id));
  if (!householdIds.length) {
    return {
      deletedHouseholds: [],
      householdIds: [],
      residentIds: [],
      vulnerabilityFlagIds: [],
      beneficiaryIds: [],
      distributionRecordIds: [],
    };
  }

  const residentRows = await getRowsByIds('residents', 'household_id', householdIds);
  const residentIds = uniqueStrings(residentRows.map((row) => (typeof row.id === 'string' ? row.id : null)));
  const vulnerabilityFlagRows = await getRowsByIds('vulnerability_flags', 'resident_id', residentIds);
  const beneficiaryRows = await getRowsByIds('beneficiaries', 'resident_id', residentIds);
  const householdDistributionRows = await getRowsByIds('distribution_records', 'household_id', householdIds);
  const residentDistributionRows = await getRowsByIds('distribution_records', 'resident_id', residentIds);

  return {
    deletedHouseholds: householdRows.map((row) => ({
      id: row.id,
      headName: typeof row.head_name === 'string' ? row.head_name : row.id,
    })),
    householdIds,
    residentIds,
    vulnerabilityFlagIds: uniqueStrings(
      vulnerabilityFlagRows.map((row) => (typeof row.id === 'string' ? row.id : null)),
    ),
    beneficiaryIds: uniqueStrings(beneficiaryRows.map((row) => (typeof row.id === 'string' ? row.id : null))),
    distributionRecordIds: uniqueStrings([
      ...householdDistributionRows.map((row) => (typeof row.id === 'string' ? row.id : null)),
      ...residentDistributionRows.map((row) => (typeof row.id === 'string' ? row.id : null)),
    ]),
  };
}

export async function buildHouseholdCascadeDeletePlanById(householdId: string): Promise<HouseholdCascadeDeletePlan> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('households')
    .select('id, head_name')
    .eq('id', householdId)
    .limit(1);

  if (error) {
    throw new Error(`Failed to load household ${householdId}: ${error.message}`);
  }

  return buildHouseholdCascadeDeletePlan((data ?? []) as Array<{ id: string; head_name?: unknown }>);
}

/**
 * Hard-delete every household registered by the given user account.
 * This explicitly removes records that would otherwise keep private household
 * payloads through SET NULL foreign keys, audit history, or sync backups.
 */
async function deleteHouseholdsLinkedToUser(user: { id: string; email?: string | null }): Promise<DeletedHouseholdSummary[]> {
  const supabase = getSupabaseAdminClient();
  const normalizedEmail = user.email?.trim().toLowerCase() ?? null;

  const householdRowsById = await supabase
    .from('households')
    .select('id, head_name')
    .eq('applicant_user_id', user.id);

  if (householdRowsById.error) {
    throw new Error(`Failed to load households linked to the account: ${householdRowsById.error.message}`);
  }

  let householdRowsByEmail: Array<{ id: string; head_name?: unknown }> = [];
  if (normalizedEmail) {
    const { data, error } = await supabase
      .from('households')
      .select('id, head_name')
      .ilike('applicant_email', normalizedEmail);

    if (error) {
      throw new Error(`Failed to load households linked to the account email: ${error.message}`);
    }

    householdRowsByEmail = (data ?? []) as Array<{ id: string; head_name?: unknown }>;
  }

  const linkedHouseholdsById = new Map<string, { id: string; head_name?: unknown }>();
  for (const row of [
    ...((householdRowsById.data ?? []) as Array<{ id: string; head_name?: unknown }>),
    ...householdRowsByEmail,
  ]) {
    linkedHouseholdsById.set(row.id, row);
  }

  const plan = await buildHouseholdCascadeDeletePlan(Array.from(linkedHouseholdsById.values()));
  await deleteHouseholdCascadeData(plan, { claimantUserId: user.id });

  return plan.deletedHouseholds;
}

export async function deleteHouseholdCascadeData(
  plan: HouseholdCascadeDeletePlan,
  options: { claimantUserId?: string } = {},
): Promise<void> {
  await deleteAuditLogsForEntities('household', plan.householdIds);
  await deleteAuditLogsForEntities('resident', plan.residentIds);
  await deleteAuditLogsForEntities('distribution', plan.distributionRecordIds);

  await deleteSyncBackupsForEntities('households', plan.householdIds);
  await deleteSyncBackupsForEntities('residents', plan.residentIds);
  await deleteSyncBackupsForEntities('vulnerability_flags', plan.vulnerabilityFlagIds);
  await deleteSyncBackupsForEntities('beneficiaries', plan.beneficiaryIds);
  await deleteSyncBackupsForEntities('distribution_records', plan.distributionRecordIds);

  await deleteRowsByIds('distribution_qr_scan_logs', 'household_id', plan.householdIds);
  if (options.claimantUserId) {
    await deleteRowsByIds('distribution_qr_scan_logs', 'claimant_user_id', [options.claimantUserId]);
  }

  if (!plan.householdIds.length) {
    return;
  }

  await deleteRowsByIds('distribution_records', 'id', plan.distributionRecordIds);
  await deleteRowsByIds('households', 'id', plan.householdIds);
}

/**
 * Hard-delete the distribution records tied to the given households, both the
 * records that reference the household directly and the ones that reference a
 * member resident. This must happen before the households (or their residents)
 * are deleted: distribution_records has a CHECK constraint requiring exactly
 * one of household_id / resident_id to be non-null, and the ON DELETE SET NULL
 * foreign keys would otherwise null out the last remaining reference, violate
 * that constraint, and block the entire deletion.
 */
export async function deleteDistributionRecordsForHouseholds(householdIds: string[]): Promise<void> {
  if (!householdIds.length) {
    return;
  }

  const supabase = getSupabaseAdminClient();

  const { data: memberRows, error: membersError } = await supabase
    .from('residents')
    .select('id')
    .in('household_id', householdIds);

  if (membersError) {
    throw new Error(`Failed to load household members for distribution cleanup: ${membersError.message}`);
  }

  const orFilters = [`household_id.in.(${householdIds.join(',')})`];
  const memberIds = (memberRows ?? [])
    .map((row) => (typeof row.id === 'string' ? row.id : ''))
    .filter(Boolean);

  if (memberIds.length > 0) {
    orFilters.push(`resident_id.in.(${memberIds.join(',')})`);
  }

  const { error: deleteError } = await supabase
    .from('distribution_records')
    .delete()
    .or(orFilters.join(','));

  if (deleteError) {
    throw new Error(`Failed to delete distribution records for households: ${deleteError.message}`);
  }
}

export async function deleteUserAccount(userId: string): Promise<DeletedAccountSummary> {
  const existing = await getProfileById(userId);
  if (!existing) {
    throw new Error('User not found.');
  }

  const supabase = getSupabaseAdminClient();

  // Resident accounts own the household they registered: remove the household
  // and its cascading data before the auth user disappears.
  const deletedHouseholds = await deleteHouseholdsLinkedToUser({
    id: existing.id,
    email: existing.email,
  });

  await deleteRowsByIds('user_notifications', 'user_id', [existing.id]);
  await deleteAuditLogsForEntities('user', [existing.id]);

  const attemptDelete = async () => {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      throw new Error(error.message);
    }
  };

  try {
    await attemptDelete();
    return { deletedHouseholds };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown delete failure.';

    // Older schemas can still block auth deletion when user-linked history rows
    // are on restrictive foreign keys. Detach those references when possible,
    // and fall back to clearing the legacy rows before retrying.
    if (message.toLowerCase().includes('database error deleting user')) {
      await clearLinkedHistoryForDeletedUser(userId);

      await attemptDelete().catch((retryError) => {
        throw new Error(
          `Failed to delete the Supabase user after linked-history cleanup: ${
            retryError instanceof Error ? retryError.message : 'unknown error'
          }`,
        );
      });
      return { deletedHouseholds };
    }

    throw new Error(`Failed to delete the Supabase user: ${message}`);
  }
}

export async function createPasswordSetupToken(userId: string): Promise<string> {
  const existing = await getProfileById(userId);
  if (!existing) {
    throw new Error('User not found.');
  }

  try {
    await deleteUnusedTokens('password_setup_tokens', userId);

    const rawToken = createToken();
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from('password_setup_tokens')
      .insert({
        id: `setup_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        user_id: userId,
        token_hash: hashToken(rawToken),
        created_at: nowIso(),
        expires_at: new Date(Date.now() + PASSWORD_TOKEN_TTL_MS).toISOString(),
      });

    if (error) {
      throw new Error(`Failed to create the password setup token: ${error.message}`);
    }

    await writeProfile({
      id: existing.id,
      email: existing.email,
      name: existing.name,
      role: existing.role,
      status: existing.status,
      barangay_id: existing.barangay_id,
      must_change_password: true,
      email_verification_required: existing.email_verification_required,
      email_verified_at: existing.email_verified_at ?? null,
    });

    return rawToken;
  } catch (error) {
    if (!isMissingTokenTableError(error, 'password_setup_tokens')) {
      throw error;
    }

    const updatedUser = await writeProfile({
      id: existing.id,
      email: existing.email,
      name: existing.name,
      role: existing.role,
      status: existing.status,
      barangay_id: existing.barangay_id,
      must_change_password: true,
      email_verification_required: existing.email_verification_required,
      email_verified_at: existing.email_verified_at ?? null,
    });

    return createStatelessToken({
      kind: 'password_setup',
      ttlMs: PASSWORD_TOKEN_TTL_MS,
      user: updatedUser,
    });
  }
}

export async function validatePasswordSetupToken(rawToken: string): Promise<User | null> {
  try {
    const token = await getTokenByHash('password_setup_tokens', rawToken);
    if (!token || !isTokenUsable(token)) {
      return null;
    }

    const user = await getProfileById(token.user_id);
    return user ? toPublicUser(user) : null;
  } catch (error) {
    if (!isMissingTokenTableError(error, 'password_setup_tokens')) {
      throw error;
    }

    const token = parseStatelessToken(rawToken, 'password_setup');
    if (!token) {
      return null;
    }

    const user = await getProfileById(token.user_id);
    if (!user || !user.must_change_password) {
      return null;
    }

    return getRecordVersion(user) === token.version
      ? toPublicUser(user)
      : null;
  }
}

export async function createPasswordResetToken(userId: string): Promise<string> {
  const existing = await getProfileById(userId);
  if (!existing) {
    throw new Error('User not found.');
  }

  try {
    await deleteUnusedTokens('password_setup_tokens', userId);

    const rawToken = createToken();
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from('password_setup_tokens')
      .insert({
        id: `reset_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        user_id: userId,
        token_hash: hashToken(rawToken),
        created_at: nowIso(),
        expires_at: new Date(Date.now() + PASSWORD_TOKEN_TTL_MS).toISOString(),
      });

    if (error) {
      throw new Error(`Failed to create the password reset token: ${error.message}`);
    }

    return rawToken;
  } catch (error) {
    if (!isMissingTokenTableError(error, 'password_setup_tokens')) {
      throw error;
    }

    return createStatelessToken({
      kind: 'password_reset',
      ttlMs: PASSWORD_TOKEN_TTL_MS,
      user: existing,
    });
  }
}

export async function validatePasswordResetToken(rawToken: string): Promise<User | null> {
  try {
    const token = await getTokenByHash('password_setup_tokens', rawToken);
    if (!token || !isTokenUsable(token)) {
      return null;
    }

    const user = await getProfileById(token.user_id);
    return user ? toPublicUser(user) : null;
  } catch (error) {
    if (!isMissingTokenTableError(error, 'password_setup_tokens')) {
      throw error;
    }

    const token = parseStatelessToken(rawToken, 'password_reset');
    if (!token) {
      return null;
    }

    const user = await getProfileById(token.user_id);
    if (!user) {
      return null;
    }

    return getRecordVersion(user) === token.version
      ? toPublicUser(user)
      : null;
  }
}

export async function completePasswordSetup(rawToken: string, password: string): Promise<User> {
  try {
    const token = await getTokenByHash('password_setup_tokens', rawToken);
    if (!token || !isTokenUsable(token)) {
      throw new Error('This password setup link is invalid or has expired.');
    }

    const user = await getProfileById(token.user_id);
    if (!user) {
      throw new Error('User not found.');
    }

    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
    });

    if (error) {
      throw new Error(`Failed to update the Supabase password: ${error.message}`);
    }

    await markTokenUsed('password_setup_tokens', token.id);
    const updatedUser = await writeProfile({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      barangay_id: user.barangay_id,
      must_change_password: false,
      email_verification_required: user.email_verification_required,
      email_verified_at: user.email_verified_at ?? null,
    });

    return toPublicUser(updatedUser);
  } catch (error) {
    if (!isMissingTokenTableError(error, 'password_setup_tokens')) {
      throw error;
    }

    const token = parseStatelessToken(rawToken, 'password_setup');
    if (!token) {
      throw new Error('This password setup link is invalid or has expired.');
    }

    const user = await getProfileById(token.user_id);
    if (!user) {
      throw new Error('User not found.');
    }

    if (!user.must_change_password || getRecordVersion(user) !== token.version) {
      throw new Error('This password setup link is invalid or has expired.');
    }

    const supabase = getSupabaseAdminClient();
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password,
    });

    if (updateError) {
      throw new Error(`Failed to update the Supabase password: ${updateError.message}`);
    }

    const updatedUser = await writeProfile({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      barangay_id: user.barangay_id,
      must_change_password: false,
      email_verification_required: user.email_verification_required,
      email_verified_at: user.email_verified_at ?? null,
    });

    return toPublicUser(updatedUser);
  }
}

export async function completePasswordReset(rawToken: string, password: string): Promise<User> {
  try {
    const token = await getTokenByHash('password_setup_tokens', rawToken);
    if (!token || !isTokenUsable(token)) {
      throw new Error('This password reset link is invalid or has expired.');
    }

    const user = await getProfileById(token.user_id);
    if (!user) {
      throw new Error('User not found.');
    }

    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
    });

    if (error) {
      throw new Error(`Failed to update the Supabase password: ${error.message}`);
    }

    await markTokenUsed('password_setup_tokens', token.id);
    const updatedUser = await writeProfile({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      barangay_id: user.barangay_id,
      must_change_password: false,
      email_verification_required: user.email_verification_required,
      email_verified_at: user.email_verified_at ?? null,
    });

    return toPublicUser(updatedUser);
  } catch (error) {
    if (!isMissingTokenTableError(error, 'password_setup_tokens')) {
      throw error;
    }

    const token = parseStatelessToken(rawToken, 'password_reset');
    if (!token) {
      throw new Error('This password reset link is invalid or has expired.');
    }

    const user = await getProfileById(token.user_id);
    if (!user) {
      throw new Error('User not found.');
    }

    if (getRecordVersion(user) !== token.version) {
      throw new Error('This password reset link is invalid or has expired.');
    }

    const supabase = getSupabaseAdminClient();
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password,
    });

    if (updateError) {
      throw new Error(`Failed to update the Supabase password: ${updateError.message}`);
    }

    const updatedUser = await writeProfile({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      barangay_id: user.barangay_id,
      must_change_password: false,
      email_verification_required: user.email_verification_required,
      email_verified_at: user.email_verified_at ?? null,
    });

    return toPublicUser(updatedUser);
  }
}

export async function createEmailVerificationToken(userId: string): Promise<string> {
  const user = await getProfileById(userId);
  if (!user) {
    throw new Error('User not found.');
  }

  if (user.role !== 'resident') {
    throw new Error('Only resident accounts can use email verification.');
  }

  if (!user.email_verification_required && user.email_verified_at) {
    throw new Error('This account is already verified.');
  }

  try {
    await deleteUnusedTokens('email_verification_tokens', userId);

    const rawToken = createToken();
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from('email_verification_tokens')
      .insert({
        id: `verify_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        user_id: userId,
        token_hash: hashToken(rawToken),
        created_at: nowIso(),
        expires_at: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS).toISOString(),
      });

    if (error) {
      throw new Error(`Failed to create the email verification token: ${error.message}`);
    }

    return rawToken;
  } catch (error) {
    if (!isMissingTokenTableError(error, 'email_verification_tokens')) {
      throw error;
    }

    const updatedUser = await writeProfile({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      barangay_id: user.barangay_id,
      must_change_password: user.must_change_password,
      email_verification_required: true,
      email_verified_at: user.email_verified_at ?? null,
    });

    return createStatelessToken({
      kind: 'email_verification',
      ttlMs: EMAIL_VERIFICATION_TOKEN_TTL_MS,
      user: updatedUser,
    });
  }
}

export async function completeEmailVerification(rawToken: string): Promise<{ user: User; alreadyVerified: boolean }> {
  try {
    const token = await getTokenByHash('email_verification_tokens', rawToken);
    if (!token) {
      throw new Error('This verification link is invalid or has expired.');
    }

    const user = await getProfileById(token.user_id);
    if (!user) {
      throw new Error('User not found.');
    }

    const alreadyVerified =
      Boolean(token.used_at)
      || Boolean(user.email_verified_at)
      || !user.email_verification_required;

    if (!alreadyVerified) {
      const supabase = getSupabaseAdminClient();
      const { error } = await supabase.auth.admin.updateUserById(user.id, {
        email_confirm: true,
      });

      if (error) {
        throw new Error(`Failed to verify the Supabase email address: ${error.message}`);
      }
    }

    if (!token.used_at) {
      await markTokenUsed('email_verification_tokens', token.id);
    }

    const updatedUser = alreadyVerified
      ? user
      : await writeProfile({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
          barangay_id: user.barangay_id,
          must_change_password: user.must_change_password,
          email_verification_required: false,
          email_verified_at: nowIso(),
        });

    return {
      user: toPublicUser(updatedUser),
      alreadyVerified,
    };
  } catch (error) {
    if (!isMissingTokenTableError(error, 'email_verification_tokens')) {
      throw error;
    }

    const token = parseStatelessToken(rawToken, 'email_verification');
    if (!token) {
      throw new Error('This verification link is invalid or has expired.');
    }

    const user = await getProfileById(token.user_id);
    if (!user) {
      throw new Error('User not found.');
    }

    const alreadyVerified =
      Boolean(user.email_verified_at)
      || !user.email_verification_required;

    if (!alreadyVerified && getRecordVersion(user) !== token.version) {
      throw new Error('This verification link is invalid or has expired.');
    }

    if (!alreadyVerified) {
      const supabase = getSupabaseAdminClient();
      const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
        email_confirm: true,
      });

      if (updateError) {
        throw new Error(`Failed to verify the Supabase email address: ${updateError.message}`);
      }
    }

    const updatedUser = alreadyVerified
      ? user
      : await writeProfile({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
          barangay_id: user.barangay_id,
          must_change_password: user.must_change_password,
          email_verification_required: false,
          email_verified_at: nowIso(),
        });

    return {
      user: toPublicUser(updatedUser),
      alreadyVerified,
    };
  }
}

export async function authenticateUser(email: string, password: string): Promise<AuthenticationResult> {
  const user = await getProfileByEmail(email);
  if (!user) {
    return { status: 'invalid_credentials' };
  }

  try {
    const supabase = getSupabasePublicAuthClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });

    if (error) {
      const normalizedMessage = error.message.trim().toLowerCase();
      const looksLikeUnverifiedEmail =
        normalizedMessage.includes('email not confirmed')
        || normalizedMessage.includes('email not verified');

      if (user.role === 'resident' && user.email_verification_required && looksLikeUnverifiedEmail) {
        return {
          status: 'email_not_verified',
          user: toPublicUser(user),
        };
      }

      return { status: 'invalid_credentials' };
    }
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error('Supabase public auth is not configured.');
  }

  if (user.status === 'inactive') {
    return {
      status: 'account_inactive',
      user: toPublicUser(user),
    };
  }

  if (user.role === 'resident' && user.email_verification_required) {
    return {
      status: 'email_not_verified',
      user: toPublicUser(user),
    };
  }

  return {
    status: 'success',
    user: toPublicUser(user),
  };
}

export async function getAuthenticatedUser(email: string, password: string): Promise<User | null> {
  const result = await authenticateUser(email, password);
  return result.status === 'success' ? result.user : null;
}
