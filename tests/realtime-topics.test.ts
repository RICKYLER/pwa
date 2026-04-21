import assert from 'node:assert/strict';
import test from 'node:test';
import { getRealtimeTopicsForUser } from '../lib/supabase/realtime-topics';
import type { User } from '../lib/db/schema';

function makeUser(overrides: Partial<User>): User {
  return {
    id: overrides.id ?? 'user-default',
    email: overrides.email ?? 'user@example.com',
    name: overrides.name ?? 'Default User',
    role: overrides.role ?? 'encoder',
    status: overrides.status ?? 'active',
    barangay_id: overrides.barangay_id ?? 'anitapan',
    must_change_password: overrides.must_change_password ?? false,
    createdAt: overrides.createdAt ?? new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2025-01-01T00:00:00.000Z'),
  };
}

test('admin users subscribe to admin-scoped realtime topics', () => {
  const topics = getRealtimeTopicsForUser(makeUser({ role: 'admin' }));

  assert.deepEqual(topics, [
    'global:programs',
    'role:admin:registry',
    'role:admin:inventory',
    'role:admin:distribution',
    'role:admin:incidents',
    'role:admin:audit',
    'user:user-default:notifications',
  ]);
});

test('responder users subscribe to incident topics and personal notifications', () => {
  const topics = getRealtimeTopicsForUser(makeUser({
    id: 'responder-456',
    role: 'responder',
    barangay_id: 'pindasan',
  }));

  assert.deepEqual(topics, [
    'global:programs',
    'barangay:pindasan:registry',
    'role:incident_staff:incidents',
    'user:responder-456:notifications',
  ]);
});

test('resident users subscribe only to their own scoped realtime topics', () => {
  const topics = getRealtimeTopicsForUser(makeUser({
    id: 'resident-123',
    role: 'resident',
  }));

  assert.deepEqual(topics, [
    'global:programs',
    'user:resident-123:registry',
    'user:resident-123:audit',
    'user:resident-123:notifications',
  ]);
});
