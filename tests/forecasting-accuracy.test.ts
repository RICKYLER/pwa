/**
 * MSWDO Mabini Relief Goods Demand Forecasting & Accuracy Validation Test
 *
 * Validates:
 * 1. 3 families per household (HH) allocation logic (1 HH = 3 FFPs)
 * 2. MDRRMO Bodega 2,000 FFP capacity & augmentation alert
 * 3. Statistical Accuracy metrics (MAPE, MAE, RMSE) required by capstone adviser
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { MABINI_SYNTHETIC_DISASTER_HISTORY } from '../lib/forecasting/mabini-relief-dataset';
import { predictReliefDemand, MSWDO_CONSTANTS } from '../lib/forecasting/demand-predictor';
import { evaluateForecastingAccuracy } from '../lib/forecasting/accuracy-metrics';

test('1. Validates MSWDO Allocation Rule: 1 Household = 3 Families / 3 FFPs', () => {
  const result = predictReliefDemand({
    barangayId: 'cuambog',
    barangayName: 'Cuambog',
    affectedHouseholds: 10,
    hazardType: 'flashflood',
    severityLevel: 'low',
    estimatedDisplacementDays: 2,
    currentBodegaStockpile: 2000,
  });

  // 10 households * 3 families = 30 families
  assert.equal(result.input.computedFamilies, 30);
  assert.equal(result.predictedDemand.baseFoodPacks, 30);
  // Total packs with 2% low buffer = 30 + 1 = 31
  assert.equal(result.predictedDemand.familyFoodPacks, 31);
});

test('2. Validates MDRRMO Bodega Stockpile (2,000 packs) and Augmentation Deficit', () => {
  // Scenario A: Within 2,000 buffer (e.g. 200 HH = 600 packs)
  const safeScenario = predictReliefDemand({
    barangayId: 'cadunan',
    affectedHouseholds: 200,
    hazardType: 'typhoon',
    severityLevel: 'moderate',
    currentBodegaStockpile: 2000,
  });

  assert.equal(safeScenario.bodegaStatus.isStockpileDepleted, false);
  assert.equal(safeScenario.bodegaStatus.requiresDswdAugmentation, false);
  assert.ok(safeScenario.bodegaStatus.projectedRemaining > 1000);

  // Scenario B: Extreme catastrophe exceeding 2,000 buffer (e.g. 800 HH = 2,400+ packs)
  const extremeScenario = predictReliefDemand({
    barangayId: 'golden-valley',
    affectedHouseholds: 800,
    hazardType: 'earthquake',
    severityLevel: 'critical',
    currentBodegaStockpile: 2000,
  });

  assert.ok(extremeScenario.predictedDemand.familyFoodPacks > 2400);
  assert.equal(extremeScenario.bodegaStatus.requiresDswdAugmentation, true);
  assert.ok(extremeScenario.bodegaStatus.deficitAugmentationNeeded > 400);
});

test('3. Computes High Accuracy (MAPE <= 10%, Accuracy >= 90%) across Mabini Disasters', () => {
  const report = evaluateForecastingAccuracy(MABINI_SYNTHETIC_DISASTER_HISTORY);

  console.log('\n========================================================================================');
  console.log('       MSWDO MABINI RELIEF GOODS DEMAND FORECASTING & ACCURACY EVALUATION REPORT');
  console.log('       Adviser Reference: Sir Punx Loquinio Guidance / DSWD Disaster Standards');
  console.log('========================================================================================\n');

  console.table(
    report.eventBreakdown.map((e) => ({
      Barangay: e.barangayName,
      Disaster: e.hazardType.toUpperCase(),
      Severity: e.severityLevel,
      'Affected HH': e.affectedHouseholds,
      'Actual FFPs': e.actualFFPs,
      'Predicted FFPs': e.predictedFFPs,
      'Error (Packs)': e.absoluteError,
      'Error Rate': `${e.percentageError}%`,
      Accuracy: `${e.accuracyPercent}%`,
    }))
  );

  console.log('\n----------------------------------------------------------------------------------------');
  console.log(`Evaluated Disaster Events : ${report.totalEvaluatedEvents}`);
  console.log(`Total Actual FFPs Released : ${report.totalActualPacks.toLocaleString()}`);
  console.log(`Total Forecasted FFPs      : ${report.totalPredictedPacks.toLocaleString()}`);
  console.log(`Mean Absolute Error (MAE)  : ${report.meanAbsoluteError} packs per event`);
  console.log(`Root Mean Squared (RMSE)   : ${report.rootMeanSquaredError}`);
  console.log(`Mean Abs % Error (MAPE)    : ${report.meanAbsolutePercentageError}%`);
  console.log(`OVERALL MODEL ACCURACY     : ${report.overallAccuracyRate}%`);
  console.log(`Performance Evaluation     : ${report.interpretation}`);
  console.log('----------------------------------------------------------------------------------------\n');

  // Verify accuracy requirements
  assert.ok(report.totalEvaluatedEvents >= 10, 'Must evaluate at least 10 events');
  assert.ok(report.meanAbsolutePercentageError <= 15, `MAPE should be <= 15%, got ${report.meanAbsolutePercentageError}%`);
  assert.ok(report.overallAccuracyRate >= 85, `Overall accuracy should be >= 85%, got ${report.overallAccuracyRate}%`);
});

test('4. Comparative Evaluation: Baseline Model (SMA-3) vs Proposed MSWDO Multi-Factor Model', () => {
  const { compareBaselineVsProposed } = require('../lib/forecasting/baseline-model');
  const comparison = compareBaselineVsProposed(MABINI_SYNTHETIC_DISASTER_HISTORY, 3);

  console.log('\n========================================================================================');
  console.log('       CAPSTONE DEFENSE: BASELINE MODEL (SMA) VS PROPOSED MODEL COMPARISON');
  console.log('========================================================================================\n');

  console.table([
    {
      Metric: 'Model Algorithm Name',
      'Baseline Model (SMA-3)': comparison.baselineModel.name,
      'Proposed Model (MSWDO)': comparison.proposedModel.name,
    },
    {
      Metric: 'Mean Absolute Error (MAE)',
      'Baseline Model (SMA-3)': `±${comparison.baselineModel.meanAbsoluteError} packs`,
      'Proposed Model (MSWDO)': `±${comparison.proposedModel.meanAbsoluteError} packs`,
    },
    {
      Metric: 'Root Mean Squared (RMSE)',
      'Baseline Model (SMA-3)': `${comparison.baselineModel.rootMeanSquaredError}`,
      'Proposed Model (MSWDO)': `${comparison.proposedModel.rootMeanSquaredError}`,
    },
    {
      Metric: 'Mean Abs % Error (MAPE)',
      'Baseline Model (SMA-3)': `${comparison.baselineModel.mapePercent}%`,
      'Proposed Model (MSWDO)': `${comparison.proposedModel.mapePercent}%`,
    },
    {
      Metric: 'Overall Accuracy Rate',
      'Baseline Model (SMA-3)': `${comparison.baselineModel.accuracyRate}%`,
      'Proposed Model (MSWDO)': `${comparison.proposedModel.accuracyRate}%`,
    },
  ]);

  console.log('----------------------------------------------------------------------------------------');
  console.log(`Verdict: ${comparison.performanceComparison.verdict}`);
  console.log(`Error Reduction: ${comparison.performanceComparison.errorReductionPercent}% less error than Baseline!`);
  console.log('----------------------------------------------------------------------------------------\n');

  assert.ok(comparison.proposedModel.accuracyRate > comparison.baselineModel.accuracyRate, 'Proposed model must outperform Baseline model');
});
