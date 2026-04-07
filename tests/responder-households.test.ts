import assert from 'node:assert/strict';
import test from 'node:test';
import type { Household } from '../lib/db/schema';
import {
  getResponderCoverageLabel,
  getResponderMappedHouseholds,
} from '../lib/responder-households';

function makeHousehold(overrides: Partial<Household> = {}): Household {
  return {
    id: overrides.id ?? 'hh-default',
    head_name: overrides.head_name ?? 'Default Household',
    barangay_id: overrides.barangay_id ?? 'anitapan',
    purok_sitio: overrides.purok_sitio ?? 'Purok 1',
    street_address: overrides.street_address ?? 'Main Street',
    status: overrides.status ?? 'active',
    registration_status: overrides.registration_status ?? 'approved',
    location_verified: overrides.location_verified ?? true,
    gps_lat: overrides.gps_lat ?? 7.11,
    gps_long: overrides.gps_long ?? 125.61,
    createdAt: overrides.createdAt ?? new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-04-01T00:00:00.000Z'),
    syncStatus: overrides.syncStatus ?? 'synced',
  };
}

test('responder mapped households keep only approved verified active pins in scope', () => {
  const visible = makeHousehold({ id: 'hh-visible', barangay_id: 'anitapan', gps_lat: 7.11, gps_long: 125.61 });
  const pending = makeHousehold({ id: 'hh-pending', barangay_id: 'anitapan', registration_status: 'pending', gps_lat: 7.12, gps_long: 125.62 });
  const unverified = makeHousehold({ id: 'hh-unverified', barangay_id: 'anitapan', location_verified: false, gps_lat: 7.13, gps_long: 125.63 });
  const movedOut = makeHousehold({ id: 'hh-moved', barangay_id: 'anitapan', status: 'moved_out', gps_lat: 7.14, gps_long: 125.64 });
  const otherBarangay = makeHousehold({ id: 'hh-other', barangay_id: 'cuambog', gps_lat: 7.15, gps_long: 125.65 });

  assert.deepEqual(
    getResponderMappedHouseholds([visible, pending, unverified, movedOut, otherBarangay], {
      role: 'responder',
      barangay_id: 'anitapan',
    }).map((household) => household.id),
    ['hh-visible'],
  );
});

test('main admin responder map includes verified approved households across all barangays', () => {
  const first = makeHousehold({ id: 'hh-anitapan', barangay_id: 'anitapan', gps_lat: 7.21, gps_long: 125.71 });
  const second = makeHousehold({ id: 'hh-cuambog', barangay_id: 'cuambog', gps_lat: 7.31, gps_long: 125.81 });

  assert.deepEqual(
    getResponderMappedHouseholds([first, second], {
      role: 'admin',
      barangay_id: 'anitapan',
    }).map((household) => household.id),
    ['hh-anitapan', 'hh-cuambog'],
  );

  assert.equal(
    getResponderCoverageLabel({ role: 'admin', barangay_id: 'anitapan' }),
    'Field response across all barangays',
  );
});
