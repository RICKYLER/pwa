import * as XLSX from 'xlsx';
import type { CaseRecord } from '@/lib/db/schema';
import { BARANGAY_REGISTRY } from '@/lib/mabini-barangays';

function getBarangayLabel(id: string): string {
  const match = BARANGAY_REGISTRY.find((b) => b.id === id);
  return match ? match.label : id;
}

function formatDatePH(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit', year: 'numeric' });
  } catch { return dateStr ?? ''; }
}

function parseNameParts(fullName: string): { first: string; middle: string; last: string; ext: string } {
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

function classifyViolenceType(c: CaseRecord) {
  const t = (c.case_type || '').toLowerCase();
  const all = ((c.case_summary || '') + ' ' + (c.intake_notes || '') + ' ' + (c.intake_sheet?.case_category_type || '')).toLowerCase();
  const physical = t === 'vawc_physical' || all.includes('physical') || all.includes('bun-og');
  const sexual = t === 'vawc_sexual' || t === 'rape' || t === 'acts_of_lasciviousness' || all.includes('sexual') || all.includes('rape') || all.includes('lascivious');
  const psychological = t === 'vawc_psychological' || t === 'vawc_economic' || all.includes('psychological') || all.includes('emotional');
  const neglect = t === 'vac_neglect' || all.includes('neglect');
  const others = !physical && !sexual && !psychological && !neglect;
  return { physical, sexual, psychological, neglect, others };
}

function classifyPerpetrator(rel: string | undefined) {
  const r = (rel || '').toLowerCase();
  const immFam = /father|mother|husband|wife|sibling|brother|sister|parent|son|daughter|spouse|partner|live-?in|tatay|nanay|asawa/.test(r);
  const closeRel = !immFam && /uncle|aunt|cousin|grandparent|lolo|lola|relative/.test(r);
  const acquaint = !immFam && !closeRel && /acquaint|neighbor|friend|classmate|teacher|employer|boss/.test(r);
  const stranger = !immFam && !closeRel && !acquaint && /stranger|unknown/.test(r);
  const localOff = !immFam && !closeRel && !acquaint && !stranger && /official|kagawad|captain|tanod/.test(r);
  const lawEnf = !immFam && !closeRel && !acquaint && !stranger && !localOff && /police|pnp|military|soldier|guard/.test(r);
  const others = !immFam && !closeRel && !acquaint && !stranger && !localOff && !lawEnf;
  return { immFam, closeRel, acquaint, stranger, localOff, lawEnf, others };
}

function classifyActions(c: CaseRecord) {
  const status = (c.status || '').toLowerCase();
  const all = ((c.intake_notes || '') + ' ' + (c.case_summary || '')).toLowerCase();
  const lswdo = /lswdo|social welfare|dswd|mswdo|social worker/.test(all);
  const pnp = status === 'referred_pnp_wcpd' || /pnp|wcpd|police|blotter/.test(all);
  const nbi = /nbi|national bureau/.test(all);
  const medical = /medico|medical|hospital|health center|clinic|treatment/.test(all);
  const legal = status === 'under_bpo_tpo' || status === 'filed_in_court' || /bpo|tpo|ppo|court|lawyer|legal|prosecutor/.test(all);
  const others = !lswdo && !pnp && !nbi && !medical && !legal;
  return { lswdo, pnp, nbi, medical, legal, others };
}

/** Builds the official DILG/BCPC VAC Logbook .xlsx workbook from case records */
export function buildVacLogbookWorkbook(cases: CaseRecord[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const dateStr = new Date().toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

  // ---------------------------------------------------------------------------
  // Sheet 1: VAC Logbook – 32 columns (A–AF)
  // Row layout:
  //   0  = Municipality title
  //   1  = BCPC subtitle
  //   2  = (blank)
  //   3  = Form title
  //   4  = RA / period
  //   5  = (blank)
  //   6  = Group header row  (with span info stored in !merges)
  //   7  = Sub-header row
  //   8+ = Data rows
  // ---------------------------------------------------------------------------

  const TOTAL_COLS = 32;
  const mk = (val: string | number, fill: (string | number)[] = Array(TOTAL_COLS).fill('')) => {
    fill[0] = val; return fill;
  };

  const groupRow: (string | number)[] = Array(TOTAL_COLS).fill('');
  groupRow[0]  = 'NO.';
  groupRow[1]  = 'INTAKE DATE';
  groupRow[2]  = 'BARANGAY';
  groupRow[3]  = 'DATE OF INCIDENT/S';
  groupRow[4]  = 'VAC VICTIMS (1 & 2 & 3)';   // spans 4–11
  groupRow[12] = 'TYPES OF VIOLENCE (4)';      // spans 12–16
  groupRow[17] = 'PERPETRATORS (5)';           // spans 17–24
  groupRow[25] = 'ACTIONS TAKEN BY THE BARANGAY/BCPC (6)'; // spans 25–30
  groupRow[31] = 'REMARKS';

  const subRow: (string | number)[] = Array(TOTAL_COLS).fill('');
  subRow[0]  = 'No.';
  subRow[1]  = 'Intake Date';
  subRow[2]  = 'Barangay';
  subRow[3]  = 'Date of Incident';
  // VAC Victims
  subRow[4]  = 'Total No. of VAC Victims (1)';
  subRow[5]  = 'First Name';
  subRow[6]  = 'Middle Name';
  subRow[7]  = 'Last Name';
  subRow[8]  = 'Name Ext.';
  subRow[9]  = 'Male (2a)';
  subRow[10] = 'Female (2b)';
  subRow[11] = 'Age (3)';
  // Types of Violence
  subRow[12] = 'Physical Abuse (4a)';
  subRow[13] = 'Sexual Abuse (4b)';
  subRow[14] = 'Psychological/Emotional Abuse (4c)';
  subRow[15] = 'Neglect (4d)';
  subRow[16] = 'Others (4e)';
  // Perpetrators
  subRow[17] = 'Immediate Family Member (5a)';
  subRow[18] = 'Close Relative (5b)';
  subRow[19] = 'Acquaintance (5c)';
  subRow[20] = 'Stranger (5d)';
  subRow[21] = 'Local Official (5e)';
  subRow[22] = 'Law Enforcer (5f)';
  subRow[23] = 'Others (inc. Guardian) (5g)';
  subRow[24] = 'NAME OF PERPETRATOR';
  // Actions Taken
  subRow[25] = 'Referred to LSWDO (6a)';
  subRow[26] = 'Referred to PNP (6b)';
  subRow[27] = 'Referred to NBI (6c)';
  subRow[28] = 'Referred for Medical Treatment (6d)';
  subRow[29] = 'Referred for Legal Assistance (6e)';
  subRow[30] = 'Others incl. NGOs (6f)';
  subRow[31] = 'REMARKS';

  const aoa: (string | number)[][] = [
    mk('MUNICIPALITY OF MABINI, DAVAO DE ORO'),
    mk('BARANGAY COUNCIL FOR THE PROTECTION OF CHILDREN (BCPC)'),
    Array(TOTAL_COLS).fill(''),
    mk('VIOLENCE AGAINST CHILDREN (VAC) INTAKE REGISTRY'),
    mk(`Republic Act No. 7610  —  ${dateStr}`),
    Array(TOTAL_COLS).fill(''),
    groupRow,
    subRow,
  ];

  // Filter VAC cases
  const vacCases = cases.filter((c) => {
    const t = (c.case_type || '').toLowerCase();
    const g = (c.intake_sheet?.case_category_type || '').toLowerCase();
    return t.startsWith('vac') || t === 'cicl' || t === 'rape' || t === 'acts_of_lasciviousness'
      || g === 'vac_abuse' || g === 'vac_neglect' || g === 'child_abuse' || g === 'child_neglect';
  });

  // Add dummy data if no cases passed (template mode)
  const dataSource = vacCases.length > 0 ? vacCases : null;

  if (dataSource) {
    let seq = 1;
    for (const c of dataSource) {
      const nm = parseNameParts(c.victim_name || '');
      const vt = classifyViolenceType(c);
      const pp = classifyPerpetrator(c.perpetrator_relationship);
      const ac = classifyActions(c);
      const isMale = (c.victim_gender || 'F').toUpperCase().startsWith('M');

      aoa.push([
        seq++,
        formatDatePH(c.reported_at),
        getBarangayLabel(c.barangay_id),
        formatDatePH(c.incident_date || c.reported_at),
        1,
        nm.first, nm.middle, nm.last, nm.ext,
        isMale ? 1 : '', !isMale ? 1 : '',
        c.victim_age ?? '',
        vt.physical ? 1 : '', vt.sexual ? 1 : '', vt.psychological ? 1 : '', vt.neglect ? 1 : '', vt.others ? 1 : '',
        pp.immFam ? 1 : '', pp.closeRel ? 1 : '', pp.acquaint ? 1 : '', pp.stranger ? 1 : '',
        pp.localOff ? 1 : '', pp.lawEnf ? 1 : '', pp.others ? 1 : '',
        c.perpetrator_name || '',
        ac.lswdo ? 1 : '', ac.pnp ? 1 : '', ac.nbi ? 1 : '', ac.medical ? 1 : '', ac.legal ? 1 : '', ac.others ? 1 : '',
        (c.case_summary || '').substring(0, 200),
      ]);
    }
  } else {
    // Blank template rows
    for (let i = 1; i <= 5; i++) {
      aoa.push([i, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws['!cols'] = [
    { wch: 5 },  { wch: 13 }, { wch: 14 }, { wch: 14 },
    { wch: 8 },  { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 },
    { wch: 7 },  { wch: 7 },  { wch: 6 },
    { wch: 10 }, { wch: 10 }, { wch: 13 }, { wch: 10 }, { wch: 9 },
    { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 30 },
    { wch: 11 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 40 },
  ];

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 31 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 31 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 31 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 31 } },
    // Group header row (row index 6) – single-cell cols span down to row 7
    { s: { r: 6, c: 0  }, e: { r: 7, c: 0  } },
    { s: { r: 6, c: 1  }, e: { r: 7, c: 1  } },
    { s: { r: 6, c: 2  }, e: { r: 7, c: 2  } },
    { s: { r: 6, c: 3  }, e: { r: 7, c: 3  } },
    { s: { r: 6, c: 4  }, e: { r: 6, c: 11 } },  // VAC VICTIMS
    { s: { r: 6, c: 12 }, e: { r: 6, c: 16 } },  // TYPES OF VIOLENCE
    { s: { r: 6, c: 17 }, e: { r: 6, c: 24 } },  // PERPETRATORS
    { s: { r: 6, c: 25 }, e: { r: 6, c: 30 } },  // ACTIONS TAKEN
    { s: { r: 6, c: 31 }, e: { r: 7, c: 31 } },  // REMARKS
  ];

  // Row heights for header rows (pixels)
  ws['!rows'] = [
    { hpx: 22 }, { hpx: 20 }, { hpx: 8 }, { hpx: 24 }, { hpx: 18 }, { hpx: 8 },
    { hpx: 40 }, { hpx: 55 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'VAC Logbook (DILG-BCPC RA7610)');

  // ---------------------------------------------------------------------------
  // Sheet 2: Column Key
  // ---------------------------------------------------------------------------
  const keyAoa: (string | number)[][] = [
    ['DILG / BCPC VAC LOGBOOK — COLUMN KEY & COLOR CODING'],
    [''],
    ['HEADER COLOR CODES (apply manually in Excel if needed):'],
    ['Color', 'Hex Code', 'Applied To'],
    ['Dark Green', '#215732', 'Municipality Title row & Group Header row'],
    ['Medium Green', '#538135', 'Sub-column header row'],
    ['Light Green', '#E2EFDA', 'Alternating data rows'],
    [''],
    ['COLUMN', 'FIELD NAME', 'DESCRIPTION'],
    ['A', 'No.', 'Sequential row number'],
    ['B', 'Intake Date', 'Date the case was reported/received by MSWDO or BCPC'],
    ['C', 'Barangay', 'Barangay where the victim resides'],
    ['D', 'Date of Incident', 'Date the incident actually occurred'],
    ['E', 'Total No. of VAC Victims (1)', 'Number of child victims in this entry (usually 1)'],
    ['F', 'First Name', 'Victim first/given name'],
    ['G', 'Middle Name', 'Victim middle name'],
    ['H', 'Last Name', 'Victim last name / surname'],
    ['I', 'Name Ext.', 'Name extension: Jr., Sr., II, III, etc.'],
    ['J', 'Male (2a)', 'Put "1" if victim is male'],
    ['K', 'Female (2b)', 'Put "1" if victim is female'],
    ['L', 'Age (3)', 'Age of victim at time of incident'],
    ['M', '(4a) Physical Abuse', 'Hitting, kicking, burning, mauling, etc.'],
    ['N', '(4b) Sexual Abuse', 'Rape, molestation, incest, sexual exploitation'],
    ['O', '(4c) Psychological/Emotional Abuse', 'Verbal abuse, threats, humiliation, emotional manipulation'],
    ['P', '(4d) Neglect', 'Abandonment, failure to provide food, shelter, medical care'],
    ['Q', '(4e) Others', 'Child labor, trafficking, economic exploitation, etc.'],
    ['R', '(5a) Immediate Family Member', 'Parent, sibling, spouse/partner, child'],
    ['S', '(5b) Close Relative', 'Uncle, aunt, cousin, lolo, lola, grandparent'],
    ['T', '(5c) Acquaintance', 'Neighbor, friend, classmate, teacher, employer'],
    ['U', '(5d) Stranger', 'Person unknown to the victim'],
    ['V', '(5e) Local Official', 'Barangay captain, kagawad, tanod, local gov\'t official'],
    ['W', '(5f) Law Enforcer', 'Police, military, security guard'],
    ['X', '(5g) Others incl. Guardian', 'Guardian, foster parent, institution staff, etc.'],
    ['Y', 'Name of Perpetrator', 'Full name: Last Name, First Name, Middle Name, Extension'],
    ['Z', '(6a) Referred to LSWDO', 'Referred to Local/Municipal Social Welfare & Development Office'],
    ['AA', '(6b) Referred to PNP', 'Referred to Philippine National Police / WCPD'],
    ['AB', '(6c) Referred to NBI', 'Referred to National Bureau of Investigation'],
    ['AC', '(6d) Referred for Medical Treatment', 'Hospital, health center, clinic, RHU'],
    ['AD', '(6e) Referred for Legal Assistance', 'BPO, TPO, PPO, court filing, public attorney'],
    ['AE', '(6f) Others incl. NGOs', 'NGO referral, DSWD, shelter home, livelihood assistance'],
    ['AF', 'REMARKS', 'Additional notes, follow-up actions, case status, etc.'],
    [''],
    ['NOTE: For columns M to AE (violence types, perpetrators, actions), enter "1" if applicable.'],
    ['Leave blank if not applicable. Do not enter "0".'],
    [''],
    ['This template follows the official DILG/BCPC VAC Logbook format under:'],
    ['Republic Act No. 7610 — Special Protection of Children Against Abuse,'],
    ['Exploitation and Discrimination Act'],
  ];
  const keyWs = XLSX.utils.aoa_to_sheet(keyAoa);
  keyWs['!cols'] = [{ wch: 8 }, { wch: 32 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, keyWs, 'Column Key & Instructions');

  return wb;
}

/**
 * Downloads the VAC Logbook filled with real case data from the MSWDO system
 */
export function downloadVacLogbook(cases: CaseRecord[], barangayLabel?: string): void {
  try {
    const wb = buildVacLogbookWorkbook(cases);
    const dateStr = new Date().toISOString().slice(0, 10);
    const brgy = barangayLabel ? `_${barangayLabel.replace(/\s+/g, '_')}` : '';
    XLSX.writeFile(wb, `BCPC_VAC_Logbook_RA7610${brgy}_${dateStr}.xlsx`);
  } catch (err) {
    console.error('Error downloading VAC logbook:', err);
  }
}

/**
 * Downloads a blank VAC Logbook template (official format, no data)
 */
export function downloadBlankVacTemplate(): void {
  try {
    const wb = buildVacLogbookWorkbook([]);
    XLSX.writeFile(wb, 'BCPC_VAC_Logbook_BLANK_Template_RA7610.xlsx');
  } catch (err) {
    console.error('Error downloading blank VAC template:', err);
  }
}
