import * as XLSX from 'xlsx';
import type {
  CaseRecord,
  CaseClassification,
  CaseStatus,
  Gender,
} from '@/lib/db/schema';
import { BARANGAY_REGISTRY } from '@/lib/mabini-barangays';

export const CASE_TEMPLATE_HEADERS = [
  'Case Number',
  'Date Reported (YYYY-MM-DD)',
  'Incident Date (YYYY-MM-DD)',
  'Case Classification',
  'Victim / Client Full Name',
  'Age',
  'Gender (F/M)',
  'Contact Number',
  'Address / Purok',
  'Barangay',
  'Alleged Perpetrator / Respondent',
  'Relationship to Victim',
  'Status',
  'Case Summary / Incident Narrative',
  'Assigned Social Worker',
  'Intake Notes / Actions Taken',
];

export interface CaseImportResult {
  success: boolean;
  totalRows: number;
  validCount: number;
  cases: Array<Omit<CaseRecord, 'id' | 'createdAt' | 'updatedAt'>>;
  errors: string[];
  warnings: string[];
  rawHeaders?: string[];
  rawRows?: (string | number)[][];
}

/**
 * Sample rows used in the downloadable Excel / CSV template
 */
export const SAMPLE_CASE_ROWS: (string | number)[][] = [
  [
    'VAWC-2024-001',
    '2024-01-15',
    '2024-01-14',
    'VAWC (RA 9262) - Physical',
    'Maria Santos',
    34,
    'F',
    '09171234567',
    'Purok 2',
    'Cadunan',
    'Juan Santos',
    'Husband',
    'Under BPO',
    'Physical assault following argument; complainant sustained minor contusions on arms.',
    'Jane Doe, RSW',
    'Assisted in Barangay Protection Order (BPO) application; scheduled psychosocial intake.',
  ],
  [
    'VAC-2024-002',
    '2024-02-03',
    '2024-02-01',
    'VAC (RA 7610) - Child Neglect',
    'Minor A. D.',
    9,
    'M',
    '',
    'Purok 4',
    'Cuambog',
    'Elena Dela Cruz',
    'Mother',
    'Active',
    'Severe neglect reported by public school teacher; student repeatedly unattended without food.',
    'Maria Clara, RSW',
    'Home visit conducted with Barangay Kagawad on Women & Family; temporary foster placement explored.',
  ],
  [
    'RAPE-2024-003',
    '2024-03-10',
    '2024-03-08',
    'Rape',
    'Jane Doe (Confidential)',
    17,
    'F',
    '09987654321',
    'Purok 1',
    'Pindasan',
    'Rodrigo Morales',
    'Acquaintance',
    'Referred to PNP-WCPD',
    'Alleged statutory rape incident; prompt crisis intervention and trauma counseling initiated.',
    'Jane Doe, RSW',
    'Accompanied to Davao de Oro Provincial Hospital for medico-legal; case endorsed to PNP WCPD.',
  ],
  [
    'VAWC-2024-004',
    '2024-04-18',
    '2024-04-18',
    'VAWC (RA 9262) - Economic Abuse',
    'Luzviminda Reyes',
    29,
    'F',
    '09201112233',
    'Purok 3',
    'Tagnanan',
    'Carlos Reyes',
    'Husband',
    'Resolved / Closed',
    'Complete withholding of financial support for 3 minor children despite regular employment.',
    'Pedro Penduko, RSW',
    'MSWDO conciliation conference completed; signed binding agreement on monthly child support.',
  ],
];

/**
 * Builds an Excel workbook for download
 */
export function buildCaseExcelWorkbook(): XLSX.WorkBook {
  const ws = XLSX.utils.aoa_to_sheet([CASE_TEMPLATE_HEADERS, ...SAMPLE_CASE_ROWS]);
  ws['!cols'] = [
    { wch: 18 }, // Case Number
    { wch: 16 }, // Date Reported
    { wch: 16 }, // Incident Date
    { wch: 28 }, // Case Classification
    { wch: 26 }, // Victim / Client Full Name
    { wch: 8 },  // Age
    { wch: 12 }, // Gender
    { wch: 16 }, // Contact Number
    { wch: 20 }, // Address / Purok
    { wch: 18 }, // Barangay
    { wch: 26 }, // Alleged Perpetrator
    { wch: 20 }, // Relationship
    { wch: 22 }, // Status
    { wch: 45 }, // Summary
    { wch: 22 }, // Assigned Social Worker
    { wch: 45 }, // Intake Notes
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'MSWDO Case Records');
  return wb;
}

/**
 * Triggers browser download of the standard MSWDO Case Records Excel template (.xlsx)
 */
export function downloadCaseExcelTemplate(): void {
  try {
    const wb = buildCaseExcelWorkbook();
    const dateStr = new Date().toISOString().slice(0, 10);
    if (typeof window !== 'undefined') {
      XLSX.writeFile(wb, `MSWDO_Case_Records_Template_${dateStr}.xlsx`);
    }
  } catch (err) {
    console.warn('Falling back to CSV download:', err);
    downloadCaseCsvTemplate();
  }
}

/**
 * Fallback browser download of CSV template
 */
export function downloadCaseCsvTemplate(): void {
  try {
    const escapeCsv = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;
    const lines = [
      CASE_TEMPLATE_HEADERS.map(escapeCsv).join(','),
      ...SAMPLE_CASE_ROWS.map((row) => row.map(escapeCsv).join(',')),
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `MSWDO_Case_Records_Template_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Error downloading CSV template:', err);
  }
}

/**
 * Normalizes case classification into standard CaseClassification union
 */
export function normalizeCaseClassification(input: string): CaseClassification {
  const clean = input.toLowerCase().trim();
  if (clean.includes('rape') || clean.includes('lugos')) return 'rape';
  if (clean.includes('cicl') || clean.includes('conflict with the law')) return 'cicl';
  if (clean.includes('neglect') || clean.includes('pabaya')) return 'vac_neglect';
  if (clean.includes('vac') || clean.includes('child abuse') || clean.includes('7610')) return 'vac_abuse';
  if (clean.includes('exploitation') || clean.includes('child labor')) return 'vac_exploitation';
  if (clean.includes('psych') || clean.includes('emotional') || clean.includes('verbal')) return 'vawc_psychological';
  if (clean.includes('sexual') || clean.includes('molest') || clean.includes('lascivious')) return 'vawc_sexual';
  if (clean.includes('economic') || clean.includes('sustento') || clean.includes('financial')) return 'vawc_economic';
  if (clean.includes('vawc') || clean.includes('physical') || clean.includes('kulata') || clean.includes('bun-og') || clean.includes('9262')) {
    return 'vawc_physical';
  }
  return 'other';
}

/**
 * Normalizes case status into CaseStatus union
 */
export function normalizeCaseStatus(input: string): CaseStatus {
  const clean = input.toLowerCase().trim();
  if (clean.includes('close') || clean.includes('resolved') || clean.includes('nahuman') || clean.includes('settled')) {
    return 'resolved_closed';
  }
  if (clean.includes('court') || clean.includes('korte') || clean.includes('prosecutor') || clean.includes('fiscal')) {
    return 'filed_in_court';
  }
  if (clean.includes('pnp') || clean.includes('wcpd') || clean.includes('police') || clean.includes('blotter')) {
    return 'referred_pnp_wcpd';
  }
  if (clean.includes('bpo') || clean.includes('tpo') || clean.includes('ppo') || clean.includes('protection order')) {
    return 'under_bpo_tpo';
  }
  if (clean.includes('monitor') || clean.includes('follow-up')) {
    return 'monitoring';
  }
  return 'active';
}

/**
 * Resolves barangay input to Mabini 11 official barangay ID
 */
export function resolveCaseBarangay(input: string): string {
  if (!input) return 'cadunan';
  const clean = input.toLowerCase().replace(/barangay|brgy\.?|\(.*?\)/g, '').trim();
  const match = BARANGAY_REGISTRY.find((b) => {
    const bClean = b.label.toLowerCase();
    return bClean === clean || b.id === clean || bClean.includes(clean) || clean.includes(bClean);
  });
  return match ? match.id : clean.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '') || 'cadunan';
}

/**
 * Cleanses and normalizes dates from various formats (Excel serial number, MM/DD/YYYY, YYYY-MM-DD)
 */
export function parseDateClean(value: unknown): string {
  if (!value) return new Date().toISOString().slice(0, 10);

  // If number (Excel date code)
  if (typeof value === 'number') {
    const jsDate = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!isNaN(jsDate.getTime())) {
      return jsDate.toISOString().slice(0, 10);
    }
  }

  const str = String(value).trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // MM/DD/YYYY or DD/MM/YYYY
  const parts = str.split(/[/-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    if (parts[2].length === 4) {
      // Assume MM/DD/YYYY
      return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
}

/**
 * Finds column index by searching common aliases for that field
 */
function findColIndex(headers: string[], aliases: string[]): number {
  const lowerHeaders = headers.map((h) => String(h || '').toLowerCase().trim());
  for (let i = 0; i < lowerHeaders.length; i++) {
    const h = lowerHeaders[i];
    if (aliases.some((alias) => h === alias || h.includes(alias))) {
      return i;
    }
  }
  return -1;
}

/**
 * Parses and cleanses raw spreadsheet binary buffer, array buffer, or CSV text
 */
export function parseAndCleanseCaseFile(
  data: ArrayBuffer | string | Uint8Array,
  filename: string = 'Uploaded_Cases.xlsx',
): CaseImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let workbook: XLSX.WorkBook;
  try {
    if (typeof data === 'string') {
      workbook = XLSX.read(data, { type: 'string' });
    } else {
      workbook = XLSX.read(data, { type: 'array' });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      totalRows: 0,
      validCount: 0,
      cases: [],
      errors: [`Failed to read file ${filename}: ${msg}`],
      warnings: [],
    };
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return {
      success: false,
      totalRows: 0,
      validCount: 0,
      cases: [],
      errors: ['The uploaded spreadsheet has no sheets.'],
      warnings: [],
    };
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows: (string | number)[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (!rows || rows.length < 2) {
    return {
      success: false,
      totalRows: 0,
      validCount: 0,
      cases: [],
      errors: ['No data rows found in spreadsheet. Ensure headers and at least 1 record exist.'],
      warnings: [],
    };
  }

  const headers = rows[0].map((h) => String(h || '').trim());
  const dataRows = rows.slice(1);

  // Column matching with flexible aliases
  const colCaseNo = findColIndex(headers, [
    'case number',
    'case no',
    'case #',
    'control no',
    'control number',
    'case_number',
    'case id',
    'numero sa kaso',
  ]);
  const colDateReported = findColIndex(headers, [
    'date reported',
    'reported at',
    'reported date',
    'intake date',
    'petsa sa report',
    'date_reported',
    'date',
  ]);
  const colIncidentDate = findColIndex(headers, [
    'incident date',
    'date of incident',
    'petsa sa hitabo',
    'incident_date',
  ]);
  const colType = findColIndex(headers, [
    'case classification',
    'classification',
    'case type',
    'type',
    'violation',
    'crime',
    'klase sa kaso',
    'category',
  ]);
  const colVictim = findColIndex(headers, [
    'victim',
    'client',
    'complainant',
    'biktima',
    'ngalan sa biktima',
    'victim name',
    'client full name',
    'name',
  ]);
  const colAge = findColIndex(headers, ['age', 'edad', 'victim age', 'client age']);
  const colGender = findColIndex(headers, ['gender', 'sex', 'kasarian']);
  const colContact = findColIndex(headers, ['contact', 'contact number', 'phone', 'cellphone', 'mobile']);
  const colAddress = findColIndex(headers, ['address', 'purok', 'sitio', 'street', 'tirahan']);
  const colBarangay = findColIndex(headers, ['barangay', 'brgy', 'barangay name']);
  const colPerpetrator = findColIndex(headers, [
    'perpetrator',
    'respondent',
    'suspect',
    'akusado',
    'reklamado',
    'alleged perpetrator',
    'perpetrator name',
  ]);
  const colRelationship = findColIndex(headers, [
    'relationship',
    'relation',
    'relasyon',
    'relationship to victim',
  ]);
  const colStatus = findColIndex(headers, ['status', 'case status', 'kahimtang']);
  const colSummary = findColIndex(headers, [
    'case summary',
    'summary',
    'incident narrative',
    'narrative',
    'details',
    'remarks',
    'description',
  ]);
  const colWorker = findColIndex(headers, [
    'assigned social worker',
    'social worker',
    'assigned worker',
    'worker',
    'caseworker',
    'intake worker',
  ]);
  const colNotes = findColIndex(headers, [
    'intake notes',
    'notes',
    'actions taken',
    'action taken',
    'rekomendasyon',
  ]);

  const parsedCases: Array<Omit<CaseRecord, 'id' | 'createdAt' | 'updatedAt'>> = [];
  const seenCaseNumbers = new Set<string>();

  dataRows.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-based, accounting for header
    // Check if entire row is empty
    if (!row.some((val) => String(val || '').trim() !== '')) {
      return;
    }

    let caseNumber = colCaseNo >= 0 ? String(row[colCaseNo] || '').trim() : '';
    const victimName = colVictim >= 0 ? String(row[colVictim] || '').trim() : '';

    if (!victimName) {
      warnings.push(`Row ${rowNum}: Missing Victim / Client Name. Skipped.`);
      return;
    }

    if (!caseNumber) {
      caseNumber = `AUTO-${Date.now().toString().slice(-4)}-${rowNum}`;
      warnings.push(`Row ${rowNum}: Missing Case Number. Generated temporary number '${caseNumber}'.`);
    }

    const normCaseNo = caseNumber.toLowerCase();
    if (seenCaseNumbers.has(normCaseNo)) {
      warnings.push(`Row ${rowNum}: Duplicate Case Number '${caseNumber}' in upload file. Will overwrite previous.`);
    }
    seenCaseNumbers.add(normCaseNo);

    const rawReportedDate = colDateReported >= 0 ? row[colDateReported] : '';
    const reportedAt = parseDateClean(rawReportedDate);

    const rawIncidentDate = colIncidentDate >= 0 ? row[colIncidentDate] : '';
    const incidentDate = rawIncidentDate ? parseDateClean(rawIncidentDate) : undefined;

    const rawType = colType >= 0 ? String(row[colType] || '') : '';
    const caseType = normalizeCaseClassification(rawType);

    const rawAge = colAge >= 0 ? parseInt(String(row[colAge]).replace(/[^0-9]/g, ''), 10) : undefined;
    const age = isNaN(rawAge as number) ? undefined : rawAge;

    const rawGender = colGender >= 0 ? String(row[colGender] || '').trim().toUpperCase() : '';
    let gender: Gender | string = 'F';
    if (rawGender.startsWith('M')) gender = 'M';
    else if (rawGender.startsWith('F')) gender = 'F';

    const contact = colContact >= 0 ? String(row[colContact] || '').trim() : undefined;
    const address = colAddress >= 0 ? String(row[colAddress] || '').trim() : undefined;

    const rawBarangay = colBarangay >= 0 ? String(row[colBarangay] || '').trim() : '';
    const barangayId = resolveCaseBarangay(rawBarangay);

    const perpetratorName = colPerpetrator >= 0 ? String(row[colPerpetrator] || '').trim() : undefined;
    const perpetratorRelationship = colRelationship >= 0 ? String(row[colRelationship] || '').trim() : undefined;

    const rawStatus = colStatus >= 0 ? String(row[colStatus] || '') : '';
    const status = normalizeCaseStatus(rawStatus);

    const caseSummary = colSummary >= 0 ? String(row[colSummary] || '').trim() : `Case record for ${victimName}`;
    const assignedWorker = colWorker >= 0 ? String(row[colWorker] || '').trim() : undefined;
    const intakeNotes = colNotes >= 0 ? String(row[colNotes] || '').trim() : undefined;

    parsedCases.push({
      case_number: caseNumber,
      case_type: caseType,
      reported_at: reportedAt,
      incident_date: incidentDate,
      victim_name: victimName,
      victim_age: age,
      victim_gender: gender,
      victim_contact: contact,
      victim_address: address,
      barangay_id: barangayId,
      purok_sitio: address,
      perpetrator_name: perpetratorName,
      perpetrator_relationship: perpetratorRelationship,
      status,
      case_summary: caseSummary || `Incident reported regarding ${victimName}`,
      assigned_worker_name: assignedWorker,
      intake_notes: intakeNotes,
      source: 'excel_import',
      syncStatus: 'pending',
    });
  });

  return {
    success: errors.length === 0,
    totalRows: dataRows.length,
    validCount: parsedCases.length,
    cases: parsedCases,
    errors,
    warnings,
    rawHeaders: headers,
    rawRows: dataRows,
  };
}
