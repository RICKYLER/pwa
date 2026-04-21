import assert from 'node:assert/strict';
import test from 'node:test';
import type { Household } from '../lib/db/schema';
import { selectAlertTargetHouseholds } from '../lib/disaster-alert-targeting';

function makeHousehold(overrides?: Partial<Household>): Household {
  return {
    id: 'household-1',
    head_name: 'Maria Dela Cruz',
    barangay_id: 'anitapan',
    purok_sitio: 'Purok 1',
    street_address: 'Sitio Centro',
    status: 'active',
    hazard_tags: [],
    createdAt: new Date('2026-04-20T00:00:00.000Z'),
    updatedAt: new Date('2026-04-20T00:00:00.000Z'),
    syncStatus: 'synced',
    ...overrides,
  };
}

const households = [
  makeHousehold({ id: 'h1', purok_sitio: 'Purok 1', hazard_tags: [] }),
  makeHousehold({ id: 'h2', purok_sitio: 'Purok 2', hazard_tags: ['flood'] }),
  makeHousehold({ id: 'h3', purok_sitio: 'Purok 3', hazard_tags: ['typhoon'] }),
];

test('selectAlertTargetHouseholds sends scoped flood alerts to every household in the purok', () => {
  const result = selectAlertTargetHouseholds({
    households,
    hazard: 'flood',
    purokSitio: 'Purok 1',
    purokRiskProfiles: [
      { purok_sitio: 'Purok 1', flood_prone: false },
      { purok_sitio: 'Purok 2', flood_prone: true },
    ],
  });

  assert.equal(result.strategy, 'scoped_purok');
  assert.deepEqual(result.households.map((household) => household.id), ['h1']);
});

test('selectAlertTargetHouseholds prefers flood-prone purok profiles for barangay-wide flood alerts', () => {
  const result = selectAlertTargetHouseholds({
    households,
    hazard: 'flood',
    purokRiskProfiles: [
      { purok_sitio: 'Purok 1', flood_prone: false },
      { purok_sitio: 'Purok 2', flood_prone: true },
      { purok_sitio: 'Purok 3', flood_prone: false },
    ],
  });

  assert.equal(result.strategy, 'purok_profiles');
  assert.deepEqual(result.households.map((household) => household.id), ['h2']);
});

test('selectAlertTargetHouseholds falls back to household flood hazard tags when no purok profiles exist', () => {
  const result = selectAlertTargetHouseholds({
    households,
    hazard: 'flood',
  });

  assert.equal(result.strategy, 'household_hazard_tags');
  assert.deepEqual(result.households.map((household) => household.id), ['h2']);
});

test('selectAlertTargetHouseholds keeps existing hazard-tag behavior for non-flood alerts', () => {
  const result = selectAlertTargetHouseholds({
    households,
    hazard: 'typhoon',
  });

  assert.equal(result.strategy, 'hazard_tags');
  assert.deepEqual(result.households.map((household) => household.id), ['h3']);
});
