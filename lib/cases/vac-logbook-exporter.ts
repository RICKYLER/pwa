import * as XLSX from 'xlsx-js-style';
import type { CaseRecord } from '@/lib/db/schema';
import { BARANGAY_REGISTRY } from '@/lib/mabini-barangays';

// -----------------------------------------------------------------------------
// Official VAC Color Palette (Matching DILG / BCPC Form & Screenshot)
// -----------------------------------------------------------------------------
export const VAC_COLORS = {
  violence: 'DDEBF7',     // Soft Pastel Baby Blue (Types of Violence 4a-4e)
  perpetrator: 'E2EFDA',  // Soft Pastel Olive/Sage Green (Perpetrators 5a-5g & Perpetrator Name)
  actions: 'D9E1F2',      // Soft Pastel Ice/Slate Blue (Actions Taken 6a-6f)
  remarks: 'D9E1F2',      // Soft Pastel Slate Blue (Remarks)
  headerInfo: 'F2F2F2',   // Soft Neutral Light Gray (Victim / Case Headers)
  subHeaderInfo: 'F9FAFB',// Subtle Very Light Gray
  border: '000000',       // Crisp Black Border Gridlines
  textDark: '000000',
};

const borderThin = {
  top: { style: 'thin', color: { rgb: VAC_COLORS.border } },
  bottom: { style: 'thin', color: { rgb: VAC_COLORS.border } },
  left: { style: 'thin', color: { rgb: VAC_COLORS.border } },
  right: { style: 'thin', color: { rgb: VAC_COLORS.border } },
};

export interface CellStyleOptions {
  fill?: string;
  bold?: boolean;
  fontSize?: number;
  fontColor?: string;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'center' | 'bottom';
  wrapText?: boolean;
  border?: boolean;
}

export function createStyledCell(
  value: string | number | null | undefined,
  opts?: CellStyleOptions
): XLSX.CellObject {
  const cellVal = value === null || value === undefined ? '' : value;
  const isNum = typeof cellVal === 'number';
  return {
    v: cellVal,
    t: isNum ? 'n' : 's',
    s: {
      font: {
        name: 'Calibri',
        sz: opts?.fontSize ?? 9,
        bold: opts?.bold ?? false,
        color: { rgb: opts?.fontColor ?? VAC_COLORS.textDark },
      },
      alignment: {
        horizontal: opts?.align ?? (isNum ? 'center' : 'left'),
        vertical: opts?.valign ?? 'center',
        wrapText: opts?.wrapText ?? false,
      },
      fill: opts?.fill ? { fgColor: { rgb: opts.fill } } : undefined,
      border: opts?.border !== false ? borderThin : undefined,
    },
  };
}

export function getBarangayLabel(id: string): string {
  const match = BARANGAY_REGISTRY.find((b) => b.id === id);
  return match ? match.label : id;
}

export function formatDatePH(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit', year: 'numeric' });
  } catch {
    return dateStr ?? '';
  }
}

export function parseNameParts(fullName: string): { first: string; middle: string; last: string; ext: string } {
  const parts = (fullName || '').trim().split(/\s+/);
  if (parts.length === 0) return { first: '', middle: '', last: '', ext: '' };
  if (parts.length === 1) return { first: parts[0], middle: '', last: '', ext: '' };
  if (parts.length === 2) return { first: parts[0], middle: '', last: parts[1], ext: '' };
  const extPattern = /^(jr\.?|sr\.?|ii|iii|iv|v|vi)$/i;
  const lastPart = parts[parts.length - 1];
  if (extPattern.test(lastPart) && parts.length >= 4) {
    return { first: parts[0], middle: parts.slice(1, -2).join(' '), last: parts[parts.length - 2], ext: lastPart };
  }
  return { first: parts[0], middle: parts.slice(1, -1).join(' '), last: parts[parts.length - 1], ext: '' };
}

export function classifyViolenceType(c: CaseRecord) {
  const t = (c.case_type || '').toLowerCase();
  const all = (
    (c.case_summary || '') +
    ' ' +
    (c.intake_notes || '') +
    ' ' +
    (c.intake_sheet?.case_category_type || '')
  ).toLowerCase();
  const physical = t === 'vawc_physical' || all.includes('physical') || all.includes('bun-og') || all.includes('kulata');
  const sexual =
    t === 'vawc_sexual' ||
    t === 'rape' ||
    t === 'acts_of_lasciviousness' ||
    all.includes('sexual') ||
    all.includes('rape') ||
    all.includes('lascivious');
  const psychological =
    t === 'vawc_psychological' ||
    t === 'vawc_economic' ||
    all.includes('psychological') ||
    all.includes('emotional') ||
    all.includes('verbal');
  const neglect = t === 'vac_neglect' || all.includes('neglect') || all.includes('pabaya');
  const others = !physical && !sexual && !psychological && !neglect;
  return { physical, sexual, psychological, neglect, others };
}

export function classifyPerpetrator(rel: string | undefined) {
  const r = (rel || '').toLowerCase();
  const immFam = /father|mother|husband|wife|sibling|brother|sister|parent|son|daughter|spouse|partner|live-?in|tatay|nanay|asawa/.test(r);
  const closeRel = !immFam && /uncle|aunt|cousin|grandparent|lolo|lola|relative|ig-agaw|tiyo|tiya/.test(r);
  const acquaint = !immFam && !closeRel && /acquaint|neighbor|friend|classmate|teacher|employer|boss|siligan|amigo/.test(r);
  const stranger = !immFam && !closeRel && !acquaint && /stranger|unknown|dili kaila|estranghero/.test(r);
  const localOff = !immFam && !closeRel && !acquaint && !stranger && /official|kagawad|captain|tanod|konsehal/.test(r);
  const lawEnf = !immFam && !closeRel && !acquaint && !stranger && !localOff && /police|pnp|military|soldier|guard|pulis/.test(r);
  const others = !immFam && !closeRel && !acquaint && !stranger && !localOff && !lawEnf;
  return { immFam, closeRel, acquaint, stranger, localOff, lawEnf, others };
}

export function classifyActions(c: CaseRecord) {
  const status = (c.status || '').toLowerCase();
  const all = ((c.intake_notes || '') + ' ' + (c.case_summary || '')).toLowerCase();
  const lswdo = /lswdo|social welfare|dswd|mswdo|social worker/.test(all);
  const pnp = status === 'referred_pnp_wcpd' || /pnp|wcpd|police|blotter/.test(all);
  const nbi = /nbi|national bureau/.test(all);
  const medical = /medico|medical|hospital|health center|clinic|treatment|tambal/.test(all);
  const legal =
    status === 'under_bpo_tpo' ||
    status === 'filed_in_court' ||
    /bpo|tpo|ppo|court|lawyer|legal|prosecutor|korte|fiscal/.test(all);
  const others = !lswdo && !pnp && !nbi && !medical && !legal;
  return { lswdo, pnp, nbi, medical, legal, others };
}

/**
 * Filter VAC-relevant cases from the full case repository
 */
export function filterVacCases(cases: CaseRecord[]): CaseRecord[] {
  return cases.filter((c) => {
    const t = (c.case_type || '').toLowerCase();
    const g = (c.intake_sheet?.case_category_type || '').toLowerCase();
    return (
      t.startsWith('vac') ||
      t === 'cicl' ||
      t === 'rape' ||
      t === 'acts_of_lasciviousness' ||
      g === 'vac_abuse' ||
      g === 'vac_neglect' ||
      g === 'child_abuse' ||
      g === 'child_neglect' ||
      g === 'cicl' ||
      g === 'rape'
    );
  });
}

// -----------------------------------------------------------------------------
// Sheet 1: Two-Tier Stacked VAC Monitoring Form (Exact Layout from Screenshot)
// -----------------------------------------------------------------------------
export function buildTwoTierVacMonitoringSheet(cases: CaseRecord[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const TOTAL_COLS = 30; // Columns A to AD (indices 0 to 29)
  const vacCases = filterVacCases(cases);

  // Section 1 data row count: at least 7 rows (rows 3 to 9) like the screenshot
  const sec1RowCount = Math.max(7, vacCases.length);
  // Section 2 data row count: at least 10 rows (rows 12 to 21) like the screenshot
  const sec2RowCount = Math.max(10, vacCases.length);

  const merges: XLSX.Range[] = [];

  // Helper to safely assign a styled cell
  const setCell = (r: number, c: number, val: string | number | null | undefined, opts?: CellStyleOptions) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    ws[ref] = createStyledCell(val, opts);
  };

  // Pre-fill entire grid with empty bordered cells so every cell has borders
  const totalRowsInSheet = 2 + sec1RowCount + 2 + sec2RowCount;
  for (let r = 0; r < totalRowsInSheet; r++) {
    for (let c = 0; c < TOTAL_COLS; c++) {
      setCell(r, c, '', { border: true, fontSize: 9 });
    }
  }

  // ---------------------------------------------------------------------------
  // SECTION 1: Child Victims & Types of Violence (Rows 1 & 2 -> 0-indexed r=0 & r=1)
  // ---------------------------------------------------------------------------
  // Row 0 Group Headers
  setCell(0, 0, 'NO.', { fill: VAC_COLORS.headerInfo, bold: true, align: 'center', valign: 'center' });
  setCell(0, 1, 'INTAKE DATE', { fill: VAC_COLORS.headerInfo, bold: true, align: 'center', valign: 'center' });
  setCell(0, 2, 'BARANGAY', { fill: VAC_COLORS.headerInfo, bold: true, align: 'center', valign: 'center' });
  setCell(0, 3, 'DATE OF INCIDENT', { fill: VAC_COLORS.headerInfo, bold: true, align: 'center', valign: 'center' });
  setCell(0, 4, 'TOTAL NO. OF VAC VICTIMS (1)', { fill: VAC_COLORS.headerInfo, bold: true, align: 'center', valign: 'center', wrapText: true });
  setCell(0, 5, 'NAME OF VICTIM', { fill: VAC_COLORS.headerInfo, bold: true, align: 'center', valign: 'center' });
  setCell(0, 9, 'SEX (2)', { fill: VAC_COLORS.headerInfo, bold: true, align: 'center', valign: 'center' });
  setCell(0, 11, 'AGE (3)', { fill: VAC_COLORS.headerInfo, bold: true, align: 'center', valign: 'center' });
  setCell(0, 12, 'TYPES OF VIOLENCE\n(4)', { fill: VAC_COLORS.violence, bold: true, align: 'center', valign: 'center', wrapText: true });

  // Merges for Row 0
  merges.push(
    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },   // NO.
    { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },   // INTAKE DATE
    { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },   // BARANGAY
    { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } },   // DATE OF INCIDENT
    { s: { r: 0, c: 4 }, e: { r: 1, c: 4 } },   // TOTAL VICTIMS (1)
    { s: { r: 0, c: 5 }, e: { r: 0, c: 8 } },   // NAME OF VICTIM (F-I)
    { s: { r: 0, c: 9 }, e: { r: 0, c: 10 } },  // SEX (J-K)
    { s: { r: 0, c: 11 }, e: { r: 1, c: 11 } }, // AGE (3)
    { s: { r: 0, c: 12 }, e: { r: 0, c: 16 } }, // TYPES OF VIOLENCE (4) (M-Q)
  );

  // Row 1 Subheaders
  setCell(1, 5, 'First Name', { fill: VAC_COLORS.subHeaderInfo, align: 'center', valign: 'center' });
  setCell(1, 6, 'Middle Name', { fill: VAC_COLORS.subHeaderInfo, align: 'center', valign: 'center' });
  setCell(1, 7, 'Last Name', { fill: VAC_COLORS.subHeaderInfo, align: 'center', valign: 'center' });
  setCell(1, 8, 'Name Ext.', { fill: VAC_COLORS.subHeaderInfo, align: 'center', valign: 'center' });
  setCell(1, 9, 'Male\n(2a)', { fill: VAC_COLORS.subHeaderInfo, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 10, 'Female\n(2b)', { fill: VAC_COLORS.subHeaderInfo, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 12, 'Physical Abuse\n(4a)', { fill: VAC_COLORS.violence, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 13, 'Sexual Abuse\n(4b)', { fill: VAC_COLORS.violence, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 14, 'Psychological/\nEmotional Abuse\n(4c)', { fill: VAC_COLORS.violence, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 15, 'Neglect\n(4d)', { fill: VAC_COLORS.violence, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 16, 'Others\n(4e)', { fill: VAC_COLORS.violence, align: 'center', valign: 'center', wrapText: true });

  // Rows 2 to (2 + sec1RowCount - 1): Data Rows for Section 1 (Rows 3 to 9 in template)
  for (let i = 0; i < sec1RowCount; i++) {
    const rowIdx = 2 + i;
    const seq = i + 1;
    const c = vacCases[i];

    if (c) {
      const nm = parseNameParts(c.victim_name || '');
      const vt = classifyViolenceType(c);
      const isMale = (c.victim_gender || 'F').toUpperCase().startsWith('M');

      setCell(rowIdx, 0, seq, { align: 'center' });
      setCell(rowIdx, 1, formatDatePH(c.reported_at), { align: 'center' });
      setCell(rowIdx, 2, getBarangayLabel(c.barangay_id), { align: 'left' });
      setCell(rowIdx, 3, formatDatePH(c.incident_date || c.reported_at), { align: 'center' });
      setCell(rowIdx, 4, 1, { align: 'center' });
      setCell(rowIdx, 5, nm.first, { align: 'left' });
      setCell(rowIdx, 6, nm.middle, { align: 'left' });
      setCell(rowIdx, 7, nm.last, { align: 'left' });
      setCell(rowIdx, 8, nm.ext, { align: 'center' });
      setCell(rowIdx, 9, isMale ? 1 : '', { align: 'center' });
      setCell(rowIdx, 10, !isMale ? 1 : '', { align: 'center' });
      setCell(rowIdx, 11, c.victim_age ?? '', { align: 'center' });
      setCell(rowIdx, 12, vt.physical ? 1 : '', { align: 'center' });
      setCell(rowIdx, 13, vt.sexual ? 1 : '', { align: 'center' });
      setCell(rowIdx, 14, vt.psychological ? 1 : '', { align: 'center' });
      setCell(rowIdx, 15, vt.neglect ? 1 : '', { align: 'center' });
      setCell(rowIdx, 16, vt.others ? 1 : '', { align: 'center' });
    } else {
      // Empty template row with sequence number
      setCell(rowIdx, 0, seq, { align: 'center' });
    }
  }

  // ---------------------------------------------------------------------------
  // SECTION 2: Perpetrators & Actions Taken (Starts at row 10 in template)
  // Columns 0 to 13 (A to N) are left blank to avoid duplicate headers/data
  // ---------------------------------------------------------------------------
  const s2Hdr0 = 2 + sec1RowCount; // row index 9 = Row 10 in Excel
  const s2Hdr1 = s2Hdr0 + 1;       // row index 10 = Row 11 in Excel

  // Row 10 Group Headers (only for Perpetrators, Actions Taken, and Remarks)
  setCell(s2Hdr0, 14, 'REMARKS', { fill: VAC_COLORS.remarks, bold: true, align: 'center', valign: 'center' });
  setCell(s2Hdr0, 15, 'PERPETRATORS', { fill: VAC_COLORS.perpetrator, bold: true, align: 'center', valign: 'center' });
  setCell(s2Hdr0, 22, 'NAME OF\nPERPETRATOR\n[LAST NAME,\nFIRST NAME,\nMIDDLE]', {
    fill: VAC_COLORS.perpetrator,
    bold: true,
    align: 'center',
    valign: 'center',
    wrapText: true,
  });
  setCell(s2Hdr0, 23, 'ACTIONS TAKEN BY THE BARANGAY/BCPC', { fill: VAC_COLORS.actions, bold: true, align: 'center', valign: 'center' });
  setCell(s2Hdr0, 29, 'REMARKS', { fill: VAC_COLORS.remarks, bold: true, align: 'center', valign: 'center' });

  // Merges for Section 2 Headers (no duplicate merges for cols 0 to 13)
  merges.push(
    { s: { r: s2Hdr0, c: 14 }, e: { r: s2Hdr1, c: 14 } }, // REMARKS (Col O)
    { s: { r: s2Hdr0, c: 15 }, e: { r: s2Hdr0, c: 21 } }, // PERPETRATORS (Cols P to V)
    { s: { r: s2Hdr0, c: 22 }, e: { r: s2Hdr1, c: 22 } }, // NAME OF PERPETRATOR (Col W)
    { s: { r: s2Hdr0, c: 23 }, e: { r: s2Hdr0, c: 28 } }, // ACTIONS TAKEN (Cols X to AC)
    { s: { r: s2Hdr0, c: 29 }, e: { r: s2Hdr1, c: 29 } }, // REMARKS (Col AD)
  );

  // Row 11 Subheaders
  setCell(s2Hdr1, 15, 'Immediate Family\nMember\n(5a)', { fill: VAC_COLORS.perpetrator, align: 'center', valign: 'center', wrapText: true });
  setCell(s2Hdr1, 16, 'Close Relative\n(5b)', { fill: VAC_COLORS.perpetrator, align: 'center', valign: 'center', wrapText: true });
  setCell(s2Hdr1, 17, 'Acquaintance\n(5c)', { fill: VAC_COLORS.perpetrator, align: 'center', valign: 'center', wrapText: true });
  setCell(s2Hdr1, 18, 'Stranger\n(5d)', { fill: VAC_COLORS.perpetrator, align: 'center', valign: 'center', wrapText: true });
  setCell(s2Hdr1, 19, 'Local Official\n(5e)', { fill: VAC_COLORS.perpetrator, align: 'center', valign: 'center', wrapText: true });
  setCell(s2Hdr1, 20, 'Law Enforcer\n(5f)', { fill: VAC_COLORS.perpetrator, align: 'center', valign: 'center', wrapText: true });
  setCell(s2Hdr1, 21, 'Others\n(ex: Guardian)\n(5g)', { fill: VAC_COLORS.perpetrator, align: 'center', valign: 'center', wrapText: true });

  setCell(s2Hdr1, 23, 'Referred to\nLSWDO\n(6a)', { fill: VAC_COLORS.actions, align: 'center', valign: 'center', wrapText: true });
  setCell(s2Hdr1, 24, 'Referred to\nPNP\n(6b)', { fill: VAC_COLORS.actions, align: 'center', valign: 'center', wrapText: true });
  setCell(s2Hdr1, 25, 'Referred to\nNBI\n(6c)', { fill: VAC_COLORS.actions, align: 'center', valign: 'center', wrapText: true });
  setCell(s2Hdr1, 26, 'Referred for\nMedical\nTreatment\n(6d)', { fill: VAC_COLORS.actions, align: 'center', valign: 'center', wrapText: true });
  setCell(s2Hdr1, 27, 'Referred for\nLegal\nAssistance\n(6e)', { fill: VAC_COLORS.actions, align: 'center', valign: 'center', wrapText: true });
  setCell(s2Hdr1, 28, 'Others\n(ex: Referred to\nNGOs, FBOs)\n(6f)', { fill: VAC_COLORS.actions, align: 'center', valign: 'center', wrapText: true });

  // Data rows for Section 2 (Row 12 onwards in template)
  const s2DataStart = s2Hdr1 + 1;
  for (let i = 0; i < sec2RowCount; i++) {
    const rowIdx = s2DataStart + i;
    const c = vacCases[i];

    if (c) {
      const pp = classifyPerpetrator(c.perpetrator_relationship);
      const ac = classifyActions(c);
      const perpName = c.perpetrator_name || '';

      setCell(rowIdx, 14, (c.case_summary || '').slice(0, 100), { align: 'left' });
      setCell(rowIdx, 15, pp.immFam ? 1 : '', { align: 'center' });
      setCell(rowIdx, 16, pp.closeRel ? 1 : '', { align: 'center' });
      setCell(rowIdx, 17, pp.acquaint ? 1 : '', { align: 'center' });
      setCell(rowIdx, 18, pp.stranger ? 1 : '', { align: 'center' });
      setCell(rowIdx, 19, pp.localOff ? 1 : '', { align: 'center' });
      setCell(rowIdx, 20, pp.lawEnf ? 1 : '', { align: 'center' });
      setCell(rowIdx, 21, pp.others ? 1 : '', { align: 'center' });
      setCell(rowIdx, 22, perpName, { align: 'left' });
      setCell(rowIdx, 23, ac.lswdo ? 1 : '', { align: 'center' });
      setCell(rowIdx, 24, ac.pnp ? 1 : '', { align: 'center' });
      setCell(rowIdx, 25, ac.nbi ? 1 : '', { align: 'center' });
      setCell(rowIdx, 26, ac.medical ? 1 : '', { align: 'center' });
      setCell(rowIdx, 27, ac.legal ? 1 : '', { align: 'center' });
      setCell(rowIdx, 28, ac.others ? 1 : '', { align: 'center' });
      setCell(rowIdx, 29, (c.status || '').replace(/_/g, ' ').toUpperCase(), { align: 'left' });
    }
  }

  // Column widths (matching screenshot proportions)
  ws['!cols'] = [
    { wch: 6 },   // A: NO.
    { wch: 13 },  // B: INTAKE DATE
    { wch: 14 },  // C: BARANGAY
    { wch: 14 },  // D: DATE OF INCIDENT
    { wch: 8 },   // E: TOTAL VICTIMS (1)
    { wch: 14 },  // F: First Name
    { wch: 14 },  // G: Middle Name
    { wch: 14 },  // H: Last Name
    { wch: 8 },   // I: Name Ext.
    { wch: 7 },   // J: Male (2a)
    { wch: 7 },   // K: Female (2b)
    { wch: 6 },   // L: Age (3)
    { wch: 12 },  // M: Physical Abuse (4a)
    { wch: 12 },  // N: Sexual Abuse (4b)
    { wch: 16 },  // O: Psychological Abuse (4c) / REMARKS
    { wch: 14 },  // P: Neglect (4d) / Immediate Family (5a)
    { wch: 14 },  // Q: Others (4e) / Close Relative (5b)
    { wch: 13 },  // R: Acquaintance (5c)
    { wch: 11 },  // S: Stranger (5d)
    { wch: 12 },  // T: Local Official (5e)
    { wch: 12 },  // U: Law Enforcer (5f)
    { wch: 13 },  // V: Others 5g
    { wch: 28 },  // W: NAME OF PERPETRATOR
    { wch: 12 },  // X: Referred to LSWDO (6a)
    { wch: 11 },  // Y: Referred to PNP (6b)
    { wch: 11 },  // Z: Referred to NBI (6c)
    { wch: 14 },  // AA: Referred Medical (6d)
    { wch: 14 },  // AB: Referred Legal (6e)
    { wch: 14 },  // AC: Others NGOs (6f)
    { wch: 26 },  // AD: REMARKS
  ];

  // Row heights
  const rowHeights: { hpx: number }[] = [];
  rowHeights[0] = { hpx: 28 }; // Header row 1
  rowHeights[1] = { hpx: 48 }; // Subheader row 2
  for (let i = 0; i < sec1RowCount; i++) {
    rowHeights[2 + i] = { hpx: 20 };
  }
  rowHeights[s2Hdr0] = { hpx: 28 }; // Header row 10
  rowHeights[s2Hdr1] = { hpx: 48 }; // Subheader row 11
  for (let i = 0; i < sec2RowCount; i++) {
    rowHeights[s2DataStart + i] = { hpx: 20 };
  }
  ws['!rows'] = rowHeights;

  ws['!merges'] = merges;
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: totalRowsInSheet - 1, c: TOTAL_COLS - 1 },
  });

  return ws;
}

// -----------------------------------------------------------------------------
// Sheet 2: Wide Master Logbook (All 32 Columns Side-by-Side with Colors)
// -----------------------------------------------------------------------------
export function buildWideVacMasterSheet(cases: CaseRecord[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const TOTAL_COLS = 32;
  const vacCases = filterVacCases(cases);
  const dataRowCount = Math.max(5, vacCases.length);

  const setCell = (r: number, c: number, val: string | number | null | undefined, opts?: CellStyleOptions) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    ws[ref] = createStyledCell(val, opts);
  };

  const merges: XLSX.Range[] = [];

  // Group Header Row 0
  setCell(0, 0, 'NO.', { fill: VAC_COLORS.headerInfo, bold: true, align: 'center', valign: 'center' });
  setCell(0, 1, 'INTAKE DATE', { fill: VAC_COLORS.headerInfo, bold: true, align: 'center', valign: 'center' });
  setCell(0, 2, 'BARANGAY', { fill: VAC_COLORS.headerInfo, bold: true, align: 'center', valign: 'center' });
  setCell(0, 3, 'DATE OF INCIDENT', { fill: VAC_COLORS.headerInfo, bold: true, align: 'center', valign: 'center' });
  setCell(0, 4, 'VAC VICTIMS (1 & 2 & 3)', { fill: VAC_COLORS.headerInfo, bold: true, align: 'center', valign: 'center' });
  setCell(0, 12, 'TYPES OF VIOLENCE (4)', { fill: VAC_COLORS.violence, bold: true, align: 'center', valign: 'center' });
  setCell(0, 17, 'PERPETRATORS (5)', { fill: VAC_COLORS.perpetrator, bold: true, align: 'center', valign: 'center' });
  setCell(0, 25, 'ACTIONS TAKEN BY THE BARANGAY/BCPC (6)', { fill: VAC_COLORS.actions, bold: true, align: 'center', valign: 'center' });
  setCell(0, 31, 'REMARKS', { fill: VAC_COLORS.remarks, bold: true, align: 'center', valign: 'center' });

  merges.push(
    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
    { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
    { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
    { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } },
    { s: { r: 0, c: 4 }, e: { r: 0, c: 11 } },
    { s: { r: 0, c: 12 }, e: { r: 0, c: 16 } },
    { s: { r: 0, c: 17 }, e: { r: 0, c: 24 } },
    { s: { r: 0, c: 25 }, e: { r: 0, c: 30 } },
    { s: { r: 0, c: 31 }, e: { r: 1, c: 31 } },
  );

  // Subheader Row 1
  setCell(1, 4, 'Total Victims (1)', { fill: VAC_COLORS.subHeaderInfo, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 5, 'First Name', { fill: VAC_COLORS.subHeaderInfo, align: 'center', valign: 'center' });
  setCell(1, 6, 'Middle Name', { fill: VAC_COLORS.subHeaderInfo, align: 'center', valign: 'center' });
  setCell(1, 7, 'Last Name', { fill: VAC_COLORS.subHeaderInfo, align: 'center', valign: 'center' });
  setCell(1, 8, 'Name Ext.', { fill: VAC_COLORS.subHeaderInfo, align: 'center', valign: 'center' });
  setCell(1, 9, 'Male\n(2a)', { fill: VAC_COLORS.subHeaderInfo, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 10, 'Female\n(2b)', { fill: VAC_COLORS.subHeaderInfo, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 11, 'Age (3)', { fill: VAC_COLORS.subHeaderInfo, align: 'center', valign: 'center' });

  setCell(1, 12, 'Physical Abuse\n(4a)', { fill: VAC_COLORS.violence, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 13, 'Sexual Abuse\n(4b)', { fill: VAC_COLORS.violence, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 14, 'Psychological/\nEmotional Abuse\n(4c)', { fill: VAC_COLORS.violence, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 15, 'Neglect\n(4d)', { fill: VAC_COLORS.violence, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 16, 'Others\n(4e)', { fill: VAC_COLORS.violence, align: 'center', valign: 'center', wrapText: true });

  setCell(1, 17, 'Immediate Family\n(5a)', { fill: VAC_COLORS.perpetrator, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 18, 'Close Relative\n(5b)', { fill: VAC_COLORS.perpetrator, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 19, 'Acquaintance\n(5c)', { fill: VAC_COLORS.perpetrator, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 20, 'Stranger\n(5d)', { fill: VAC_COLORS.perpetrator, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 21, 'Local Official\n(5e)', { fill: VAC_COLORS.perpetrator, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 22, 'Law Enforcer\n(5f)', { fill: VAC_COLORS.perpetrator, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 23, 'Others\n(ex: Guardian)\n(5g)', { fill: VAC_COLORS.perpetrator, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 24, 'NAME OF\nPERPETRATOR', { fill: VAC_COLORS.perpetrator, align: 'center', valign: 'center', wrapText: true });

  setCell(1, 25, 'Referred to\nLSWDO\n(6a)', { fill: VAC_COLORS.actions, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 26, 'Referred to\nPNP\n(6b)', { fill: VAC_COLORS.actions, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 27, 'Referred to\nNBI\n(6c)', { fill: VAC_COLORS.actions, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 28, 'Referred for\nMedical\n(6d)', { fill: VAC_COLORS.actions, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 29, 'Referred for\nLegal\n(6e)', { fill: VAC_COLORS.actions, align: 'center', valign: 'center', wrapText: true });
  setCell(1, 30, 'Others\nNGOs\n(6f)', { fill: VAC_COLORS.actions, align: 'center', valign: 'center', wrapText: true });

  // Data rows
  for (let i = 0; i < dataRowCount; i++) {
    const rowIdx = 2 + i;
    const seq = i + 1;
    const c = vacCases[i];

    if (c) {
      const nm = parseNameParts(c.victim_name || '');
      const vt = classifyViolenceType(c);
      const pp = classifyPerpetrator(c.perpetrator_relationship);
      const ac = classifyActions(c);
      const isMale = (c.victim_gender || 'F').toUpperCase().startsWith('M');

      setCell(rowIdx, 0, seq, { align: 'center' });
      setCell(rowIdx, 1, formatDatePH(c.reported_at), { align: 'center' });
      setCell(rowIdx, 2, getBarangayLabel(c.barangay_id), { align: 'left' });
      setCell(rowIdx, 3, formatDatePH(c.incident_date || c.reported_at), { align: 'center' });
      setCell(rowIdx, 4, 1, { align: 'center' });
      setCell(rowIdx, 5, nm.first, { align: 'left' });
      setCell(rowIdx, 6, nm.middle, { align: 'left' });
      setCell(rowIdx, 7, nm.last, { align: 'left' });
      setCell(rowIdx, 8, nm.ext, { align: 'center' });
      setCell(rowIdx, 9, isMale ? 1 : '', { align: 'center' });
      setCell(rowIdx, 10, !isMale ? 1 : '', { align: 'center' });
      setCell(rowIdx, 11, c.victim_age ?? '', { align: 'center' });
      setCell(rowIdx, 12, vt.physical ? 1 : '', { align: 'center' });
      setCell(rowIdx, 13, vt.sexual ? 1 : '', { align: 'center' });
      setCell(rowIdx, 14, vt.psychological ? 1 : '', { align: 'center' });
      setCell(rowIdx, 15, vt.neglect ? 1 : '', { align: 'center' });
      setCell(rowIdx, 16, vt.others ? 1 : '', { align: 'center' });
      setCell(rowIdx, 17, pp.immFam ? 1 : '', { align: 'center' });
      setCell(rowIdx, 18, pp.closeRel ? 1 : '', { align: 'center' });
      setCell(rowIdx, 19, pp.acquaint ? 1 : '', { align: 'center' });
      setCell(rowIdx, 20, pp.stranger ? 1 : '', { align: 'center' });
      setCell(rowIdx, 21, pp.localOff ? 1 : '', { align: 'center' });
      setCell(rowIdx, 22, pp.lawEnf ? 1 : '', { align: 'center' });
      setCell(rowIdx, 23, pp.others ? 1 : '', { align: 'center' });
      setCell(rowIdx, 24, c.perpetrator_name || '', { align: 'left' });
      setCell(rowIdx, 25, ac.lswdo ? 1 : '', { align: 'center' });
      setCell(rowIdx, 26, ac.pnp ? 1 : '', { align: 'center' });
      setCell(rowIdx, 27, ac.nbi ? 1 : '', { align: 'center' });
      setCell(rowIdx, 28, ac.medical ? 1 : '', { align: 'center' });
      setCell(rowIdx, 29, ac.legal ? 1 : '', { align: 'center' });
      setCell(rowIdx, 30, ac.others ? 1 : '', { align: 'center' });
      setCell(rowIdx, 31, (c.case_summary || '').substring(0, 150), { align: 'left' });
    } else {
      setCell(rowIdx, 0, seq, { align: 'center' });
      for (let cCol = 1; cCol < TOTAL_COLS; cCol++) {
        setCell(rowIdx, cCol, '', { align: 'center' });
      }
    }
  }

  ws['!cols'] = [
    { wch: 6 },  { wch: 13 }, { wch: 14 }, { wch: 14 },
    { wch: 8 },  { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 },
    { wch: 7 },  { wch: 7 },  { wch: 6 },
    { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 11 },
    { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 11 }, { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 28 },
    { wch: 12 }, { wch: 11 }, { wch: 11 }, { wch: 13 }, { wch: 13 }, { wch: 13 },
    { wch: 35 },
  ];

  ws['!rows'] = [{ hpx: 28 }, { hpx: 48 }, ...Array(dataRowCount).fill({ hpx: 20 })];
  ws['!merges'] = merges;
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: 1 + dataRowCount, c: TOTAL_COLS - 1 },
  });

  return ws;
}

// -----------------------------------------------------------------------------
// Sheet 3: Column Key & Instructions
// -----------------------------------------------------------------------------
export function buildVacInstructionsSheet(): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const setCell = (r: number, c: number, val: string | number | null | undefined, opts?: CellStyleOptions) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    ws[ref] = createStyledCell(val, opts);
  };

  setCell(0, 0, 'DILG / BCPC VAC MONITORING FORM — USER GUIDE & COLOR LEGEND', {
    bold: true,
    fontSize: 12,
    align: 'left',
    fill: VAC_COLORS.headerInfo,
  });

  const legendRows = [
    { label: 'TYPES OF VIOLENCE (4)', color: VAC_COLORS.violence, desc: 'Covers physical, sexual, emotional abuse & neglect (4a–4e)' },
    { label: 'PERPETRATORS (5)', color: VAC_COLORS.perpetrator, desc: 'Relationship of perpetrator to child & perpetrator name (5a–5g)' },
    { label: 'ACTIONS TAKEN (6)', color: VAC_COLORS.actions, desc: 'Interventions, referrals to LSWDO, PNP, NBI, medical & legal (6a–6f)' },
    { label: 'REMARKS', color: VAC_COLORS.remarks, desc: 'Case status, protective orders (BPO/TPO), follow-up actions' },
  ];

  setCell(2, 0, 'COLOR CODE', { bold: true, fill: VAC_COLORS.headerInfo, align: 'center' });
  setCell(2, 1, 'SECTION', { bold: true, fill: VAC_COLORS.headerInfo, align: 'left' });
  setCell(2, 2, 'DESCRIPTION', { bold: true, fill: VAC_COLORS.headerInfo, align: 'left' });

  legendRows.forEach((row, i) => {
    const r = 3 + i;
    setCell(r, 0, '■ SAMPLE', { fill: row.color, bold: true, align: 'center' });
    setCell(r, 1, row.label, { bold: true, align: 'left' });
    setCell(r, 2, row.desc, { align: 'left' });
  });

  const instructions = [
    '',
    'HOW TO USE THIS FORM:',
    '1. Sheet 1 ("VAC Monitoring Form") provides the official Two-Tier Stacked Layout matching the DILG/BCPC monitoring format.',
    '   - Top Section (Rows 1–9): Victim Profile and Types of Violence (4)',
    '   - Bottom Section (Rows 10–21): Perpetrator Information (5) and Actions Taken (6)',
    '2. Sheet 2 ("VAC Master Logbook (Wide)") provides all 32 columns side-by-side in a single continuous table for easy sorting/filtering.',
    '3. For checkboxes in columns 4a–4e, 5a–5g, and 6a–6f, enter "1" if applicable. Leave blank if not applicable.',
    '4. Both sheets can be filled out and uploaded directly to the MSWDO Case Registry via the "Upload Excel Sheet" button.',
    '',
    'Governing Law: Republic Act No. 7610 (Special Protection of Children Against Abuse, Exploitation and Discrimination Act)',
  ];

  let curRow = 8;
  instructions.forEach((line) => {
    setCell(curRow++, 0, line, { border: false, bold: line.startsWith('HOW') || line.startsWith('Governing') });
  });

  ws['!cols'] = [{ wch: 18 }, { wch: 32 }, { wch: 70 }];
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: curRow, c: 2 } });

  return ws;
}

// -----------------------------------------------------------------------------
// Main Workbook Builder
// -----------------------------------------------------------------------------
export function buildVacLogbookWorkbook(cases: CaseRecord[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // Sheet 1: The official Two-Tier Stacked Layout (Tab: "VAC Monitoring Form")
  const wsMonitoring = buildTwoTierVacMonitoringSheet(cases);
  XLSX.utils.book_append_sheet(wb, wsMonitoring, 'VAC Monitoring Form');

  // Sheet 2: Wide Master Logbook (Tab: "VAC Master Logbook")
  const wsMaster = buildWideVacMasterSheet(cases);
  XLSX.utils.book_append_sheet(wb, wsMaster, 'VAC Master Logbook');

  // Sheet 3: Column Key & Instructions (Tab: "Instructions & Legend")
  const wsInstructions = buildVacInstructionsSheet();
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions & Legend');

  return wb;
}

/**
 * Downloads the VAC Logbook filled with case data and styled with official colors
 */
export function downloadVacLogbook(cases: CaseRecord[], barangayLabel?: string): void {
  try {
    const wb = buildVacLogbookWorkbook(cases);
    const dateStr = new Date().toISOString().slice(0, 10);
    const brgy = barangayLabel ? `_${barangayLabel.replace(/\s+/g, '_')}` : '';
    XLSX.writeFile(wb, `BCPC_VAC_Monitoring_Form${brgy}_${dateStr}.xlsx`);
  } catch (err) {
    console.error('Error downloading VAC logbook:', err);
  }
}

/**
 * Downloads a blank VAC Logbook template with official pastel colors and formatting
 */
export function downloadBlankVacTemplate(): void {
  try {
    const wb = buildVacLogbookWorkbook([]);
    XLSX.writeFile(wb, 'BCPC_VAC_Monitoring_Form_TEMPLATE.xlsx');
  } catch (err) {
    console.error('Error downloading blank VAC template:', err);
  }
}
