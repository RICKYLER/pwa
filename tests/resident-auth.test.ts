import assert from 'node:assert/strict';
import test from 'node:test';
import { getDefaultRouteForUser, isResidentUser } from '../lib/auth';
import type { User } from '../lib/db/schema';

function makeUser(overrides: Partial<User>): User {
  return {
    id: overrides.id ?? 'user-default',
    email: overrides.email ?? 'user@example.com',
    name: overrides.name ?? 'Default User',
    role: overrides.role ?? 'encoder',
    barangay_id: overrides.barangay_id ?? 'barangay-1',
    must_change_password: overrides.must_change_password ?? false,
    createdAt: overrides.createdAt ?? new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2025-01-01T00:00:00.000Z'),
  };
}

test('resident users are detected and routed to the resident portal', () => {
  const resident = makeUser({ role: 'resident' });
  const staff = makeUser({ role: 'admin' });

  assert.equal(isResidentUser(resident), true);
  assert.equal(isResidentUser(staff), false);
  assert.equal(getDefaultRouteForUser(resident), '/resident');
  assert.equal(getDefaultRouteForUser(staff), '/dashboard');
});
