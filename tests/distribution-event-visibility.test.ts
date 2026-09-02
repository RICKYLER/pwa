import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectResidentAllowedBarangayIds,
  isDistributionEventVisibleToResident,
  isHouseholdAllowedToClaimFromEvent,
} from '../lib/distribution-event-visibility';

test('collectResidentAllowedBarangayIds combines the user barangay with linked household barangays', () => {
  const allowed = collectResidentAllowedBarangayIds(
    { barangay_id: 'anitapan' },
    ['basiao', '  tagubilin  ', null, undefined, ''],
  );

  assert.deepEqual([...allowed].sort(), ['anitapan', 'basiao', 'tagubilin']);
});

test('collectResidentAllowedBarangayIds trims and drops empty user barangay ids', () => {
  const allowed = collectResidentAllowedBarangayIds({ barangay_id: '  ' }, [undefined, '']);

  assert.equal(allowed.size, 0);
});

test('a new resident account only sees events for its own barangay', () => {
  const allowed = collectResidentAllowedBarangayIds(
    { barangay_id: 'cadunan' },
    [], // brand-new account: no approved households anywhere yet
  );

  const anitapanEvent = { id: 'dist_anitapan', barangay_id: 'anitapan' };
  const cadunanEvent = { id: 'dist_cadunan', barangay_id: 'cadunan' };

  assert.equal(isDistributionEventVisibleToResident(anitapanEvent, allowed), false);
  assert.equal(isDistributionEventVisibleToResident(cadunanEvent, allowed), true);
});

test('events with a missing or blank barangay are never visible through the derived notifications', () => {
  const allowed = collectResidentAllowedBarangayIds({ barangay_id: 'anitapan' }, ['basiao']);

  assert.equal(isDistributionEventVisibleToResident({ id: 'dist_1' }, allowed), false);
  assert.equal(isDistributionEventVisibleToResident({ id: 'dist_2', barangay_id: '  ' }, allowed), false);
  assert.equal(isDistributionEventVisibleToResident({ id: 'dist_3', barangay_id: null }, allowed), false);
});

test('a resident with an approved household in another barangay sees that barangay\'s events', () => {
  const allowed = collectResidentAllowedBarangayIds({ barangay_id: 'anitapan' }, ['basiao']);

  assert.equal(isDistributionEventVisibleToResident({ barangay_id: 'basiao' }, allowed), true);
  assert.equal(isDistributionEventVisibleToResident({ barangay_id: 'tagubilin' }, allowed), false);
});

test('a household cannot claim a QR package from an event in a different barangay', () => {
  assert.equal(isHouseholdAllowedToClaimFromEvent('anitapan', 'basiao'), false);
  assert.equal(isHouseholdAllowedToClaimFromEvent('anitapan', 'anitapan'), true);
  assert.equal(isHouseholdAllowedToClaimFromEvent(' anitapan ', 'anitapan'), true);
});

test('QR claiming fails open only when a barangay is missing on either side', () => {
  // Legacy events recorded before barangay scoping have no barangay_id; the
  // route keeps serving them rather than locking residents out.
  assert.equal(isHouseholdAllowedToClaimFromEvent(null, 'anitapan'), true);
  assert.equal(isHouseholdAllowedToClaimFromEvent('anitapan', null), true);
  assert.equal(isHouseholdAllowedToClaimFromEvent('', ''), true);
  assert.equal(isHouseholdAllowedToClaimFromEvent('  ', 'basiao'), true);
});
