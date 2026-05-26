import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateHouseholdDistributionEligibility } from '../lib/distribution-claims';
import type {
  DistributionEventNotificationPayload,
  Household,
  Resident,
  VulnerabilityFlags,
} from '../lib/db/schema';

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
    verification_status: overrides.verification_status ?? 'verified',
    syncStatus: overrides.syncStatus ?? 'synced',
    income_level: overrides.income_level,
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

function makeNotification(overrides: Partial<DistributionEventNotificationPayload> = {}): DistributionEventNotificationPayload {
  return {
    event_id: overrides.event_id ?? 'dist-1',
    event_name: overrides.event_name ?? 'Senior Food Pack',
    type: overrides.type ?? 'regular',
    status: overrides.status ?? 'ongoing',
    target_scope: overrides.target_scope ?? 'household',
    target_group: overrides.target_group ?? 'senior',
    scheduled_date: overrides.scheduled_date ?? '2026-05-26',
    location: overrides.location ?? 'Barangay Hall',
    notes: overrides.notes,
  };
}

test('household eligibility returns matched sector residents for QR-qualified events', () => {
  const household = makeHousehold({ id: 'hh-1', head_name: 'Santos Family' });
  const residents = [
    makeResident({ id: 'res-1', household_id: 'hh-1', full_name: 'Lola Santos' }),
    makeResident({ id: 'res-2', household_id: 'hh-1', full_name: 'Miguel Santos' }),
  ];
  const flagsByResidentId = new Map<string, VulnerabilityFlags>([
    ['res-1', makeFlags('res-1', { is_adult: false, is_senior: true })],
    ['res-2', makeFlags('res-2')],
  ]);

  const eligibility = evaluateHouseholdDistributionEligibility({
    household,
    notification: makeNotification({ target_group: 'senior' }),
    residents,
    flagsByResidentId,
  });

  assert.equal(eligibility.eligible, true);
  assert.deepEqual(
    eligibility.matchedResidents.map((resident) => resident.full_name),
    ['Lola Santos'],
  );
});

test('household eligibility blocks non-matching sector households', () => {
  const household = makeHousehold({ id: 'hh-2', head_name: 'Garcia Family' });
  const residents = [
    makeResident({ id: 'res-3', household_id: 'hh-2', full_name: 'Ana Garcia' }),
  ];
  const flagsByResidentId = new Map<string, VulnerabilityFlags>([
    ['res-3', makeFlags('res-3')],
  ]);

  const eligibility = evaluateHouseholdDistributionEligibility({
    household,
    notification: makeNotification({ target_group: 'pwd' }),
    residents,
    flagsByResidentId,
  });

  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.matchedResidents.length, 0);
});
