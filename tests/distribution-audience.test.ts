import assert from 'node:assert/strict';
import test from 'node:test';
import {
  coerceDistributionTargetScope,
  isResidentOnlyTargetGroup,
  resolveDistributionAudienceMatches,
} from '../lib/distribution-audience';
import type { Household, Resident, VulnerabilityFlags } from '../lib/db/schema';

function makeHousehold(overrides: Partial<Household> = {}): Household {
  return {
    id: overrides.id ?? 'hh-1',
    head_name: overrides.head_name ?? 'Default Household',
    barangay_id: overrides.barangay_id ?? 'anitapan',
    purok_sitio: overrides.purok_sitio ?? 'Purok 1',
    street_address: overrides.street_address ?? 'Default Street',
    status: overrides.status ?? 'active',
    createdAt: overrides.createdAt ?? new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2025-01-01T00:00:00.000Z'),
    syncStatus: overrides.syncStatus ?? 'synced',
  };
}

function makeResident(overrides: Partial<Resident> = {}): Resident {
  return {
    id: overrides.id ?? 'res-1',
    household_id: overrides.household_id ?? 'hh-1',
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

function makeFlags(residentId: string, overrides: Partial<VulnerabilityFlags> = {}): VulnerabilityFlags {
  return {
    id: overrides.id ?? `vf_${residentId}`,
    resident_id: residentId,
    is_child: overrides.is_child ?? false,
    is_adult: overrides.is_adult ?? true,
    is_senior: overrides.is_senior ?? false,
    is_pregnant: overrides.is_pregnant ?? false,
    is_pwd: overrides.is_pwd ?? false,
    pwd_type: overrides.pwd_type,
    has_chronic_illness: overrides.has_chronic_illness ?? false,
    chronic_conditions: overrides.chronic_conditions ?? [],
    is_low_income: overrides.is_low_income ?? false,
    notes: overrides.notes,
    updatedAt: overrides.updatedAt ?? new Date('2025-01-01T00:00:00.000Z'),
    syncStatus: overrides.syncStatus ?? 'synced',
  };
}

test('senior audience only keeps senior residents and their households', () => {
  const households = [
    makeHousehold({ id: 'hh-1', head_name: 'Santos Family' }),
    makeHousehold({ id: 'hh-2', head_name: 'Garcia Family' }),
  ];
  const residents = [
    makeResident({ id: 'res-senior-1', household_id: 'hh-1', full_name: 'Lola Santos' }),
    makeResident({ id: 'res-adult-1', household_id: 'hh-1', full_name: 'Miguel Santos' }),
    makeResident({ id: 'res-senior-2', household_id: 'hh-2', full_name: 'Lolo Garcia' }),
  ];
  const flagsByResidentId = new Map<string, VulnerabilityFlags>([
    ['res-senior-1', makeFlags('res-senior-1', { is_adult: false, is_senior: true })],
    ['res-adult-1', makeFlags('res-adult-1')],
    ['res-senior-2', makeFlags('res-senior-2', { is_adult: false, is_senior: true })],
  ]);

  const matches = resolveDistributionAudienceMatches({
    households,
    residents,
    flagsByResidentId,
    targetGroup: 'senior',
  });

  assert.deepEqual(
    matches.eligibleResidents.map((resident) => resident.id),
    ['res-senior-1', 'res-senior-2'],
  );
  assert.deepEqual(
    matches.eligibleHouseholds.map((household) => household.id),
    ['hh-1', 'hh-2'],
  );
  assert.equal(matches.matchedResidentsByHouseholdId.get('hh-1')?.length, 1);
  assert.equal(matches.matchedResidentsByHouseholdId.get('hh-2')?.length, 1);
});

test('all audience keeps every resident and household in scope', () => {
  const households = [
    makeHousehold({ id: 'hh-1' }),
    makeHousehold({ id: 'hh-2' }),
  ];
  const residents = [
    makeResident({ id: 'res-1', household_id: 'hh-1' }),
    makeResident({ id: 'res-2', household_id: 'hh-1' }),
    makeResident({ id: 'res-3', household_id: 'hh-2' }),
  ];
  const flagsByResidentId = new Map<string, VulnerabilityFlags>([
    ['res-1', makeFlags('res-1')],
    ['res-2', makeFlags('res-2', { is_adult: false, is_senior: true })],
    ['res-3', makeFlags('res-3', { is_low_income: true })],
  ]);

  const matches = resolveDistributionAudienceMatches({
    households,
    residents,
    flagsByResidentId,
    targetGroup: 'all',
  });

  assert.equal(matches.eligibleResidents.length, 3);
  assert.equal(matches.eligibleHouseholds.length, 2);
  assert.equal(matches.matchedResidentsByHouseholdId.get('hh-1')?.length, 2);
  assert.equal(matches.matchedResidentsByHouseholdId.get('hh-2')?.length, 1);
});

test('resident-only target groups stay on member-based release flows', () => {
  assert.equal(isResidentOnlyTargetGroup('senior'), true);
  assert.equal(isResidentOnlyTargetGroup('pwd'), true);
  assert.equal(isResidentOnlyTargetGroup('pregnant'), true);
  assert.equal(isResidentOnlyTargetGroup('minor'), true);
  assert.equal(isResidentOnlyTargetGroup('all'), false);
  assert.equal(isResidentOnlyTargetGroup('low_income'), false);
});

test('member-based target groups coerce household events into resident release', () => {
  assert.equal(coerceDistributionTargetScope('household', 'senior'), 'resident');
  assert.equal(coerceDistributionTargetScope('household', 'pwd'), 'resident');
  assert.equal(coerceDistributionTargetScope('household', 'pregnant'), 'resident');
  assert.equal(coerceDistributionTargetScope('household', 'minor'), 'resident');
  assert.equal(coerceDistributionTargetScope('household', 'all'), 'household');
  assert.equal(coerceDistributionTargetScope('resident', 'all'), 'resident');
  assert.equal(coerceDistributionTargetScope('household', 'low_income'), 'household');
});
