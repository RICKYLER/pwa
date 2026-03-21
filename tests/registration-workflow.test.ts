import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRegistrationTimeline,
  derivePinQaStatus,
  getHouseholdRegistrationStatus,
} from '../lib/household-registration';
import type { Household } from '../lib/db/schema';

function makeHousehold(overrides: Partial<Household>): Household {
  return {
    id: overrides.id ?? 'hh-default',
    head_name: overrides.head_name ?? 'Default Household',
    barangay_id: overrides.barangay_id ?? 'barangay-1',
    purok_sitio: overrides.purok_sitio ?? 'Purok 1',
    street_address: overrides.street_address ?? 'Default Street',
    status: overrides.status ?? 'active',
    location_verified: overrides.location_verified ?? false,
    gps_lat: overrides.gps_lat,
    gps_long: overrides.gps_long,
    registration_status: overrides.registration_status,
    createdAt: overrides.createdAt ?? new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2025-01-01T00:00:00.000Z'),
    syncStatus: overrides.syncStatus ?? 'synced',
  };
}

test('households default to approved registration status when no review status is stored', () => {
  assert.equal(getHouseholdRegistrationStatus(makeHousehold({ registration_status: undefined })), 'approved');
  assert.equal(getHouseholdRegistrationStatus(makeHousehold({ registration_status: 'pending' })), 'pending');
});

test('pin QA detects duplicate coordinates and missing verification', () => {
  const base = makeHousehold({
    id: 'hh-1',
    gps_lat: 7.12345,
    gps_long: 125.98765,
    location_verified: false,
  });
  const duplicate = makeHousehold({
    id: 'hh-2',
    gps_lat: 7.1234501,
    gps_long: 125.9876501,
    location_verified: true,
  });
  const clean = makeHousehold({
    id: 'hh-3',
    gps_lat: 7.125,
    gps_long: 125.99,
    location_verified: true,
  });

  assert.equal(derivePinQaStatus(base, [base, duplicate, clean]), 'duplicate');
  assert.equal(derivePinQaStatus(clean, [base, duplicate, clean]), 'valid');
  assert.equal(derivePinQaStatus(makeHousehold({ id: 'hh-4' }), [base, duplicate, clean]), 'needs_verification');
});

test('registration timeline marks pending and approved states correctly', () => {
  const pendingTimeline = buildRegistrationTimeline(makeHousehold({ registration_status: 'pending' }));
  assert.deepEqual(
    pendingTimeline.map((step) => step.state),
    ['done', 'current', 'upcoming', 'upcoming'],
  );

  const approvedTimeline = buildRegistrationTimeline(
    makeHousehold({ registration_status: 'approved', location_verified: true }),
  );
  assert.equal(approvedTimeline.at(-1)?.label, 'Approved');
  assert.equal(approvedTimeline.at(-1)?.state, 'current');
});
