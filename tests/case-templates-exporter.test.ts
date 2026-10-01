import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx-js-style';
import {
  buildVawcWorkbook,
  buildChildCustodySupportWorkbook,
  buildMasterInventoryWorkbook,
} from '../lib/cases/case-templates-exporter';
import { parseAndCleanseCaseFile } from '../lib/cases/case-excel-importer';
import type { CaseRecord } from '../lib/db/schema';

const sampleCases: CaseRecord[] = [
  {
    id: 'case_vawc_1',
    case_number: 'VAWC-2024-001',
    reported_at: '2024-05-10',
    incident_date: '2024-05-09',
    case_type: 'vawc_physical',
    victim_name: 'Maria Clara Santos',
    victim_age: 28,
    victim_gender: 'F',
    victim_contact: '09123456789',
    victim_address: 'Purok 2',
    barangay_id: 'cadunan',
    perpetrator_name: 'Juan Santos',
    perpetrator_relationship: 'Husband',
    perpetrator_address: 'Purok 2, Cadunan',
    status: 'under_bpo_tpo',
    case_summary: 'Physical assault and threats',
    intake_notes: 'Referred to PNP WCPD and RHU',
    source: 'manual_intake',
    createdAt: '2024-05-10T08:00:00Z',
    updatedAt: '2024-05-10T08:00:00Z',
  },
  {
    id: 'case_custody_1',
    case_number: 'CUS-2024-002',
    reported_at: '2024-05-12',
    incident_date: '2024-05-12',
    case_type: 'other',
    victim_name: 'Dela Cruz, Jose Jr.',
    victim_age: 7,
    victim_gender: 'M',
    victim_contact: '09987654321',
    victim_address: 'Purok 4',
    barangay_id: 'cuambog',
    perpetrator_name: 'Pedro Dela Cruz',
    perpetrator_relationship: 'Father',
    status: 'active',
    case_summary: 'Dispute over child custody and monthly financial support of P5,000',
    intake_notes: 'Conciliation agreement drafted at MSWDO',
    source: 'manual_intake',
    intake_sheet: {
      date_of_interview: '2024-05-12',
      client_category: 'walk_in',
      sectors: ['children'],
      case_category_type: 'child_custody',
      client_signature_name: 'Juana Dela Cruz',
      family_members: [],
    },
    createdAt: '2024-05-12T08:00:00Z',
    updatedAt: '2024-05-12T08:00:00Z',
  },
];

test('VAWC Exporter: Builds 2-sheet workbook with VAWC Registry & Guidelines', () => {
  const wb = buildVawcWorkbook(sampleCases);
  assert.equal(wb.SheetNames.length, 2);
  assert.equal(wb.SheetNames[0], 'VAWC Registry (RA 9262)');
  assert.equal(wb.SheetNames[1], 'VAWC Guidelines & Protocols');

  const ws = wb.Sheets['VAWC Registry (RA 9262)'];
  assert.ok(ws['A1']); // Title banner
  assert.ok(ws['A3']); // Group header or sub-header
  assert.equal((ws['A1'].s as any)?.fill?.fgColor?.rgb, '5B21B6'); // Deep Purple
});

test('Custody & Support Exporter: Builds Custody & Support Registry with Emerald headers', () => {
  const wb = buildChildCustodySupportWorkbook(sampleCases);
  assert.equal(wb.SheetNames.length, 1);
  assert.equal(wb.SheetNames[0], 'Custody & Support Registry');

  const ws = wb.Sheets['Custody & Support Registry'];
  assert.ok(ws['A1']);
  assert.equal((ws['A1'].s as any)?.fill?.fgColor?.rgb, '065F46'); // Emerald Dark
});

test('Master Inventory Exporter: Builds Master Case Inventory and Statistical Summary sheets', () => {
  const wb = buildMasterInventoryWorkbook(sampleCases);
  assert.equal(wb.SheetNames.length, 2);
  assert.equal(wb.SheetNames[0], 'Master Case Inventory');
  assert.equal(wb.SheetNames[1], 'Statistical Summary');

  const wsStats = wb.Sheets['Statistical Summary'];
  assert.ok(wsStats['A1']); // Title
  assert.ok(wsStats['A3']); // Header
});

test('Excel Importer: Seamlessly imports and parses VAWC Registry export', () => {
  const wb = buildVawcWorkbook(sampleCases);
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const result = parseAndCleanseCaseFile(buffer, 'VAWC_Registry_Test.xlsx');

  assert.equal(result.success, true);
  assert.ok(result.validCount >= 1);
  const vawcCase = result.cases.find((c) => c.victim_name.includes('Maria Clara'));
  assert.ok(vawcCase);
  assert.equal(vawcCase.barangay_id, 'cadunan');
});
