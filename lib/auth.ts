import type { User, UserRole, AuthContext } from './db/schema';
import { getSupabaseBrowserClient, getSupabaseBrowserConfig } from './supabase/client';
import { runServerMutation } from './mutations';

export class AuthRequestError extends Error {
  code?: string;
  email?: string;
  status?: number;

  constructor(
    message: string,
    options?: {
      code?: string;
      email?: string;
      status?: number;
    },
  ) {
    super(message);
    this.name = 'AuthRequestError';
    this.code = options?.code;
    this.email = options?.email;
    this.status = options?.status;
  }
}

// Role-based permissions matrix
const PERMISSIONS = {
  admin: [
    'view_all',
    'manage_users',
    'export_data',
    'manage_inventory',
    'generate_reports',
  ],
  encoder: [
    'view_households',
    'create_household',
    'update_resident',
    'view_vulnerability',
    'view_reports',
    'manage_inventory',
  ],
  health_worker: [
    'view_residents',
    'update_health_flags',
    'view_vulnerability',
  ],
  responder: [
    'view_vulnerable',
    'view_incidents',
    'update_incident_status',
    'view_map',
  ],
  resident: [
    'register_self',
    'view_own_registration',
  ],
};

// In-memory auth state hydrated from the server-backed session cookie.
let currentUser: User | null = null;
let hydratePromise: Promise<User | null> | null = null;
let sessionSource: 'server' | 'snapshot' | null = null;
const AUTH_SNAPSHOT_KEY = 'mswdo.auth.snapshot';
const AUTH_SESSION_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeUser(user: User | null): User | null {
  if (!user) return null;

  return {
    ...user,
    email_verified_at: user.email_verified_at ? new Date(user.email_verified_at) : undefined,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  };
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readStoredSessionSnapshot(): User | null {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(AUTH_SNAPSHOT_KEY);
    if (!raw) return null;
    return normalizeUser(JSON.parse(raw) as User);
  } catch (error) {
    console.error('Failed to read cached auth snapshot:', error);
    return null;
  }
}

function persistSessionSnapshot(user: User | null) {
  if (!canUseStorage()) return;

  try {
    if (!user) {
      window.localStorage.removeItem(AUTH_SNAPSHOT_KEY);
      return;
    }

    window.localStorage.setItem(
      AUTH_SNAPSHOT_KEY,
      JSON.stringify({
        ...user,
        email_verified_at: user.email_verified_at ? user.email_verified_at.toISOString() : undefined,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      }),
    );
  } catch (error) {
    console.error('Failed to persist cached auth snapshot:', error);
  }
}

export async function ensureSupabaseBrowserSession(email: string, password: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!getSupabaseBrowserConfig().isConfigured || !supabase) {
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user?.email?.trim().toLowerCase() === normalizedEmail) {
    return;
  }

  if (session) {
    await supabase.auth.signOut();
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) {
    throw new Error(`Supabase realtime sign-in failed: ${error.message}`);
  }
}

async function clearSupabaseBrowserSession(): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!getSupabaseBrowserConfig().isConfigured || !supabase) {
    return;
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    console.warn('Supabase browser sign-out failed:', error.message);
  }
}

export function setAuthenticatedUser(user: User | null) {
  currentUser = normalizeUser(user);
  sessionSource = currentUser ? 'server' : null;
  persistSessionSnapshot(currentUser);
}

/**
 * Get current authenticated user
 */
export function getCurrentUser(): User | null {
  return currentUser;
}

/**
 * Get current user's role
 */
export function getCurrentRole(): UserRole | null {
  return currentUser?.role || null;
}

/**
 * Check if user has a specific role
 */
export function hasRole(role: UserRole | UserRole[]): boolean {
  if (!currentUser) return false;
  const roles = Array.isArray(role) ? role : [role];
  return roles.includes(currentUser.role);
}

/**
 * Check if user has permission for an action
 */
export function hasPermission(action: string): boolean {
  if (!currentUser) return false;
  const rolePermissions = PERMISSIONS[currentUser.role];
  return rolePermissions.includes(action) || rolePermissions.includes('view_all');
}

export function isResidentUser(user: User | null | undefined): user is User & { role: 'resident' } {
  return Boolean(user && user.role === 'resident');
}

export function getDefaultRouteForUser(user: User | null | undefined): string {
  if (!user) return '/login';
  return user.role === 'resident' ? '/resident' : '/dashboard';
}

/**
 * Login user with email and password via the server auth API.
 */
export async function login(email: string, password: string): Promise<User> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const payload = await response.json().catch(() => ({})) as {
    error?: string;
    code?: string;
    email?: string;
    user?: User | null;
  };

  if (!response.ok) {
    throw new AuthRequestError(payload.error || 'Login failed', {
      code: typeof payload.code === 'string' ? payload.code : undefined,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      status: response.status,
    });
  }

  const user = normalizeUser(payload.user as User | null);
  if (!user) {
    throw new Error('Login failed');
  }

  try {
    await ensureSupabaseBrowserSession(user.email, password);
  } catch (error) {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => null);

    throw error instanceof Error ? error : new Error('Supabase realtime sign-in failed');
  }

  currentUser = user;
  sessionSource = 'server';
  persistSessionSnapshot(currentUser);
  return user;
}

/**
 * Logout current user
 */
export async function logout(): Promise<void> {
  try {
    await clearSupabaseBrowserSession();
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Logout failed:', error);
  } finally {
    currentUser = null;
    sessionSource = null;
    persistSessionSnapshot(null);
    await import('@/lib/supabase/bootstrap')
      .then(({ clearSupabaseBootstrapData }) => clearSupabaseBootstrapData({
        includeSyncQueue: true,
        notifyTables: false,
      }))
      .catch((error) => {
        console.warn('Failed to clear local Supabase mirror on logout:', error);
      });
  }
}

/**
 * Return the current hydrated session user.
 */
export function restoreSession(): User | null {
  return currentUser;
}

/**
 * Hydrate session state from the secure HTTP-only cookie.
 */
export async function hydrateSession(force = false): Promise<User | null> {
  if (!force && currentUser && sessionSource === 'server') {
    return currentUser;
  }

  if (!force && hydratePromise) {
    return hydratePromise;
  }

  hydratePromise = fetchWithTimeout('/api/auth/session', {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  }, AUTH_SESSION_TIMEOUT_MS)
    .catch(async (error) => {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn(`Session hydration timed out after ${AUTH_SESSION_TIMEOUT_MS}ms.`);
      }

      throw error;
    })
    .then(async (response) => {
      if (!response.ok) {
        currentUser = null;
        sessionSource = null;
        persistSessionSnapshot(null);
        return null;
      }

      const payload = await response.json();
      currentUser = normalizeUser((payload.user ?? null) as User | null);
      sessionSource = currentUser ? 'server' : null;
      persistSessionSnapshot(currentUser);
      return currentUser;
    })
    .catch((error) => {
      console.error('Failed to hydrate session:', error);
      currentUser = null;
      sessionSource = null;
      persistSessionSnapshot(null);
      return null;
    })
    .finally(() => {
      hydratePromise = null;
    });

  return hydratePromise;
}

/**
 * Get auth context for React components
 */
export function getAuthContext(): AuthContext {
  return {
    user: currentUser,
    role: currentUser?.role || null,
    isLoading: false,
    login: async (email: string, password: string) => {
      await login(email, password);
    },
    logout: async () => {
      await logout();
    },
    hasRole,
    hasPermission,
  };
}

/**
 * Create audit log entry
 */
export async function createAuditLog(
  action: string,
  entity_type: 'household' | 'resident' | 'distribution' | 'incident' | 'inventory' | 'user' | 'location_master',
  entity_id: string,
  changes?: Record<string, any>
): Promise<void> {
  if (!currentUser) return;

  try {
    await runServerMutation({
      action: 'create_audit_log',
      auditAction: action,
      entityType: entity_type,
      entityId: entity_id,
      changes,
    });
    console.log('Audit log created:', action);
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
}
