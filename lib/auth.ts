import type { User, UserRole, AuthContext } from './db/schema';
import { db, STORE_NAMES } from './db/indexeddb';

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

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Login failed');
  }

  const user = normalizeUser(payload.user as User | null);
  if (!user) {
    throw new Error('Login failed');
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
  }
}

/**
 * Return the current hydrated session user.
 */
export function restoreSession(): User | null {
  if (!currentUser) {
    const snapshot = readStoredSessionSnapshot();
    if (snapshot) {
      currentUser = snapshot;
      sessionSource = 'snapshot';
    }
  }

  return currentUser;
}

/**
 * Hydrate session state from the secure HTTP-only cookie.
 */
export async function hydrateSession(force = false): Promise<User | null> {
  const snapshot = !force ? restoreSession() : null;
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  if (!force && currentUser && sessionSource === 'server') {
    return currentUser;
  }

  if (!force && snapshot && isOffline) {
    return snapshot;
  }

  if (!force && hydratePromise) {
    return hydratePromise;
  }

  hydratePromise = fetch('/api/auth/session', {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
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

      if (snapshot) {
        currentUser = snapshot;
        sessionSource = 'snapshot';
        return snapshot;
      }

      currentUser = null;
      sessionSource = null;
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
    const log = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user_id: currentUser.id,
      action,
      entity_type,
      entity_id,
      changes,
      timestamp: new Date(),
      syncStatus: 'pending' as const,
    };

    await db.add(STORE_NAMES.audit_logs, log);
    console.log('Audit log created:', action);
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
}
