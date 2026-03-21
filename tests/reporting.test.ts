import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildResidentAnalyticsRecords,
  calculateDashboardStats,
  calculateTopPuroksByPopulation,
} from '../lib/db/reporting';
import type { Household, Resident, VulnerabilityFlags } from '../lib/db/schema';

function makeHousehold(overrides: Partial<Household>): Household {
  return {
    id: overrides.id ?? 'hh-default',
    head_name: overrides.head_name ?? 'Default Household',
    barangay_id: overrides.barangay_id ?? 'barangay-1',
    purok_sitio: overrides.purok_sitio ?? 'Purok 1',
    street_address: overrides.street_address ?? 'Default Street',
    status: overrides.status ?? 'active',
    createdAt: overrides.createdAt ?? new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2025-01-01T00:00:00.000Z'),
    syncStatus: overrides.syncStatus ?? 'synced',
  };
}

function makeResident(overrides: Partial<Resident>): Resident {
  return {
    id: overrides.id ?? 'res-default',
    household_id: overrides.household_id ?? 'hh-default',
    full_name: overrides.full_name ?? 'Default Resident',
    birthdate: overrides.birthdate ?? '1990-01-01',
    gender: overrides.gender ?? 'M',
    relationship_to_head: overrides.relationship_to_head ?? 'Self',
    status: overrides.status ?? 'active',
    createdAt: overrides.createdAt ?? new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2025-01-01T00:00:00.000Z'),
    syncStatus: overrides.syncStatus ?? 'synced',
    income_level: overrides.income_level,
    civil_status: overrides.civil_status,
    occupation: overrides.occupation,
    contact_number: overrides.contact_number,
  };
}

function makeFlags(overrides: Partial<VulnerabilityFlags>): VulnerabilityFlags {
  return {
    id: overrides.id ?? 'vf-default',
    resident_id: overrides.resident_id ?? 'res-default',
    is_child: overrides.is_child ?? false,
    is_adult: overrides.is_adult ?? true,
    is_senior: overrides.is_senior ?? false,
    is_pregnant: overrides.is_pregnant ?? false,
    is_pwd: overrides.is_pwd ?? false,
    pwd_type: overrides.pwd_type,
    has_chronic_illness: overrides.has_chronic_illness ?? false,
    chronic_conditions: overrides.chronic_conditions ?? [],
    is_low_income: overrides.is_low_income ?? false,
    notes: overrides.notes ?? '',
    updatedAt: overrides.updatedAt ?? new Date('2025-01-01T00:00:00.000Z'),
    syncStatus: overrides.syncStatus ?? 'synced',
  };
}

test('dashboard stats only count residents attached to the selected barangay households', () => {
  const barangayHouseholds = [
    makeHousehold({ id: 'hh-1', barangay_id: 'barangay-1', purok_sitio: 'Purok 1' }),
    makeHousehold({ id: 'hh-2', barangay_id: 'barangay-1', purok_sitio: 'Purok 2' }),
  ];

  const residents = [
    makeResident({ id: 'res-1', household_id: 'hh-1', full_name: 'Ana Child' }),
    makeResident({ id: 'res-2', household_id: 'hh-2', full_name: 'Ben Senior' }),
    makeResident({ id: 'res-3', household_id: 'hh-outside', full_name: 'Cara Outside' }),
  ];

  const flagsByResidentId = new Map<string, VulnerabilityFlags>([
    ['res-1', makeFlags({ resident_id: 'res-1', is_child: true, is_adult: false })],
    ['res-2', makeFlags({ resident_id: 'res-2', is_adult: false, is_senior: true, is_pwd: true })],
    ['res-3', makeFlags({ resident_id: 'res-3', is_low_income: true })],
  ]);

  const records = buildResidentAnalyticsRecords({
    households: barangayHouseholds,
    residents,
    flagsByResidentId,
  });
  const stats = calculateDashboardStats(barangayHouseholds, records);

  assert.equal(stats.total_households, 2);
  assert.equal(stats.total_population, 2);
  assert.equal(stats.children_count, 1);
  assert.equal(stats.seniors_count, 1);
  assert.equal(stats.pwd_count, 1);
  assert.equal(stats.low_income_count, 0);
});

test('top puroks by population count residents instead of households', () => {
  const households = [
    makeHousehold({ id: 'hh-1', purok_sitio: 'Purok 1' }),
    makeHousehold({ id: 'hh-2', purok_sitio: 'Purok 1' }),
    makeHousehold({ id: 'hh-3', purok_sitio: 'Purok 2' }),
  ];

  const residents = [
    makeResident({ id: 'res-1', household_id: 'hh-1', full_name: 'Household 1 Resident 1' }),
    makeResident({ id: 'res-2', household_id: 'hh-1', full_name: 'Household 1 Resident 2' }),
    makeResident({ id: 'res-3', household_id: 'hh-2', full_name: 'Household 2 Resident 1' }),
    makeResident({ id: 'res-4', household_id: 'hh-2', full_name: 'Household 2 Resident 2' }),
    makeResident({ id: 'res-5', household_id: 'hh-3', full_name: 'Household 3 Resident 1' }),
  ];

  const flagsByResidentId = new Map<string, VulnerabilityFlags>(
    residents.map((resident) => [
      resident.id,
      makeFlags({
        resident_id: resident.id,
        id: `vf-${resident.id}`,
      }),
    ]),
  );

  const records = buildResidentAnalyticsRecords({
    households,
    residents,
    flagsByResidentId,
  });
  const topPuroks = calculateTopPuroksByPopulation(records, 2);

  assert.deepEqual(topPuroks, [
    { purok: 'Purok 1', population: 4 },
    { purok: 'Purok 2', population: 1 },
  ]);
});
