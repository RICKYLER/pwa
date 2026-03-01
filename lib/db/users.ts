import { db, STORE_NAMES } from './indexeddb';
import type { User, UserRole } from './schema';

/** Return all users from IndexedDB */
export async function getAllUsers(): Promise<User[]> {
    return db.getAll<User>(STORE_NAMES.users);
}

/** Create a new user account (admin only). Password stored as plain text for MVP. */
export async function createUser(data: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    barangay_id: string;
}): Promise<User> {
    const existing = await getAllUsers();
    if (existing.find(u => u.email.toLowerCase() === data.email.toLowerCase())) {
        throw new Error('An account with this email already exists.');
    }

    const now = new Date();
    const user: User = {
        id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        email: data.email.toLowerCase().trim(),
        password_hash: data.password, // MVP: plain text (see TODOs in lib/auth.ts)
        name: data.name.trim(),
        role: data.role,
        barangay_id: data.barangay_id.trim(),
        createdAt: now,
        updatedAt: now,
    };

    await db.add<User>(STORE_NAMES.users, user);
    return user;
}

/** Update an existing user's editable fields */
export async function updateUser(
    id: string,
    patch: Partial<Pick<User, 'name' | 'role' | 'barangay_id'>> & { password?: string }
): Promise<void> {
    const users = await getAllUsers();
    const user = users.find(u => u.id === id);
    if (!user) throw new Error('User not found.');

    const updated: User = {
        ...user,
        name: patch.name ?? user.name,
        role: patch.role ?? user.role,
        barangay_id: patch.barangay_id ?? user.barangay_id,
        password_hash: patch.password ? patch.password : user.password_hash,
        updatedAt: new Date(),
    };

    await db.put<User>(STORE_NAMES.users, updated);
}

/** Delete a user account by ID */
export async function deleteUser(id: string): Promise<void> {
    await db.delete(STORE_NAMES.users, id);
}
