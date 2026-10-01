import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx-js-style';
import {
  buildVacLogbookWorkbook,
  buildTwoTierVacMonitoringSheet,
  buildWideVacMasterSheet,
  VAC_COLORS,
} from '../lib/cases/vac-logbook-exporter';
import { parseAndCleanseCaseFile } from '../lib/cases/case-excel-importer';
import type { CaseRecord } from '../lib/db/schema';

test('VAC Exporter: Builds 3-sheet workbook with official VAC Monitoring Form tab', () => {
  const wb = buildVacLogbookWorkbook([]);
  assert.equal(wb.SheetNames.length, 3);
  assert.equal(wb.SheetNames[0], 'VAC Monitoring Form');
  assert.equal(wb.SheetNames[1], 'VAC Master Logbook');
  assert.equal(wb.SheetNames[2], 'Instructions & Legend');
});

test('VAC Exporter: Two-Tier layout includes pastel color styling for violence, perpetrators, actions', () => {
  const sampleCases: CaseRecord[] = [
    {
      id: 'case_vac_1',
      case_number: 'VAC-2024-001',
      reported_at: '2024-06-15',
      incident_date: '2024-06-14',
      case_type: 'vac_abuse',
      victim_name: 'Dela Cruz, Juan Pedro Jr.',
      victim_age: 11,
      victim_gender: 'M',
      victim_contact: '09123456789',
      victim_address: 'Purok 3',
      barangay_id: 'cadunan',
      perpetrator_name: 'Dela Cruz, Mario',
      perpetrator_relationship: 'Father',
      status: 'referred_pnp_wcpd',
      case_summary: 'Child was subjected to severe physical maltreatment at home',
      intake_notes: 'Referred to PNP WCPD and hospital medico-legal treatment',
      assigned_worker_name: 'Maria Clara, RSW',
      source: 'manual_intake',
      syncStatus: 'synced',
      createdAt: '2024-06-15T08:00:00Z',
      updatedAt: '2024-06-15T08:00:00Z',
    },
  ];

  const ws = buildTwoTierVacMonitoringSheet(sampleCases);

  // Check Types of Violence header (Col M / col 12, Row 0)
  const cellViolenceHdr = ws['M1'];
  assert.ok(cellViolenceHdr);
  assert.equal(cellViolenceHdr.v, 'TYPES OF VIOLENCE\n(4)');
  assert.equal((cellViolenceHdr.s as any)?.fill?.fgColor?.rgb, VAC_COLORS.violence);

  // Check Perpetrators header (Col P / col 15, Row 10 -> row index 9)
  const cellPerpHdr = ws['P10'];
  assert.ok(cellPerpHdr);
  assert.equal(cellPerpHdr.v, 'PERPETRATORS');
  assert.equal((cellPerpHdr.s as any)?.fill?.fgColor?.rgb, VAC_COLORS.perpetrator);

  // Check Actions Taken header (Col X / col 23, Row 10)
  const cellActionsHdr = ws['X10'];
  assert.ok(cellActionsHdr);
  assert.equal(cellActionsHdr.v, 'ACTIONS TAKEN BY THE BARANGAY/BCPC');
  assert.equal((cellActionsHdr.s as any)?.fill?.fgColor?.rgb, VAC_COLORS.actions);

  // Check subheaders on Row 11
  const cellImmFam = ws['P11'];
  assert.ok(cellImmFam);
  assert.ok(String(cellImmFam.v).includes('(5a)'));
  assert.equal((cellImmFam.s as any)?.fill?.fgColor?.rgb, VAC_COLORS.perpetrator);

  const cellLswdo = ws['X11'];
  assert.ok(cellLswdo);
  assert.ok(String(cellLswdo.v).includes('(6a)'));
  assert.equal((cellLswdo.s as any)?.fill?.fgColor?.rgb, VAC_COLORS.actions);

  // Check Remarks column on Row 10 & 11 (Column AD)
  const cellRemarks = ws['AD10'];
  assert.ok(cellRemarks);
  assert.equal(cellRemarks.v, 'REMARKS');
  assert.equal((cellRemarks.s as any)?.fill?.fgColor?.rgb, VAC_COLORS.remarks);
});

test('VAC Importer: Successfully round-trips exported VAC Monitoring Form back to CaseRecords', () => {
  const originalCases: CaseRecord[] = [
    {
      id: 'case_vac_test_1',
      case_number: 'VAC-2024-001',
      reported_at: '2024-06-15',
      incident_date: '2024-06-14',
      case_type: 'vac_abuse',
      victim_name: 'Santos, Ana Maria',
      victim_age: 9,
      victim_gender: 'F',
      victim_contact: '09123456789',
      barangay_id: 'cuambog',
      perpetrator_name: 'Santos, Ricardo',
      perpetrator_relationship: 'Father',
      status: 'under_bpo_tpo',
      case_summary: 'Emotional and psychological distress following dispute',
      intake_notes: 'Referred for Legal Assistance (6e)',
      source: 'manual_intake',
      syncStatus: 'synced',
      createdAt: '2024-06-15T08:00:00Z',
      updatedAt: '2024-06-15T08:00:00Z',
    },
  ];

  const wb = buildVacLogbookWorkbook(originalCases);
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const importResult = parseAndCleanseCaseFile(buffer, 'Exported_VAC_Form.xlsx');
  assert.equal(importResult.success, true);
  assert.equal(importResult.validCount, 1);

  const parsed = importResult.cases[0];
  assert.ok(parsed.victim_name.includes('Ana Maria') || parsed.victim_name.includes('Santos'));
  assert.equal(parsed.victim_age, 9);
  assert.equal(parsed.victim_gender, 'F');
  assert.equal(parsed.barangay_id, 'cuambog');
  assert.equal(parsed.perpetrator_name, 'Santos, Ricardo');
});
