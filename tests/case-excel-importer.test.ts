import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  CASE_TEMPLATE_HEADERS,
  buildCaseExcelWorkbook,
  normalizeCaseClassification,
  normalizeCaseStatus,
  resolveCaseBarangay,
  parseDateClean,
  parseAndCleanseCaseFile,
} from '../lib/cases/case-excel-importer';

test('1. Generates valid Excel workbook with MSWDO Case Headers', () => {
  const wb = buildCaseExcelWorkbook();
  assert.ok(wb.SheetNames.includes('MSWDO Case Records'));
  const sheet = wb.Sheets['MSWDO Case Records'];
  const data: (string | number)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  assert.equal(data[0][0], 'Case Number');
  assert.equal(data[0][3], 'Case Classification');
  assert.equal(data[0][4], 'Victim / Client Full Name');
  assert.ok(data.length >= 5); // 1 header + 4 sample rows
});

test('2. Normalizes various case classifications and statuses correctly', () => {
  assert.equal(normalizeCaseClassification('RA 9262 Physical Abuse'), 'vawc_physical');
  assert.equal(normalizeCaseClassification('Psychological & verbal abuse'), 'vawc_psychological');
  assert.equal(normalizeCaseClassification('Child Neglect RA 7610'), 'vac_neglect');
  assert.equal(normalizeCaseClassification('Rape case'), 'rape');
  assert.equal(normalizeCaseClassification('Deprivation of financial support'), 'vawc_economic');
  assert.equal(normalizeCaseClassification('CICL theft incident'), 'cicl');

  assert.equal(normalizeCaseStatus('Under BPO issued by Punong Barangay'), 'under_bpo_tpo');
  assert.equal(normalizeCaseStatus('Referred to PNP WCPD'), 'referred_pnp_wcpd');
  assert.equal(normalizeCaseStatus('Filed in RTC Court'), 'filed_in_court');
  assert.equal(normalizeCaseStatus('Resolved and closed'), 'resolved_closed');
  assert.equal(normalizeCaseStatus('Ongoing counseling'), 'active');
});

test('3. Resolves barangays to Mabini 11 official IDs', () => {
  assert.equal(resolveCaseBarangay('Brgy. Cadunan'), 'cadunan');
  assert.equal(resolveCaseBarangay('Cuambog'), 'cuambog');
  assert.equal(resolveCaseBarangay('Barangay Golden Valley'), 'golden-valley');
  assert.equal(resolveCaseBarangay('Pindasan Purok 2'), 'pindasan');
});

test('4. Parses and cleanses raw CSV text with custom header aliases', () => {
  const csvData = `Control No,Petsa,Klase sa Kaso,Biktima,Edad,Sex,Address,Barangay,Akusado,Relasyon,Kahimtang,Narrative,Worker
"VAWC-2024-099",2024-05-12,"Physical Abuse","Elena Ramos",31,"F","Purok 1","Cadunan","Mario Ramos","Husband","Under BPO","Spousal battery reported","Jane Doe, RSW"
"VAC-2024-100",2024-06-01,"Child Abuse","Pedro Minor",8,"M","Purok 3","Cuambog","Juan Dela Cruz","Uncle","Referred to Police","Physical harm inflicted","Maria Clara, RSW"`;

  const result = parseAndCleanseCaseFile(csvData, 'test.csv');
  assert.equal(result.success, true);
  assert.equal(result.validCount, 2);

  const case1 = result.cases[0];
  assert.equal(case1.case_number, 'VAWC-2024-099');
  assert.equal(case1.victim_name, 'Elena Ramos');
  assert.equal(case1.victim_age, 31);
  assert.equal(case1.victim_gender, 'F');
  assert.equal(case1.barangay_id, 'cadunan');
  assert.equal(case1.case_type, 'vawc_physical');
  assert.equal(case1.status, 'under_bpo_tpo');
  assert.equal(case1.perpetrator_name, 'Mario Ramos');
  assert.equal(case1.perpetrator_relationship, 'Husband');

  const case2 = result.cases[1];
  assert.equal(case2.case_number, 'VAC-2024-100');
  assert.equal(case2.victim_name, 'Pedro Minor');
  assert.equal(case2.case_type, 'vac_abuse');
  assert.equal(case2.status, 'referred_pnp_wcpd');
});

test('5. Handles missing optional fields and duplicate case numbers gracefully', () => {
  const messyCsv = `Case Number,Victim Name,Barangay,Status
"CASE-001","Juana Dela Cruz","Pindasan","Active"
"CASE-001","Juana Dela Cruz Updated","Pindasan","Resolved"
"","Missing Victim Name","Cadunan","Active"
"CASE-003","","Cadunan","Active"`;

  const result = parseAndCleanseCaseFile(messyCsv, 'messy.csv');
  assert.equal(result.validCount, 3); // row 4 skipped because no victim name
  assert.ok(result.warnings.some((w) => w.includes('Duplicate Case Number')));
  assert.ok(result.warnings.some((w) => w.includes('Missing Case Number')));
});
