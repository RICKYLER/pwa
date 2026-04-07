import assert from 'node:assert/strict';
import test from 'node:test';
import type { Household } from '../lib/db/schema';
import {
  isResidentActiveApprovedHousehold,
  resolveResidentActiveApprovedHousehold,
} from '../lib/resident-households';
import { getResidentNavItems } from '../lib/navigation';

function makeHousehold(overrides: Partial<Household> = {}): Household {
  return {
    id: overrides.id ?? 'hh-default',
    head_name: overrides.head_name ?? 'Default Household',
    barangay_id: overrides.barangay_id ?? 'anitapan',
    purok_sitio: overrides.purok_sitio ?? 'Purok 1',
    street_address: overrides.street_address ?? 'Default Street',
    status: overrides.status ?? 'active',
    registration_status: overrides.registration_status ?? 'approved',
    registration_reviewed_at: overrides.registration_reviewed_at,
    createdAt: overrides.createdAt ?? new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-04-01T00:00:00.000Z'),
    syncStatus: overrides.syncStatus ?? 'synced',
  };
}

test('resident active household resolver keeps only approved active records', () => {
  assert.equal(
    isResidentActiveApprovedHousehold(makeHousehold({ registration_status: 'approved', status: 'active' })),
    true,
  );
  assert.equal(
    isResidentActiveApprovedHousehold(makeHousehold({ registration_status: 'pending', status: 'active' })),
    false,
  );
  assert.equal(
    isResidentActiveApprovedHousehold(makeHousehold({ registration_status: 'approved', status: 'moved_out' })),
    false,
  );
});

test('resident active household resolver picks the latest approved active household', () => {
  const olderApproved = makeHousehold({
    id: 'hh-older',
    registration_reviewed_at: new Date('2026-04-04T08:00:00.000Z'),
    updatedAt: new Date('2026-04-04T09:00:00.000Z'),
    createdAt: new Date('2026-04-03T09:00:00.000Z'),
  });
  const latestApproved = makeHousehold({
    id: 'hh-latest',
    registration_reviewed_at: new Date('2026-04-05T08:00:00.000Z'),
    updatedAt: new Date('2026-04-05T09:00:00.000Z'),
    createdAt: new Date('2026-04-04T09:00:00.000Z'),
  });
  const pending = makeHousehold({
    id: 'hh-pending',
    registration_status: 'pending',
    registration_reviewed_at: new Date('2026-04-06T08:00:00.000Z'),
    updatedAt: new Date('2026-04-06T09:00:00.000Z'),
  });

  assert.equal(
    resolveResidentActiveApprovedHousehold([olderApproved, pending, latestApproved])?.id,
    'hh-latest',
  );
});

test('resident navigation swaps register for household when an approved household exists', () => {
  assert.equal(getResidentNavItems().at(-1)?.href, '/households/register');
  assert.equal(
    getResidentNavItems({ hasActiveHousehold: true }).at(-1)?.href,
    '/resident/household',
  );
  assert.equal(
    getResidentNavItems({ pathname: '/resident/household' }).at(-1)?.href,
    '/resident/household',
  );
});
