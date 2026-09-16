import assert from 'node:assert/strict';
import test from 'node:test';
import type { DisasterAlert, Incident } from '../lib/db/schema';
import type { PurokPriorityGroup } from '../lib/responder-priorities';
import {
  AI_BRIEF_MAX_INCIDENTS,
  AI_BRIEF_MAX_PUROKS,
  buildAIBriefPayload,
} from '../lib/ai-brief';

function makeGroup(overrides: Partial<PurokPriorityGroup> = {}): PurokPriorityGroup {
  return {
    id: overrides.id ?? 'anitapan::purok-1',
    barangayId: overrides.barangayId ?? 'anitapan',
    barangayLabel: overrides.barangayLabel ?? 'Anitapan',
    purokSitio: overrides.purokSitio ?? 'Purok 1',
    score: overrides.score ?? 120,
    level: overrides.level ?? 'critical',
    reasons: overrides.reasons ?? ['Flood-prone purok', 'Active flood incident'],
    households: [],
    householdCount: overrides.householdCount ?? 12,
    vulnerableResidentCount: overrides.vulnerableResidentCount ?? 9,
    categoryCounts: overrides.categoryCounts ?? {
      senior: 4,
      pwd: 2,
      pregnant: 1,
      minor: 5,
      low_income: 6,
    },
    floodProne: overrides.floodProne ?? true,
    floodControlStatus: overrides.floodControlStatus ?? 'none',
    floodControlLabel: overrides.floodControlLabel ?? 'No flood control',
    defaultEvacuationSite: overrides.defaultEvacuationSite ?? 'Anitapan Gym',
    warningNotes: overrides.warningNotes ?? 'Access road floods knee-deep',
  };
}

function makeIncident(overrides: Record<string, unknown> = {}): Incident {
  return {
    id: 'inc-1',
    type: 'flood',
    severity: 'critical',
    status: 'responding',
    location: 'Purok 1, Anitapan',
    description: 'Knee-deep flood covering the access road',
    hazard_context: 'flood',
    reported_by: 'responder-1',
    reported_at: new Date('2026-09-01T00:00:00.000Z'),
    syncStatus: 'synced',
    ...overrides,
  } as Incident;
}

function makeAlert(overrides: Record<string, unknown> = {}): DisasterAlert {
  return {
    id: 'alert-1',
    hazard: 'flood',
    severity: 'warning',
    barangay_id: 'anitapan',
    purok_sitio: 'Purok 1',
    ...overrides,
  } as DisasterAlert;
}

test('buildAIBriefPayload defaults to situation mode and forwards purok mode', () => {
  const situation = buildAIBriefPayload({ groups: [makeGroup()], incidents: [], alerts: [] });
  assert.equal(situation.mode, 'situation');

  const focused = buildAIBriefPayload({
    groups: [makeGroup()],
    incidents: [],
    alerts: [],
    mode: 'purok',
  });
  assert.equal(focused.mode, 'purok');
  assert.equal(focused.priorityPuroks.length, 1);
});

test('buildAIBriefPayload ranks groups by score and caps the list size', () => {
  const groups = Array.from({ length: AI_BRIEF_MAX_PUROKS + 5 }, (_, index) =>
    makeGroup({ id: `g-${index}`, score: 200 - index }),
  );

  const payload = buildAIBriefPayload({ groups, incidents: [], alerts: [] });

  assert.equal(payload.priorityPuroks.length, AI_BRIEF_MAX_PUROKS);
  assert.equal(payload.priorityPuroks[0].score, 200);
  assert.equal(payload.priorityPuroks[0].rank, 1);
  assert.equal(payload.priorityPuroks.at(-1)?.score, 200 - (AI_BRIEF_MAX_PUROKS - 1));
});

test('buildAIBriefPayload strips household PII — no names or resident records leave the client', () => {
  const group = makeGroup();
  // Simulate the full group shape the UI passes in: households carry head names.
  const withHouseholds = group as unknown as { households: unknown[] };
  withHouseholds.households = [
    { household: { head_name: 'Juan Dela Cruz' }, residents: [{ full_name: 'Juana Dela Cruz' }] },
  ];

  const serialized = JSON.stringify(
    buildAIBriefPayload({ groups: [group], incidents: [], alerts: [] }),
  );

  assert.ok(!serialized.includes('Juan Dela Cruz'));
  assert.ok(!serialized.includes('Juana Dela Cruz'));
  assert.ok(!serialized.includes('households'));
});

test('buildAIBriefPayload only includes unresolved flood-related incidents, worst severity first', () => {
  const incidents = [
    makeIncident({ id: 'resolved', status: 'resolved', severity: 'critical' }),
    makeIncident({ id: 'medium', severity: 'medium' }),
    makeIncident({ id: 'critical', severity: 'critical' }),
    makeIncident({ id: 'nonflood', type: 'fire', hazard_context: 'fire' }),
  ];

  const payload = buildAIBriefPayload({ groups: [makeGroup()], incidents, alerts: [] });

  assert.deepEqual(
    payload.activeFloodIncidents.map((entry) => entry.severity),
    ['critical', 'medium'],
  );
  assert.equal(payload.activeFloodIncidents.length, 2);
});

test('buildAIBriefPayload counts only flood alerts and truncates incident descriptions', () => {
  const alerts = [
    makeAlert(),
    makeAlert({ id: 'alert-2', hazard: 'typhoon' }),
    makeAlert({ id: 'alert-3' }),
  ];
  const longDescription = 'x'.repeat(500);

  const payload = buildAIBriefPayload({
    groups: [makeGroup()],
    incidents: [makeIncident({ description: longDescription })],
    alerts,
  });

  assert.equal(payload.activeFloodAlerts, 2);
  assert.equal(payload.floodAlertSummaries.length, 2);
  assert.equal(payload.activeFloodIncidents[0].description.length, 240);
});

test('buildAIBriefPayload caps incident entries at the documented limit', () => {
  const incidents = Array.from({ length: AI_BRIEF_MAX_INCIDENTS + 4 }, (_, index) =>
    makeIncident({ id: `inc-${index}` }),
  );

  const payload = buildAIBriefPayload({ groups: [makeGroup()], incidents, alerts: [] });

  assert.equal(payload.activeFloodIncidents.length, AI_BRIEF_MAX_INCIDENTS);
});

test('buildAIBriefPayload serializes the trigger incident for trigger mode', () => {
  const trigger = makeIncident({
    id: 'trigger-1',
    severity: 'high',
    status: 'verified',
    location: 'Purok 3, Anitapan',
    description: `${'y'.repeat(300)} — tail should be cut`,
  });

  const payload = buildAIBriefPayload({
    groups: [makeGroup()],
    incidents: [trigger],
    alerts: [],
    mode: 'trigger',
    trigger,
  });

  assert.equal(payload.mode, 'trigger');
  assert.equal(payload.trigger?.type, 'flood');
  assert.equal(payload.trigger?.severity, 'high');
  assert.equal(payload.trigger?.status, 'verified');
  assert.equal(payload.trigger?.location, 'Purok 3, Anitapan');
  assert.equal(payload.trigger?.description.length, 240);
  // The trigger stays anonymized too — no id, reporter, or timestamps.
  const serialized = JSON.stringify(payload.trigger);
  assert.ok(!serialized.includes('reported_by'));
  assert.ok(!serialized.includes('trigger-1'));
});

test('buildAIBriefPayload accepts an alert-zone trigger descriptor (map trigger click)', () => {
  const payload = buildAIBriefPayload({
    groups: [makeGroup()],
    incidents: [],
    alerts: [],
    mode: 'trigger',
    trigger: {
      type: 'flood',
      severity: 'monitoring',
      status: 'armed',
      location: 'Purok 1, Anitapan',
      description: 'Automatic flood alert trigger zone covering Purok 1, selected from the field map.',
    },
  });

  assert.equal(payload.mode, 'trigger');
  assert.equal(payload.trigger?.type, 'flood');
  assert.equal(payload.trigger?.severity, 'monitoring');
  assert.equal(payload.trigger?.status, 'armed');
  assert.ok(payload.trigger?.description.includes('field map'));
});
