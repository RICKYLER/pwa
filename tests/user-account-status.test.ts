import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('staff accounts can be deactivated and reactivated without deleting the record', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'mswdo-auth-store-'));
  const previousStorePath = process.env.MSWDO_AUTH_STORE_PATH;
  process.env.MSWDO_AUTH_STORE_PATH = path.join(tempDir, 'auth-store.json');

  try {
    const authStore = await import('../lib/server/auth-store');
    const staff = await authStore.createUserAccount({
      name: 'Encoder Example',
      email: 'encoder@example.com',
      role: 'encoder',
      barangay_id: 'anitapan',
    });

    assert.equal(staff.status, 'active');

    const setupToken = await authStore.createPasswordSetupToken(staff.id);
    await authStore.completePasswordSetup(setupToken, 'encoder123');

    const activeLogin = await authStore.authenticateUser('encoder@example.com', 'encoder123');
    assert.equal(activeLogin.status, 'success');

    const inactiveUser = await authStore.updateUserAccount(staff.id, { status: 'inactive' });
    assert.equal(inactiveUser.status, 'inactive');

    const inactiveLogin = await authStore.authenticateUser('encoder@example.com', 'encoder123');
    assert.equal(inactiveLogin.status, 'account_inactive');

    const reactivatedUser = await authStore.updateUserAccount(staff.id, { status: 'active' });
    assert.equal(reactivatedUser.status, 'active');

    const reactivatedLogin = await authStore.authenticateUser('encoder@example.com', 'encoder123');
    assert.equal(reactivatedLogin.status, 'success');
  } finally {
    if (previousStorePath) {
      process.env.MSWDO_AUTH_STORE_PATH = previousStorePath;
    } else {
      delete process.env.MSWDO_AUTH_STORE_PATH;
    }

    await rm(tempDir, { recursive: true, force: true });
  }
});

test('staff accounts can also be permanently deleted when needed', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'mswdo-auth-store-'));
  const previousStorePath = process.env.MSWDO_AUTH_STORE_PATH;
  process.env.MSWDO_AUTH_STORE_PATH = path.join(tempDir, 'auth-store.json');

  try {
    const authStore = await import('../lib/server/auth-store');
    const staff = await authStore.createUserAccount({
      name: 'Health Worker Example',
      email: 'health-worker@example.com',
      role: 'health_worker',
      barangay_id: 'anitapan',
    });

    const setupToken = await authStore.createPasswordSetupToken(staff.id);
    await authStore.completePasswordSetup(setupToken, 'healthworker123');

    const activeLogin = await authStore.authenticateUser('health-worker@example.com', 'healthworker123');
    assert.equal(activeLogin.status, 'success');

    await authStore.deleteUserAccount(staff.id);

    const deletedUser = await authStore.getStoredUserById(staff.id);
    assert.equal(deletedUser, null);

    const deletedLogin = await authStore.authenticateUser('health-worker@example.com', 'healthworker123');
    assert.equal(deletedLogin.status, 'invalid_credentials');
  } finally {
    if (previousStorePath) {
      process.env.MSWDO_AUTH_STORE_PATH = previousStorePath;
    } else {
      delete process.env.MSWDO_AUTH_STORE_PATH;
    }

    await rm(tempDir, { recursive: true, force: true });
  }
});
