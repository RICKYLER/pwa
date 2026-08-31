import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildQrScanLogRow,
  hashQrScanToken,
} from '../lib/server/distribution-qr-log';
import {
  describeDistributionQrFailure,
  isDistributionQrNetworkFailure,
  QR_NETWORK_FAILURE_MESSAGE,
} from '../lib/distribution-qr-ui';

test('QR scan log rows hash the token and never store the raw value', () => {
  const token = 'claims.signature';
  const row = buildQrScanLogRow({
    eventId: 'dist-1',
    householdId: 'hh-7',
    claimantUserId: 'user-1',
    scannedBy: 'staff-2',
    source: 'camera',
    status: 'released',
    token,
    notes: 'QR release completed.',
  });

  assert.equal(row.status, 'released');
  assert.equal(row.source, 'camera');
  assert.equal(row.event_id, 'dist-1');
  assert.equal(row.household_id, 'hh-7');
  assert.equal(row.token_hash, hashQrScanToken(token));
  assert.match(row.token_hash, /^[0-9a-f]{64}$/);
  assert.ok(!('token' in row), 'raw token must not be persisted');
  assert.ok(!JSON.stringify(row).includes(token), 'raw token must not leak into the row');
});

test('QR scan log token hashing is deterministic and collision-free in practice', () => {
  const first = hashQrScanToken('abc.def');
  assert.equal(first, hashQrScanToken('abc.def'));
  assert.notEqual(first, hashQrScanToken('abc.defg'));
});

test('QR scan log rows default nullable audit fields to null', () => {
  const row = buildQrScanLogRow({
    source: 'manual',
    status: 'rejected',
    token: null,
  });

  assert.equal(row.event_id, null);
  assert.equal(row.household_id, null);
  assert.equal(row.claimant_user_id, null);
  assert.equal(row.scanned_by, null);
  assert.equal(row.token_hash, null);
  assert.equal(row.notes, null);
});

test('network failures get an actionable venue message; other errors pass through', () => {
  assert.equal(
    describeDistributionQrFailure(new TypeError('Failed to fetch')),
    QR_NETWORK_FAILURE_MESSAGE,
  );
  assert.equal(
    isDistributionQrNetworkFailure(new TypeError('Failed to fetch')),
    true,
  );

  assert.equal(
    describeDistributionQrFailure(new Error('This household already claimed this package.')),
    'This household already claimed this package.',
  );
  assert.equal(isDistributionQrNetworkFailure(new Error('nope')), false);

  assert.equal(
    describeDistributionQrFailure('unexpected'),
    'Unable to process the household QR code.',
  );
});
