import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('resident accounts must verify email before they can log in', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'mswdo-auth-store-'));
  const previousStorePath = process.env.MSWDO_AUTH_STORE_PATH;
  process.env.MSWDO_AUTH_STORE_PATH = path.join(tempDir, 'auth-store.json');

  try {
    const authStore = await import('../lib/server/auth-store');
    const resident = await authStore.createResidentSelfServiceAccount({
      name: 'Resident Example',
      email: 'resident@example.com',
      password: 'resident123',
      barangay_id: 'barangay-1',
    });

    assert.equal(resident.email_verification_required, true);
    assert.equal(resident.email_verified_at, undefined);

    const beforeVerification = await authStore.authenticateUser('resident@example.com', 'resident123');
    assert.equal(beforeVerification.status, 'email_not_verified');

    const token = await authStore.createEmailVerificationToken(resident.id);
    const verified = await authStore.completeEmailVerification(token);

    assert.equal(verified.alreadyVerified, false);
    assert.ok(verified.user.email_verified_at instanceof Date);
    assert.equal(verified.user.email_verification_required, false);

    const afterVerification = await authStore.authenticateUser('resident@example.com', 'resident123');
    assert.equal(afterVerification.status, 'success');

    const resetToken = await authStore.createPasswordResetToken(resident.id);
    const resetUser = await authStore.validatePasswordResetToken(resetToken);

    assert.equal(resetUser?.email, 'resident@example.com');

    const resetResult = await authStore.completePasswordReset(resetToken, 'resident456');
    assert.equal(resetResult.must_change_password, false);

    const oldPasswordResult = await authStore.authenticateUser('resident@example.com', 'resident123');
    assert.equal(oldPasswordResult.status, 'invalid_credentials');

    const newPasswordResult = await authStore.authenticateUser('resident@example.com', 'resident456');
    assert.equal(newPasswordResult.status, 'success');

    const secondVerification = await authStore.completeEmailVerification(token);
    assert.equal(secondVerification.alreadyVerified, true);
  } finally {
    if (previousStorePath) {
      process.env.MSWDO_AUTH_STORE_PATH = previousStorePath;
    } else {
      delete process.env.MSWDO_AUTH_STORE_PATH;
    }

    await rm(tempDir, { recursive: true, force: true });
  }
});
