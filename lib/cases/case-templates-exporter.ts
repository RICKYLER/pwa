/**
 * Comprehensive Case Templates Exporter for LGU MSWDO / BCPC
 * Supports:
 *  1. VAC Monitoring Form (RA 7610) with official pastel colors
 *  2. VAWC Registry & Logbook (RA 9262) with official purple/violet styling
 *  3. Child Custody & Support Registry with soft emerald styling
 *  4. Master Inventory of Cases (All Categories) with statistical summary sheet
 */

import * as XLSX from 'xlsx-js-style';
import type { CaseRecord } from '@/lib/db/schema';
import { getBarangayName } from '@/lib/mabini-barangays';
import {
  buildVacLogbookWorkbook,
  downloadVacLogbook,
  downloadBlankVacTemplate,
} from './vac-logbook-exporter';

// Re-export VAC functions for easy one-stop import
export { downloadVacLogbook, downloadBlankVacTemplate };

const BORDER_THIN = {
  top: { style: 'thin', color: { rgb: '000000' } },
  bottom: { style: 'thin', color: { rgb: '000000' } },
  left: { style: 'thin', color: { rgb: '000000' } },
  right: { style: 'thin', color: { rgb: '000000' } },
};

function formatDate(val?: string | Date | null): string {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function createStyledCell(
  val: string | number | null | undefined,
  opts: {
    fill?: string;
    bold?: boolean;
    align?: 'left' | 'center' | 'right';
    color?: string;
    fontSize?: number;
    wrapText?: boolean;
    border?: boolean;
  } = {}
): XLSX.CellObject {
  const isNum = typeof val === 'number';
  const cell: XLSX.CellObject = {
    v: val ?? '',
    t: isNum ? 'n' : 's',
    s: {
      font: {
        name: 'Calibri',
        sz: opts.fontSize ?? 9,
        bold: opts.bold ?? false,
        color: opts.color ? { rgb: opts.color } : { rgb: '000000' },
      },
      alignment: {
        horizontal: opts.align ?? (isNum ? 'center' : 'left'),
        vertical: 'center',
        wrapText: opts.wrapText ?? false,
      },
      border: opts.border !== false ? BORDER_THIN : undefined,
    },
  };
  if (opts.fill) {
    cell.s.fill = {
      patternType: 'solid',
      fgColor: { rgb: opts.fill.replace('#', '') },
    };
  }
  return cell;
}

// =============================================================================
// 1. VAWC REGISTRY & LOGBOOK (RA 9262)
// =============================================================================
export function buildVawcWorkbook(cases: CaseRecord[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {};
  const vawcCases = cases.filter((c) => {
    const t = (c.case_type || '').toLowerCase();
    const g = (c.intake_sheet?.case_category_type || '').toLowerCase();
    const n = ((c.case_summary || '') + ' ' + (c.intake_notes || '')).toLowerCase();
    return (
      t.startsWith('vawc') ||
      g === 'vawc' ||
      n.includes('vawc') ||
      n.includes('9262') ||
      n.includes('bpo')
    );
  });

  const setCell = (r: number, c: number, val: any, opts: any = {}) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    ws[ref] = createStyledCell(val, opts);
  };

  const VAWC_PURPLE_DARK = '5B21B6';  // Title / Deep Purple
  const VAWC_PURPLE_MID = '7C3AED';   // Group headers
  const VAWC_PURPLE_LIGHT = 'EDE9FE'; // Sub-headers / Light Violet
  const VAWC_BG_ZEBRA = 'FAF5FF';     // Subtle alternating row

  // Row 0: Title Banner
  setCell(0, 0, 'BARANGAY VAWC DESK & MSWDO REGISTRY OF CASES (REPUBLIC ACT NO. 9262)', {
    fill: VAWC_PURPLE_DARK,
    bold: true,
    color: 'FFFFFF',
    fontSize: 11,
    align: 'center',
  });
  for (let c = 1; c <= 20; c++) {
    setCell(0, c, '', { fill: VAWC_PURPLE_DARK });
  }

  // Row 1: Group Headers
  setCell(1, 0, 'CASE & INTAKE INFORMATION', { fill: VAWC_PURPLE_MID, bold: true, color: 'FFFFFF', align: 'center' });
  for (let c = 1; c <= 3; c++) setCell(1, c, '', { fill: VAWC_PURPLE_MID });

  setCell(1, 4, 'VICTIM / SURVIVOR DETAILS', { fill: VAWC_PURPLE_MID, bold: true, color: 'FFFFFF', align: 'center' });
  for (let c = 5; c <= 8; c++) setCell(1, c, '', { fill: VAWC_PURPLE_MID });

  setCell(1, 9, 'RESPONDENT / PERPETRATOR', { fill: VAWC_PURPLE_MID, bold: true, color: 'FFFFFF', align: 'center' });
  for (let c = 10; c <= 11; c++) setCell(1, c, '', { fill: VAWC_PURPLE_MID });

  setCell(1, 12, 'ACTS OF VIOLENCE (RA 9262)', { fill: VAWC_PURPLE_MID, bold: true, color: 'FFFFFF', align: 'center' });
  for (let c = 13; c <= 15; c++) setCell(1, c, '', { fill: VAWC_PURPLE_MID });

  setCell(1, 16, 'PROTECTIVE ORDER', { fill: VAWC_PURPLE_MID, bold: true, color: 'FFFFFF', align: 'center' });
  setCell(1, 17, '', { fill: VAWC_PURPLE_MID });

  setCell(1, 18, 'ACTIONS & STATUS', { fill: VAWC_PURPLE_MID, bold: true, color: 'FFFFFF', align: 'center' });
  for (let c = 19; c <= 20; c++) setCell(1, c, '', { fill: VAWC_PURPLE_MID });

  // Row 2: Sub-headers
  const headers = [
    'NO.',
    'CASE NO.',
    'INTAKE DATE',
    'BARANGAY',
    'SURVIVOR FULL NAME',
    'AGE',
    'GENDER',
    'CONTACT NO.',
    'PUROK / ADDRESS',
    'PERPETRATOR NAME',
    'RELATIONSHIP',
    'ADDRESS',
    'Physical (Sec 5a)',
    'Psychological (Sec 5i)',
    'Sexual (Sec 5g)',
    'Economic (Sec 5e)',
    'BPO Issued',
    'Court TPO/PPO',
    'ACTION TAKEN / REFERRAL',
    'CURRENT STATUS',
    'REMARKS',
  ];

  headers.forEach((h, c) => {
    setCell(2, c, h, {
      fill: VAWC_PURPLE_LIGHT,
      bold: true,
      color: '4C1D95',
      align: 'center',
      wrapText: true,
    });
  });

  const rowCount = Math.max(12, vawcCases.length);
  for (let i = 0; i < rowCount; i++) {
    const r = 3 + i;
    const c = vawcCases[i];
    const fillZebra = i % 2 === 1 ? VAWC_BG_ZEBRA : undefined;

    if (c) {
      const allText = ((c.case_summary || '') + ' ' + (c.intake_notes || '')).toLowerCase();
      const isPhysical = c.case_type === 'vawc_physical' || allText.includes('physical');
      const isPsych = c.case_type === 'vawc_psychological' || allText.includes('psychological') || allText.includes('emotional');
      const isSexual = c.case_type === 'vawc_sexual' || allText.includes('sexual');
      const isEconomic = c.case_type === 'vawc_economic' || allText.includes('economic');
      const hasBpo = c.status === 'under_bpo_tpo' || allText.includes('bpo');
      const hasCourt = c.status === 'filed_in_court' || allText.includes('tpo') || allText.includes('ppo');

      setCell(r, 0, i + 1, { align: 'center', fill: fillZebra });
      setCell(r, 1, c.case_number, { align: 'center', fill: fillZebra, bold: true });
      setCell(r, 2, formatDate(c.reported_at), { align: 'center', fill: fillZebra });
      setCell(r, 3, getBarangayName(c.barangay_id), { align: 'left', fill: fillZebra });
      setCell(r, 4, c.victim_name, { align: 'left', fill: fillZebra, bold: true });
      setCell(r, 5, c.victim_age ?? '', { align: 'center', fill: fillZebra });
      setCell(r, 6, c.victim_gender || 'F', { align: 'center', fill: fillZebra });
      setCell(r, 7, c.victim_contact || '', { align: 'center', fill: fillZebra });
      setCell(r, 8, c.purok_sitio || c.victim_address || '', { align: 'left', fill: fillZebra });
      setCell(r, 9, c.perpetrator_name || '', { align: 'left', fill: fillZebra });
      setCell(r, 10, c.perpetrator_relationship || '', { align: 'left', fill: fillZebra });
      setCell(r, 11, c.perpetrator_address || '', { align: 'left', fill: fillZebra });
      setCell(r, 12, isPhysical ? '1' : '', { align: 'center', fill: fillZebra });
      setCell(r, 13, isPsych ? '1' : '', { align: 'center', fill: fillZebra });
      setCell(r, 14, isSexual ? '1' : '', { align: 'center', fill: fillZebra });
      setCell(r, 15, isEconomic ? '1' : '', { align: 'center', fill: fillZebra });
      setCell(r, 16, hasBpo ? 'YES' : '', { align: 'center', fill: fillZebra, bold: hasBpo });
      setCell(r, 17, hasCourt ? 'YES' : '', { align: 'center', fill: fillZebra, bold: hasCourt });
      setCell(r, 18, c.intake_notes || 'Referred to MSWDO', { align: 'left', fill: fillZebra });
      setCell(r, 19, (c.status || 'active').replace(/_/g, ' ').toUpperCase(), { align: 'center', fill: fillZebra });
      setCell(r, 20, c.case_summary || '', { align: 'left', fill: fillZebra });
    } else {
      setCell(r, 0, i + 1, { align: 'center', fill: fillZebra });
      for (let col = 1; col <= 20; col++) {
        setCell(r, col, '', { fill: fillZebra });
      }
    }
  }

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 20 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
    { s: { r: 1, c: 4 }, e: { r: 1, c: 8 } },
    { s: { r: 1, c: 9 }, e: { r: 1, c: 11 } },
    { s: { r: 1, c: 12 }, e: { r: 1, c: 15 } },
    { s: { r: 1, c: 16 }, e: { r: 1, c: 17 } },
    { s: { r: 1, c: 18 }, e: { r: 1, c: 20 } },
  ];

  ws['!cols'] = [
    { wch: 6 },  // No.
    { wch: 16 }, // Case No.
    { wch: 13 }, // Intake Date
    { wch: 18 }, // Barangay
    { wch: 25 }, // Survivor Name
    { wch: 6 },  // Age
    { wch: 8 },  // Gender
    { wch: 14 }, // Contact
    { wch: 18 }, // Purok/Address
    { wch: 24 }, // Perp Name
    { wch: 18 }, // Relationship
    { wch: 18 }, // Address
    { wch: 14 }, // Physical
    { wch: 16 }, // Psych
    { wch: 14 }, // Sexual
    { wch: 14 }, // Economic
    { wch: 12 }, // BPO
    { wch: 13 }, // TPO/PPO
    { wch: 26 }, // Action Taken
    { wch: 18 }, // Status
    { wch: 32 }, // Remarks
  ];

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 3 + rowCount, c: 20 } });
  XLSX.utils.book_append_sheet(wb, ws, 'VAWC Registry (RA 9262)');

  // Sheet 2: Reference & Instructions
  const wsGuide: XLSX.WorkSheet = {};
  const guideLines = [
    'BARANGAY VAWC DESK — PROTOCOL & INSTRUCTIONS (RA 9262)',
    '',
    '1. Republic Act No. 9262: Anti-Violence Against Women and Their Children Act of 2004.',
    '2. Barangay Protection Order (BPO): Issued by the Punong Barangay or Kagawad on duty, valid for 15 days.',
    '3. Acts of Violence Categories:',
    '   - Section 5(a): Physical Violence (causing bodily harm, threat of harm)',
    '   - Section 5(i): Psychological/Emotional (causing mental agony, marital infidelity, intimidation)',
    '   - Section 5(g): Sexual Violence (rape, sexual harassment, making humiliating remarks)',
    '   - Section 5(e): Economic Abuse (withholding financial support, controlling property/finances)',
    '4. Standard Operating Procedure:',
    '   - Immediately interview the victim in a private room.',
    '   - Facilitate medical examination / medico-legal certificate at RHU or Hospital.',
    '   - Issue BPO upon application if ex-parte basis is met.',
    '   - Endorse case to MSWDO and PNP Women & Children Protection Desk (WCPD) within 48 hours.',
  ];
  guideLines.forEach((line, idx) => {
    const ref = XLSX.utils.encode_cell({ r: idx, c: 0 });
    wsGuide[ref] = createStyledCell(line, {
      bold: idx === 0 || line.startsWith('1.') || line.startsWith('4.'),
      fontSize: idx === 0 ? 11 : 9.5,
      border: false,
    });
  });
  wsGuide['!cols'] = [{ wch: 90 }];
  wsGuide['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: guideLines.length, c: 0 } });
  XLSX.utils.book_append_sheet(wb, wsGuide, 'VAWC Guidelines & Protocols');

  return wb;
}

export function downloadVawcLogbook(cases: CaseRecord[], barangayLabel?: string): void {
  try {
    const wb = buildVawcWorkbook(cases);
    const dateStr = new Date().toISOString().slice(0, 10);
    const brgy = barangayLabel ? `_${barangayLabel.replace(/\s+/g, '_')}` : '';
    XLSX.writeFile(wb, `VAWC_Desk_Registry_RA9262${brgy}_${dateStr}.xlsx`);
  } catch (err) {
    console.error('Error downloading VAWC logbook:', err);
  }
}

export function downloadBlankVawcTemplate(): void {
  try {
    const wb = buildVawcWorkbook([]);
    XLSX.writeFile(wb, 'VAWC_Desk_Registry_TEMPLATE_RA9262.xlsx');
  } catch (err) {
    console.error('Error downloading blank VAWC template:', err);
  }
}

// =============================================================================
// 2. CHILD CUSTODY & SUPPORT REGISTRY
// =============================================================================
export function buildChildCustodySupportWorkbook(cases: CaseRecord[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {};
  const custodyCases = cases.filter((c) => {
    const g = (c.intake_sheet?.case_category_type || '').toLowerCase();
    const n = ((c.case_summary || '') + ' ' + (c.intake_notes || '')).toLowerCase();
    return (
      g === 'child_custody' ||
      g === 'child_support' ||
      n.includes('child support') ||
      n.includes('custody') ||
      n.includes('sustento') ||
      n.includes('visitation')
    );
  });

  const setCell = (r: number, c: number, val: any, opts: any = {}) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    ws[ref] = createStyledCell(val, opts);
  };

  const EMERALD_DARK = '065F46';
  const EMERALD_MID = '047857';
  const EMERALD_LIGHT = 'D1FAE5';
  const EMERALD_ZEBRA = 'F0FDF4';

  // Row 0: Title Banner
  setCell(0, 0, 'MSWDO CHILD CUSTODY & FINANCIAL SUPPORT MONITORING REGISTRY', {
    fill: EMERALD_DARK,
    bold: true,
    color: 'FFFFFF',
    fontSize: 11,
    align: 'center',
  });
  for (let c = 1; c <= 16; c++) setCell(0, c, '', { fill: EMERALD_DARK });

  // Row 1: Group Headers
  setCell(1, 0, 'CASE PROFILE', { fill: EMERALD_MID, bold: true, color: 'FFFFFF', align: 'center' });
  for (let c = 1; c <= 3; c++) setCell(1, c, '', { fill: EMERALD_MID });

  setCell(1, 4, 'CHILD / BENEFICIARY', { fill: EMERALD_MID, bold: true, color: 'FFFFFF', align: 'center' });
  for (let c = 5; c <= 6; c++) setCell(1, c, '', { fill: EMERALD_MID });

  setCell(1, 7, 'CUSTODIAL PARENT / COMPLAINANT', { fill: EMERALD_MID, bold: true, color: 'FFFFFF', align: 'center' });
  for (let c = 8; c <= 9; c++) setCell(1, c, '', { fill: EMERALD_MID });

  setCell(1, 10, 'RESPONDENT / OBLIGOR PARENT', { fill: EMERALD_MID, bold: true, color: 'FFFFFF', align: 'center' });
  setCell(1, 11, '', { fill: EMERALD_MID });

  setCell(1, 12, 'AGREED TERMS & CONCILIATION', { fill: EMERALD_MID, bold: true, color: 'FFFFFF', align: 'center' });
  for (let c = 13; c <= 16; c++) setCell(1, c, '', { fill: EMERALD_MID });

  // Row 2: Sub-headers
  const headers = [
    'NO.',
    'CASE NO.',
    'FILING DATE',
    'BARANGAY',
    'CHILD NAME',
    'AGE',
    'GENDER',
    'CUSTODIAL PARENT NAME',
    'CONTACT NO.',
    'ADDRESS',
    'RESPONDENT NAME',
    'RELATIONSHIP',
    'NATURE OF DISPUTE',
    'AGREED MONTHLY SUPPORT (PHP)',
    'PAYMENT SCHEDULE & MODE',
    'STATUS OF AGREEMENT',
    'REMARKS & MONITORING',
  ];

  headers.forEach((h, c) => {
    setCell(2, c, h, {
      fill: EMERALD_LIGHT,
      bold: true,
      color: '064E3B',
      align: 'center',
      wrapText: true,
    });
  });

  const rowCount = Math.max(12, custodyCases.length);
  for (let i = 0; i < rowCount; i++) {
    const r = 3 + i;
    const c = custodyCases[i];
    const fillZebra = i % 2 === 1 ? EMERALD_ZEBRA : undefined;

    if (c) {
      const summary = c.case_summary || '';
      const notes = c.intake_notes || '';
      const amountMatch = (summary + ' ' + notes).match(/P(?:HP)?\s*([0-9,]+)/i);
      const supportAmt = amountMatch ? `₱${amountMatch[1]}` : 'Per Agreement';

      setCell(r, 0, i + 1, { align: 'center', fill: fillZebra });
      setCell(r, 1, c.case_number, { align: 'center', fill: fillZebra, bold: true });
      setCell(r, 2, formatDate(c.reported_at), { align: 'center', fill: fillZebra });
      setCell(r, 3, getBarangayName(c.barangay_id), { align: 'left', fill: fillZebra });
      setCell(r, 4, c.victim_name, { align: 'left', fill: fillZebra, bold: true });
      setCell(r, 5, c.victim_age ?? '', { align: 'center', fill: fillZebra });
      setCell(r, 6, c.victim_gender || 'M', { align: 'center', fill: fillZebra });
      setCell(r, 7, c.intake_sheet?.client_signature_name || 'Custodial Parent', { align: 'left', fill: fillZebra });
      setCell(r, 8, c.victim_contact || '', { align: 'center', fill: fillZebra });
      setCell(r, 9, c.purok_sitio || c.victim_address || '', { align: 'left', fill: fillZebra });
      setCell(r, 10, c.perpetrator_name || '', { align: 'left', fill: fillZebra });
      setCell(r, 11, c.perpetrator_relationship || 'Father', { align: 'left', fill: fillZebra });
      setCell(r, 12, c.intake_sheet?.case_category_type === 'child_custody' ? 'Child Custody' : 'Child Support', { align: 'center', fill: fillZebra });
      setCell(r, 13, supportAmt, { align: 'center', fill: fillZebra, bold: true });
      setCell(r, 14, 'Every 15th & 30th (Direct / MSWDO)', { align: 'left', fill: fillZebra });
      setCell(r, 15, (c.status || 'active').replace(/_/g, ' ').toUpperCase(), { align: 'center', fill: fillZebra });
      setCell(r, 16, c.case_summary || notes, { align: 'left', fill: fillZebra });
    } else {
      setCell(r, 0, i + 1, { align: 'center', fill: fillZebra });
      for (let col = 1; col <= 16; col++) {
        setCell(r, col, '', { fill: fillZebra });
      }
    }
  }

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 16 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
    { s: { r: 1, c: 4 }, e: { r: 1, c: 6 } },
    { s: { r: 1, c: 7 }, e: { r: 1, c: 9 } },
    { s: { r: 1, c: 10 }, e: { r: 1, c: 11 } },
    { s: { r: 1, c: 12 }, e: { r: 1, c: 16 } },
  ];

  ws['!cols'] = [
    { wch: 6 },  // No.
    { wch: 16 }, // Case No.
    { wch: 13 }, // Filing Date
    { wch: 18 }, // Barangay
    { wch: 24 }, // Child Name
    { wch: 6 },  // Age
    { wch: 8 },  // Gender
    { wch: 25 }, // Custodial Parent
    { wch: 15 }, // Contact
    { wch: 18 }, // Address
    { wch: 24 }, // Respondent
    { wch: 16 }, // Relationship
    { wch: 18 }, // Nature of Dispute
    { wch: 22 }, // Agreed Amount
    { wch: 28 }, // Schedule & Mode
    { wch: 20 }, // Status
    { wch: 35 }, // Remarks
  ];

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 3 + rowCount, c: 16 } });
  XLSX.utils.book_append_sheet(wb, ws, 'Custody & Support Registry');

  return wb;
}

export function downloadChildCustodySupportLogbook(cases: CaseRecord[], barangayLabel?: string): void {
  try {
    const wb = buildChildCustodySupportWorkbook(cases);
    const dateStr = new Date().toISOString().slice(0, 10);
    const brgy = barangayLabel ? `_${barangayLabel.replace(/\s+/g, '_')}` : '';
    XLSX.writeFile(wb, `Child_Custody_Support_Registry${brgy}_${dateStr}.xlsx`);
  } catch (err) {
    console.error('Error downloading Child Custody & Support registry:', err);
  }
}

export function downloadBlankCustodySupportTemplate(): void {
  try {
    const wb = buildChildCustodySupportWorkbook([]);
    XLSX.writeFile(wb, 'Child_Custody_Support_TEMPLATE.xlsx');
  } catch (err) {
    console.error('Error downloading blank Child Custody & Support template:', err);
  }
}

// =============================================================================
// 3. MASTER INVENTORY OF CASES (ALL CATEGORIES)
// =============================================================================
export function buildMasterInventoryWorkbook(cases: CaseRecord[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {};

  const setCell = (r: number, c: number, val: any, opts: any = {}) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    ws[ref] = createStyledCell(val, opts);
  };

  const SLATE_DARK = '0F172A';
  const SLATE_MID = '334155';
  const SLATE_LIGHT = 'F1F5F9';
  const ZEBRA = 'F8FAFC';

  // Row 0: Title Banner
  setCell(0, 0, 'MUNICIPAL SOCIAL WELFARE AND DEVELOPMENT OFFICE (MSWDO) — MASTER INVENTORY OF CASES', {
    fill: SLATE_DARK,
    bold: true,
    color: 'FFFFFF',
    fontSize: 11,
    align: 'center',
  });
  for (let c = 1; c <= 15; c++) setCell(0, c, '', { fill: SLATE_DARK });

  const headers = [
    'NO.',
    'CASE NO.',
    'DATE REPORTED',
    'INCIDENT DATE',
    'CASE CLASSIFICATION',
    'CLIENT / VICTIM NAME',
    'AGE',
    'GENDER',
    'CONTACT NO.',
    'BARANGAY',
    'PUROK / ADDRESS',
    'RESPONDENT / PERPETRATOR',
    'RELATIONSHIP',
    'STATUS',
    'ASSIGNED SOCIAL WORKER',
    'CASE SUMMARY / INTAKE NOTES',
  ];

  headers.forEach((h, c) => {
    setCell(1, c, h, {
      fill: SLATE_LIGHT,
      bold: true,
      color: SLATE_MID,
      align: 'center',
      wrapText: true,
    });
  });

  const rowCount = Math.max(12, cases.length);
  for (let idx = 0; idx < rowCount; idx++) {
    const r = 2 + idx;
    const c = cases[idx];
    const fillZebra = idx % 2 === 1 ? ZEBRA : undefined;

    if (c) {
      setCell(r, 0, idx + 1, { align: 'center', fill: fillZebra });
      setCell(r, 1, c.case_number, { align: 'center', fill: fillZebra, bold: true });
      setCell(r, 2, formatDate(c.reported_at), { align: 'center', fill: fillZebra });
      setCell(r, 3, formatDate(c.incident_date || c.reported_at), { align: 'center', fill: fillZebra });
      setCell(r, 4, (c.case_type || 'General Case').replace(/_/g, ' ').toUpperCase(), { align: 'left', fill: fillZebra, bold: true });
      setCell(r, 5, c.victim_name, { align: 'left', fill: fillZebra, bold: true });
      setCell(r, 6, c.victim_age ?? '', { align: 'center', fill: fillZebra });
      setCell(r, 7, c.victim_gender || '', { align: 'center', fill: fillZebra });
      setCell(r, 8, c.victim_contact || '', { align: 'center', fill: fillZebra });
      setCell(r, 9, getBarangayName(c.barangay_id), { align: 'left', fill: fillZebra });
      setCell(r, 10, c.purok_sitio || c.victim_address || '', { align: 'left', fill: fillZebra });
      setCell(r, 11, c.perpetrator_name || '', { align: 'left', fill: fillZebra });
      setCell(r, 12, c.perpetrator_relationship || '', { align: 'left', fill: fillZebra });
      setCell(r, 13, (c.status || 'active').replace(/_/g, ' ').toUpperCase(), { align: 'center', fill: fillZebra });
      setCell(r, 14, c.assigned_worker_name || 'MSWDO Officer', { align: 'left', fill: fillZebra });
      setCell(r, 15, `${c.case_summary || ''}${c.intake_notes ? ' | ' + c.intake_notes : ''}`, { align: 'left', fill: fillZebra });
    } else {
      setCell(r, 0, idx + 1, { align: 'center', fill: fillZebra });
      for (let col = 1; col <= 15; col++) {
        setCell(r, col, '', { fill: fillZebra });
      }
    }
  }

  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 15 } }];
  ws['!cols'] = [
    { wch: 6 },  // No.
    { wch: 16 }, // Case No.
    { wch: 13 }, // Reported Date
    { wch: 13 }, // Incident Date
    { wch: 26 }, // Classification
    { wch: 25 }, // Client Name
    { wch: 6 },  // Age
    { wch: 8 },  // Gender
    { wch: 14 }, // Contact
    { wch: 18 }, // Barangay
    { wch: 18 }, // Purok
    { wch: 24 }, // Respondent
    { wch: 18 }, // Relationship
    { wch: 18 }, // Status
    { wch: 22 }, // Worker
    { wch: 45 }, // Summary
  ];
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 2 + Math.max(1, cases.length), c: 15 } });
  XLSX.utils.book_append_sheet(wb, ws, 'Master Case Inventory');

  // Sheet 2: Statistical Breakdown Sheet
  const wsStats: XLSX.WorkSheet = {};
  const setStatCell = (r: number, c: number, val: any, opts: any = {}) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    wsStats[ref] = createStyledCell(val, opts);
  };

  setStatCell(0, 0, 'CASE INVENTORY STATISTICAL BREAKDOWN SUMMARY', { fill: SLATE_DARK, color: 'FFFFFF', bold: true, fontSize: 11, align: 'center' });
  for (let c = 1; c <= 4; c++) setStatCell(0, c, '', { fill: SLATE_DARK });
  wsStats['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];

  setStatCell(2, 0, 'CASE CATEGORY', { fill: SLATE_LIGHT, bold: true });
  setStatCell(2, 1, 'TOTAL CASES', { fill: SLATE_LIGHT, bold: true, align: 'center' });
  setStatCell(2, 2, 'ACTIVE', { fill: SLATE_LIGHT, bold: true, align: 'center' });
  setStatCell(2, 3, 'BPO / COURT', { fill: SLATE_LIGHT, bold: true, align: 'center' });
  setStatCell(2, 4, 'RESOLVED', { fill: SLATE_LIGHT, bold: true, align: 'center' });

  const categories = [
    { label: 'VAWC (RA 9262)', match: (c: CaseRecord) => (c.case_type || '').startsWith('vawc') },
    { label: 'VAC / Child Abuse (RA 7610)', match: (c: CaseRecord) => (c.case_type || '').startsWith('vac') || c.case_type === 'cicl' },
    { label: 'Child Custody & Support', match: (c: CaseRecord) => (c.intake_sheet?.case_category_type || '').includes('custody') || (c.intake_sheet?.case_category_type || '').includes('support') },
    { label: 'Rape / Attempted Rape', match: (c: CaseRecord) => c.case_type === 'rape' },
    { label: 'Acts of Lasciviousness', match: (c: CaseRecord) => c.case_type === 'acts_of_lasciviousness' },
    { label: 'Other Special Cases', match: (c: CaseRecord) => c.case_type === 'other' },
  ];

  categories.forEach((cat, idx) => {
    const r = 3 + idx;
    const catCases = cases.filter(cat.match);
    const active = catCases.filter((c) => c.status === 'active').length;
    const bpoOrCourt = catCases.filter((c) => c.status === 'under_bpo_tpo' || c.status === 'filed_in_court' || c.status === 'referred_pnp_wcpd').length;
    const resolved = catCases.filter((c) => c.status === 'resolved_closed').length;

    setStatCell(r, 0, cat.label, { bold: true });
    setStatCell(r, 1, catCases.length, { align: 'center', bold: true });
    setStatCell(r, 2, active, { align: 'center' });
    setStatCell(r, 3, bpoOrCourt, { align: 'center' });
    setStatCell(r, 4, resolved, { align: 'center' });
  });

  const totRow = 3 + categories.length;
  setStatCell(totRow, 0, 'OVERALL TOTAL', { fill: SLATE_LIGHT, bold: true });
  setStatCell(totRow, 1, cases.length, { fill: SLATE_LIGHT, bold: true, align: 'center' });
  setStatCell(totRow, 2, cases.filter((c) => c.status === 'active').length, { fill: SLATE_LIGHT, bold: true, align: 'center' });
  setStatCell(totRow, 3, cases.filter((c) => c.status === 'under_bpo_tpo' || c.status === 'filed_in_court' || c.status === 'referred_pnp_wcpd').length, { fill: SLATE_LIGHT, bold: true, align: 'center' });
  setStatCell(totRow, 4, cases.filter((c) => c.status === 'resolved_closed').length, { fill: SLATE_LIGHT, bold: true, align: 'center' });

  wsStats['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }];
  wsStats['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totRow + 1, c: 4 } });
  XLSX.utils.book_append_sheet(wb, wsStats, 'Statistical Summary');

  return wb;
}

export function downloadMasterInventoryLogbook(cases: CaseRecord[], barangayLabel?: string): void {
  try {
    const wb = buildMasterInventoryWorkbook(cases);
    const dateStr = new Date().toISOString().slice(0, 10);
    const brgy = barangayLabel ? `_${barangayLabel.replace(/\s+/g, '_')}` : '';
    XLSX.writeFile(wb, `MSWDO_Master_Case_Inventory${brgy}_${dateStr}.xlsx`);
  } catch (err) {
    console.error('Error downloading Master Case Inventory:', err);
  }
}

export function downloadBlankMasterInventoryTemplate(): void {
  try {
    const wb = buildMasterInventoryWorkbook([]);
    XLSX.writeFile(wb, 'MSWDO_Master_Case_Inventory_TEMPLATE.xlsx');
  } catch (err) {
    console.error('Error downloading blank Master Case Inventory template:', err);
  }
}
