/**
 * Compression, File Sizing, and Formatting Utilities for MSWDO Disaster Dataset Uploads
 */

import { HistoricalDisasterEvent } from './mabini-relief-dataset';

export const MAX_FORECASTING_FILE_SIZE_MB = 10;
export const MAX_FORECASTING_FILE_SIZE_BYTES = MAX_FORECASTING_FILE_SIZE_MB * 1024 * 1024;

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  sizeBytes: number;
  sizeFormatted: string;
  limitFormatted: string;
}

export interface CompressionResult {
  originalSizeBytes: number;
  compressedSizeBytes: number;
  savedPercentage: number;
  compressedBase64: string;
}

export interface DatasetMetadataSummary {
  totalEvents: number;
  totalHouseholds: number;
  totalFamilies: number;
  totalActualFFPs: number;
  hazardsBreakdown: Record<string, number>;
  barangaysCovered: string[];
  dateRange: {
    earliest: string;
    latest: string;
  };
}

/**
 * Format raw bytes into human-readable representation (e.g. "450 KB", "2.4 MB")
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const idx = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, idx)).toFixed(dm))} ${sizes[idx]}`;
}

/**
 * Validates that the uploaded file does not exceed the allowed size limit (default 10 MB)
 */
export function validateDatasetFile(file: File, maxMb: number = MAX_FORECASTING_FILE_SIZE_MB): FileValidationResult {
  const maxBytes = maxMb * 1024 * 1024;
  const sizeFormatted = formatBytes(file.size);
  const limitFormatted = `${maxMb} MB`;

  if (file.size <= 0) {
    return {
      valid: false,
      error: 'The selected file is empty (0 bytes). Please select a valid Excel or CSV file.',
      sizeBytes: file.size,
      sizeFormatted,
      limitFormatted,
    };
  }

  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `File size exceeds the ${limitFormatted} limit (Selected: ${sizeFormatted}). Please select a file under ${limitFormatted}.`,
      sizeBytes: file.size,
      sizeFormatted,
      limitFormatted,
    };
  }

  // Extension check
  const fileName = file.name.toLowerCase();
  const validExtension = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv');
  if (!validExtension) {
    return {
      valid: false,
      error: 'Invalid file format. Only Microsoft Excel (.xlsx, .xls) and CSV (.csv) files are allowed.',
      sizeBytes: file.size,
      sizeFormatted,
      limitFormatted,
    };
  }

  return {
    valid: true,
    sizeBytes: file.size,
    sizeFormatted,
    limitFormatted,
  };
}

/**
 * Compresses any JSON-serializable payload into a base64 string using gzip
 */
export async function compressJsonPayload(payload: unknown): Promise<CompressionResult> {
  const jsonString = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(jsonString);
  const originalSizeBytes = rawBytes.byteLength;

  if (typeof CompressionStream !== 'undefined') {
    try {
      const stream = new Response(rawBytes).body?.pipeThrough(new CompressionStream('gzip'));
      if (stream) {
        const compressedArrayBuffer = await new Response(stream).arrayBuffer();
        const compressedBytes = new Uint8Array(compressedArrayBuffer);
        const compressedSizeBytes = compressedBytes.byteLength;
        const savedPercentage = originalSizeBytes > 0
          ? Math.max(0, Math.round((1 - compressedSizeBytes / originalSizeBytes) * 100))
          : 0;

        // Convert to base64
        let binary = '';
        for (let i = 0; i < compressedBytes.length; i++) {
          binary += String.fromCharCode(compressedBytes[i]);
        }
        const compressedBase64 = btoa(binary);

        return {
          originalSizeBytes,
          compressedSizeBytes,
          savedPercentage,
          compressedBase64,
        };
      }
    } catch {
      // Fallback if compression stream encounters issues
    }
  }

  // Fallback if CompressionStream is not available
  const base64 = btoa(unescape(encodeURIComponent(jsonString)));
  return {
    originalSizeBytes,
    compressedSizeBytes: base64.length,
    savedPercentage: 0,
    compressedBase64: base64,
  };
}

/**
 * Decompresses a base64 gzip string back into original JSON object
 */
export async function decompressJsonPayload<T = unknown>(compressedBase64: string): Promise<T> {
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const binary = atob(compressedBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const stream = new Response(bytes).body?.pipeThrough(new DecompressionStream('gzip'));
      if (stream) {
        const decompressedText = await new Response(stream).text();
        return JSON.parse(decompressedText) as T;
      }
    } catch {
      // Fallback to unescape/decode
    }
  }

  // Fallback
  const raw = decodeURIComponent(escape(atob(compressedBase64)));
  return JSON.parse(raw) as T;
}

/**
 * Generates an analytical summary of the dataset for quick overview in history
 */
export function calculateDatasetSummary(events: HistoricalDisasterEvent[]): DatasetMetadataSummary {
  let totalHouseholds = 0;
  let totalFamilies = 0;
  let totalActualFFPs = 0;
  const hazardsBreakdown: Record<string, number> = {};
  const barangaySet = new Set<string>();
  const dates: string[] = [];

  for (const event of events) {
    totalHouseholds += event.affectedHouseholds || 0;
    totalFamilies += event.affectedFamilies || 0;
    totalActualFFPs += event.actualDistributed?.familyFoodPacks || 0;

    const hazard = event.hazardType || 'other';
    hazardsBreakdown[hazard] = (hazardsBreakdown[hazard] || 0) + 1;

    if (event.barangayName) {
      barangaySet.add(event.barangayName);
    }

    if (event.date) {
      dates.push(event.date);
    }
  }

  dates.sort();

  return {
    totalEvents: events.length,
    totalHouseholds,
    totalFamilies,
    totalActualFFPs,
    hazardsBreakdown,
    barangaysCovered: Array.from(barangaySet),
    dateRange: {
      earliest: dates[0] || new Date().toISOString().slice(0, 10),
      latest: dates[dates.length - 1] || new Date().toISOString().slice(0, 10),
    },
  };
}
