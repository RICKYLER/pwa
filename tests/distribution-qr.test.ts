import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDistributionQrDeepLink, extractDistributionQrToken } from '../lib/distribution-qr';
import { createDistributionQrToken, verifyDistributionQrToken } from '../lib/server/distribution-qr';

test('distribution QR tokens round-trip with signing and verification', () => {
  const token = createDistributionQrToken({
    eventId: 'dist-42',
    householdId: 'hh-9',
    userId: '550e8400-e29b-41d4-a716-446655440000',
  });

  const claims = verifyDistributionQrToken(token);
  assert.equal(claims?.eventId, 'dist-42');
  assert.equal(claims?.householdId, 'hh-9');
  assert.equal(claims?.scope, 'household');
});

test('distribution QR token extraction accepts deep links and raw tokens', () => {
  const rawToken = createDistributionQrToken({
    eventId: 'dist-100',
    householdId: 'hh-1',
    userId: '550e8400-e29b-41d4-a716-446655440001',
  });

  const deepLink = buildDistributionQrDeepLink('http://localhost:3000', 'dist-100', rawToken);
  assert.deepEqual(extractDistributionQrToken(deepLink, 'dist-100'), {
    token: rawToken,
    eventId: 'dist-100',
  });

  assert.deepEqual(extractDistributionQrToken(rawToken, 'dist-100'), {
    token: rawToken,
    eventId: 'dist-100',
  });

  assert.equal(extractDistributionQrToken(deepLink, 'dist-other'), null);
});
