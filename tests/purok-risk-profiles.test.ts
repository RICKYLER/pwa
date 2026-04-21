import assert from 'node:assert/strict';
import test from 'node:test';
import type { DisasterAlertRule, Household, PurokRiskProfile } from '../lib/db/schema';
import {
  buildFieldResponseZoneMarkers,
  buildFloodProneZoneMarkers,
  buildHouseholdPurokRiskSummary,
  buildPurokRiskProfileMap,
  createDefaultPurokRiskProfile,
  matchesPurokRiskFilters,
} from '../lib/purok-risk-profiles';

function makeHousehold(overrides?: Partial<Household>): Household {
  return {
    id: 'household-1',
    head_name: 'Maria Dela Cruz',
    barangay_id: 'anitapan',
    purok_sitio: 'Purok 1',
    street_address: 'Sitio Centro',
    status: 'active',
    createdAt: new Date('2026-04-20T00:00:00.000Z'),
    updatedAt: new Date('2026-04-20T00:00:00.000Z'),
    syncStatus: 'synced',
    ...overrides,
  };
}

function makeProfile(overrides?: Partial<PurokRiskProfile>): PurokRiskProfile {
  return {
    id: 'anitapan::purok 1',
    barangay_id: 'anitapan',
    purok_sitio: 'Purok 1',
    flood_prone: true,
    flood_control_status: 'partial',
    flood_control_notes: 'Drainage canal is partially lined.',
    default_evacuation_site: 'Covered court',
    warning_notes: 'Creek rises fast after one hour of heavy rain.',
    updatedAt: new Date('2026-04-20T00:00:00.000Z'),
    updatedBy: 'user-1',
    syncStatus: 'synced',
    ...overrides,
  };
}

function makeRule(overrides?: Partial<DisasterAlertRule>): DisasterAlertRule {
  return {
    id: 'rule-1',
    municipality: 'Mabini',
    barangay_id: 'anitapan',
    purok_sitio: undefined,
    hazard: 'flood',
    trigger_lat: 7.30796,
    trigger_lng: 125.8472,
    enabled: true,
    notify_responders: true,
    official_keywords: ['flood'],
    cooldown_minutes: 180,
    createdAt: new Date('2026-04-20T00:00:00.000Z'),
    updatedAt: new Date('2026-04-20T01:00:00.000Z'),
    syncStatus: 'synced',
    ...overrides,
  };
}

test('createDefaultPurokRiskProfile applies the planned flood defaults', () => {
  const profile = createDefaultPurokRiskProfile({
    barangay_id: 'anitapan',
    purok_sitio: 'Purok 7',
    updatedBy: 'admin-1',
  });

  assert.equal(profile.barangay_id, 'anitapan');
  assert.equal(profile.purok_sitio, 'Purok 7');
  assert.equal(profile.flood_prone, false);
  assert.equal(profile.flood_control_status, 'unknown');
});

test('buildHouseholdPurokRiskSummary uses the purok evacuation site until the household overrides it', () => {
  const profile = makeProfile();

  const defaultSummary = buildHouseholdPurokRiskSummary(
    makeHousehold({ evacuation_site: undefined }),
    profile,
  );
  const overrideSummary = buildHouseholdPurokRiskSummary(
    makeHousehold({ evacuation_site: 'Barangay hall' }),
    profile,
  );

  assert.equal(defaultSummary.defaultEvacuationSite, 'Covered court');
  assert.equal(defaultSummary.effectiveEvacuationSite, 'Covered court');
  assert.equal(overrideSummary.householdEvacuationSite, 'Barangay hall');
  assert.equal(overrideSummary.effectiveEvacuationSite, 'Barangay hall');
  assert.equal(overrideSummary.floodControlStatus, 'partial');
});

test('matchesPurokRiskFilters evaluates flood-prone and flood-control filters against the purok profile', () => {
  const household = makeHousehold();
  const profileMap = buildPurokRiskProfileMap([makeProfile()]);

  assert.equal(matchesPurokRiskFilters(household, profileMap, {
    floodProne: 'flood_prone',
    floodControlStatus: 'all',
  }), true);
  assert.equal(matchesPurokRiskFilters(household, profileMap, {
    floodProne: 'not_flood_prone',
    floodControlStatus: 'all',
  }), false);
  assert.equal(matchesPurokRiskFilters(household, profileMap, {
    floodProne: 'all',
    floodControlStatus: 'partial',
  }), true);
  assert.equal(matchesPurokRiskFilters(household, profileMap, {
    floodProne: 'all',
    floodControlStatus: 'protected',
  }), false);
});

test('buildFloodProneZoneMarkers places one zone marker at the average position of mapped flood-prone households', () => {
  const markers = buildFloodProneZoneMarkers(
    [
      makeHousehold({ id: 'hh-1', gps_lat: 7.1, gps_long: 125.6 }),
      makeHousehold({ id: 'hh-2', gps_lat: 7.3, gps_long: 125.8 }),
      makeHousehold({ id: 'hh-3', purok_sitio: 'Purok 9', gps_lat: 7.9, gps_long: 125.9 }),
      makeHousehold({ id: 'hh-4', gps_lat: undefined, gps_long: undefined }),
    ],
    [
      makeProfile(),
      makeProfile({
        id: 'anitapan::purok 9',
        purok_sitio: 'Purok 9',
        flood_prone: false,
      }),
    ],
  );

  assert.equal(markers.length, 1);
  assert.equal(markers[0]?.purokSitio, 'Purok 1');
  assert.equal(markers[0]?.householdCount, 2);
  assert.ok(Math.abs((markers[0]?.lat ?? 0) - 7.2) < 0.000001);
  assert.ok(Math.abs((markers[0]?.lng ?? 0) - 125.7) < 0.000001);
});

test('buildFieldResponseZoneMarkers includes enabled alert-rule trigger points when no flood-prone profile marker exists yet', () => {
  const markers = buildFieldResponseZoneMarkers(
    [makeHousehold({ id: 'hh-1', gps_lat: 7.18, gps_long: 125.69 })],
    [],
    [makeRule()],
  );

  assert.equal(markers.length, 1);
  assert.equal(markers[0]?.source, 'alert_rule');
  assert.equal(markers[0]?.label, 'Anitapan');
  assert.equal(markers[0]?.subtitle, 'Flood auto-alert trigger');
  assert.equal(markers[0]?.lat, 7.30796);
  assert.equal(markers[0]?.lng, 125.8472);
});

test('buildFieldResponseZoneMarkers avoids duplicating a scoped purok that already has a visible flood-prone profile marker', () => {
  const markers = buildFieldResponseZoneMarkers(
    [makeHousehold({ id: 'hh-1', gps_lat: 7.1, gps_long: 125.6 })],
    [makeProfile()],
    [makeRule({ purok_sitio: 'Purok 1' })],
  );

  assert.equal(markers.length, 1);
  assert.equal(markers[0]?.source, 'purok_profile');
  assert.equal(markers[0]?.label, 'Purok 1');
});
