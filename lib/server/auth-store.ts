import { promises as fs } from 'fs';
import path from 'path';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import type { User, UserRole } from '@/lib/db/schema';
import { resolveWritableFilePath } from '@/lib/server/runtime-storage';

const scrypt = promisify(scryptCallback);

const STORE_PATH = resolveWritableFilePath('MSWDO_AUTH_STORE_PATH', 'auth-store.json');
const STORE_DIR = path.dirname(STORE_PATH);
const PASSWORD_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 3;
const EMAIL_VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 3;

interface StoredUserRecord {
  id: string;
  email: string;
  password_hash?: string;
  name: string;
  role: UserRole;
  barangay_id: string;
  must_change_password: boolean;
  email_verification_required: boolean;
  email_verified_at?: string;
  createdAt: string;
  updatedAt: string;
}

interface PasswordSetupTokenRecord {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  used_at?: string;
}

interface EmailVerificationTokenRecord {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  used_at?: string;
}

interface AuthStore {
  users: StoredUserRecord[];
  password_setup_tokens: PasswordSetupTokenRecord[];
  email_verification_tokens: EmailVerificationTokenRecord[];
}

export type AuthenticationResult =
  | { status: 'success'; user: User }
  | { status: 'invalid_credentials' }
  | { status: 'email_not_verified'; user: User };

let writeQueue = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

function generateId(prefix: string) {
  return `${prefix}_${Date.now()}_${randomBytes(6).toString('hex')}`;
}

function createToken() {
  return randomBytes(32).toString('base64url');
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function normalizeUserRecord(record: StoredUserRecord): StoredUserRecord {
  return {
    ...record,
    email_verification_required: typeof record.email_verification_required === 'boolean'
      ? record.email_verification_required
      : false,
    email_verified_at: record.email_verified_at,
  };
}

function normalizeStore(store: AuthStore): AuthStore {
  return {
    users: Array.isArray(store.users) ? store.users.map(normalizeUserRecord) : [],
    password_setup_tokens: Array.isArray(store.password_setup_tokens) ? store.password_setup_tokens : [],
    email_verification_tokens: Array.isArray(store.email_verification_tokens) ? store.email_verification_tokens : [],
  };
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, passwordHash?: string): Promise<boolean> {
  if (!passwordHash) return false;

  const [salt, storedHash] = passwordHash.split(':');
  if (!salt || !storedHash) return false;

  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const stored = Buffer.from(storedHash, 'hex');

  if (stored.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(stored, derived);
}

function toPublicUser(record: StoredUserRecord): User {
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    role: record.role,
    barangay_id: record.barangay_id,
    must_change_password: record.must_change_password,
    email_verification_required: record.email_verification_required,
    email_verified_at: record.email_verified_at ? new Date(record.email_verified_at) : undefined,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

async function createSeedUser(input: {
  id: string;
  email: string;
  password: string;
  name: string;
  role: UserRole;
  barangay_id: string;
}): Promise<StoredUserRecord> {
  const timestamp = nowIso();

  return {
    id: input.id,
    email: input.email.toLowerCase(),
    password_hash: await hashPassword(input.password),
    name: input.name,
    role: input.role,
    barangay_id: input.barangay_id,
    must_change_password: false,
    email_verification_required: false,
    email_verified_at: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function createInitialStore(): Promise<AuthStore> {
  return {
    users: await Promise.all([
      createSeedUser({
        id: 'user-admin-1',
        email: 'admin@mswdo.local',
        password: 'admin123',
        name: 'Maria Santos',
        role: 'admin',
        barangay_id: 'barangay-1',
      }),
      createSeedUser({
        id: 'user-encoder-1',
        email: 'encoder@barangay.local',
        password: 'encoder123',
        name: 'Juan dela Cruz',
        role: 'encoder',
        barangay_id: 'barangay-1',
      }),
      createSeedUser({
        id: 'user-health-1',
        email: 'health@barangay.local',
        password: 'health123',
        name: 'Dr. Rosa Garcia',
        role: 'health_worker',
        barangay_id: 'barangay-1',
      }),
      createSeedUser({
        id: 'user-responder-1',
        email: 'responder@drrmo.local',
        password: 'responder123',
        name: 'Pedro Reyes',
        role: 'responder',
        barangay_id: 'barangay-1',
      }),
    ]),
    password_setup_tokens: [],
    email_verification_tokens: [],
  };
}

async function ensureStoreFile() {
  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.mkdir(STORE_DIR, { recursive: true });
    const initialStore = await createInitialStore();
    await fs.writeFile(STORE_PATH, JSON.stringify(initialStore, null, 2), 'utf8');
  }
}

async function readStore(): Promise<AuthStore> {
  await writeQueue;
  await ensureStoreFile();
  const raw = await fs.readFile(STORE_PATH, 'utf8');
  return normalizeStore(JSON.parse(raw) as AuthStore);
}

async function withStoreWrite<T>(updater: (store: AuthStore) => Promise<T>): Promise<T> {
  const operation = async () => {
    await ensureStoreFile();
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    const store = normalizeStore(JSON.parse(raw) as AuthStore);
    const result = await updater(store);
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
    return result;
  };

  const next = writeQueue.then(operation);
  writeQueue = next.then(() => undefined, () => undefined);
  return next;
}

function removeExpiredTokens(store: AuthStore) {
  const now = Date.now();
  store.password_setup_tokens = store.password_setup_tokens.filter((token) => {
    if (token.used_at) return true;
    return new Date(token.expires_at).getTime() > now;
  });
  store.email_verification_tokens = store.email_verification_tokens.filter((token) => {
    if (token.used_at) return true;
    return new Date(token.expires_at).getTime() > now;
  });
}

export async function listUsers(): Promise<User[]> {
  const store = await readStore();
  return store.users
    .map(toPublicUser)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function getStoredUserById(userId: string): Promise<StoredUserRecord | null> {
  const store = await readStore();
  return store.users.find((user) => user.id === userId) ?? null;
}

export async function getStoredUserByEmail(email: string): Promise<StoredUserRecord | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const store = await readStore();
  return store.users.find((user) => user.email === normalizedEmail) ?? null;
}

export async function createUserAccount(input: {
  name: string;
  email: string;
  role: UserRole;
  barangay_id: string;
}): Promise<User> {
  return withStoreWrite(async (store) => {
    const normalizedEmail = input.email.trim().toLowerCase();
    if (store.users.some((user) => user.email === normalizedEmail)) {
      throw new Error('An account with this email already exists.');
    }

    const timestamp = nowIso();
    const record: StoredUserRecord = {
      id: generateId('user'),
      email: normalizedEmail,
      password_hash: undefined,
      name: input.name.trim(),
      role: input.role,
      barangay_id: input.barangay_id.trim(),
      must_change_password: true,
      email_verification_required: false,
      email_verified_at: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    store.users.push(record);
    return toPublicUser(record);
  });
}

export async function createResidentSelfServiceAccount(input: {
  name: string;
  email: string;
  password: string;
  barangay_id: string;
}): Promise<User> {
  return withStoreWrite(async (store) => {
    const normalizedEmail = input.email.trim().toLowerCase();
    if (store.users.some((user) => user.email === normalizedEmail)) {
      throw new Error('An account with this email already exists.');
    }

    const timestamp = nowIso();
    const record: StoredUserRecord = {
      id: generateId('resident'),
      email: normalizedEmail,
      password_hash: await hashPassword(input.password),
      name: input.name.trim(),
      role: 'resident',
      barangay_id: input.barangay_id.trim(),
      must_change_password: false,
      email_verification_required: true,
      email_verified_at: undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    store.users.push(record);
    return toPublicUser(record);
  });
}

export async function updateUserAccount(
  userId: string,
  patch: Partial<Pick<User, 'name' | 'role' | 'barangay_id'>>,
): Promise<User> {
  return withStoreWrite(async (store) => {
    const user = store.users.find((entry) => entry.id === userId);
    if (!user) {
      throw new Error('User not found.');
    }

    user.name = patch.name?.trim() || user.name;
    user.role = patch.role || user.role;
    user.barangay_id = patch.barangay_id?.trim() || user.barangay_id;
    user.updatedAt = nowIso();

    return toPublicUser(user);
  });
}

export async function deleteUserAccount(userId: string): Promise<void> {
  await withStoreWrite(async (store) => {
    const nextUsers = store.users.filter((user) => user.id !== userId);
    if (nextUsers.length === store.users.length) {
      throw new Error('User not found.');
    }

    store.users = nextUsers;
    store.password_setup_tokens = store.password_setup_tokens.filter((token) => token.user_id !== userId);
    store.email_verification_tokens = store.email_verification_tokens.filter((token) => token.user_id !== userId);
  });
}

export async function createPasswordSetupToken(userId: string): Promise<string> {
  return withStoreWrite(async (store) => {
    removeExpiredTokens(store);

    const user = store.users.find((entry) => entry.id === userId);
    if (!user) {
      throw new Error('User not found.');
    }

    const rawToken = createToken();
    const timestamp = nowIso();

    store.password_setup_tokens = store.password_setup_tokens.filter((token) => (
      token.user_id !== userId || Boolean(token.used_at)
    ));

    store.password_setup_tokens.push({
      id: generateId('setup'),
      user_id: userId,
      token_hash: hashToken(rawToken),
      created_at: timestamp,
      expires_at: new Date(Date.now() + PASSWORD_TOKEN_TTL_MS).toISOString(),
    });

    user.must_change_password = true;
    user.updatedAt = timestamp;

    return rawToken;
  });
}

export async function validatePasswordSetupToken(rawToken: string): Promise<User | null> {
  const store = await readStore();
  removeExpiredTokens(store);

  const token = store.password_setup_tokens.find((entry) => (
    entry.token_hash === hashToken(rawToken)
    && !entry.used_at
    && new Date(entry.expires_at).getTime() > Date.now()
  ));

  if (!token) return null;

  const user = store.users.find((entry) => entry.id === token.user_id);
  return user ? toPublicUser(user) : null;
}

export async function completePasswordSetup(rawToken: string, password: string): Promise<User> {
  return withStoreWrite(async (store) => {
    removeExpiredTokens(store);

    const token = store.password_setup_tokens.find((entry) => (
      entry.token_hash === hashToken(rawToken)
      && !entry.used_at
      && new Date(entry.expires_at).getTime() > Date.now()
    ));

    if (!token) {
      throw new Error('This password setup link is invalid or has expired.');
    }

    const user = store.users.find((entry) => entry.id === token.user_id);
    if (!user) {
      throw new Error('User not found.');
    }

    user.password_hash = await hashPassword(password);
    user.must_change_password = false;
    user.updatedAt = nowIso();

    token.used_at = nowIso();

    return toPublicUser(user);
  });
}

export async function createEmailVerificationToken(userId: string): Promise<string> {
  return withStoreWrite(async (store) => {
    removeExpiredTokens(store);

    const user = store.users.find((entry) => entry.id === userId);
    if (!user) {
      throw new Error('User not found.');
    }

    if (user.role !== 'resident') {
      throw new Error('Only resident accounts can use email verification.');
    }

    if (!user.email_verification_required && user.email_verified_at) {
      throw new Error('This account is already verified.');
    }

    const rawToken = createToken();
    const timestamp = nowIso();

    store.email_verification_tokens = store.email_verification_tokens.filter((token) => (
      token.user_id !== userId || Boolean(token.used_at)
    ));

    store.email_verification_tokens.push({
      id: generateId('verify'),
      user_id: userId,
      token_hash: hashToken(rawToken),
      created_at: timestamp,
      expires_at: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS).toISOString(),
    });

    user.updatedAt = timestamp;

    return rawToken;
  });
}

export async function completeEmailVerification(rawToken: string): Promise<{ user: User; alreadyVerified: boolean }> {
  return withStoreWrite(async (store) => {
    removeExpiredTokens(store);

    const token = store.email_verification_tokens.find((entry) => entry.token_hash === hashToken(rawToken));
    if (!token) {
      throw new Error('This verification link is invalid or has expired.');
    }

    const user = store.users.find((entry) => entry.id === token.user_id);
    if (!user) {
      throw new Error('User not found.');
    }

    const alreadyVerified = Boolean(token.used_at) || Boolean(user.email_verified_at) || !user.email_verification_required;
    const timestamp = nowIso();

    if (!alreadyVerified) {
      user.email_verified_at = timestamp;
      user.email_verification_required = false;
      user.updatedAt = timestamp;
      token.used_at = timestamp;
    } else if (!token.used_at) {
      token.used_at = timestamp;
    }

    return {
      user: toPublicUser(user),
      alreadyVerified,
    };
  });
}

export async function authenticateUser(email: string, password: string): Promise<AuthenticationResult> {
  const user = await getStoredUserByEmail(email);
  if (!user || !user.password_hash) {
    return { status: 'invalid_credentials' };
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return { status: 'invalid_credentials' };
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
