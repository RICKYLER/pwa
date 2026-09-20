import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDatasetFile,
  formatBytes,
  compressJsonPayload,
  decompressJsonPayload,
  calculateDatasetSummary,
  MAX_FORECASTING_FILE_SIZE_MB,
} from '../lib/forecasting/compression-helper';
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
