import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDatasetFile,
  formatBytes,
  compressJsonPayload,
  decompressJsonPayload,
  compressDisasterDataset,
  calculateDatasetSummary,
  MAX_FORECASTING_FILE_SIZE_MB,
} from '../lib/forecasting/compression-helper';
import { restoreRecordDataset, ForecastingUploadRecord } from '../lib/forecasting/forecasting-upload-store';
import { HistoricalDisasterEvent } from '../lib/forecasting/mabini-relief-dataset';

test('1. Validates dataset file size limits and extensions', () => {
  // Test valid CSV under 10MB
  const smallCsv = new File(['Col1,Col2\nVal1,Val2'], 'disaster_data.csv', { type: 'text/csv' });
  const resultValid = validateDatasetFile(smallCsv, MAX_FORECASTING_FILE_SIZE_MB);
  assert.equal(resultValid.valid, true);
  assert.equal(resultValid.limitFormatted, '10 MB');

  // Test empty file (0 bytes)
  const emptyFile = new File([], 'empty.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const resultEmpty = validateDatasetFile(emptyFile, MAX_FORECASTING_FILE_SIZE_MB);
  assert.equal(resultEmpty.valid, false);
  assert.ok(resultEmpty.error?.includes('empty'));

  // Test invalid extension
  const invalidExtFile = new File(['dummy content'], 'report.pdf', { type: 'application/pdf' });
  const resultInvalidExt = validateDatasetFile(invalidExtFile, MAX_FORECASTING_FILE_SIZE_MB);
  assert.equal(resultInvalidExt.valid, false);
  assert.ok(resultInvalidExt.error?.includes('Invalid file format'));

  // Test file exceeding 10MB limit (simulate large size using Blob slice or mock)
  const fakeLargeFile = {
    name: 'huge_disaster_log.xlsx',
    size: 11 * 1024 * 1024, // 11 MB
  } as unknown as File;

  const resultExceeded = validateDatasetFile(fakeLargeFile, 10);
  assert.equal(resultExceeded.valid, false);
  assert.ok(resultExceeded.error?.includes('exceeds the 10 MB limit'));
});

test('2. Formats bytes into human-readable representation correctly', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1 KB');
  assert.equal(formatBytes(1048576), '1 MB');
  assert.equal(formatBytes(2.5 * 1024 * 1024), '2.5 MB');
  assert.equal(formatBytes(500 * 1024), '500 KB');
});

test('3. Compresses and decompresses disaster dataset payload', async () => {
  const sampleEvents: Partial<HistoricalDisasterEvent>[] = [
    {
      id: 'test-1',
      eventName: '2023 Heavy Rain Inundation',
      date: '2023-01-15',
      barangayId: 'cadunan',
      barangayName: 'Cadunan',
      hazardType: 'flashflood',
      severityLevel: 'moderate',
      affectedHouseholds: 75,
      affectedFamilies: 225,
      displacementDays: 2,
      actualDistributed: {
        familyFoodPacks: 232,
        kitchenSets: 40,
        hygieneKits: 75,
        infantCarePacks: 15,
        seniorCarePacks: 20,
      },
      notes: 'Flooding in rice fields',
    },
    {
      id: 'test-2',
      eventName: '2024 Monsoon Storm Surge',
      date: '2024-02-02',
      barangayId: 'pindasan',
      barangayName: 'Pindasan',
      hazardType: 'typhoon',
      severityLevel: 'moderate',
      affectedHouseholds: 60,
      affectedFamilies: 180,
      displacementDays: 2,
      actualDistributed: {
        familyFoodPacks: 186,
        kitchenSets: 35,
        hygieneKits: 60,
        infantCarePacks: 10,
        seniorCarePacks: 15,
      },
      notes: 'Coastal purok relief',
    },
  ];

  const compression = await compressJsonPayload(sampleEvents);
  assert.ok(compression.originalSizeBytes > 0);
  assert.ok(compression.compressedBase64.length > 0);

  const decompressed = await decompressJsonPayload<HistoricalDisasterEvent[]>(compression.compressedBase64);
  assert.equal(decompressed.length, 2);
  assert.equal(decompressed[0].eventName, '2023 Heavy Rain Inundation');
  assert.equal(decompressed[1].barangayName, 'Pindasan');
});

test('4. Calculates dataset summary metadata accurately', () => {
  const events: HistoricalDisasterEvent[] = [
    {
      id: 'e-1',
      eventName: 'Event 1',
      date: '2023-01-15',
      barangayId: 'cadunan',
      barangayName: 'Cadunan',
      hazardType: 'flashflood',
      severityLevel: 'moderate',
      affectedHouseholds: 75,
      affectedFamilies: 225,
      displacementDays: 2,
      vulnerability: { seniorsCount: 10, pwdsCount: 5, infantsCount: 5, lactatingMothersCount: 5 },
      actualDistributed: { familyFoodPacks: 232, kitchenSets: 40, hygieneKits: 75, infantCarePacks: 0, seniorCarePacks: 0 },
      notes: '',
    },
    {
      id: 'e-2',
      eventName: 'Event 2',
      date: '2024-03-12',
      barangayId: 'golden-valley',
      barangayName: 'Golden Valley',
      hazardType: 'landslide',
      severityLevel: 'critical',
      affectedHouseholds: 145,
      affectedFamilies: 435,
      displacementDays: 5,
      vulnerability: { seniorsCount: 20, pwdsCount: 8, infantsCount: 12, lactatingMothersCount: 10 },
      actualDistributed: { familyFoodPacks: 460, kitchenSets: 140, hygieneKits: 145, infantCarePacks: 0, seniorCarePacks: 0 },
      notes: '',
    },
  ];

  const summary = calculateDatasetSummary(events);
  assert.equal(summary.totalEvents, 2);
  assert.equal(summary.totalHouseholds, 220);
  assert.equal(summary.totalFamilies, 660);
  assert.equal(summary.totalActualFFPs, 692);
  assert.equal(summary.hazardsBreakdown.flashflood, 1);
  assert.equal(summary.hazardsBreakdown.landslide, 1);
  assert.equal(summary.barangaysCovered.length, 2);
  assert.ok(summary.barangaysCovered.includes('Cadunan'));
  assert.ok(summary.barangaysCovered.includes('Golden Valley'));
  assert.equal(summary.dateRange.earliest, '2023-01-15');
  assert.equal(summary.dateRange.latest, '2024-03-12');
});

test('5. compressDisasterDataset heavily compresses 500 records by over 75%', async () => {
  // Generate 500 records representing a large disaster assessment file
  const largeEvents: HistoricalDisasterEvent[] = [];
  const rawRows: (string | number)[][] = [];
  const rawHeaders = ['Barangay', 'Households', 'Families', 'Food Packs', 'Damage Notes'];

  for (let i = 0; i < 500; i++) {
    const brgy = i % 2 === 0 ? 'Cadunan' : 'Cuambog';
    largeEvents.push({
      id: `ev-${i}`,
      eventName: `October 2025 Earthquake Assessment Series - Phase ${i % 10}`,
      date: '2025-10-15',
      barangayId: brgy.toLowerCase(),
      barangayName: brgy,
      hazardType: 'earthquake',
      severityLevel: 'severe',
      affectedHouseholds: 50 + (i % 20),
      affectedFamilies: (50 + (i % 20)) * 3,
      displacementDays: 3,
      vulnerability: { seniorsCount: 15, pwdsCount: 5, infantsCount: 8, lactatingMothersCount: 6 },
      actualDistributed: { familyFoodPacks: 160, kitchenSets: 50, hygieneKits: 50, infantCarePacks: 8, seniorCarePacks: 15 },
      notes: `Detailed structural field inspection notes for Sitio ${i % 5} in Barangay ${brgy}`,
    });
    rawRows.push([brgy, 50 + (i % 20), (50 + (i % 20)) * 3, 160, `Sitio ${i % 5} inspection`]);
  }

  // Simulate an 8MB original file size
  const report = await compressDisasterDataset({
    events: largeEvents,
    rawHeaders,
    rawRows,
    originalFileSizeBytes: 8 * 1024 * 1024,
  });

  assert.ok(report.compressedSizeBytes < report.originalSizeBytes, 'Compressed size must be smaller than original');
  assert.ok(report.savedPercentage >= 75, `Expected >= 75% savings, got ${report.savedPercentage}%`);
  assert.ok(report.compressedPayload.length > 0);
  assert.ok(report.ratioString.includes('x smaller'));

  // Test transparent restoration from compressed payload
  const mockRecord: ForecastingUploadRecord = {
    id: 'fdu-test',
    file_name: 'LargeDisasterAssessment.xlsx',
    file_size_bytes: 8 * 1024 * 1024,
    compressed_size_bytes: report.compressedSizeBytes,
    file_type: 'xlsx',
    records_count: 500,
    accuracy_rate: 99.5,
    mape_percent: 0.5,
    mae_error: 1,
    uploaded_by: 'MSWDO Staff',
    uploaded_at: new Date().toISOString(),
    is_active: false,
    metadata: {},
    dataset_events: [], // Inactive record stripped of events to save localStorage
    raw_headers: rawHeaders,
    compressed_payload: report.compressedPayload,
  };

  const restored = await restoreRecordDataset(mockRecord);
  assert.equal(restored.events.length, 500);
  assert.equal(restored.rawRows?.length, 500);
  assert.equal(restored.events[0].eventName, 'October 2025 Earthquake Assessment Series - Phase 0');
});
