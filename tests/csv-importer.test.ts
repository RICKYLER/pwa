import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSampleCsvTemplate,
  parseAndCleanseDisasterCsv,
  buildExcelWorkbook,
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

test('4. Builds Excel workbook from disaster events with headers and correct row mapping', () => {
  const sampleEvents = [
    {
      id: 'e-1',
      eventName: 'Test Event Cadunan',
      date: '2024-04-01',
      barangayId: 'cadunan',
      barangayName: 'Cadunan',
      hazardType: 'flashflood' as const,
      severityLevel: 'moderate' as const,
      affectedHouseholds: 50,
      affectedFamilies: 150,
      displacementDays: 3,
      vulnerability: { seniorsCount: 5, pwdsCount: 2, infantsCount: 3, lactatingMothersCount: 2 },
      actualDistributed: { familyFoodPacks: 155, kitchenSets: 25, hygieneKits: 50, infantCarePacks: 0, seniorCarePacks: 0 },
      notes: 'Road flooded',
    },
  ];

  const wb = buildExcelWorkbook(sampleEvents);
  assert.ok(wb.SheetNames.includes('Disaster Data'));
  const sheet = wb.Sheets['Disaster Data'];
  assert.ok(sheet);

  // Check columns and values
  assert.equal(sheet['A1'].v, 'Event Name');
  assert.equal(sheet['A2'].v, 'Test Event Cadunan');
  assert.equal(sheet['C2'].v, 'Cadunan');
  assert.equal(sheet['F2'].v, 50);
  assert.equal(sheet['G2'].v, 150);
  assert.equal(sheet['I2'].v, 155);
  assert.equal(sheet['L2'].v, 'Road flooded');
});

