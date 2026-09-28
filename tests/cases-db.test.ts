import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCase,
  getCases,
  getCase,
  getCaseByNumber,
  updateCase,
  deleteCase,
  bulkImportCases,
  addCaseNote,
  getCaseNotes,
  addCaseAttachment,
  getCaseAttachments,
  deleteCaseAttachment,
} from '../lib/db/cases';

test('1. createCase and getCases search filtering', async () => {
  const c1 = await createCase({
    case_number: 'TEST-VAWC-001',
    case_type: 'vawc_physical',
    status: 'active',
    reported_at: '2026-09-20',
    victim_name: 'Rosa Rosal',
    victim_gender: 'F',
    barangay_id: 'cadunan',
    case_summary: 'Physical battery argument',
    source: 'manual_intake',
  });

  assert.ok(c1.id.startsWith('case_'));
  assert.equal(c1.case_number, 'TEST-VAWC-001');

  // Search by case number
  const byNum = await getCases({ query: 'TEST-VAWC' });
  assert.ok(byNum.some((c) => c.case_number === 'TEST-VAWC-001'));

  // Search by victim name
  const byName = await getCases({ query: 'Rosa' });
  assert.ok(byName.some((c) => c.victim_name === 'Rosa Rosal'));

  // Filter by barangay
  const byBrgy = await getCases({ barangay_id: 'cadunan' });
  assert.ok(byBrgy.some((c) => c.case_number === 'TEST-VAWC-001'));

  // Filter by non-existent barangay
  const none = await getCases({ barangay_id: 'nonexistent-brgy', query: 'TEST-VAWC-001' });
  assert.equal(none.length, 0);
});

test('2. updateCase changes status and details', async () => {
  const c = await createCase({
    case_number: 'TEST-VAC-002',
    case_type: 'vac_neglect',
    status: 'active',
    reported_at: '2026-09-21',
    victim_name: 'Juanito Minor',
    victim_gender: 'M',
    barangay_id: 'cuambog',
    case_summary: 'Child neglect',
    source: 'manual_intake',
  });

  const updated = await updateCase(c.id, {
    status: 'under_bpo_tpo',
    perpetrator_name: 'Alberto Santos',
  });

  assert.equal(updated.status, 'under_bpo_tpo');
  assert.equal(updated.perpetrator_name, 'Alberto Santos');

  const fetched = await getCase(c.id);
  assert.equal(fetched?.status, 'under_bpo_tpo');
});

test('3. bulkImportCases handles insert and updates', async () => {
  const result = await bulkImportCases([
    {
      case_number: 'BULK-001',
      case_type: 'vawc_economic',
      status: 'active',
      reported_at: '2026-09-22',
      victim_name: 'Client A',
      barangay_id: 'pindasan',
      case_summary: 'Financial deprivation',
      source: 'excel_import',
    },
    {
      case_number: 'BULK-002',
      case_type: 'rape',
      status: 'referred_pnp_wcpd',
      reported_at: '2026-09-23',
      victim_name: 'Client B',
      barangay_id: 'tagnanan',
      case_summary: 'Rape referral',
      source: 'excel_import',
    },
  ]);

  assert.equal(result.importedCount, 2);

  // Update existing
  const updateResult = await bulkImportCases(
    [
      {
        case_number: 'BULK-001',
        case_type: 'vawc_economic',
        status: 'resolved_closed',
        reported_at: '2026-09-22',
        victim_name: 'Client A Updated',
        barangay_id: 'pindasan',
        case_summary: 'Agreement signed',
        source: 'excel_import',
      },
    ],
    { updateExisting: true },
  );

  assert.equal(updateResult.updatedCount, 1);
  const updatedCase = await getCaseByNumber('BULK-001');
  assert.equal(updatedCase?.status, 'resolved_closed');
  assert.equal(updatedCase?.victim_name, 'Client A Updated');
});

test('4. addCaseNote and getCaseNotes', async () => {
  const c = await createCase({
    case_number: 'NOTE-TEST-001',
    case_type: 'vawc_physical',
    status: 'active',
    reported_at: '2026-09-25',
    victim_name: 'Note Client',
    barangay_id: 'cadunan',
    case_summary: 'Test notes',
    source: 'manual_intake',
  });

  const note = await addCaseNote(c.id, {
    worker_name: 'Worker Jane, RSW',
    date: '2026-09-26',
    note: 'Conducted home visit and verified safety',
    action_taken: 'Referred to MSWDO Counselor',
  });

  assert.ok(note.id.startsWith('note_'));
  const allNotes = await getCaseNotes(c.id);
  assert.equal(allNotes.length, 1);
  assert.equal(allNotes[0].note, 'Conducted home visit and verified safety');
});

test('5. addCaseAttachment, getCaseAttachments and deleteCase', async () => {
  const c = await createCase({
    case_number: 'ATT-TEST-001',
    case_type: 'vac_abuse',
    status: 'active',
    reported_at: '2026-09-26',
    victim_name: 'Attachment Client',
    barangay_id: 'cadunan',
    case_summary: 'Test attachments',
    source: 'manual_intake',
  });

  const att = await addCaseAttachment(c.id, {
    file_name: 'BPO_Order.pdf',
    file_type: 'application/pdf',
    file_url: 'data:application/pdf;base64,sample',
    document_type: 'bpo_tpo',
    uploaded_by: 'Social Worker',
  });

  assert.ok(att.id.startsWith('att_'));
  let allAtts = await getCaseAttachments(c.id);
  assert.equal(allAtts.length, 1);

  await deleteCaseAttachment(att.id);
  allAtts = await getCaseAttachments(c.id);
  assert.equal(allAtts.length, 0);

  // Delete case
  await deleteCase(c.id);
  const deleted = await getCase(c.id);
  assert.equal(deleted, undefined);
});
