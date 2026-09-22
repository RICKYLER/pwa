/**
 * MSWDO Relief Historical Disaster Data CSV / Excel Importer & Cleansing Pipeline
 *
 * Implements the requirement:
 * "Para by the time naa najud ang data, cleansing and upload na lang"
 *
 * Capabilities:
 * 1. Parses raw CSV text exported from Microsoft Excel or Google Sheets.
 * 2. Cleanses and normalizes column headers and data types.
 * 3. Maps barangays to Mabini's 11 official registry IDs.
 * 4. Automatically applies MSWDO 3-families-per-HH rule if family counts are omitted.
 * 5. Validates numbers, removes commas (e.g. "1,250" -> 1250), handles missing fields.
 */

import * as XLSX from 'xlsx';
import { HistoricalDisasterEvent, DisasterHazardType } from './mabini-relief-dataset';
import { BARANGAY_REGISTRY } from '@/lib/mabini-barangays';

export interface ImportResult {
  success: boolean;
  importedCount: number;
  events: HistoricalDisasterEvent[];
  errors: string[];
  warnings: string[];
  /** Preserved exact raw column headers from the uploaded file */
  rawHeaders?: string[];
  /** Preserved exact raw rows from the uploaded file */
  rawRows?: (string | number)[][];
}

/**
 * Standard CSV / Excel Template headers for MSWDO Disaster Relief Data
 */
export const CSV_TEMPLATE_HEADERS = [
  'Event Name',
  'Date (YYYY-MM-DD)',
  'Barangay',
  'Hazard Type',
  'Severity (low/moderate/severe/critical)',
  'Affected Households',
  'Affected Families (optional)',
  'Displacement Days',
  'Actual FFPs Distributed',
  'Kitchen Sets Distributed',
  'Hygiene Kits Distributed',
  'Notes',
];

/**
 * Generates sample CSV content ready to be opened in Microsoft Excel
 */
export function generateSampleCsvTemplate(): string {
  const sampleRows = [
    CSV_TEMPLATE_HEADERS.join(','),
    '"2023 Heavy Rain Inundation","2023-01-15","Cadunan","flashflood","moderate",75,"",2,232,40,75,"Lowland ricefield flooding"',
    '"2023 Magnitude 5.9 Tremor","2023-03-07","Cuambog","earthquake","severe",80,"",3,252,60,80,"Evacuation to gym"',
    '"2024 Monsoon Storm Surge","2024-02-02","Pindasan","typhoon","moderate",60,"",2,186,35,60,"Coastal purok relief"',
    '"2024 Upland Landslide","2024-03-12","Golden Valley","landslide","critical",145,"",5,460,140,145,"Sitio isolated road block"',
  ];
  return sampleRows.join('\r\n');
}

/**
 * Trigger browser download of formatted Microsoft Excel (.xlsx) template
 */
export function downloadExcelTemplate(): void {
  try {
    const headers = CSV_TEMPLATE_HEADERS;
    const rows = [
      ['2023 Heavy Rain Inundation', '2023-01-15', 'Cadunan', 'flashflood', 'moderate', 75, 225, 2, 232, 40, 75, 'Lowland ricefield flooding'],
      ['2023 Magnitude 5.9 Tremor', '2023-03-07', 'Cuambog', 'earthquake', 'severe', 80, 240, 3, 252, 60, 80, 'Evacuation to gym'],
      ['2024 Monsoon Storm Surge', '2024-02-02', 'Pindasan', 'typhoon', 'moderate', 60, 180, 2, 186, 35, 60, 'Coastal purok relief'],
      ['2024 Upland Landslide', '2024-03-12', 'Golden Valley', 'landslide', 'critical', 145, 435, 5, 460, 140, 145, 'Sitio isolated road block'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [
      { wch: 32 },
      { wch: 16 },
      { wch: 18 },
      { wch: 15 },
      { wch: 22 },
      { wch: 20 },
      { wch: 22 },
      { wch: 18 },
      { wch: 24 },
      { wch: 24 },
      { wch: 24 },
      { wch: 35 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Disaster Data');
    if (typeof window !== 'undefined') {
      XLSX.writeFile(wb, `MSWDO_Relief_Forecasting_Template_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }
  } catch (err) {
    // Fallback to CSV if browser environment prevents direct XLSX write
    downloadCsvTemplate();
  }
}

/**
 * Builds a structured Microsoft Excel (.xlsx) workbook from HistoricalDisasterEvent array
 */
export function buildExcelWorkbook(events: HistoricalDisasterEvent[]): XLSX.WorkBook {
  const headers = CSV_TEMPLATE_HEADERS;
  const rows = (events || []).map((e) => [
    e.eventName || '',
    e.date || '',
    e.barangayName || e.barangayId || '',
    e.hazardType || 'flashflood',
    e.severityLevel || 'moderate',
    e.affectedHouseholds ?? 0,
    e.affectedFamilies ?? (e.affectedHouseholds ? e.affectedHouseholds * 3 : 0),
    e.displacementDays ?? 1,
    e.actualDistributed?.familyFoodPacks ?? 0,
    e.actualDistributed?.kitchenSets ?? 0,
    e.actualDistributed?.hygieneKits ?? 0,
    e.notes || '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    { wch: 32 }, // Event Name
    { wch: 16 }, // Date (YYYY-MM-DD)
    { wch: 18 }, // Barangay
    { wch: 15 }, // Hazard Type
    { wch: 22 }, // Severity (low/moderate/severe/critical)
    { wch: 20 }, // Affected Households
    { wch: 22 }, // Affected Families (optional)
    { wch: 18 }, // Displacement Days
    { wch: 24 }, // Actual FFPs Distributed
    { wch: 24 }, // Kitchen Sets Distributed
    { wch: 24 }, // Hygiene Kits Distributed
    { wch: 35 }, // Notes
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Disaster Data');
  return wb;
}

/**
 * Trigger browser download of historical disaster events as a formatted Microsoft Excel (.xlsx) file.
 * Enables downloading whatever dataset was uploaded or is currently active.
 */
export function exportEventsToExcel(
  events: HistoricalDisasterEvent[],
  filenamePrefix: string = 'MSWDO_Disaster_Data'
): void {
  try {
    if (!events || events.length === 0) {
      downloadExcelTemplate();
      return;
    }

    const wb = buildExcelWorkbook(events);
    const cleanName = (filenamePrefix || 'MSWDO_Disaster_Data')
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_\-\s]/g, '_')
      .trim();
    const finalFilename = `${cleanName}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    if (typeof window !== 'undefined') {
      XLSX.writeFile(wb, finalFilename);
    }
  } catch (err) {
    console.warn('[exportEventsToExcel] Falling back to CSV export:', err);
    exportEventsToCsv(events, filenamePrefix);
  }
}

/**
 * Fallback browser download of disaster events as CSV
 */
export function exportEventsToCsv(
  events: HistoricalDisasterEvent[],
  filenamePrefix: string = 'MSWDO_Disaster_Data'
): void {
  try {
    const headers = CSV_TEMPLATE_HEADERS.join(',');
    const rows = (events || []).map((e) => [
      `"${(e.eventName || '').replace(/"/g, '""')}"`,
      `"${e.date || ''}"`,
      `"${(e.barangayName || e.barangayId || '').replace(/"/g, '""')}"`,
      `"${e.hazardType || ''}"`,
      `"${e.severityLevel || ''}"`,
      e.affectedHouseholds ?? 0,
      e.affectedFamilies ?? (e.affectedHouseholds ? e.affectedHouseholds * 3 : ''),
      e.displacementDays ?? 1,
      e.actualDistributed?.familyFoodPacks ?? 0,
      e.actualDistributed?.kitchenSets ?? 0,
      e.actualDistributed?.hygieneKits ?? 0,
      `"${(e.notes || '').replace(/"/g, '""')}"`,
    ].join(','));

    const content = [headers, ...rows].join('\r\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const cleanName = (filenamePrefix || 'MSWDO_Disaster_Data')
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_\-\s]/g, '_')
      .trim();
    link.setAttribute('download', `${cleanName}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Failed to export CSV:', err);
  }
}

/**
 * Trigger browser download of the sample CSV template
 */
export function downloadCsvTemplate(): void {
  const content = generateSampleCsvTemplate();
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `MSWDO_Relief_Forecasting_Template_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Universal file parser supporting both Microsoft Excel (.xlsx, .xls) and CSV (.csv)
 */
export async function parseExcelOrCsvFile(file: File): Promise<ImportResult> {
  const fileName = file.name.toLowerCase();
  const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

  if (isExcel) {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        return {
          success: false,
          importedCount: 0,
          events: [],
          errors: ['Walay sulod o walay sheets ang na-upload nga Excel file.'],
          warnings: [],
        };
      }
      const worksheet = workbook.Sheets[firstSheetName];
      const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      return parseAndCleanseMatrix(rawMatrix, file.name);
    } catch (err: any) {
      return {
        success: false,
        importedCount: 0,
        events: [],
        errors: [`Dili mabasa ang Excel file: ${err?.message || 'Invalid format'}`],
        warnings: [],
      };
    }
  } else {
    try {
      const text = await file.text();
      return parseAndCleanseDisasterCsv(text, file.name);
    } catch (err: any) {
      return {
        success: false,
        importedCount: 0,
        events: [],
        errors: [`Dili mabasa ang CSV file: ${err?.message || 'Invalid format'}`],
        warnings: [],
      };
    }
  }
}

/**
 * Parses a single CSV row handling quotes and commas
 */
export function parseCsvRow(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

/**
 * Matches and cleanses barangay names to official Mabini IDs
 */
export function resolveBarangay(input: string): { id: string; name: string } {
  const clean = input.toLowerCase().replace(/barangay|brgy\.?|\(.*?\)/g, '').trim();
  const match = BARANGAY_REGISTRY.find((b) => {
    const bClean = b.label.toLowerCase();
    return bClean === clean || b.id === clean || bClean.includes(clean) || clean.includes(bClean);
  });

  if (match) {
    return { id: match.id, name: match.label };
  }
  // If not in registry, format nicely
  const titleCase = input
    .trim()
    .replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
  return { id: clean.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, ''), name: titleCase || 'Mabini Area' };
}

/**
 * Cleanses numbers removing commas and invalid characters
 */
export function parseNumberClean(value: any, fallback: number = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const str = String(value).replace(/,/g, '').trim();
  const parsed = Number(str);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Normalizes hazard string
 */
export function normalizeHazard(hazard: string): DisasterHazardType {
  const h = hazard.toLowerCase();
  if (h.includes('quake') || h.includes('linog') || h.includes('tremor') || h.includes('earthquake')) return 'earthquake';
  if (h.includes('typhoon') || h.includes('bagyo') || h.includes('wind') || h.includes('storm')) return 'typhoon';
  if (h.includes('landslide') || h.includes('slide') || h.includes('debris') || h.includes('slope')) return 'landslide';
  if (h.includes('flood') || h.includes('baha') || h.includes('rain') || h.includes('shear')) return 'flashflood';
  return 'flashflood';
}

/**
 * Normalizes severity level
 */
export function normalizeSeverity(severity: string): 'low' | 'moderate' | 'severe' | 'critical' {
  const s = severity.toLowerCase();
  if (s.includes('crit') || s.includes('calamity') || s.includes('state') || s.includes('4')) return 'critical';
  if (s.includes('sev') || s.includes('high') || s.includes('alert 3') || s.includes('3')) return 'severe';
  if (s.includes('mod') || s.includes('alert 2') || s.includes('2')) return 'moderate';
  return 'low';
}

/**
 * Universal CSV parser delegating to parseAndCleanseMatrix
 */
export function parseAndCleanseDisasterCsv(
  csvContent: string,
  fileName: string = 'Uploaded_Data.csv'
): ImportResult {
  if (!csvContent || typeof csvContent !== 'string') {
    return {
      success: false,
      importedCount: 0,
      events: [],
      errors: ['Walay sulod ang CSV content.'],
      warnings: [],
    };
  }

  const rawLines = csvContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (rawLines.length === 0) {
    return {
      success: false,
      importedCount: 0,
      events: [],
      errors: ['Walay sulod ang CSV file.'],
      warnings: [],
    };
  }

  const matrix = rawLines.map((line) => parseCsvRow(line));
  return parseAndCleanseMatrix(matrix, fileName);
}

/**
 * Universal Matrix Parser & Normalizer
 * Reads ANY Excel or CSV sheet format:
 * - Scans first 25 rows to detect actual header row even if title rows precede it
 * - Recognizes damage assessment sheets, relief distribution logs, and custom formats
 * - Extracts Barangay, Households, Families, Damaged Houses, Infrastructure, FFPs, and Dates
 * - Preserves exact rawHeaders and rawRows so the exact table format can be copied & rendered in UI
 */
export function parseAndCleanseMatrix(
  rawMatrix: any[][],
  fileName: string = 'Uploaded_Data'
): ImportResult {
  const warnings: string[] = [];
  const events: HistoricalDisasterEvent[] = [];

  if (!rawMatrix || !Array.isArray(rawMatrix) || rawMatrix.length === 0) {
    return {
      success: false,
      importedCount: 0,
      events: [],
      errors: ['Walay sulod o dili mabasa ang file.'],
      warnings: [],
    };
  }

  // Filter out completely blank rows
  const cleanRows = rawMatrix.filter(
    (r) => Array.isArray(r) && r.some((c) => c !== null && c !== undefined && String(c).trim() !== '')
  );

  if (cleanRows.length === 0) {
    return {
      success: false,
      importedCount: 0,
      events: [],
      errors: ['Walay nakit-ang data sa file.'],
      warnings: [],
    };
  }

  // 1. Detect Header Row Index (Scan first 25 rows)
  let bestHeaderIdx = 0;
  let maxScore = -1;

  const headerKeywords = [
    'barangay', 'brgy', 'location', 'lugar', 'area', 'purok', 'sitio', 'community', 'zone',
    'household', 'hh', 'family', 'families', 'pamilya', 'pop', 'population', 'affected',
    'damage', 'damaged', 'totally', 'partially', 'guba', 'wasak', 'house', 'houses', 'balay',
    'ffp', 'food', 'pack', 'relief', 'aid', 'hinabang', 'kitchen', 'hygiene',
    'infra', 'infrastructure', 'facility', 'school', 'cost', 'amount', 'budget', 'remarks', 'notes',
    'date', 'petsa', 'hazard', 'calamity', 'incident', 'no', '#'
  ];

  const knownBrgyNames = BARANGAY_REGISTRY.map((b) => b.label.toLowerCase());

  for (let r = 0; r < Math.min(25, cleanRows.length); r++) {
    const row = cleanRows[r];
    let score = 0;
    const textCells = row.filter((c) => typeof c === 'string' && c.trim().length > 0);

    for (const cell of row) {
      const s = String(cell).toLowerCase().replace(/[\s_\-()]/g, '');
      if (headerKeywords.some((k) => s.includes(k))) {
        score += 3;
      }
    }

    // High bonus if subsequent row has known Mabini barangay names
    if (r + 1 < cleanRows.length) {
      const nextRow = cleanRows[r + 1];
      const hasBrgy = nextRow.some((cell) => {
        const val = String(cell).toLowerCase().trim();
        return knownBrgyNames.some((kb) => val.includes(kb) || kb.includes(val));
      });
      if (hasBrgy) {
        score += 15;
      }
    }

    if (textCells.length >= 3) {
      score += 2;
    }

    if (score > maxScore) {
      maxScore = score;
      bestHeaderIdx = r;
    }
  }

  // 2. Extract rawHeaders and rawRows
  const headerRow = cleanRows[bestHeaderIdx];
  const maxCols = Math.max(...cleanRows.slice(bestHeaderIdx).map((r) => r.length), headerRow.length);

  const rawHeaders: string[] = [];
  for (let col = 0; col < maxCols; col++) {
    const rawVal = headerRow[col];
    const name =
      rawVal !== null && rawVal !== undefined && String(rawVal).trim() !== ''
        ? String(rawVal).trim()
        : `Column ${col + 1}`;
    rawHeaders.push(name);
  }

  const rawRows: (string | number)[][] = [];
  const candidateDataRows = cleanRows.slice(bestHeaderIdx + 1);

  for (const row of candidateDataRows) {
    const formattedRow: (string | number)[] = [];
    let hasContent = false;
    for (let c = 0; c < maxCols; c++) {
      const cell = row[c];
      if (cell !== null && cell !== undefined && String(cell).trim() !== '') {
        hasContent = true;
        if (typeof cell === 'number') {
          formattedRow.push(cell);
        } else {
          const str = String(cell).trim();
          const cleanNum = str.replace(/,/g, '');
          if (/^-?\d+(\.\d+)?$/.test(cleanNum)) {
            formattedRow.push(Number(cleanNum));
          } else {
            formattedRow.push(str);
          }
        }
      } else {
        formattedRow.push('');
      }
    }
    if (hasContent) {
      rawRows.push(formattedRow);
    }
  }

  // 3. Intelligent Column Index Mapping
  const normalizedHeaders = rawHeaders.map((h) => h.toLowerCase().replace(/[\s_\-()]/g, ''));

  const findCol = (keywords: string[]): number => {
    return normalizedHeaders.findIndex((col) => keywords.some((k) => col.includes(k)));
  };

  let idxBrgy = findCol(['barangay', 'brgy', 'location', 'lugar', 'area', 'purok', 'sitio', 'community', 'zone', 'name', 'unit', 'municipality']);

  // If header didn't catch barangay, inspect actual cells in data rows for known Mabini barangays!
  if (idxBrgy === -1) {
    for (let c = 0; c < maxCols; c++) {
      let brgyMatches = 0;
      for (const row of rawRows) {
        const val = String(row[c] || '').toLowerCase().trim();
        if (knownBrgyNames.some((kb) => val.includes(kb) || kb.includes(val))) {
          brgyMatches++;
        }
      }
      if (brgyMatches > 0) {
        idxBrgy = c;
        break;
      }
    }
  }

  // If still not found, fallback to first column with non-numeric text
  if (idxBrgy === -1) {
    for (let c = 0; c < maxCols; c++) {
      const hasText = rawRows.some((r) => typeof r[c] === 'string' && isNaN(Number(r[c])) && String(r[c]).trim().length > 1);
      if (hasText) {
        idxBrgy = c;
        break;
      }
    }
  }
  if (idxBrgy === -1) idxBrgy = 0;

  // Other column indices
  const idxEvent = findCol(['event', 'disaster', 'calamity', 'incident', 'kalamidad']);
  const idxDate = findCol(['date', 'petsa', 'asof', 'adlaw', 'time']);
  const idxHazard = findCol(['hazard', 'type', 'klase']);
  const idxSeverity = findCol(['severity', 'level', 'signal']);
  const idxHH = findCol(['affectedhh', 'affectedhouseholds', 'households', 'household', 'hh', 'panimalay', 'kabahayan']);
  let idxFam = findCol(['affectedfamilies', 'families', 'family', 'beneficiaries', 'pop', 'population']);
  if (idxFam === idxHH) {
    idxFam = -1;
  }
  const idxTotally = findCol(['totally', 'totaldamage', 'wasak', 'totallydamaged']);
  const idxPartially = findCol(['partially', 'partial', 'partiallydamaged']);
  const idxDamagedHouses = findCol(['damagedhouses', 'totaldamaged', 'totalhouses', 'damages', 'guba']);
  const idxActualFFP = findCol(['actualffp', 'ffp', 'foodpack', 'pack', 'foodpacks', 'food', 'relief', 'aid', 'hinabang', 'allocation']);
  const idxKitchen = findCol(['kitchen', 'cook', 'kusina']);
  const idxHygiene = findCol(['hygiene']);
  const idxInfra = findCol(['infra', 'infrastructure', 'facility', 'facilities', 'pasilidad', 'school', 'building', 'road']);
  const idxNotes = findCol(['note', 'remark', 'desc', 'details', 'status', 'description']);

  // Extract date from fileName if available
  const dateInFileMatch = fileName.match(/20\d{2}[-_/]\d{1,2}[-_/]\d{1,2}|(oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep)[a-z]*\s*\d{1,2}(?:st|nd|rd|th)?(?:,?\s*20\d{2})?/i);
  let fallbackDate = new Date().toISOString().slice(0, 10);
  if (dateInFileMatch) {
    const rawMatch = dateInFileMatch[0];
    const parsedD = new Date(rawMatch);
    if (!isNaN(parsedD.getTime())) {
      fallbackDate = parsedD.toISOString().slice(0, 10);
    }
  }

  // Default hazard based on file name or content
  let defaultHazard: DisasterHazardType = 'flashflood';
  const fileLower = fileName.toLowerCase();
  if (fileLower.includes('earthquake') || fileLower.includes('linog') || fileLower.includes('tremor') || fileLower.includes('quake')) {
    defaultHazard = 'earthquake';
  } else if (fileLower.includes('typhoon') || fileLower.includes('bagyo') || fileLower.includes('storm')) {
    defaultHazard = 'typhoon';
  } else if (fileLower.includes('landslide') || fileLower.includes('slide')) {
    defaultHazard = 'landslide';
  }

  // 4. Process each data row into HistoricalDisasterEvent
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rawBrgy = String(row[idxBrgy] ?? '').trim();

    // Skip summary / total rows in calculation (e.g. "TOTAL", "GRAND TOTAL")
    const firstColStr = String(row[0] || '').toLowerCase().trim();
    if (
      firstColStr.startsWith('total') ||
      firstColStr.startsWith('grand total') ||
      firstColStr.startsWith('subtotal') ||
      firstColStr.startsWith('kabuuan')
    ) {
      continue;
    }

    if (!rawBrgy || rawBrgy === '0' || rawBrgy === '-') {
      continue;
    }

    const brgyResolved = resolveBarangay(rawBrgy);
    const eventName = idxEvent !== -1 && row[idxEvent] ? String(row[idxEvent]) : `SitRep Assessment in ${brgyResolved.name}`;
    const rawDateStr = idxDate !== -1 && row[idxDate] ? String(row[idxDate]).trim() : '';
    const dateStr = rawDateStr ? rawDateStr.split('T')[0].split(' ')[0] : fallbackDate;
    const hazardType = idxHazard !== -1 && row[idxHazard] ? normalizeHazard(String(row[idxHazard])) : defaultHazard;
    const severityLevel = idxSeverity !== -1 && row[idxSeverity] ? normalizeSeverity(String(row[idxSeverity])) : 'moderate';

    // Parse damage numbers
    const totallyDamaged = idxTotally !== -1 ? parseNumberClean(row[idxTotally], 0) : 0;
    const partiallyDamaged = idxPartially !== -1 ? parseNumberClean(row[idxPartially], 0) : 0;
    let damagedHouses = idxDamagedHouses !== -1 ? parseNumberClean(row[idxDamagedHouses], 0) : 0;
    if (damagedHouses === 0 && (totallyDamaged > 0 || partiallyDamaged > 0)) {
      damagedHouses = totallyDamaged + partiallyDamaged;
    }

    // Parse households & families
    let affectedHH = idxHH !== -1 ? parseNumberClean(row[idxHH], 0) : 0;
    if (affectedHH === 0 && damagedHouses > 0) {
      affectedHH = damagedHouses;
    }

    let actualFFPs = idxActualFFP !== -1 ? parseNumberClean(row[idxActualFFP], 0) : 0;
    if (affectedHH === 0 && actualFFPs > 0) {
      affectedHH = Math.max(1, Math.round(actualFFPs / 3));
    }
    if (affectedHH === 0) {
      affectedHH = 1; // Resilient fallback to avoid dropping rows
    }

    let families = idxFam !== -1 ? parseNumberClean(row[idxFam], 0) : 0;
    if (families === 0) {
      families = affectedHH * 3; // MSWDO standard: 3 families per HH
    }

    if (actualFFPs === 0) {
      actualFFPs = families; // 1 FFP per family
    }

    // Parse infrastructure count
    let infraCount = 0;
    if (idxInfra !== -1 && row[idxInfra]) {
      const rawInfra = row[idxInfra];
      if (typeof rawInfra === 'number') {
        infraCount = rawInfra;
      } else {
        const str = String(rawInfra).trim();
        const num = parseNumberClean(str, -1);
        if (num !== -1) {
          infraCount = num;
        } else if (str.length > 0 && str !== '-' && str !== '0' && str.toLowerCase() !== 'none') {
          infraCount = str.split(/[,;\n\r]+/).filter((s) => s.trim().length > 0).length;
        }
      }
    }

    // Preserved rawRowData mapping each raw header name to the cell value
    const rawRowData: Record<string, any> = {};
    for (let c = 0; c < rawHeaders.length; c++) {
      rawRowData[rawHeaders[c]] = row[c] ?? '';
    }

    const notes = idxNotes !== -1 && row[idxNotes]
      ? String(row[idxNotes])
      : damagedHouses > 0
      ? `Damaged: ${totallyDamaged} totally, ${partiallyDamaged} partially`
      : `SitRep record for ${brgyResolved.name}`;

    events.push({
      id: `imported-${Date.now()}-${i}`,
      eventName,
      date: dateStr,
      hazardType,
      severityLevel,
      barangayId: brgyResolved.id,
      barangayName: brgyResolved.name,
      affectedHouseholds: affectedHH,
      affectedFamilies: families,
      displacementDays: 3,
      vulnerability: {
        seniorsCount: Math.round(affectedHH * 0.35),
        pwdsCount: Math.round(affectedHH * 0.1),
        infantsCount: Math.round(affectedHH * 0.2),
        lactatingMothersCount: Math.round(affectedHH * 0.15),
      },
      actualDistributed: {
        familyFoodPacks: actualFFPs,
        kitchenSets: damagedHouses > 0 ? damagedHouses : Math.round(affectedHH * 0.6),
        hygieneKits: affectedHH,
        infantCarePacks: Math.round(affectedHH * 0.2),
        seniorCarePacks: Math.round(affectedHH * 0.35),
      },
      damagedHousesDetail: {
        totally: totallyDamaged,
        partially: partiallyDamaged,
      },
      damagedInfrastructureCount: infraCount,
      notes,
      rawRowData,
    });
  }

  // Fallback if no records met criteria: create at least 1 event per row
  if (events.length === 0 && rawRows.length > 0) {
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rawRowData: Record<string, any> = {};
      for (let c = 0; c < rawHeaders.length; c++) {
        rawRowData[rawHeaders[c]] = row[c] ?? '';
      }
      events.push({
        id: `imported-${Date.now()}-${i}`,
        eventName: `Uploaded Record #${i + 1}`,
        date: fallbackDate,
        hazardType: defaultHazard,
        severityLevel: 'moderate',
        barangayId: 'cadunan',
        barangayName: String(row[0] || 'Cadunan'),
        affectedHouseholds: 1,
        affectedFamilies: 3,
        displacementDays: 1,
        vulnerability: { seniorsCount: 1, pwdsCount: 0, infantsCount: 0, lactatingMothersCount: 0 },
        actualDistributed: { familyFoodPacks: 3, kitchenSets: 1, hygieneKits: 1, infantCarePacks: 0, seniorCarePacks: 1 },
        notes: `Raw uploaded record`,
        rawRowData,
      });
    }
  }

  return {
    success: events.length > 0,
    importedCount: events.length,
    events,
    errors: events.length > 0 ? [] : ['Walay nakitang valid data rows sa file.'],
    warnings,
    rawHeaders,
    rawRows,
  };
}
