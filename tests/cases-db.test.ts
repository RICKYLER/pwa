import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCase,
  getCases,
  getCase,
  getCaseByNumber,
  updateCase,
  deleteCase,
  moveCaseToTrash,
  getTrashCases,
  restoreCaseFromTrash,
  permanentlyDeleteCase,
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

test('6. createCase with acts_of_lasciviousness and full intake_sheet GIS profile', async () => {
  const c = await createCase({
    case_number: 'GIS-TEST-2026-001',
    case_type: 'acts_of_lasciviousness',
    status: 'active',
    reported_at: '2026-09-28',
    victim_name: 'Maria Dela Cruz',
    victim_age: 24,
    victim_gender: 'F',
    victim_address: 'Purok 3, Cadunan, Mabini',
    barangay_id: 'cadunan',
    purok_sitio: 'Purok 3',
    case_summary: 'Acts of Lasciviousness reported by walk-in client',
    source: 'manual_intake',
    intake_sheet: {
      date_of_interview: '2026-09-28',
      client_category: 'walk_in',
      sectors: ['women', 'solo_parent'],
      case_category_type: 'acts_of_lasciviousness',
      birthdate: '2002-05-14',
      birthplace: 'Mabini, Davao de Oro',
      civil_status: 'Single',
      educational_attainment: 'College Level',
      occupation: 'Store Assistant',
      monthly_income: 6000,
      house_occupancy: 'renter',
      family_members: [
        {
          name: 'Angelo Dela Cruz',
          age: 4,
          civil_status: 'Single',
          relationship: 'Son',
          birthday: '2022-03-10',
        },
      ],
      monthly_expenses: {
        food: 3000,
        water: 300,
        electricity: 500,
        total: 3800,
      },
      agricultural_profile: {
        has_land: false,
      },
      problem_presented: 'Alleged harassment and indecent advances by landlord on September 25, 2026',
      family_background: 'Living independently with 4-year-old child; father provides no support',
      assessment: 'Client is distressed and requires immediate legal counseling and psycho-social support',
      recommendation_action: 'Issue Barangay Protection Order referral and assist with filing at PNP WCPD',
      priority_assistance_for: 'Legal and Medical Assistance',
      priority_rank: 'Priority 1',
      date_interviewed: '2026-09-28',
      client_signature_name: 'Maria Dela Cruz',
      mswdo_worker_name: 'Social Worker Elena, RSW',
    },
  });

  assert.equal(c.case_type, 'acts_of_lasciviousness');
  assert.ok(c.intake_sheet);
  assert.equal(c.intake_sheet.client_category, 'walk_in');
  assert.deepEqual(c.intake_sheet.sectors, ['women', 'solo_parent']);
  assert.equal(c.intake_sheet.family_members.length, 1);
  assert.equal(c.intake_sheet.family_members[0].name, 'Angelo Dela Cruz');
  assert.equal(c.intake_sheet.monthly_expenses?.total, 3800);
  assert.equal(c.intake_sheet.mswdo_worker_name, 'Social Worker Elena, RSW');

  // Verify retrieval
  const fetched = await getCase(c.id);
  assert.ok(fetched);
  assert.equal(fetched?.case_type, 'acts_of_lasciviousness');
  assert.equal(fetched?.intake_sheet?.problem_presented, 'Alleged harassment and indecent advances by landlord on September 25, 2026');

  // Search matching problem_presented
  const searchResults = await getCases({ query: 'harassment and indecent advances' });
  assert.ok(searchResults.some((item) => item.id === c.id));

  // Clean up
  await deleteCase(c.id);
});

test('7. moveCaseToTrash, getTrashCases, restoreCaseFromTrash, and permanentlyDeleteCase', async () => {
  const c = await createCase({
    case_number: 'TRASH-TEST-001',
    case_type: 'vawc_physical',
    status: 'active',
    reported_at: '2026-09-28',
    victim_name: 'Trash Victim',
    barangay_id: 'cadunan',
    case_summary: 'Test for trash bin workflow',
    source: 'manual_intake',
  });

  // 1. Initially active
  let activeCases = await getCases();
  assert.ok(activeCases.some((item) => item.id === c.id));
  let trashCases = await getTrashCases();
  assert.ok(!trashCases.some((item) => item.id === c.id));

  // 2. Move to trash
  await moveCaseToTrash(c.id, 'Officer Jane');
  activeCases = await getCases();
  assert.ok(!activeCases.some((item) => item.id === c.id));
  trashCases = await getTrashCases();
  const trashedRecord = trashCases.find((item) => item.id === c.id);
  assert.ok(trashedRecord);
  assert.equal(trashedRecord?.is_deleted, true);
  assert.equal(trashedRecord?.deleted_by, 'Officer Jane');
  assert.ok(trashedRecord?.deleted_at);

  // Normal getCase returns undefined for trashed item
  const regularFetch = await getCase(c.id);
  assert.equal(regularFetch, undefined);

  // getCase with includeDeleted returns the trashed record
  const fetchWithDeleted = await getCase(c.id, { includeDeleted: true });
  assert.ok(fetchWithDeleted);
  assert.equal(fetchWithDeleted?.id, c.id);

  // 3. Restore from trash
  await restoreCaseFromTrash(c.id);
  activeCases = await getCases();
  assert.ok(activeCases.some((item) => item.id === c.id));
  trashCases = await getTrashCases();
  assert.ok(!trashCases.some((item) => item.id === c.id));
  const restoredFetch = await getCase(c.id);
  assert.ok(restoredFetch);
  assert.equal(restoredFetch?.is_deleted, false);

  // 4. Move to trash and permanently delete
  await moveCaseToTrash(c.id);
  await permanentlyDeleteCase(c.id);

  // Permanently removed even with includeDeleted
  const purgedFetch = await getCase(c.id, { includeDeleted: true });
  assert.equal(purgedFetch, undefined);
  const finalTrash = await getTrashCases();
  assert.ok(!finalTrash.some((item) => item.id === c.id));
});


