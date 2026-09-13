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
import { buildIncidentImpactAnalysis } from '../lib/incident-impact';

const now = new Date('2026-09-11T00:00:00.000Z');

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

function makeIncident(overrides?: Partial<Incident>): Incident {
  return {
    id: 'incident-1',
    type: 'flood',
    location: '',
    severity: 'high',
    status: 'verified',
    reported_by: 'admin-1',
    reported_at: now,
    description: '',
    hazard_context: 'flood',
    syncStatus: 'synced',
    ...overrides,
  };
}

const baseInput = {
  households: [] as Household[],
  residents: [] as Resident[],
  flags: [] as VulnerabilityFlags[],
  alerts: [] as DisasterAlert[],
  alertRules: [] as DisasterAlertRule[],
  purokRiskProfiles: [] as PurokRiskProfile[],
};

test('alert-scoped incident matches exactly the alert barangay and purok', () => {
  const analysis = buildIncidentImpactAnalysis({
    ...baseInput,
    incident: makeIncident({
      source: 'alert',
      source_alert_id: 'alert-1',
      location: 'Flood alert zone',
      description: 'Triggered by heavy rain.',
    }),
    households: [
      makeHousehold({ id: 'hh-1', purok_sitio: 'Purok 1' }),
      makeHousehold({ id: 'hh-2', purok_sitio: 'Purok 2' }),
      makeHousehold({ id: 'hh-3', purok_sitio: 'Purok 1', barangay_id: 'tagnaya' }),
    ],
    residents: [
      makeResident({ id: 'r-1', household_id: 'hh-1' }),
    ],
    flags: [
      makeFlags({ id: 'f-1', resident_id: 'r-1', is_senior: true }),
    ],
    alerts: [makeAlert()],
    purokRiskProfiles: [makeProfile()],
  });

  assert.equal(analysis.matchStrategy, 'alert_scope');
  assert.equal(analysis.affectedHouseholdCount, 1);
  assert.equal(analysis.queue[0].household.id, 'hh-1');
  assert.equal(analysis.affectedResidentCount, 1);
  assert.equal(analysis.categoryCounts.senior, 1);
  assert.equal(analysis.vulnerableResidentCount, 1);
  assert.equal(analysis.evacuationSite, 'Cuambog Gym');
});

test('rule fallback matches the whole barangay when alert is missing', () => {
  const analysis = buildIncidentImpactAnalysis({
    ...baseInput,
    incident: makeIncident({
      source: 'alert',
      source_rule_id: 'rule-1',
      source_alert_id: 'missing-alert',
    }),
    households: [
      makeHousehold({ id: 'hh-1', purok_sitio: 'Purok 1' }),
      makeHousehold({ id: 'hh-2', purok_sitio: 'Purok 2' }),
      makeHousehold({ id: 'hh-3', barangay_id: 'tagnaya', purok_sitio: 'Purok 1' }),
    ],
    alertRules: [makeRule({ purok_sitio: undefined })],
  });

  assert.equal(analysis.matchStrategy, 'alert_scope');
  assert.equal(analysis.affectedHouseholdCount, 2);
  assert.deepEqual(
    analysis.queue.map((entry) => entry.household.id).sort(),
    ['hh-1', 'hh-2'],
  );
});

test('GPS incident includes households within the radius and excludes far ones', () => {
  const analysis = buildIncidentImpactAnalysis({
    ...baseInput,
    incident: makeIncident({
      location: 'Riverside area',
      gps_lat: 7.3000,
      gps_lng: 125.8000,
    }),
    households: [
      // ~100 m north of the incident pin
      makeHousehold({ id: 'hh-near', gps_lat: 7.3009, gps_long: 125.8000 }),
      // ~55 km away
      makeHousehold({ id: 'hh-far', gps_lat: 7.35, gps_long: 125.85 }),
    ],
  });

  assert.equal(analysis.matchStrategy, 'gps_radius');
  assert.equal(analysis.affectedHouseholdCount, 1);
  assert.equal(analysis.queue[0].household.id, 'hh-near');
});

test('GPS incident with no households in radius falls back to the nearest purok', () => {
  const analysis = buildIncidentImpactAnalysis({
    ...baseInput,
    incident: makeIncident({
      location: 'Mountain road',
      gps_lat: 7.3000,
      gps_lng: 125.8000,
    }),
    households: [
      // ~11 km away
      makeHousehold({ id: 'hh-p1', purok_sitio: 'Purok 1', gps_lat: 7.31, gps_long: 125.80 }),
      // ~33 km away
      makeHousehold({ id: 'hh-p2', purok_sitio: 'Purok 2', gps_lat: 7.33, gps_long: 125.80 }),
    ],
  });

  assert.equal(analysis.matchStrategy, 'gps_radius');
  assert.equal(analysis.affectedHouseholdCount, 1);
  assert.equal(analysis.queue[0].household.id, 'hh-p1');
  assert.match(analysis.matchNote, /nearest purok/i);
});

test('text fallback matches purok name in the incident location', () => {
  const analysis = buildIncidentImpactAnalysis({
    ...baseInput,
    incident: makeIncident({
      location: 'Purok 1 low-lying area',
      description: 'Water knee-deep along the road.',
    }),
    households: [
      makeHousehold({ id: 'hh-1', purok_sitio: 'Purok 1' }),
      makeHousehold({ id: 'hh-2', purok_sitio: 'Purok 5' }),
    ],
  });

  assert.equal(analysis.matchStrategy, 'text_fallback');
  assert.equal(analysis.affectedHouseholdCount, 1);
  assert.equal(analysis.queue[0].household.id, 'hh-1');
});

test('non-flood hazard matches by GPS radius and text', () => {
  const gpsAnalysis = buildIncidentImpactAnalysis({
    ...baseInput,
    incident: makeIncident({
      type: 'fire',
      hazard_context: 'fire',
      location: 'Market area',
      gps_lat: 7.3000,
      gps_lng: 125.8000,
    }),
    households: [makeHousehold({ id: 'hh-near', gps_lat: 7.3005, gps_long: 125.8000 })],
  });
  assert.equal(gpsAnalysis.matchStrategy, 'gps_radius');
  assert.equal(gpsAnalysis.affectedHouseholdCount, 1);

  const textAnalysis = buildIncidentImpactAnalysis({
    ...baseInput,
    incident: makeIncident({
      type: 'fire',
      hazard_context: 'fire',
      location: 'Cuambog Purok 1',
    }),
    households: [makeHousehold({ id: 'hh-1', purok_sitio: 'Purok 1' })],
  });
  assert.equal(textAnalysis.matchStrategy, 'text_fallback');
  assert.equal(textAnalysis.affectedHouseholdCount, 1);
});

test('no match returns an empty analysis without crashing', () => {
  const analysis = buildIncidentImpactAnalysis({
    ...baseInput,
    incident: makeIncident({ location: 'Somewhere', description: 'No area info.' }),
    households: [makeHousehold({ id: 'hh-1', purok_sitio: 'Purok 1' })],
  });

  assert.equal(analysis.matchStrategy, 'none');
  assert.equal(analysis.affectedHouseholdCount, 0);
  assert.equal(analysis.affectedResidentCount, 0);
  assert.equal(analysis.vulnerableResidentCount, 0);
  assert.deepEqual(analysis.queue, []);
});

test('queue ranks vulnerable households first and only counts active residents', () => {
  const analysis = buildIncidentImpactAnalysis({
    ...baseInput,
    incident: makeIncident({ location: 'Purok 1', description: '' }),
    households: [
      makeHousehold({ id: 'hh-plain', head_name: 'Ana Plain' }),
      makeHousehold({ id: 'hh-vulnerable', head_name: 'Ben Vulnerable' }),
    ],
    residents: [
      makeResident({ id: 'r-plain', household_id: 'hh-plain' }),
      makeResident({ id: 'r-senior', household_id: 'hh-vulnerable' }),
      makeResident({ id: 'r-pwd', household_id: 'hh-vulnerable' }),
      makeResident({ id: 'r-inactive', household_id: 'hh-vulnerable', status: 'moved_out' }),
    ],
    flags: [
      makeFlags({ id: 'f-senior', resident_id: 'r-senior', is_senior: true }),
      makeFlags({ id: 'f-pwd', resident_id: 'r-pwd', is_pwd: true }),
      makeFlags({ id: 'f-inactive', resident_id: 'r-inactive', is_pwd: true }),
    ],
  });

  assert.equal(analysis.affectedResidentCount, 3);
  assert.equal(analysis.categoryCounts.senior, 1);
  assert.equal(analysis.categoryCounts.pwd, 1);
  assert.equal(analysis.vulnerableResidentCount, 2);
  assert.equal(analysis.queue[0].household.id, 'hh-vulnerable');
  assert.equal(analysis.queue[1].household.id, 'hh-plain');
});
