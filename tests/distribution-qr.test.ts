import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDistributionQrDeepLink, extractDistributionQrToken } from '../lib/distribution-qr';
import {
  computeDistributionQrExpiry,
  createDistributionQrToken,
  verifyDistributionQrToken,
} from '../lib/server/distribution-qr';

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

test('distribution QR expiry defaults to generation time plus TTL when no event date is set', () => {
  const nowMs = new Date(2026, 7, 25, 8, 0, 0).getTime();
  const ttlMs = 24 * 60 * 60 * 1000;

  assert.equal(
    computeDistributionQrExpiry({ nowMs, defaultTtlMs: ttlMs, eventScheduledDate: null }),
    nowMs + ttlMs,
  );
});

test('distribution QR expiry extends to the scheduled event day when close enough', () => {
  const nowMs = new Date(2026, 7, 25, 8, 0, 0).getTime();
  const ttlMs = 24 * 60 * 60 * 1000;
  const eventDate = new Date(2026, 7, 29, 10, 0, 0);
  const endOfEventDay = new Date(2026, 7, 29, 23, 59, 59, 999).getTime();

  assert.equal(
    computeDistributionQrExpiry({
      nowMs,
      defaultTtlMs: ttlMs,
      eventScheduledDate: eventDate.toISOString(),
    }),
    endOfEventDay,
  );
});

test('distribution QR expiry stays on the base TTL for far-future events', () => {
  const nowMs = new Date(2026, 7, 25, 8, 0, 0).getTime();
  const ttlMs = 24 * 60 * 60 * 1000;
  // 31 days out — beyond the default 14-day extension window.
  const eventDate = new Date(2026, 8, 25, 10, 0, 0);

  assert.equal(
    computeDistributionQrExpiry({
      nowMs,
      defaultTtlMs: ttlMs,
      eventScheduledDate: eventDate.toISOString(),
    }),
    nowMs + ttlMs,
  );
});

test('distribution QR expiry respects a custom extension window', () => {
  const nowMs = new Date(2026, 7, 25, 8, 0, 0).getTime();
  const ttlMs = 24 * 60 * 60 * 1000;
  const eventDate = new Date(2026, 7, 28, 10, 0, 0);

  assert.equal(
    computeDistributionQrExpiry({
      nowMs,
      defaultTtlMs: ttlMs,
      eventScheduledDate: eventDate.toISOString(),
      maxEventExtensionMs: 60 * 60 * 1000, // 1 hour — cannot reach the event day
    }),
    nowMs + ttlMs,
  );
});

test('distribution QR expiry falls back to base TTL for past or invalid event dates', () => {
  const nowMs = new Date(2026, 7, 25, 8, 0, 0).getTime();
  const ttlMs = 24 * 60 * 60 * 1000;

  const pastEvent = new Date(2026, 7, 20, 10, 0, 0);
  assert.equal(
    computeDistributionQrExpiry({
      nowMs,
      defaultTtlMs: ttlMs,
      eventScheduledDate: pastEvent.toISOString(),
    }),
    nowMs + ttlMs,
  );

  assert.equal(
    computeDistributionQrExpiry({
      nowMs,
      defaultTtlMs: ttlMs,
      eventScheduledDate: 'not-a-real-date',
    }),
    nowMs + ttlMs,
  );
});

test('distribution QR token created with an event date stays valid through the event day', () => {
  const token = createDistributionQrToken({
    eventId: 'dist-200',
    householdId: 'hh-20',
    userId: '550e8400-e29b-41d4-a716-446655440002',
    eventScheduledDate: new Date(2026, 7, 29, 10, 0, 0).toISOString(),
  });

  const claims = verifyDistributionQrToken(token);
  assert.ok(claims);
  const endOfEventDay = new Date(2026, 7, 29, 23, 59, 59, 999).getTime();
  assert.ok(claims.exp >= endOfEventDay, 'token should remain valid on distribution day');
});
