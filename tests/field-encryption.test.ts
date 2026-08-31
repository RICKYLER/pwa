import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveFieldEncryptionKey,
  encryptField,
  decryptField,
  encryptJson,
  decryptJson,
} from '../lib/security/field-encryption';

test('AES-GCM field encryption round-trips a string', async () => {
  const key = await deriveFieldEncryptionKey('test-passphrase', 'test-salt');
  const encrypted = await encryptField('Pregnant · 5 mo', key);

  assert.equal(encrypted.v, 1);
  assert.ok(encrypted.iv.length > 0);
  assert.ok(encrypted.ct.length > 0);
  // Ciphertext must not contain the plaintext.
  assert.ok(!encrypted.ct.includes('Pregnant'));

  const decrypted = await decryptField(encrypted, key);
  assert.equal(decrypted, 'Pregnant · 5 mo');
});

test('JSON envelope encryption round-trips structured payloads', async () => {
  const key = await deriveFieldEncryptionKey('test-passphrase', 'test-salt');
  const payload = {
    household: 'hh-1',
    is_pregnant: true,
    chronic_conditions: ['Hypertension', 'Diabetes'],
    medical_notes: 'Needs monthly check-up',
  };

  const envelope = await encryptJson(payload, key);
  assert.equal(envelope.encrypted, true);
  assert.equal(envelope.algorithm, 'AES-256-GCM');
  assert.equal(envelope.v, 1);
  assert.ok(!JSON.stringify(envelope).includes('Hypertension'));

  const restored = await decryptJson(envelope, key);
  assert.deepEqual(restored, payload);
});

test('ciphertext fails to decrypt with a different key', async () => {
  const encryptKey = await deriveFieldEncryptionKey('correct-horse', 'salt-a');
  const wrongKey = await deriveFieldEncryptionKey('battery-staple', 'salt-a');
  const envelope = await encryptJson({ secret: 'value' }, encryptKey);

  await assert.rejects(decryptJson(envelope, wrongKey));
});
