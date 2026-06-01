import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  DisasterAlert,
  DisasterAlertRule,
  Household,
  Incident,
  PurokRiskProfile,
  Resident,
  VulnerabilityFlags,
} from '../lib/db/schema';
import {
  buildPurokPriorityGroups,
  matchesPurokPriorityFilters,
} from '../lib/responder-priorities';

const now = new Date('2026-05-27T00:00:00.000Z');

function makeHousehold(overrides?: Partial<Household>): Household {
  return {
    id: 'hh-1',
    head_name: 'Maria Dela Cruz',
    barangay_id: 'cuambog',
    barangay_name: 'Cuambog',
    municipality: 'Mabini',
    purok_sitio: 'Purok 1',
    street_address: 'Center Road',
    status: 'active',
    disaster_risk_level: 'low',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'synced',
    ...overrides,
  };
}

function makeResident(overrides?: Partial<Resident>): Resident {
  return {
    id: 'resident-1',
    household_id: 'hh-1',
    full_name: 'Maria Dela Cruz',
    birthdate: '1956-01-01',
    gender: 'F',
    relationship_to_head: 'Head',
    status: 'active',
    verification_status: 'verified',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'synced',
    ...overrides,
  };
}

function makeFlags(overrides?: Partial<VulnerabilityFlags>): VulnerabilityFlags {
  return {
    id: 'flag-1',
    resident_id: 'resident-1',
    is_child: false,
    is_adult: false,
    is_senior: false,
    is_pregnant: false,
    is_pwd: false,
    has_chronic_illness: false,
    is_low_income: false,
    updatedAt: now,
    syncStatus: 'synced',
    ...overrides,
  };
}

function makeProfile(overrides?: Partial<PurokRiskProfile>): PurokRiskProfile {
  return {
    id: 'cuambog::purok 1',
    barangay_id: 'cuambog',
    purok_sitio: 'Purok 1',
    flood_prone: true,
    flood_control_status: 'none',
    default_evacuation_site: 'Cuambog Gym',
    warning_notes: 'River rises quickly.',
    updatedAt: now,
    syncStatus: 'synced',
    ...overrides,
  };
}

function makeRule(overrides?: Partial<DisasterAlertRule>): DisasterAlertRule {
  return {
    id: 'rule-1',
    municipality: 'Mabini',
    barangay_id: 'cuambog',
    purok_sitio: 'Purok 1',
    hazard: 'flood',
    trigger_lat: 7.3,
    trigger_lng: 125.8,
    enabled: true,
    notify_responders: true,
    official_keywords: ['flood'],
    cooldown_minutes: 180,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'synced',
    ...overrides,
  };
}

function makeAlert(overrides?: Partial<DisasterAlert>): DisasterAlert {
  return {
    id: 'alert-1',
    rule_id: 'rule-1',
    municipality: 'Mabini',
    barangay_id: 'cuambog',
    purok_sitio: 'Purok 1',
    hazard: 'flood',
    severity: 'warning',
    title: 'Flood warning',
    message: 'Flood warning for Purok 1.',
    trigger_source: 'threshold',
    trigger_reason: 'Heavy rain',
    weather_snapshot: {
      summary: 'Heavy rain',
      official_alert_titles: [],
      rain_chance: 100,
      rain_intensity_mm_per_hr: 12,
      next_hour_precip_mm: 8,
      wind_gust_kph: null,
    },
    notify_responders: true,
    reachable_household_count: 1,
    unreachable_household_count: 0,
    issued_at: now,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'synced',
    ...overrides,
  };
}

function makeIncident(overrides?: Partial<Incident>): Incident {
  return {
    id: 'incident-1',
    type: 'flood',
    location: 'Cuambog Purok 1',
    severity: 'high',
    status: 'verified',
    reported_by: 'admin-1',
    reported_at: now,
    description: 'Flood water near Purok 1.',
    hazard_context: 'flood',
    syncStatus: 'synced',
    ...overrides,
  };
}

test('flood-prone purok with no flood control outranks protected purok', () => {
  const groups = buildPurokPriorityGroups({
    households: [
      makeHousehold({ id: 'hh-risk', purok_sitio: 'Purok 1' }),
      makeHousehold({ id: 'hh-safe', purok_sitio: 'Purok 2' }),
    ],
    residents: [],
    flags: [],
    purokRiskProfiles: [
      makeProfile({ id: 'cuambog::purok 1', purok_sitio: 'Purok 1', flood_prone: true, flood_control_status: 'none' }),
      makeProfile({ id: 'cuambog::purok 2', purok_sitio: 'Purok 2', flood_prone: true, flood_control_status: 'protected' }),
    ],
  });

  assert.equal(groups[0]?.purokSitio, 'Purok 1');
  assert.ok((groups[0]?.score ?? 0) > (groups[1]?.score ?? 0));
});

test('vulnerable residents lift a purok above the same flood status with no vulnerability', () => {
  const groups = buildPurokPriorityGroups({
    households: [
      makeHousehold({ id: 'hh-vulnerable', purok_sitio: 'Purok 1' }),
      makeHousehold({ id: 'hh-plain', purok_sitio: 'Purok 2' }),
    ],
    residents: [
      makeResident({ id: 'resident-vulnerable', household_id: 'hh-vulnerable' }),
      makeResident({ id: 'resident-plain', household_id: 'hh-plain' }),
    ],
    flags: [
      makeFlags({ id: 'flag-vulnerable', resident_id: 'resident-vulnerable', is_senior: true, is_pwd: true, is_pregnant: true }),
      makeFlags({ id: 'flag-plain', resident_id: 'resident-plain' }),
    ],
    purokRiskProfiles: [
      makeProfile({ id: 'cuambog::purok 1', purok_sitio: 'Purok 1', flood_prone: true, flood_control_status: 'partial' }),
      makeProfile({ id: 'cuambog::purok 2', purok_sitio: 'Purok 2', flood_prone: true, flood_control_status: 'partial' }),
    ],
  });

  assert.equal(groups[0]?.purokSitio, 'Purok 1');
  assert.equal(groups[0]?.vulnerableResidentCount, 1);
});

test('active flood alert and incident boost the matching purok', () => {
  const withoutOps = buildPurokPriorityGroups({
    households: [makeHousehold()],
    residents: [],
    flags: [],
    purokRiskProfiles: [makeProfile({ flood_prone: false, flood_control_status: 'protected' })],
  });
  const withOps = buildPurokPriorityGroups({
    households: [makeHousehold()],
    residents: [],
    flags: [],
    purokRiskProfiles: [makeProfile({ flood_prone: false, flood_control_status: 'protected' })],
    alertRules: [makeRule()],
    alerts: [makeAlert()],
    incidents: [makeIncident()],
  });

  assert.equal(withoutOps.length, 1);
  assert.ok((withOps[0]?.score ?? 0) > (withoutOps[0]?.score ?? 0));
  assert.ok(withOps[0]?.reasons.includes('Active flood alert'));
  assert.ok(withOps[0]?.reasons.includes('Active flood incident'));
});

test('purok priority filters remove non-matching groups', () => {
  const groups = buildPurokPriorityGroups({
    households: [
      makeHousehold({ id: 'hh-risk', purok_sitio: 'Purok 1' }),
      makeHousehold({ id: 'hh-safe', purok_sitio: 'Purok 2' }),
    ],
    residents: [],
    flags: [],
    purokRiskProfiles: [
      makeProfile({ id: 'cuambog::purok 1', purok_sitio: 'Purok 1', flood_prone: true, flood_control_status: 'none' }),
      makeProfile({ id: 'cuambog::purok 2', purok_sitio: 'Purok 2', flood_prone: false, flood_control_status: 'protected' }),
    ],
  });

  assert.deepEqual(
    groups.filter((group) => matchesPurokPriorityFilters(group, {
      floodProne: 'flood_prone',
      floodControlStatus: 'none',
    })).map((group) => group.purokSitio),
    ['Purok 1'],
  );
});
