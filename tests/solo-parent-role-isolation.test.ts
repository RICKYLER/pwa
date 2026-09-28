import assert from 'node:assert/strict';
import test from 'node:test';
import { getDefaultRouteForUser, hasPermission } from '../lib/auth';
import type { User } from '../lib/db/schema';

function makeUser(overrides: Partial<User>): User {
  return {
    id: overrides.id ?? 'user-default',
    email: overrides.email ?? 'user@example.com',
    name: overrides.name ?? 'Default User',
    role: overrides.role ?? 'solo_parent_focal',
    status: overrides.status ?? 'active',
    barangay_id: overrides.barangay_id ?? 'anitapan',
    must_change_password: overrides.must_change_password ?? false,
    createdAt: overrides.createdAt ?? new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2025-01-01T00:00:00.000Z'),
  };
}

test('solo_parent_focal routes directly to /solo-parents upon login', () => {
  const soloParentOfficer = makeUser({ role: 'solo_parent_focal' });
  assert.equal(getDefaultRouteForUser(soloParentOfficer), '/solo-parents');
});

test('encoder and admin routes to /dashboard', () => {
  const encoder = makeUser({ role: 'encoder' });
  const admin = makeUser({ role: 'admin' });
  assert.equal(getDefaultRouteForUser(encoder), '/dashboard');
  assert.equal(getDefaultRouteForUser(admin), '/dashboard');
});
