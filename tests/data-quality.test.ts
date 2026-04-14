import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getBlockedPackageTemplates,
  getBrokenVulnerabilityFlagIssues,
  getHouseholdsMissingLocation,
  getResidentsMissingBirthdate,
  summarizeOperationalDataQuality,
} from '../lib/data-quality';
import type {
  DistributionEvent,
  Household,
  InventoryItem,
  PackageTemplate,
  Resident,
  VulnerabilityFlags,
} from '../lib/db/schema';

function makeHousehold(overrides: Partial<Household> = {}): Household {
  return {
    id: overrides.id ?? 'hh-1',
    head_name: overrides.head_name ?? 'Household Head',
    barangay_id: overrides.barangay_id ?? 'anitapan',
    purok_sitio: overrides.purok_sitio ?? 'Purok 1',
    street_address: overrides.street_address ?? 'Default Street',
    status: overrides.status ?? 'active',
    registration_status: overrides.registration_status ?? 'approved',
    gps_lat: overrides.gps_lat,
    gps_long: overrides.gps_long,
    createdAt: overrides.createdAt ?? new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2025-01-01T00:00:00.000Z'),
    syncStatus: overrides.syncStatus ?? 'synced',
  };
}

function makeResident(overrides: Partial<Resident> = {}): Resident {
  return {
    id: overrides.id ?? 'res-1',
    household_id: overrides.household_id ?? 'hh-1',
    full_name: overrides.full_name ?? 'Resident Name',
    birthdate: overrides.birthdate ?? '1990-01-01',
    gender: overrides.gender ?? 'F',
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

function makeFlags(overrides: Partial<VulnerabilityFlags> = {}): VulnerabilityFlags {
  return {
    id: overrides.id ?? 'vf-1',
    resident_id: overrides.resident_id ?? 'res-1',
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

function makeTemplate(overrides: Partial<PackageTemplate> = {}): PackageTemplate {
  return {
    id: overrides.id ?? 'tpl-1',
    name: overrides.name ?? 'Family Pack',
    description: overrides.description,
    items: overrides.items ?? [{ item_id: 'item-1', item_name: 'Rice', quantity: 10, unit: 'pcs' }],
    createdAt: overrides.createdAt ?? new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2025-01-01T00:00:00.000Z'),
    syncStatus: overrides.syncStatus ?? 'synced',
  };
}

function makeEvent(overrides: Partial<DistributionEvent> = {}): DistributionEvent {
  return {
    id: overrides.id ?? 'event-1',
    barangay_id: overrides.barangay_id ?? 'anitapan',
    event_name: overrides.event_name ?? 'Senior Relief',
    type: overrides.type ?? 'regular',
    target_scope: overrides.target_scope ?? 'resident',
    target_group: overrides.target_group ?? 'senior',
    package_items: overrides.package_items ?? [{ item_id: 'item-1', item_name: 'Rice', quantity: 5, unit: 'pcs' }],
    location: overrides.location ?? 'Municipal Hall',
    scheduled_date: overrides.scheduled_date ?? '2026-04-10',
    status: overrides.status ?? 'planned',
    created_by: overrides.created_by ?? 'user-1',
    notes: overrides.notes,
    syncStatus: overrides.syncStatus ?? 'synced',
  };
}

test('data-quality helpers identify missing coordinates, missing birthdates, broken flags, and blocked templates', () => {
  const missingPinHousehold = makeHousehold({ id: 'hh-missing-pin', head_name: 'No Pin Household' });
  const validHousehold = makeHousehold({ id: 'hh-valid', head_name: 'Pinned Household', gps_lat: 7.1, gps_long: 125.6 });
  const pendingHousehold = makeHousehold({
    id: 'hh-pending',
    head_name: 'Pending Household',
    registration_status: 'pending',
  });
  const residents = [
    makeResident({ id: 'res-missing-birthdate', household_id: missingPinHousehold.id, full_name: 'Missing Birthdate', birthdate: '' }),
    makeResident({ id: 'res-inactive', household_id: validHousehold.id, full_name: 'Inactive Resident', status: 'moved_out' }),
    makeResident({ id: 'res-pending-household', household_id: pendingHousehold.id, full_name: 'Pending Household Resident' }),
  ];
  const householdsById = new Map([
    [missingPinHousehold.id, missingPinHousehold],
    [validHousehold.id, validHousehold],
    [pendingHousehold.id, pendingHousehold],
  ]);
  const residentsById = new Map(residents.map((resident) => [resident.id, resident]));
  const brokenFlags = getBrokenVulnerabilityFlagIssues({
    flags: [
      makeFlags({ id: 'vf-missing-resident', resident_id: 'missing-resident' }),
      makeFlags({ id: 'vf-inactive-resident', resident_id: 'res-inactive' }),
      makeFlags({ id: 'vf-pending-household', resident_id: 'res-pending-household', is_senior: true }),
    ],
    residentsById,
    householdsById,
  });
  const blockedTemplates = getBlockedPackageTemplates(
    [makeTemplate()],
    [makeInventoryItem({ id: 'item-1', item_name: 'Rice', quantity_available: 4, unit: 'pcs' })],
  );

  assert.equal(getHouseholdsMissingLocation([missingPinHousehold, validHousehold]).length, 1);
  assert.equal(getResidentsMissingBirthdate({ residents, householdsById }).length, 1);
  assert.equal(brokenFlags.length, 3);
  assert.equal(brokenFlags[0]?.label, 'Missing resident record');
  assert.equal(brokenFlags[0]?.detail, 'Resident ID: missing-resident');
  assert.equal(brokenFlags[1]?.reason, 'Resident status is moved out.');
  assert.equal(brokenFlags[2]?.reason, 'Linked household registration is pending.');
  assert.deepEqual(brokenFlags[2]?.categories, ['Senior']);
  assert.equal(blockedTemplates.length, 1);
});

test('data-quality summary exposes deep-link issue counts for admin dashboards', () => {
  const summary = summarizeOperationalDataQuality({
    householdsMissingLocation: [makeHousehold({ head_name: 'No Pin Household' })],
    residentsMissingBirthdate: [makeResident({ full_name: 'Missing Birthdate', birthdate: '' })],
    brokenFlags: [{
      flag: makeFlags({ id: 'vf-broken' }),
      resident: null,
      household: null,
      label: 'Missing resident record',
      detail: 'Resident ID: missing-resident',
      reason: 'This vulnerability flag points to a resident record that no longer exists.',
      categories: ['Senior'],
    }],
    zeroMatchEvents: [{
      event: makeEvent({ event_name: 'Zero Match Event' }),
      eligibility_summary: {
        total_households: 10,
        total_residents: 24,
        eligible_households: 0,
        eligible_residents: 0,
        match_label: 'Senior Matches',
        match_support: '0 matched households across the event scope.',
        target_count_label: '0 senior residents',
      },
    }],
    blockedTemplates: [{
      template: makeTemplate({ name: 'Blocked Pack' }),
      inventory_summary: getBlockedPackageTemplates(
        [makeTemplate({ name: 'Blocked Pack' })],
        [makeInventoryItem({ id: 'item-1', quantity_available: 2 })],
      )[0]!.inventory_summary,
    }],
  });

  assert.equal(summary.blocking_issues, 5);
  assert.equal(summary.total_issues, 5);
  assert.ok(summary.issues.some((issue) => issue.href === '/households?issue=missing_location'));
  assert.ok(summary.issues.some((issue) => issue.href === '/vulnerability?issue=missing_birthdate'));
  assert.ok(summary.issues.some((issue) => issue.href === '/distribution?issue=zero_matches'));
});
