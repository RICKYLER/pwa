import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSampleCsvTemplate,
  parseAndCleanseDisasterCsv,
} from '../lib/forecasting/csv-importer';

test('1. Generates valid CSV template with correct MSWDO headers', () => {
  const template = generateSampleCsvTemplate();
  assert.ok(template.includes('Event Name'));
  assert.ok(template.includes('Barangay'));
  assert.ok(template.includes('Actual FFPs Distributed'));
  assert.ok(template.includes('Cadunan'));
});

test('2. Parses and cleanses raw CSV text into HistoricalDisasterEvent array', () => {
  const csvData = `Event Name,Date,Barangay,Hazard,Severity,Affected Households,Actual FFPs
"Severe Flood Cadunan",2024-01-20,Cadunan,flashflood,severe,100,310
"Landslide Golden Valley",2024-02-14,Golden Valley,landslide,critical,50,155
"Coastal High Tide",2024-03-01,Pindasan,typhoon,low,30,90`;

  const result = parseAndCleanseDisasterCsv(csvData);

  assert.equal(result.success, true);
  assert.equal(result.importedCount, 3);
  assert.equal(result.events[0].barangayId, 'cadunan');
  assert.equal(result.events[0].affectedHouseholds, 100);
  // Checked MSWDO 3 families per HH auto-computation
  assert.equal(result.events[0].affectedFamilies, 300);
  assert.equal(result.events[0].actualDistributed.familyFoodPacks, 310);
});

test('3. Handles missing columns and cleanses numbers with commas (e.g. "1,200")', () => {
  const dirtyCsv = `Barangay,Hazard,Affected Households,Actual FFPs
"Brgy. Cuambog",Baha,"1,200","3,600"`;

  const result = parseAndCleanseDisasterCsv(dirtyCsv);

  assert.equal(result.success, true);
  assert.equal(result.events[0].barangayId, 'cuambog');
  assert.equal(result.events[0].affectedHouseholds, 1200);
  assert.equal(result.events[0].actualDistributed.familyFoodPacks, 3600);
  assert.equal(result.events[0].hazardType, 'flashflood');
});
