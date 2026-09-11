import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDistributionCoverageSummary,
  buildDistributionInventorySummary,
  buildDistributionSelectionPreview,
} from '../lib/distribution-insights';
import type {
  DistributionRecord,
  Household,
  InventoryItem,
  Resident,
  VulnerabilityFlags,
} from '../lib/db/schema';

function makeHousehold(overrides: Partial<Household> = {}): Household {
  return {
    id: overrides.id ?? 'hh-1',
    head_name: overrides.head_name ?? 'Santos Family',
    barangay_id: overrides.barangay_id ?? 'anitapan',
    purok_sitio: overrides.purok_sitio ?? 'Purok 1',
    street_address: overrides.street_address ?? 'Default Street',
    status: overrides.status ?? 'active',
    registration_status: overrides.registration_status ?? 'approved',
    createdAt: overrides.createdAt ?? new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2025-01-01T00:00:00.000Z'),
    syncStatus: overrides.syncStatus ?? 'synced',
  };
}

function makeResident(overrides: Partial<Resident> = {}): Resident {
  return {
    id: overrides.id ?? 'res-1',
    household_id: overrides.household_id ?? 'hh-1',
    full_name: overrides.full_name ?? 'Lola Santos',
    birthdate: overrides.birthdate ?? '1950-04-10',
    gender: overrides.gender ?? 'F',
    relationship_to_head: overrides.relationship_to_head ?? 'Mother',
    status: overrides.status ?? 'active',
    verification_status: overrides.verification_status ?? 'verified',
    createdAt: overrides.createdAt ?? new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2025-01-01T00:00:00.000Z'),
    syncStatus: overrides.syncStatus ?? 'synced',
    income_level: overrides.income_level,
    civil_status: overrides.civil_status,
    occupation: overrides.occupation,
    contact_number: overrides.contact_number,
  };
}

function makeInventoryItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: overrides.id ?? 'item-1',
    item_name: overrides.item_name ?? 'Rice',
    category: overrides.category ?? 'food',
    quantity_available: overrides.quantity_available ?? 100,
    unit: overrides.unit ?? 'pcs',
    reorder_level: overrides.reorder_level ?? 10,
    status: overrides.status ?? 'active',
    storage_location: overrides.storage_location,
    expiration_date: overrides.expiration_date,
    notes: overrides.notes,
    syncStatus: overrides.syncStatus ?? 'synced',
  };
}

function makeFlags(residentId: string, overrides: Partial<VulnerabilityFlags> = {}): VulnerabilityFlags {
  return {
    id: overrides.id ?? `vf_${residentId}`,
    resident_id: residentId,
    is_child: overrides.is_child ?? false,
    is_adult: overrides.is_adult ?? false,
    is_senior: overrides.is_senior ?? true,
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

test('inventory summary computes available full packages and low-stock warnings consistently', () => {
  const summary = buildDistributionInventorySummary(
    [
      { item_id: 'rice', item_name: 'Rice', quantity: 5, unit: 'pcs' },
      { item_id: 'sardines', item_name: 'Sardines', quantity: 2, unit: 'pcs' },
    ],
    [
      makeInventoryItem({ id: 'rice', item_name: 'Rice', quantity_available: 15, unit: 'pcs', reorder_level: 8 }),
      makeInventoryItem({ id: 'sardines', item_name: 'Sardines', quantity_available: 20, unit: 'pcs', reorder_level: 4 }),
    ],
  );

  assert.equal(summary.available_packages, 3);
  assert.equal(summary.blocking_items.length, 0);
  assert.equal(summary.low_stock_items.length, 1);
  assert.equal(summary.low_stock_items[0]?.item_id, 'rice');
});

test('inventory summary flags blocking items when stock cannot fulfill one package', () => {
  const summary = buildDistributionInventorySummary(
    [{ item_id: 'rice', item_name: 'Rice', quantity: 10, unit: 'pcs' }],
    [makeInventoryItem({ id: 'rice', item_name: 'Rice', quantity_available: 6, unit: 'pcs' })],
  );

  assert.equal(summary.available_packages, 0);
  assert.equal(summary.blocking_items.length, 1);
  assert.equal(summary.blocking_items[0]?.shortageQuantity, 4);
});

test('selection preview explains why a senior resident qualifies and shows stock after release', () => {
  const household = makeHousehold();
  const resident = makeResident();
  const inventorySummary = buildDistributionInventorySummary(
    [{ item_id: 'rice', item_name: 'Rice', quantity: 5, unit: 'pcs' }],
    [makeInventoryItem({ id: 'rice', item_name: 'Rice', quantity_available: 25, unit: 'pcs' })],
  );

  const preview = buildDistributionSelectionPreview({
    event: { target_scope: 'resident', target_group: 'senior' },
    selectedHousehold: household,
    selectedResident: resident,
    matchedResidentsByHouseholdId: new Map([[household.id, [resident]]]),
    flagsByResidentId: new Map([[resident.id, makeFlags(resident.id)]]),
    inventorySummary,
    servedResidentIds: new Set(),
    eligibleResidents: [resident],
    eligibleHouseholds: [household],
  });

  assert.equal(preview.errors.length, 0);
  assert.match(preview.qualification, /matched as senior/i);
  assert.equal(preview.packagePreview[0]?.stock_after_release, 20);
});

test('selection preview blocks releases when stock is insufficient or resident no longer qualifies', () => {
  const household = makeHousehold();
  const resident = makeResident({ id: 'res-not-eligible', full_name: 'Adult Resident', birthdate: '1995-04-10' });
  const inventorySummary = buildDistributionInventorySummary(
    [{ item_id: 'rice', item_name: 'Rice', quantity: 10, unit: 'pcs' }],
    [makeInventoryItem({ id: 'rice', item_name: 'Rice', quantity_available: 5, unit: 'pcs' })],
  );

  const preview = buildDistributionSelectionPreview({
    event: { target_scope: 'resident', target_group: 'senior' },
    selectedHousehold: household,
    selectedResident: resident,
    matchedResidentsByHouseholdId: new Map([[household.id, [resident]]]),
    flagsByResidentId: new Map([[resident.id, makeFlags(resident.id, { is_adult: true, is_senior: false })]]),
    inventorySummary,
    servedResidentIds: new Set(),
    eligibleResidents: [],
    eligibleHouseholds: [household],
  });

  assert.ok(preview.errors.some((message) => /restock required/i.test(message)));
  assert.ok(preview.errors.some((message) => /no longer qualifies/i.test(message)));
});

function makeDistributionRecord(overrides: Partial<DistributionRecord> = {}): DistributionRecord {
  return {
    id: overrides.id ?? 'dr-1',
    event_id: overrides.event_id ?? 'evt-1',
    household_id: overrides.household_id,
    resident_id: overrides.resident_id,
    beneficiary_name: overrides.beneficiary_name,
    items_distributed: overrides.items_distributed ?? [{ item_id: 'rice', quantity: 5 }],
    received_by_name: overrides.received_by_name,
    timestamp: overrides.timestamp ?? new Date('2025-06-01T00:00:00.000Z'),
    distributor_id: overrides.distributor_id ?? 'user-1',
    notes: overrides.notes,
    syncStatus: overrides.syncStatus ?? 'synced',
  };
}

test('coverage summary reports partial household distribution with unclaimed count', () => {
  const households = Array.from({ length: 20 }, (_, index) =>
    makeHousehold({ id: `hh-${index + 1}`, head_name: `Household ${index + 1}` }));
  const records = Array.from({ length: 10 }, (_, index) =>
    makeDistributionRecord({ household_id: `hh-${index + 1}` }));

  const coverage = buildDistributionCoverageSummary({
    targetScope: 'household',
    records,
    eligibleHouseholds: households,
    eligibleResidents: [],
    categoriesById: new Map([
      ['hh-11', ['senior', 'pwd']],
      ['hh-12', ['low_income']],
    ]),
  });

  assert.equal(coverage.eligible_count, 20);
  assert.equal(coverage.served_count, 10);
  assert.equal(coverage.unclaimed_count, 10);
  assert.equal(coverage.coverage_percent, 50);
  assert.equal(coverage.coverage_label, '10 of 20 households served');
  assert.equal(coverage.unclaimed_label, '10 unclaimed households');
  assert.equal(coverage.unclaimed_entries.length, 10);
  assert.deepEqual(
    coverage.unclaimed_entries.map((entry) => entry.name),
    Array.from({ length: 10 }, (_, index) => `Household ${index + 11}`),
  );
  assert.deepEqual(coverage.unclaimed_entries[0], {
    id: 'hh-11',
    name: 'Household 11',
    subtitle: 'Purok 1 · Default Street',
    categories: ['senior', 'pwd'],
  });
  assert.deepEqual(coverage.unclaimed_entries[2].categories, []);
});

test('coverage summary counts resident-scope releases against eligible residents', () => {
  const household = makeHousehold();
  const residents = Array.from({ length: 4 }, (_, index) =>
    makeResident({ id: `res-${index + 1}`, full_name: `Resident ${index + 1}`, household_id: household.id }));
  const records = [
    makeDistributionRecord({ resident_id: 'res-1' }),
    makeDistributionRecord({ resident_id: 'res-3' }),
  ];

  const coverage = buildDistributionCoverageSummary({
    targetScope: 'resident',
    records,
    eligibleHouseholds: [household],
    eligibleResidents: residents,
    householdsById: new Map([[household.id, household]]),
    categoriesById: new Map([['res-2', ['pwd']]]),
  });

  assert.equal(coverage.eligible_count, 4);
  assert.equal(coverage.served_count, 2);
  assert.equal(coverage.unclaimed_count, 2);
  assert.equal(coverage.coverage_percent, 50);
  assert.equal(coverage.coverage_label, '2 of 4 residents served');
  assert.equal(coverage.unclaimed_label, '2 unclaimed residents');
  assert.deepEqual(
    coverage.unclaimed_entries.map((entry) => entry.id),
    ['res-2', 'res-4'],
  );
  assert.deepEqual(coverage.unclaimed_entries[0], {
    id: 'res-2',
    name: 'Resident 2',
    subtitle: 'Mother · Santos Family',
    categories: ['pwd'],
  });
  assert.deepEqual(coverage.unclaimed_entries[1].categories, []);
});

test('coverage summary reports full coverage and handles empty audiences', () => {
  const household = makeHousehold();
  const full = buildDistributionCoverageSummary({
    targetScope: 'household',
    records: [makeDistributionRecord({ household_id: household.id })],
    eligibleHouseholds: [household],
    eligibleResidents: [],
  });
  assert.equal(full.served_count, 1);
  assert.equal(full.unclaimed_count, 0);
  assert.equal(full.coverage_percent, 100);
  assert.equal(full.coverage_label, '1 of 1 household served');
  assert.equal(full.unclaimed_label, '0 unclaimed households');
  assert.deepEqual(full.unclaimed_entries, []);

  const empty = buildDistributionCoverageSummary({
    targetScope: 'resident',
    records: [],
    eligibleHouseholds: [],
    eligibleResidents: [],
  });
  assert.equal(empty.eligible_count, 0);
  assert.equal(empty.served_count, 0);
  assert.equal(empty.unclaimed_count, 0);
  assert.equal(empty.coverage_percent, 0);
  assert.deepEqual(empty.unclaimed_entries, []);
});

test('coverage summary falls back to a generic household label when the resident household lookup misses', () => {
  const residents = Array.from({ length: 2 }, (_, index) =>
    makeResident({ id: `res-${index + 1}`, full_name: `Resident ${index + 1}`, relationship_to_head: 'Spouse' }));

  const coverage = buildDistributionCoverageSummary({
    targetScope: 'resident',
    records: [],
    eligibleHouseholds: [],
    eligibleResidents: residents,
  });

  assert.deepEqual(coverage.unclaimed_entries[0], {
    id: 'res-1',
    name: 'Resident 1',
    subtitle: 'Spouse · Household',
    categories: [],
  });
});
