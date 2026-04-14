import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDistributionInventorySummary,
  buildDistributionSelectionPreview,
} from '../lib/distribution-insights';
import type {
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
