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
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Disaster Data');
    XLSX.writeFile(wb, `MSWDO_Relief_Forecasting_Template_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (err) {
    // Fallback to CSV if browser environment prevents direct XLSX write
    downloadCsvTemplate();
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
          errors: ['The uploaded Excel workbook contains no sheets.'],
          warnings: [],
        };
      }
      const worksheet = workbook.Sheets[firstSheetName];
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      return parseAndCleanseDisasterCsv(csv);
    } catch (err: any) {
      return {
        success: false,
        importedCount: 0,
        events: [],
        errors: [`Failed to parse Excel file: ${err?.message || 'Invalid format'}`],
        warnings: [],
      };
    }
  } else {
    try {
      const text = await file.text();
      return parseAndCleanseDisasterCsv(text);
    } catch (err: any) {
      return {
        success: false,
        importedCount: 0,
        events: [],
        errors: [`Failed to read CSV file: ${err?.message || 'Invalid format'}`],
        warnings: [],
      };
    }
  }
}

/**
 * Parses a single CSV row handling quotes and commas
 */
function parseCsvRow(line: string): string[] {
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
function resolveBarangay(input: string): { id: string; name: string } {
  const clean = input.toLowerCase().replace(/barangay|brgy\.?|\(.*?\)/g, '').trim();
  const match = BARANGAY_REGISTRY.find((b) => {
    const bClean = b.label.toLowerCase();
    return bClean === clean || b.id === clean || bClean.includes(clean) || clean.includes(bClean);
  });

  if (match) {
    return { id: match.id, name: match.label };
  }
  return { id: clean.replace(/\s+/g, '-'), name: input.trim() };
}

/**
 * Cleanses numbers removing commas and invalid characters
 */
function parseNumberClean(value: any, fallback: number = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const str = String(value).replace(/,/g, '').trim();
  const parsed = Number(str);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Normalizes hazard string
 */
function normalizeHazard(hazard: string): DisasterHazardType {
  const h = hazard.toLowerCase();
  if (h.includes('flood') || h.includes('baha') || h.includes('rain') || h.includes('shear')) return 'flashflood';
  if (h.includes('typhoon') || h.includes('bagyo') || h.includes('wind') || h.includes('storm')) return 'typhoon';
  if (h.includes('landslide') || h.includes('slide') || h.includes('debris') || h.includes('slope')) return 'landslide';
  if (h.includes('quake') || h.includes('linog') || h.includes('tremor') || h.includes('earthquake')) return 'earthquake';
  return 'flashflood';
}

/**
 * Normalizes severity level
 */
function normalizeSeverity(severity: string): 'low' | 'moderate' | 'severe' | 'critical' {
  const s = severity.toLowerCase();
  if (s.includes('crit') || s.includes('calamity') || s.includes('state') || s.includes('4')) return 'critical';
  if (s.includes('sev') || s.includes('high') || s.includes('alert 3') || s.includes('3')) return 'severe';
  if (s.includes('mod') || s.includes('alert 2') || s.includes('2')) return 'moderate';
  return 'low';
}

/**
 * Main parser and cleansing function
 */
export function parseAndCleanseDisasterCsv(csvContent: string): ImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const events: HistoricalDisasterEvent[] = [];

  if (!csvContent || typeof csvContent !== 'string') {
    return {
      success: false,
      importedCount: 0,
      events: [],
      errors: ['Empty or invalid CSV content provided.'],
      warnings: [],
    };
  }

  const rawLines = csvContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (rawLines.length < 2) {
    return {
      success: false,
      importedCount: 0,
      events: [],
      errors: ['CSV must have at least a header line and 1 row of data.'],
      warnings: [],
    };
  }

  // Parse header and map column indices
  const headerCols = parseCsvRow(rawLines[0]).map((h) => h.toLowerCase().replace(/[\s_()\-]/g, ''));

  const findCol = (keywords: string[]): number => {
    return headerCols.findIndex((col) => keywords.some((k) => col.includes(k)));
  };

  const idxEvent = findCol(['event', 'disaster', 'calamity', 'incident']);
  const idxDate = findCol(['date', 'petsa']);
  const idxBrgy = findCol(['barangay', 'brgy', 'location']);
  const idxHazard = findCol(['hazard', 'type', 'klase']);
  const idxSeverity = findCol(['severity', 'level', 'signal']);
  const idxHH = findCol(['household', 'hh', 'balay', 'pamilya']);
  const idxFam = findCol(['families', 'family']);
  const idxDays = findCol(['days', 'adlaw', 'displacement', 'duration']);
  const idxActualFFP = findCol(['actualffp', 'ffp', 'foodpack', 'pack']);
  const idxKitchen = findCol(['kitchen', 'cook']);
  const idxHygiene = findCol(['hygiene']);
  const idxNotes = findCol(['note', 'remark', 'desc']);

  if (idxBrgy === -1) {
    errors.push('Missing required column: "Barangay".');
  }
  if (idxActualFFP === -1 && idxHH === -1) {
    errors.push('Missing required columns: Either "Affected Households" or "Actual FFPs" must be provided.');
  }

  if (errors.length > 0) {
    return { success: false, importedCount: 0, events: [], errors, warnings };
  }

  // Process data rows
  for (let i = 1; i < rawLines.length; i++) {
    const line = rawLines[i];
    const row = parseCsvRow(line);

    // Skip empty lines
    if (row.length === 0 || row.every((val) => val === '')) continue;

    const rowNum = i + 1;
    const rawBrgy = row[idxBrgy] || '';
    if (!rawBrgy) {
      warnings.push(`Row ${rowNum}: Skipped due to missing Barangay name.`);
      continue;
    }

    const brgyResolved = resolveBarangay(rawBrgy);
    const eventName = idxEvent !== -1 && row[idxEvent] ? row[idxEvent] : `MSWDO Relief Event in ${brgyResolved.name}`;
    const dateStr = idxDate !== -1 && row[idxDate] ? row[idxDate].trim().split(' ')[0] : new Date().toISOString().slice(0, 10);
    const hazardType = idxHazard !== -1 && row[idxHazard] ? normalizeHazard(row[idxHazard]) : 'flashflood';
    const severityLevel = idxSeverity !== -1 && row[idxSeverity] ? normalizeSeverity(row[idxSeverity]) : 'moderate';

    // Cleansing and number conversions
    let affectedHH = idxHH !== -1 ? parseNumberClean(row[idxHH], 0) : 0;
    let actualFFPs = idxActualFFP !== -1 ? parseNumberClean(row[idxActualFFP], 0) : 0;

    // Auto-cleansing rule: if households is missing, deduce from actual FFPs (3 packs per HH)
    if (affectedHH <= 0 && actualFFPs > 0) {
      affectedHH = Math.max(1, Math.round(actualFFPs / 3));
      warnings.push(`Row ${rowNum}: Deduced ${affectedHH} households from ${actualFFPs} packs using 3-to-1 ratio.`);
    }

    // Auto-cleansing rule: if actual FFPs is missing, estimate from households * 3
    if (actualFFPs <= 0 && affectedHH > 0) {
      actualFFPs = affectedHH * 3;
      warnings.push(`Row ${rowNum}: Set ${actualFFPs} FFPs based on standard 3 packs per HH.`);
    }

    // Families count using MSWDO 3 families per HH rule
    let families = idxFam !== -1 ? parseNumberClean(row[idxFam], 0) : 0;
    if (families <= 0) {
      families = affectedHH * 3;
    }

    const displacementDays = idxDays !== -1 ? parseNumberClean(row[idxDays], 2) : 2;
    const kitchenSets = idxKitchen !== -1 ? parseNumberClean(row[idxKitchen], Math.round(affectedHH * 0.6)) : Math.round(affectedHH * 0.6);
    const hygieneKits = idxHygiene !== -1 ? parseNumberClean(row[idxHygiene], affectedHH) : affectedHH;
    const notes = idxNotes !== -1 && row[idxNotes] ? row[idxNotes] : `Uploaded record for ${brgyResolved.name}`;

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
      displacementDays,
      vulnerability: {
        seniorsCount: Math.round(affectedHH * 0.35),
        pwdsCount: Math.round(affectedHH * 0.1),
        infantsCount: Math.round(affectedHH * 0.2),
        lactatingMothersCount: Math.round(affectedHH * 0.15),
      },
      actualDistributed: {
        familyFoodPacks: actualFFPs,
        kitchenSets,
        hygieneKits,
        infantCarePacks: Math.round(affectedHH * 0.2),
        seniorCarePacks: Math.round(affectedHH * 0.35),
      },
      notes,
    });
  }

  return {
    success: events.length > 0,
    importedCount: events.length,
    events,
    errors,
    warnings,
  };
}
