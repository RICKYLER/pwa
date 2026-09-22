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
 * High-performance chunked Uint8Array to base64 conversion (avoids callstack/memory exhaustion on large 10MB+ buffers)
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000; // 32KB chunks
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

/**
 * High-performance chunked base64 to Uint8Array conversion
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface DatasetCompressionReport {
  originalSizeBytes: number;
  compressedSizeBytes: number;
  savedPercentage: number;
  ratioString: string;
  originalFormatted: string;
  compressedFormatted: string;
  compressedPayload: string;
}

/**
 * Compresses any JSON-serializable payload into a base64 string using gzip stream
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

        const compressedBase64 = uint8ArrayToBase64(compressedBytes);

        return {
          originalSizeBytes,
          compressedSizeBytes,
          savedPercentage,
          compressedBase64,
        };
      }
    } catch (err) {
      console.warn('[CompressionHelper] CompressionStream error, falling back:', err);
    }
  }

  // Node.js fallback
  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const zlib = await import('node:zlib');
      const compressedBuffer = zlib.gzipSync(Buffer.from(rawBytes));
      const compressedSizeBytes = compressedBuffer.byteLength;
      const savedPercentage = originalSizeBytes > 0
        ? Math.max(0, Math.round((1 - compressedSizeBytes / originalSizeBytes) * 100))
        : 0;
      return {
        originalSizeBytes,
        compressedSizeBytes,
        savedPercentage,
        compressedBase64: compressedBuffer.toString('base64'),
      };
    } catch {
      // Continue to raw fallback
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
  if (!compressedBase64) {
    throw new Error('Cannot decompress empty string');
  }

  try {
    const bytes = base64ToUint8Array(compressedBase64);

    if (typeof DecompressionStream !== 'undefined') {
      const stream = new Response(bytes).body?.pipeThrough(new DecompressionStream('gzip'));
      if (stream) {
        const decompressedText = await new Response(stream).text();
        return JSON.parse(decompressedText) as T;
      }
    }

    // Node.js fallback
    if (typeof process !== 'undefined' && process.versions?.node) {
      const zlib = await import('node:zlib');
      const decompressed = zlib.gunzipSync(Buffer.from(bytes)).toString('utf-8');
      return JSON.parse(decompressed) as T;
    }
  } catch (err) {
    console.warn('[CompressionHelper] Decompression stream error, attempting fallback:', err);
  }

  // Fallback if not gzipped
  try {
    const raw = decodeURIComponent(escape(atob(compressedBase64)));
    return JSON.parse(raw) as T;
  } catch {
    return JSON.parse(atob(compressedBase64)) as T;
  }
}

/**
 * High-level dataset compressor that packs events, raw headers, and raw rows
 * into a single heavily compressed binary payload (typically 75% to 92% reduction).
 */
export async function compressDisasterDataset(dataset: {
  events: HistoricalDisasterEvent[];
  rawHeaders?: string[];
  rawRows?: (string | number)[][] | null;
  originalFileSizeBytes?: number;
}): Promise<DatasetCompressionReport> {
  const payloadToCompress = {
    v: 1,
    events: dataset.events,
    rawHeaders: dataset.rawHeaders ?? [],
    rawRows: dataset.rawRows ?? [],
  };

  const compResult = await compressJsonPayload(payloadToCompress);
  const baselineSize = dataset.originalFileSizeBytes && dataset.originalFileSizeBytes > 0
    ? dataset.originalFileSizeBytes
    : compResult.originalSizeBytes;

  const savedPct = baselineSize > 0
    ? Math.max(0, Math.round((1 - compResult.compressedSizeBytes / baselineSize) * 100))
    : 0;

  const ratio = compResult.compressedSizeBytes > 0
    ? (baselineSize / compResult.compressedSizeBytes).toFixed(1)
    : '1.0';

  return {
    originalSizeBytes: baselineSize,
    compressedSizeBytes: compResult.compressedSizeBytes,
    savedPercentage: savedPct,
    ratioString: `${ratio}x smaller`,
    originalFormatted: formatBytes(baselineSize),
    compressedFormatted: formatBytes(compResult.compressedSizeBytes),
    compressedPayload: compResult.compressedBase64,
  };
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
