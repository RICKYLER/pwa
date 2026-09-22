import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateMultiAlgorithmLeaderboard,
  predictWithSelectedModel,
  predictWithHybridEnsemble,
  predictWithRandomForestML,
  predictWithMswdoRule,
} from '../lib/forecasting/multi-algorithm-engine';
import {
  computeCalculationSnapshot,
} from '../lib/forecasting/forecasting-upload-store';
import {
  MABINI_SYNTHETIC_DISASTER_HISTORY,
  MABINI_BENCHMARK_FIXTURE_EVENTS,
  HistoricalDisasterEvent,
} from '../lib/forecasting/mabini-relief-dataset';

test('Multi-Algorithm Leaderboard evaluates all 4 algorithms and ranks Hybrid Ensemble at the top', () => {
  // Test with empty dataset (default)
  const emptyLeaderboard = evaluateMultiAlgorithmLeaderboard([]);
  assert.equal(emptyLeaderboard.models.length, 4);
  assert.equal(emptyLeaderboard.recommendedModelId, 'hybrid_ensemble');

  // Test with benchmark fixtures
  const leaderboard = evaluateMultiAlgorithmLeaderboard(MABINI_BENCHMARK_FIXTURE_EVENTS);

  assert.equal(leaderboard.models.length, 4);
  assert.equal(leaderboard.recommendedModelId, 'hybrid_ensemble');

  const ensemble = leaderboard.models.find((m) => m.id === 'hybrid_ensemble');
  const ml = leaderboard.models.find((m) => m.id === 'random_forest_ml');
  const rule = leaderboard.models.find((m) => m.id === 'mswdo_rule_engine');
  const sma = leaderboard.models.find((m) => m.id === 'baseline_sma');

  assert.ok(ensemble, 'Ensemble model must be present');
  assert.ok(ml, 'Random Forest ML model must be present');
  assert.ok(rule, 'Rule Engine must be present');
  assert.ok(sma, 'Baseline SMA must be present');

  // Hybrid ensemble should have highest accuracy and lowest MAPE
  assert.ok(ensemble.accuracyRate >= ml.accuracyRate);
  assert.ok(ensemble.accuracyRate > sma.accuracyRate);
  assert.ok(ensemble.mapePercent <= sma.mapePercent);
});

test('predictWithSelectedModel returns valid ForecastDemandResult with all 4 model types', () => {
  const params = {
    barangayId: 'cuambog',
    barangayName: 'Cuambog',
    affectedHouseholds: 43,
    hazardType: 'earthquake' as const,
    severityLevel: 'critical' as const,
    currentBodegaStockpile: 2000,
  };

  const ensembleResult = predictWithSelectedModel('hybrid_ensemble', params);
  const mlResult = predictWithSelectedModel('random_forest_ml', params);
  const ruleResult = predictWithSelectedModel('mswdo_rule_engine', params);
  const smaResult = predictWithSelectedModel('baseline_sma', params);

  assert.ok(ensembleResult.predictedDemand.familyFoodPacks > 0);
  assert.ok(mlResult.predictedDemand.familyFoodPacks > 0);
  assert.ok(ruleResult.predictedDemand.familyFoodPacks > 0);
  assert.ok(smaResult.predictedDemand.familyFoodPacks > 0);

  // Bodega stockpile should decrement accordingly
  assert.equal(
    ensembleResult.bodegaStatus.projectedRemaining,
    2000 - ensembleResult.predictedDemand.familyFoodPacks
  );
});

test('computeCalculationSnapshot accurately computes MSWDO relief and housing metrics', () => {
  const mockEvents: HistoricalDisasterEvent[] = [
    {
      id: 'test-1',
      eventName: 'October 2025 Test Quake',
      date: '2025-10-13',
      hazardType: 'earthquake',
      severityLevel: 'critical',
      barangayId: 'cuambog',
      barangayName: 'Cuambog',
      affectedHouseholds: 43,
      affectedFamilies: 129, // 43 * 3
      displacementDays: 3,
      vulnerability: { seniorsCount: 10, pwdsCount: 3, infantsCount: 5, lactatingMothersCount: 4 },
      actualDistributed: { familyFoodPacks: 135, kitchenSets: 43, hygieneKits: 43, infantCarePacks: 5, seniorCarePacks: 10 },
      notes: 'Test note',
      damagedHousesDetail: { totally: 1, partially: 42 },
      damagedInfrastructureCount: 4,
    },
    {
      id: 'test-2',
      eventName: 'October 2025 Test Quake',
      date: '2025-10-13',
      hazardType: 'earthquake',
      severityLevel: 'severe',
      barangayId: 'anitapan',
      barangayName: 'Anitapan',
      affectedHouseholds: 5,
      affectedFamilies: 15, // 5 * 3
      displacementDays: 3,
      vulnerability: { seniorsCount: 2, pwdsCount: 1, infantsCount: 1, lactatingMothersCount: 1 },
      actualDistributed: { familyFoodPacks: 16, kitchenSets: 5, hygieneKits: 5, infantCarePacks: 1, seniorCarePacks: 2 },
      notes: 'Test note',
      damagedHousesDetail: { totally: 0, partially: 5 },
      damagedInfrastructureCount: 2,
    },
  ];

  const snapshot = computeCalculationSnapshot(mockEvents, {
    activeAlgorithm: 'hybrid_ensemble',
    bodegaBaseline: 2000,
  });

  // Total Houses: 43 + 5 = 48
  assert.equal(snapshot.totalHouses, 48);
  // Total Families: 129 + 15 = 144
  assert.equal(snapshot.totalFamilies, 144);
  // Total FFPs: 135 + 16 = 151
  assert.equal(snapshot.familyFoodPacks, 151);
  // Total Kitchen Sets = total physical households = 48
  assert.equal(snapshot.kitchenSets, 48);
  // Total Damaged Infra: 4 + 2 = 6
  assert.equal(snapshot.damagedInfrastructureCount, 6);
  // Emergency Shelter Assistance: (1 totally * 10,000) + (47 partially * 5,000) = 10,000 + 235,000 = 245,000
  assert.equal(snapshot.shelterAssistancePesos, 245000);
  // Bodega remaining: 2000 - 151 = 1849
  assert.equal(snapshot.bodegaRemaining, 1849);
});

test('Official October 2025 Mabini Earthquake sequence exists and aggregates 59 damaged houses', () => {
  const oct2025Events = MABINI_BENCHMARK_FIXTURE_EVENTS.filter((ev) =>
    ev.eventName.includes('October 2025 Mabini Earthquake Series')
  );

  assert.ok(oct2025Events.length >= 10, 'Expected multiple events across barangays and dates');

  const dates = Array.from(new Set(oct2025Events.map((e) => e.date))).sort();
  assert.deepEqual(dates, ['2025-10-10', '2025-10-11', '2025-10-13', '2025-10-15']);

  let totalTotally = 0;
  let totalPartially = 0;
  let totalHH = 0;
  let totalInfra = 0;

  for (const ev of oct2025Events) {
    totalHH += ev.affectedHouseholds;
    totalInfra += ev.damagedInfrastructureCount || 0;
    if (ev.damagedHousesDetail) {
      totalTotally += ev.damagedHousesDetail.totally;
      totalPartially += ev.damagedHousesDetail.partially;
    }
  }

  // Exact numbers from user's 9 sheets:
  // Totally: 1 (Cuambog)
  // Partially: 58 (42 Cuambog, 5 Anitapan, 3 Pangibiran, 3 Golden Valley, 2 Cabuyoan, 2 Del Pilar, 1 San Antonio)
  // Grand Total: 59 damaged houses
  assert.equal(totalTotally, 1);
  assert.equal(totalPartially, 58);
  assert.equal(totalHH, 59);
  assert.ok(totalInfra >= 25, `Expected at least 25 damaged infrastructures, got ${totalInfra}`);
});

test('parseAndCleanseMatrix handles real-world Excel sheets with title rows, custom columns, and preserves exact format', async () => {
  const { parseAndCleanseMatrix } = await import('../lib/forecasting/csv-importer');

  // Mock Excel matrix with 4 title rows preceding the actual header
  const mockMdrrmoDamageSheet = [
    ['REPUBLIC OF THE PHILIPPINES', ''],
    ['MUNICIPALITY OF MABINI - MDRRMO', ''],
    ['OFFICIAL SITUATIONAL REPORT NO. 2', ''],
    ['AS OF OCTOBER 10, 2025', ''],
    ['No.', 'Barangay', 'Totally Damaged', 'Partially Damaged', 'Total Damaged Houses', 'Infrastructure Damaged', 'Remarks'],
    [1, 'Cuambog', 1, 42, 43, 'Cuambog Elementary School, Water Reservoir', 'Ground rupture near purok 2'],
    [2, 'Anitapan', 0, 5, 5, 'Bridge approach scouring, Reservoir leak', 'Water supply interrupted'],
    [3, 'Golden Valley', 0, 3, 3, 'Panamin ES plaster cracks', 'Minor wall hairline'],
    ['TOTAL', '', 1, 50, 51, '', 'Summary of initial reports']
  ];

  const result = parseAndCleanseMatrix(mockMdrrmoDamageSheet, 'MDRRMO_SitRep_Oct10.xlsx');

  assert.equal(result.success, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.importedCount, 3); // 3 barangay data rows (TOTAL summary excluded from event count)
  assert.ok(result.rawHeaders, 'Must preserve raw headers');
  assert.ok(result.rawRows, 'Must preserve raw rows');
  assert.equal(result.rawHeaders[1], 'Barangay');
  assert.equal(result.rawHeaders[2], 'Totally Damaged');
  assert.equal(result.rawHeaders[3], 'Partially Damaged');

  // Verify event conversions
  const cuambog = result.events.find((e) => e.barangayId === 'cuambog');
  assert.ok(cuambog);
  assert.equal(cuambog.affectedHouseholds, 43);
  assert.equal(cuambog.affectedFamilies, 129); // 43 * 3
  assert.equal(cuambog.damagedHousesDetail?.totally, 1);
  assert.equal(cuambog.damagedHousesDetail?.partially, 42);
  assert.equal(cuambog.damagedInfrastructureCount, 2); // 2 comma-separated facilities
  assert.ok(cuambog.rawRowData, 'Raw row data should be preserved');
  assert.equal(cuambog.rawRowData['Barangay'], 'Cuambog');
});

test('parseAndCleanseMatrix does not crash on arbitrary column names (e.g. Location, Apektado, Hinabang)', async () => {
  const { parseAndCleanseMatrix } = await import('../lib/forecasting/csv-importer');

  const mockCustomSheet = [
    ['Location', 'Guba nga Balay', 'Hinabang Pack', 'Petsa'],
    ['Cadunan', 25, 75, '2025-10-11'],
    ['Pindasan', 10, 30, '2025-10-11'],
  ];

  const result = parseAndCleanseMatrix(mockCustomSheet, 'Custom_Damage.xlsx');

  assert.equal(result.success, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.importedCount, 2);
  assert.equal(result.rawHeaders?.length, 4);
  assert.equal(result.rawRows?.length, 2);

  const cadunan = result.events.find((e) => e.barangayId === 'cadunan');
  assert.ok(cadunan);
  assert.equal(cadunan.affectedHouseholds, 25);
  assert.equal(cadunan.affectedFamilies, 75); // 25 * 3
});

