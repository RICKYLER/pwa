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
};

// In-memory auth state
let currentUser: User | null = null;

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

/**
 * Login user with email and password
 * In MVP, using simple password matching (production should use bcrypt)
 */
export async function login(email: string, password: string): Promise<User> {
  console.log(`Attempting login for ${email}`);

  try {
    // Get user from IndexedDB
    const users = await db.getAll<User>(STORE_NAMES.users);
    const user = users.find(u => u.email === email);

    if (!user) {
      throw new Error('User not found');
    }

    // Simple password check (TODO: use bcrypt in production)
    if (user.password_hash !== password) {
      throw new Error('Invalid password');
    }

    // Set current user
    currentUser = user;

    // Store in localStorage for persistence
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('auth_token', `token_${user.id}_${Date.now()}`);

    console.log(`Login successful for ${user.name} (${user.role})`);
    return user;
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
}

/**
 * Logout current user
 */
export function logout(): void {
  console.log('Logging out user:', currentUser?.name);
  currentUser = null;
  localStorage.removeItem('auth_user');
  localStorage.removeItem('auth_token');
}

/**
 * Restore session from localStorage
 * Call this on app initialization
 */
export function restoreSession(): User | null {
  try {
    const stored = localStorage.getItem('auth_user');
    if (stored) {
      currentUser = JSON.parse(stored);
      console.log('Session restored for:', currentUser.name);
      return currentUser;
    }
  } catch (error) {
    console.error('Failed to restore session:', error);
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_token');
  }
  return null;
}

/**
 * Get auth context for React components
 */
export function getAuthContext(): AuthContext {
  return {
    user: currentUser,
    role: currentUser?.role || null,
    isLoading: false,
    login,
    logout,
    hasRole,
    hasPermission,
  };
}

/**
 * Create audit log entry
 */
export async function createAuditLog(
  action: string,
  entity_type: 'household' | 'resident' | 'distribution' | 'incident' | 'inventory' | 'user',
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
    };

    await db.add(STORE_NAMES.audit_logs, log);
    console.log('Audit log created:', action);
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
}
