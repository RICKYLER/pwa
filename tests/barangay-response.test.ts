import assert from 'node:assert/strict';
import test from 'node:test';
import type { Household, Incident, PurokRiskProfile } from '../lib/db/schema';
import {
  assignIncidentBarangay,
  buildAllBarangaySummaries,
  buildBarangayResponseSummary,
} from '../lib/barangay-response';
import { parseBarangayBoundaries, type BarangayBoundary } from '../lib/barangay-geometry';

const now = new Date('2026-09-11T00:00:00.000Z');

function makeBoundaries(): BarangayBoundary[] {
  // Two synthetic adjacent barangay squares — Cadunan around (0..10) and
  // Pindasan around (20..30). Synthetic geometry is fine in tests only.
  const payload = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { PSGC: '1108203002' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
        },
      },
      {
        type: 'Feature',
        properties: { PSGC: '1108203006' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]],
        },
      },
    ],
  };
  return parseBarangayBoundaries(payload).boundaries;
}

function makeIncident(overrides?: Partial<Incident>): Incident {
  return {
    id: 'incident-1',
    type: 'flood',
    location: 'Purok 1, Cadunan',
    gps_lat: 2,
    gps_lng: 2,
    severity: 'high',
    status: 'reported',
    reported_by: 'responder-1',
    reported_at: now,
    description: 'Waist-deep flood along the main road.',
    syncStatus: 'synced',
    ...overrides,
  };
}

function makeHousehold(overrides?: Partial<Household>): Household {
  return {
    id: 'hh-1',
    head_name: 'Maria Dela Cruz',
    barangay_id: 'cadunan',
    barangay_name: 'Cadunan',
    municipality: 'Mabini',
    purok_sitio: 'Purok 1',
    street_address: 'Center Road',
    status: 'active',
    disaster_risk_level: 'high',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'synced',
    ...overrides,
  };
}

function makePurokProfile(overrides?: Partial<PurokRiskProfile>): PurokRiskProfile {
  return {
    id: 'cadunan::purok-1',
    barangay_id: 'cadunan',
    purok_sitio: 'Purok 1',
    flood_prone: true,
    flood_control_status: 'none',
    default_evacuation_site: 'Cadunan Elementary School',
    updatedAt: now,
    syncStatus: 'synced',
    ...overrides,
  };
}

test('assignIncidentBarangay uses GIS point-in-polygon on incident coordinates', () => {
  const boundaries = makeBoundaries();

  assert.equal(assignIncidentBarangay(makeIncident(), boundaries), 'cadunan');
  assert.equal(
    assignIncidentBarangay(makeIncident({ gps_lat: 25, gps_lng: 25 }), boundaries),
    'pindasan',
  );
});

test('assignIncidentBarangay falls back to text matching without GPS', () => {
  const boundaries = makeBoundaries();

  const noGps = makeIncident({
    gps_lat: undefined,
    gps_lng: undefined,
    location: 'Near the chapel in Pindasan',
  });
  assert.equal(assignIncidentBarangay(noGps, boundaries), 'pindasan');
});

test('assignIncidentBarangay returns null when nothing matches', () => {
  const boundaries = makeBoundaries();

  const outside = makeIncident({ gps_lat: 50, gps_lng: 50, location: '', description: '' });
  assert.equal(assignIncidentBarangay(outside, boundaries), null);
  assert.equal(assignIncidentBarangay(makeIncident(), []), null);
});

test('buildBarangayResponseSummary counts incidents by status and severity', () => {
  const boundaries = makeBoundaries();
  const incidents: Incident[] = [
    makeIncident({ id: 'a', status: 'responding' }),
    makeIncident({ id: 'b', status: 'verified' }),
    makeIncident({ id: 'c', status: 'reported', severity: 'critical' }),
    makeIncident({ id: 'd', status: 'resolved' }), // not active
    makeIncident({ id: 'e', gps_lat: 25, gps_lng: 25 }), // belongs to Pindasan
  ];

  const summary = buildBarangayResponseSummary({
    barangayId: 'cadunan',
    boundaries,
    households: [],
    incidents,
    purokRiskProfiles: [],
  });

  assert.equal(summary.barangayId, 'cadunan');
  assert.equal(summary.label, 'Cadunan');
  assert.equal(summary.psgc, '1108203002');
  assert.equal(summary.areaKm2, 18.43425703);
  assert.equal(summary.activeIncidents, 3);
  assert.equal(summary.criticalIncidents, 1);
  assert.equal(summary.respondingTeams, 1);
  assert.equal(summary.pendingTasks, 2);
  assert.equal(summary.responseStatus, 'active_response');
});

test('buildBarangayResponseSummary derives monitoring and clear statuses', () => {
  const boundaries = makeBoundaries();

  const monitoring = buildBarangayResponseSummary({
    barangayId: 'cadunan',
    boundaries,
    households: [],
    incidents: [makeIncident({ status: 'verified', severity: 'medium' })],
    purokRiskProfiles: [],
  });
  assert.equal(monitoring.responseStatus, 'monitoring');

  const clear = buildBarangayResponseSummary({
    barangayId: 'cadunan',
    boundaries,
    households: [],
    incidents: [makeIncident({ status: 'resolved' })],
    purokRiskProfiles: [],
  });
  assert.equal(clear.responseStatus, 'clear');
  assert.equal(clear.activeIncidents, 0);
});

test('buildBarangayResponseSummary counts high-risk households for the barangay only', () => {
  const boundaries = makeBoundaries();
  const households = [
    makeHousehold({ id: 'h1', disaster_risk_level: 'high' }),
    makeHousehold({ id: 'h2', disaster_risk_level: 'high', barangay_id: 'pindasan' }),
    makeHousehold({ id: 'h3', disaster_risk_level: 'medium' }),
    makeHousehold({ id: 'h4', disaster_risk_level: undefined }),
  ];

  const summary = buildBarangayResponseSummary({
    barangayId: 'cadunan',
    boundaries,
    households,
    incidents: [],
    purokRiskProfiles: [],
  });

  assert.equal(summary.highRiskHouseholds, 1);
});

test('buildBarangayResponseSummary collects evacuation sites and flood-prone puroks', () => {
  const boundaries = makeBoundaries();
  const purokRiskProfiles = [
    makePurokProfile({ purok_sitio: 'Purok 1', default_evacuation_site: 'Cadunan Elementary School' }),
    makePurokProfile({ purok_sitio: 'Purok 2', default_evacuation_site: 'Cadunan Elementary School' }),
    makePurokProfile({ purok_sitio: 'Purok 3', flood_prone: false, default_evacuation_site: 'Cadunan Gym' }),
    makePurokProfile({ barangay_id: 'pindasan', purok_sitio: 'Purok 1', default_evacuation_site: 'Pindasan Chapel' }),
  ];

  const summary = buildBarangayResponseSummary({
    barangayId: 'cadunan',
    boundaries,
    households: [],
    incidents: [],
    purokRiskProfiles,
  });

  assert.equal(summary.floodPronePuroks, 2);
  assert.deepEqual(summary.evacuationSites, ['Cadunan Elementary School', 'Cadunan Gym']);
});

test('buildAllBarangaySummaries returns one summary per boundary', () => {
  const boundaries = makeBoundaries();
  const summaries = buildAllBarangaySummaries({
    boundaries,
    households: [makeHousehold()],
    incidents: [makeIncident()],
    purokRiskProfiles: [],
  });

  assert.equal(summaries.size, 2);
  assert.equal(summaries.get('cadunan')?.activeIncidents, 1);
  assert.equal(summaries.get('pindasan')?.activeIncidents, 0);
});

test('buildAllBarangaySummaries returns an empty map without boundaries', () => {
  const summaries = buildAllBarangaySummaries({
    boundaries: [],
    households: [makeHousehold()],
    incidents: [makeIncident()],
    purokRiskProfiles: [],
  });
  assert.equal(summaries.size, 0);
});
