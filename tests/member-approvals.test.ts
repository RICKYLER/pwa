import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuditLog, Household, Resident } from '../lib/db/schema';
import { selectMemberApprovalHistory, selectPendingMemberApprovals } from '../lib/db/member-approvals';

function makeHousehold(overrides: Partial<Household> = {}): Household {
  return {
    id: overrides.id ?? 'hh-default',
    head_name: overrides.head_name ?? 'Default Household',
    barangay_id: overrides.barangay_id ?? 'anitapan',
    purok_sitio: overrides.purok_sitio ?? 'Purok 1',
    street_address: overrides.street_address ?? 'Default Street',
    contact_number: overrides.contact_number,
    applicant_email: overrides.applicant_email,
    status: overrides.status ?? 'active',
    registration_status: overrides.registration_status ?? 'approved',
    registration_reviewed_at: overrides.registration_reviewed_at,
    createdAt: overrides.createdAt ?? new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-04-01T00:00:00.000Z'),
    syncStatus: overrides.syncStatus ?? 'synced',
  };
}

function makeResident(overrides: Partial<Resident> = {}): Resident {
  return {
    id: overrides.id ?? 'res-default',
    household_id: overrides.household_id ?? 'hh-default',
    full_name: overrides.full_name ?? 'Default Member',
    birthdate: overrides.birthdate ?? '2000-01-01',
    gender: overrides.gender ?? 'M',
    relationship_to_head: overrides.relationship_to_head ?? 'Child',
    status: overrides.status ?? 'active',
    verification_status: overrides.verification_status ?? 'pending',
    createdAt: overrides.createdAt ?? new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-04-01T00:00:00.000Z'),
    syncStatus: overrides.syncStatus ?? 'synced',
  };
}

function makeAuditLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: overrides.id ?? 'log-default',
    user_id: overrides.user_id,
    action: overrides.action ?? 'REJECT',
    entity_type: overrides.entity_type ?? 'resident',
    entity_id: overrides.entity_id ?? 'res-rejected',
    changes: overrides.changes ?? {},
    timestamp: overrides.timestamp ?? new Date('2026-05-01T00:00:00.000Z'),
    syncStatus: overrides.syncStatus ?? 'synced',
  };
}

test('selectPendingMemberApprovals keeps active pending members in active approved households', () => {
  const household = makeHousehold({ id: 'hh-1', head_name: 'Cruz Family' });
  const pendingMember = makeResident({ id: 'res-1', household_id: 'hh-1', full_name: 'Ana Cruz' });

  const approvals = selectPendingMemberApprovals([household], [pendingMember]);

  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].resident.id, 'res-1');
  assert.equal(approvals[0].household.id, 'hh-1');
});

test('selectPendingMemberApprovals excludes verified and non-active members', () => {
  const household = makeHousehold({ id: 'hh-1' });
  const verified = makeResident({ id: 'res-verified', household_id: 'hh-1', verification_status: 'verified' });
  const movedOut = makeResident({ id: 'res-moved', household_id: 'hh-1', status: 'moved_out' });
  const deceased = makeResident({ id: 'res-deceased', household_id: 'hh-1', status: 'deceased' });
  const pending = makeResident({ id: 'res-pending', household_id: 'hh-1' });

  const approvals = selectPendingMemberApprovals([household], [verified, movedOut, deceased, pending]);

  assert.deepEqual(approvals.map((item) => item.resident.id), ['res-pending']);
});

test('selectPendingMemberApprovals excludes members in unapproved or inactive households', () => {
  const approved = makeHousehold({ id: 'hh-approved', registration_status: 'approved', status: 'active' });
  const pendingHousehold = makeHousehold({ id: 'hh-pending', registration_status: 'pending', status: 'active' });
  const movedOutHousehold = makeHousehold({ id: 'hh-moved', registration_status: 'approved', status: 'moved_out' });

  const inApproved = makeResident({ id: 'res-approved', household_id: 'hh-approved' });
  const inPending = makeResident({ id: 'res-pending-hh', household_id: 'hh-pending' });
  const inMovedOut = makeResident({ id: 'res-moved-hh', household_id: 'hh-moved' });
  const orphan = makeResident({ id: 'res-orphan', household_id: 'hh-missing' });

  const approvals = selectPendingMemberApprovals(
    [approved, pendingHousehold, movedOutHousehold],
    [inApproved, inPending, inMovedOut, orphan],
  );

  assert.deepEqual(approvals.map((item) => item.resident.id), ['res-approved']);
});

test('selectPendingMemberApprovals sorts by household head then member name', () => {
  const santos = makeHousehold({ id: 'hh-santos', head_name: 'Santos Family' });
  const bautista = makeHousehold({ id: 'hh-bautista', head_name: 'Bautista Family' });

  const residents = [
    makeResident({ id: 'r-santos-zoe', household_id: 'hh-santos', full_name: 'Zoe Santos' }),
    makeResident({ id: 'r-santos-ana', household_id: 'hh-santos', full_name: 'Ana Santos' }),
    makeResident({ id: 'r-bautista-ben', household_id: 'hh-bautista', full_name: 'Ben Bautista' }),
  ];

  const approvals = selectPendingMemberApprovals([santos, bautista], residents);

  assert.deepEqual(
    approvals.map((item) => item.resident.id),
    ['r-bautista-ben', 'r-santos-ana', 'r-santos-zoe'],
  );
});

test('selectMemberApprovalHistory lists verified non-head members with leader details', () => {
  const household = makeHousehold({
    id: 'hh-1',
    head_name: 'Cruz Family',
    purok_sitio: 'Purok 2',
    street_address: 'Mabini St',
    contact_number: '0917-000-0000',
    applicant_email: 'cruz@example.com',
  });
  const head = makeResident({
    id: 'res-head',
    household_id: 'hh-1',
    relationship_to_head: 'Self',
    verification_status: 'verified',
  });
  const member = makeResident({
    id: 'res-1',
    household_id: 'hh-1',
    full_name: 'Ana Cruz',
    relationship_to_head: 'Child',
    verification_status: 'verified',
    updatedAt: new Date('2026-06-01T09:00:00.000Z'),
  });

  const history = selectMemberApprovalHistory([household], [head, member], []);

  // The household head (relationship 'Self') is not an added member, so it is excluded.
  assert.equal(history.length, 1);
  assert.equal(history[0].decision, 'approved');
  assert.equal(history[0].residentId, 'res-1');
  assert.equal(history[0].memberName, 'Ana Cruz');
  assert.equal(history[0].household?.headName, 'Cruz Family');
  assert.equal(history[0].household?.location, 'Purok 2 · Mabini St');
  assert.equal(history[0].household?.contactNumber, '0917-000-0000');
  assert.equal(history[0].household?.applicantEmail, 'cruz@example.com');
});

test('selectMemberApprovalHistory excludes pending members and members in unapproved households', () => {
  const approved = makeHousehold({ id: 'hh-a' });
  const pendingHousehold = makeHousehold({ id: 'hh-p', registration_status: 'pending' });

  const verifiedInApproved = makeResident({ id: 'r1', household_id: 'hh-a', verification_status: 'verified' });
  const pendingInApproved = makeResident({ id: 'r2', household_id: 'hh-a', verification_status: 'pending' });
  const verifiedInPending = makeResident({ id: 'r3', household_id: 'hh-p', verification_status: 'verified' });

  const history = selectMemberApprovalHistory(
    [approved, pendingHousehold],
    [verifiedInApproved, pendingInApproved, verifiedInPending],
    [],
  );

  assert.deepEqual(history.map((entry) => entry.residentId), ['r1']);
});

test('selectMemberApprovalHistory reconstructs rejected members from REJECT audit logs', () => {
  const household = makeHousehold({ id: 'hh-1', head_name: 'Cruz Family' });
  const log = makeAuditLog({
    id: 'log-1',
    entity_id: 'res-x',
    changes: { member_name: 'Boy Cruz', household_id: 'hh-1', reason: 'Duplicate entry' },
    timestamp: new Date('2026-06-02T10:00:00.000Z'),
  });

  const history = selectMemberApprovalHistory([household], [], [log]);

  assert.equal(history.length, 1);
  assert.equal(history[0].decision, 'rejected');
  assert.equal(history[0].residentId, 'res-x');
  assert.equal(history[0].memberName, 'Boy Cruz');
  assert.equal(history[0].reason, 'Duplicate entry');
  assert.equal(history[0].household?.headName, 'Cruz Family');
});

test('selectMemberApprovalHistory tolerates rejected logs with a missing household or payload', () => {
  const log = makeAuditLog({ id: 'log-2', entity_id: 'res-y', changes: { household_id: 'hh-missing' } });

  const history = selectMemberApprovalHistory([], [], [log]);

  assert.equal(history.length, 1);
  assert.equal(history[0].household, null);
  assert.equal(history[0].memberName, 'A household member');
  assert.equal(history[0].reason, undefined);
});

test('selectMemberApprovalHistory ignores non-REJECT and non-resident audit logs', () => {
  const rejectLog = makeAuditLog({ id: 'l1', action: 'REJECT', entity_type: 'resident', entity_id: 'res-1' });
  const verifyLog = makeAuditLog({ id: 'l2', action: 'VERIFY', entity_type: 'resident', entity_id: 'res-2' });
  const householdReject = makeAuditLog({ id: 'l3', action: 'REJECT', entity_type: 'household', entity_id: 'hh-2' });

  const history = selectMemberApprovalHistory([], [], [rejectLog, verifyLog, householdReject]);

  assert.deepEqual(history.map((entry) => entry.residentId), ['res-1']);
});

test('selectMemberApprovalHistory sorts approved and rejected entries by decision time descending', () => {
  const household = makeHousehold({ id: 'hh-1' });
  const olderApproved = makeResident({
    id: 'r-old',
    household_id: 'hh-1',
    verification_status: 'verified',
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
  });
  const newerApproved = makeResident({
    id: 'r-new',
    household_id: 'hh-1',
    verification_status: 'verified',
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  });
  const midRejected = makeAuditLog({
    entity_id: 'r-rej',
    changes: { household_id: 'hh-1', member_name: 'Mid Member' },
    timestamp: new Date('2026-06-01T00:00:00.000Z'),
  });

  const history = selectMemberApprovalHistory([household], [olderApproved, newerApproved], [midRejected]);

  assert.deepEqual(history.map((entry) => entry.residentId), ['r-new', 'r-rej', 'r-old']);
});

test('selectMemberApprovalHistory reads rejected members from soft-deleted resident rows with full detail', () => {
  const household = makeHousehold({
    id: 'hh-1',
    head_name: 'Cruz Family',
    purok_sitio: 'Purok 2',
    street_address: 'Mabini St',
  });
  const rejectedMember = makeResident({
    id: 'res-rejected',
    household_id: 'hh-1',
    full_name: 'Ana Cruz',
    relationship_to_head: 'Child',
    birthdate: '2010-04-15',
    gender: 'F',
    status: 'rejected',
    updatedAt: new Date('2026-06-02T10:00:00.000Z'),
  });
  const rejectLog = makeAuditLog({
    id: 'log-rej',
    entity_id: 'res-rejected',
    changes: { member_name: 'Ana Cruz', household_id: 'hh-1', reason: 'Duplicate entry' },
    timestamp: new Date('2026-06-02T10:00:00.000Z'),
  });

  const history = selectMemberApprovalHistory([household], [rejectedMember], [rejectLog]);

  assert.equal(history.length, 1);
  assert.equal(history[0].decision, 'rejected');
  assert.equal(history[0].residentId, 'res-rejected');
  assert.equal(history[0].memberName, 'Ana Cruz');
  assert.equal(history[0].relationship, 'Child');
  assert.equal(history[0].birthdate, '2010-04-15');
  assert.equal(history[0].gender, 'F');
  assert.equal(history[0].reason, 'Duplicate entry');
  assert.equal(history[0].household?.headName, 'Cruz Family');
});

test('selectMemberApprovalHistory does not duplicate a rejection when both the tombstone and audit log exist', () => {
  const household = makeHousehold({ id: 'hh-1' });
  const rejectedMember = makeResident({
    id: 'res-rejected',
    household_id: 'hh-1',
    status: 'rejected',
  });
  // Two REJECT logs for the same resident — only one history entry may appear.
  const logs = [
    makeAuditLog({ id: 'log-1', entity_id: 'res-rejected', changes: { household_id: 'hh-1', reason: 'Duplicate' } }),
    makeAuditLog({ id: 'log-2', entity_id: 'res-rejected', changes: { household_id: 'hh-1', reason: 'Still duplicate' } }),
  ];

  const history = selectMemberApprovalHistory([household], [rejectedMember], logs);

  assert.equal(history.length, 1);
  assert.equal(history[0].key, 'rejected:res-rejected');
});

test('selectMemberApprovalHistory still reconstructs legacy hard-deleted rejections from audit logs alone', () => {
  const household = makeHousehold({ id: 'hh-1', head_name: 'Cruz Family' });
  const log = makeAuditLog({
    id: 'log-1',
    entity_id: 'res-x',
    changes: { member_name: 'Boy Cruz', household_id: 'hh-1', reason: 'Duplicate entry' },
    timestamp: new Date('2026-06-02T10:00:00.000Z'),
  });

  const history = selectMemberApprovalHistory([household], [], [log]);

  assert.equal(history.length, 1);
  assert.equal(history[0].decision, 'rejected');
  assert.equal(history[0].residentId, 'res-x');
  assert.equal(history[0].memberName, 'Boy Cruz');
  assert.equal(history[0].reason, 'Duplicate entry');
  assert.equal(history[0].household?.headName, 'Cruz Family');
});

test('selectMemberApprovalHistory respects the limit option after sorting', () => {
  const household = makeHousehold({ id: 'hh-1' });
  const newest = makeResident({
    id: 'r-new',
    household_id: 'hh-1',
    verification_status: 'verified',
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  });
  const older = makeResident({
    id: 'r-old',
    household_id: 'hh-1',
    verification_status: 'verified',
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
  });

  const limited = selectMemberApprovalHistory([household], [older, newest], [], { limit: 1 });

  assert.deepEqual(limited.map((entry) => entry.residentId), ['r-new']);
});

test('selectPendingMemberApprovals respects the limit option after sorting', () => {
  const santos = makeHousehold({ id: 'hh-santos', head_name: 'Santos Family' });
  const bautista = makeHousehold({ id: 'hh-bautista', head_name: 'Bautista Family' });
  const residents = [
    makeResident({ id: 'r-santos', household_id: 'hh-santos', full_name: 'Zoe Santos' }),
    makeResident({ id: 'r-bautista', household_id: 'hh-bautista', full_name: 'Ben Bautista' }),
  ];

  const limited = selectPendingMemberApprovals([santos, bautista], residents, undefined, { limit: 1 });

  assert.deepEqual(limited.map((item) => item.resident.id), ['r-bautista']);
});

test('selectPendingMemberApprovals excludes rejected members from the pending queue', () => {
  const household = makeHousehold({ id: 'hh-1' });
  const pending = makeResident({ id: 'res-pending', household_id: 'hh-1' });
  const rejected = makeResident({ id: 'res-rejected', household_id: 'hh-1', status: 'rejected' });

  const approvals = selectPendingMemberApprovals([household], [pending, rejected]);

  assert.deepEqual(approvals.map((item) => item.resident.id), ['res-pending']);
});
