import type { User } from '@/lib/db/schema';
import * as localStore from '@/lib/server/local-auth-store';

export type AuthenticationResult = localStore.AuthenticationResult;
export type StoredUserRecord = localStore.StoredUserRecord;

type AuthStoreApi = {
  listUsers: typeof localStore.listUsers;
  getStoredUserById: typeof localStore.getStoredUserById;
  getStoredUserByEmail: typeof localStore.getStoredUserByEmail;
  createUserAccount: typeof localStore.createUserAccount;
  createResidentSelfServiceAccount: typeof localStore.createResidentSelfServiceAccount;
  updateUserAccount: typeof localStore.updateUserAccount;
  deleteUserAccount: typeof localStore.deleteUserAccount;
  createPasswordSetupToken: typeof localStore.createPasswordSetupToken;
  validatePasswordSetupToken: typeof localStore.validatePasswordSetupToken;
  completePasswordSetup: typeof localStore.completePasswordSetup;
  createPasswordResetToken: typeof localStore.createPasswordResetToken;
  validatePasswordResetToken: typeof localStore.validatePasswordResetToken;
  completePasswordReset: typeof localStore.completePasswordReset;
  createEmailVerificationToken: typeof localStore.createEmailVerificationToken;
  completeEmailVerification: typeof localStore.completeEmailVerification;
  authenticateUser: typeof localStore.authenticateUser;
  getAuthenticatedUser: typeof localStore.getAuthenticatedUser;
};

function hasSupabaseAuthStoreConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    && (
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
      || process.env.SUPABASE_SECRET_KEY?.trim()
    ),
  );
}

async function getSupabaseStore() {
  return import('@/lib/server/supabase-auth-store');
}

function useLocalAuthStore() {
  return process.env.NODE_ENV === 'test' || Boolean(process.env.MSWDO_AUTH_STORE_PATH?.trim());
}

async function getAuthStore(): Promise<AuthStoreApi> {
  if (useLocalAuthStore()) {
    return localStore;
  }

  if (!hasSupabaseAuthStoreConfig()) {
    throw new Error(
      'Supabase auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before using the app.',
    );
  }

  return getSupabaseStore();
}

export async function listUsers() {
  return (await getAuthStore()).listUsers();
}

export async function getStoredUserById(userId: string) {
  return (await getAuthStore()).getStoredUserById(userId);
}

export async function getStoredUserByEmail(email: string) {
  return (await getAuthStore()).getStoredUserByEmail(email);
}

export async function createUserAccount(input: {
  name: string;
  email: string;
  role: User['role'];
  barangay_id: string;
}) {
  return (await getAuthStore()).createUserAccount(input);
}

export async function createResidentSelfServiceAccount(input: {
  name: string;
  email: string;
  password: string;
  barangay_id: string;
}) {
  return (await getAuthStore()).createResidentSelfServiceAccount(input);
}

export async function updateUserAccount(
  userId: string,
  patch: Partial<Pick<User, 'name' | 'role' | 'status' | 'barangay_id'>>,
) {
  return (await getAuthStore()).updateUserAccount(userId, patch);
}

export async function deleteUserAccount(userId: string) {
  return (await getAuthStore()).deleteUserAccount(userId);
}

export async function createPasswordSetupToken(userId: string) {
  return (await getAuthStore()).createPasswordSetupToken(userId);
}

export async function validatePasswordSetupToken(rawToken: string) {
  return (await getAuthStore()).validatePasswordSetupToken(rawToken);
}

export async function completePasswordSetup(rawToken: string, password: string) {
  return (await getAuthStore()).completePasswordSetup(rawToken, password);
}

export async function createPasswordResetToken(userId: string) {
  return (await getAuthStore()).createPasswordResetToken(userId);
}

export async function validatePasswordResetToken(rawToken: string) {
  return (await getAuthStore()).validatePasswordResetToken(rawToken);
}

export async function completePasswordReset(rawToken: string, password: string) {
  return (await getAuthStore()).completePasswordReset(rawToken, password);
}

export async function createEmailVerificationToken(userId: string) {
  return (await getAuthStore()).createEmailVerificationToken(userId);
}

export async function completeEmailVerification(rawToken: string) {
  return (await getAuthStore()).completeEmailVerification(rawToken);
}

export async function authenticateUser(email: string, password: string): Promise<AuthenticationResult> {
  return (await getAuthStore()).authenticateUser(email, password);
}

export async function getAuthenticatedUser(email: string, password: string) {
  return (await getAuthStore()).getAuthenticatedUser(email, password);
}
