import assert from 'node:assert/strict';
import test from 'node:test';
import type { EvacuationCenter } from '../lib/db/schema';
import {
  applyEvacuationCenterAlertActivation,
  applyEvacuationCenterManualStatus,
  buildEvacuationCenterId,
  normalizeEvacuationCenter,
  resolveEvacuationCentersForAlert,
  summarizeEvacuationCenters,
} from '../lib/evacuation-centers';

function makeCenter(overrides?: Partial<EvacuationCenter>): EvacuationCenter {
  return {
    id: 'evac::anitapan::covered court',
    municipality: 'Mabini',
    barangay_id: 'anitapan',
    name: 'Covered Court',
    status: 'closed',
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    syncStatus: 'synced',
    ...overrides,
  };
}

test('normalizeEvacuationCenter fills defaults and trims text', () => {
  const normalized = normalizeEvacuationCenter(makeCenter({
    name: '  Covered   Court ',
    barangay_id: ' anitapan ',
    status: 'bogus' as EvacuationCenter['status'],
    capacity: -5,
    notes: '   ',
    municipality: '',
  }));

  assert.equal(normalized.name, 'Covered Court');
  assert.equal(normalized.barangay_id, 'anitapan');
  assert.equal(normalized.status, 'closed');
  assert.equal(normalized.capacity, undefined);
  assert.equal(normalized.notes, undefined);
  assert.equal(normalized.municipality, 'Mabini');
});

test('normalizeEvacuationCenter keeps valid coordinates and capacity', () => {
  const normalized = normalizeEvacuationCenter(makeCenter({
    gps_lat: 7.5231,
    gps_lng: 125.9215,
    capacity: 120,
  }));

  assert.equal(normalized.gps_lat, 7.5231);
  assert.equal(normalized.gps_lng, 125.9215);
  assert.equal(normalized.capacity, 120);
});

test('buildEvacuationCenterId is stable and case-insensitive', () => {
  assert.equal(
    buildEvacuationCenterId('anitapan', '  Covered   COURT '),
    buildEvacuationCenterId('Anitapan', 'covered court'),
  );
});

test('resolveEvacuationCentersForAlert matches the purok default evacuation site by name', () => {
  const coveredCourt = makeCenter();
  const school = makeCenter({
    id: 'evac::anitapan::school',
    name: 'Anitapan Elementary School',
  });

  const targets = resolveEvacuationCentersForAlert({
    barangay_id: 'anitapan',
    defaultEvacuationSite: 'covered court',
    centers: [school, coveredCourt],
  });

  assert.equal(targets.length, 1);
  assert.equal(targets[0].id, coveredCourt.id);
});

test('resolveEvacuationCentersForAlert prefers same-barangay name matches', () => {
  const own = makeCenter({ name: 'Covered Court' });
  const other = makeCenter({
    id: 'evac::pindasan::covered court',
    barangay_id: 'pindasan',
    name: 'Covered Court',
  });

  const targets = resolveEvacuationCentersForAlert({
    barangay_id: 'anitapan',
    defaultEvacuationSite: 'covered court',
    centers: [other, own],
  });

  assert.equal(targets.length, 1);
  assert.equal(targets[0].barangay_id, 'anitapan');
});

test('resolveEvacuationCentersForAlert falls back to cross-barangay name matches', () => {
  const other = makeCenter({
    id: 'evac::pindasan::covered court',
    barangay_id: 'pindasan',
    name: 'Covered Court',
  });
  const unrelated = makeCenter({
    id: 'evac::anitapan::gym',
    name: 'Barangay Gym',
  });

  const targets = resolveEvacuationCentersForAlert({
    barangay_id: 'anitapan',
    defaultEvacuationSite: 'covered court',
    centers: [unrelated, other],
  });

  assert.equal(targets.length, 1);
  assert.equal(targets[0].id, other.id);
});

test('resolveEvacuationCentersForAlert falls back to all barangay centers without a site name', () => {
  const own1 = makeCenter({ name: 'Covered Court' });
  const own2 = makeCenter({ id: 'evac::anitapan::gym', name: 'Barangay Gym' });
  const other = makeCenter({
    id: 'evac::pindasan::covered court',
    barangay_id: 'pindasan',
    name: 'Covered Court',
  });

  const targets = resolveEvacuationCentersForAlert({
    barangay_id: 'anitapan',
    defaultEvacuationSite: 'not-a-registered-center',
    centers: [own2, other, own1],
  });

  assert.deepEqual(
    targets.map((center) => center.id).sort(),
    [own1.id, own2.id].sort(),
  );
});

test('resolveEvacuationCentersForAlert returns empty when nothing matches', () => {
  const targets = resolveEvacuationCentersForAlert({
    barangay_id: 'pindasan',
    centers: [makeCenter()],
  });

  assert.equal(targets.length, 0);
});

test('applyEvacuationCenterAlertActivation opens a closed center with alert provenance', () => {
  const activatedAt = new Date('2026-09-14T02:00:00.000Z');
  const updated = applyEvacuationCenterAlertActivation({
    center: makeCenter(),
    alertId: 'dalert_123',
    activatedAt,
  });

  assert.equal(updated.status, 'open');
  assert.equal(updated.activation_source, 'alert');
  assert.equal(updated.activated_by_alert_id, 'dalert_123');
  assert.equal(updated.activated_at?.toISOString(), activatedAt.toISOString());
  assert.equal(updated.deactivated_at, undefined);
});

test('applyEvacuationCenterAlertActivation is a no-op for already-open centers', () => {
  const openedManually = makeCenter({
    status: 'open',
    activation_source: 'manual',
    activated_at: new Date('2026-09-14T01:00:00.000Z'),
    activated_by: 'user-1',
  });

  const updated = applyEvacuationCenterAlertActivation({
    center: openedManually,
    alertId: 'dalert_123',
    activatedAt: new Date('2026-09-14T02:00:00.000Z'),
  });

  assert.equal(updated.status, 'open');
  assert.equal(updated.activation_source, 'manual');
  assert.equal(updated.activated_by_alert_id, undefined);
});

test('applyEvacuationCenterManualStatus opens with manual provenance', () => {
  const updatedAt = new Date('2026-09-14T03:00:00.000Z');
  const updated = applyEvacuationCenterManualStatus({
    center: makeCenter(),
    status: 'open',
    updatedAt,
    updatedBy: 'user-9',
  });

  assert.equal(updated.status, 'open');
  assert.equal(updated.activation_source, 'manual');
  assert.equal(updated.activated_by, 'user-9');
  assert.equal(updated.activated_by_alert_id, undefined);
  assert.equal(updated.deactivated_at, undefined);
});

test('applyEvacuationCenterManualStatus closes an open center', () => {
  const updatedAt = new Date('2026-09-14T04:00:00.000Z');
  const updated = applyEvacuationCenterManualStatus({
    center: makeCenter({
      status: 'open',
      activation_source: 'alert',
      activated_at: new Date('2026-09-14T02:00:00.000Z'),
      activated_by_alert_id: 'dalert_123',
    }),
    status: 'closed',
    updatedAt,
    updatedBy: 'user-9',
  });

  assert.equal(updated.status, 'closed');
  assert.equal(updated.deactivated_at?.toISOString(), updatedAt.toISOString());
  // Provenance of the previous activation is kept for history.
  assert.equal(updated.activation_source, 'alert');
  assert.equal(updated.activated_by_alert_id, 'dalert_123');
});

test('applyEvacuationCenterManualStatus with the same status only bumps updated metadata', () => {
  const updatedAt = new Date('2026-09-14T05:00:00.000Z');
  const open = makeCenter({
    status: 'open',
    activation_source: 'alert',
    activated_by_alert_id: 'dalert_123',
  });

  const updated = applyEvacuationCenterManualStatus({
    center: open,
    status: 'open',
    updatedAt,
    updatedBy: 'user-9',
  });

  assert.equal(updated.status, 'open');
  assert.equal(updated.activation_source, 'alert');
  assert.equal(updated.activated_by, undefined);
  assert.equal(updated.updatedAt.toISOString(), updatedAt.toISOString());
});

test('summarizeEvacuationCenters counts open and closed centers', () => {
  const summary = summarizeEvacuationCenters([
    makeCenter(),
    makeCenter({ id: 'evac::anitapan::gym', name: 'Gym', status: 'open' }),
    makeCenter({ id: 'evac::anitapan::hall', name: 'Hall', status: 'open' }),
  ]);

  assert.deepEqual(summary, { total: 3, open: 2, closed: 1 });
});
