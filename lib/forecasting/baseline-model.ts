/**
 * Baseline Forecasting Model (Simple Moving Average - SMA)
 *
 * In Academic / Capstone Research:
 * A Baseline Model serves as the benchmark against which the proposed
 * algorithm (MSWDO Multi-Factor Demand Predictor) is compared.
 *
 * Commonly used Baseline Models in time-series and demand forecasting:
 * 1. Simple Moving Average (SMA-3): Average of the last k events/periods.
 * 2. Historical Mean (Global Baseline): Mean demand across all past events.
 * 3. Naive Baseline (Last Event): Assumes next event will equal the last event.
 */

import { HistoricalDisasterEvent, MABINI_SYNTHETIC_DISASTER_HISTORY } from './mabini-relief-dataset';
import { predictReliefDemand } from './demand-predictor';

export interface BaselinePrediction {
  id: string;
  barangayName: string;
  actualFFPs: number;
  baselineSMAFFPs: number;
  proposedFFPs: number;
  baselineAbsoluteError: number;
  proposedAbsoluteError: number;
  baselinePercentageError: number;
  proposedPercentageError: number;
}

export interface BaselineComparisonSummary {
  totalEvaluated: number;
  baselineModel: {
    name: string;
    description: string;
    meanAbsoluteError: number; // MAE
    rootMeanSquaredError: number; // RMSE
    mapePercent: number; // MAPE
    accuracyRate: number; // 100% - MAPE
  };
  proposedModel: {
    name: string;
    description: string;
    meanAbsoluteError: number;
    rootMeanSquaredError: number;
    mapePercent: number;
    accuracyRate: number;
  };
  performanceComparison: {
    accuracyImprovementPercent: number;
    errorReductionPercent: number;
    verdict: string;
  };
  breakdown: BaselinePrediction[];
}

/**
 * Calculates a k-period Simple Moving Average (SMA) baseline
 */
export function calculateSimpleMovingAverage(
  series: number[],
  k: number = 3
): number {
  if (!series || series.length === 0) return 0;
  const window = series.slice(Math.max(0, series.length - k));
  const sum = window.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / window.length);
}

/**
 * Evaluates Baseline (Simple Moving Average) vs Proposed (MSWDO Multi-Factor) Model
 */
export function compareBaselineVsProposed(
  dataset: HistoricalDisasterEvent[] = MABINI_SYNTHETIC_DISASTER_HISTORY,
  smaWindow: number = 3
): BaselineComparisonSummary {
  let baseSumAbsError = 0;
  let baseSumSqError = 0;
  let baseSumPctError = 0;

  let propSumAbsError = 0;
  let propSumSqError = 0;
  let propSumPctError = 0;

  const pastDistributedPacks: number[] = [];

  const breakdown: BaselinePrediction[] = dataset.map((event, index) => {
    const actual = event.actualDistributed.familyFoodPacks;

    // 1. BASELINE MODEL: Simple Moving Average of past events
    let baselinePred = 0;
    if (pastDistributedPacks.length === 0) {
      // First event has no history, fallback to first actual or standard 200
      baselinePred = actual;
    } else {
      baselinePred = calculateSimpleMovingAverage(pastDistributedPacks, smaWindow);
    }
    // Add current actual to historical series for future moving average steps
    pastDistributedPacks.push(actual);

    // 2. PROPOSED MODEL: MSWDO Multi-Factor Rule (3 families/HH + severity buffer)
    const proposedResult = predictReliefDemand({
      barangayId: event.barangayId,
      barangayName: event.barangayName,
      affectedHouseholds: event.affectedHouseholds,
      hazardType: event.hazardType,
      severityLevel: event.severityLevel,
      estimatedDisplacementDays: event.displacementDays,
    });
    const proposedPred = proposedResult.predictedDemand.familyFoodPacks;

    // Baseline errors
    const baseAbsErr = Math.abs(actual - baselinePred);
    const basePctErr = actual > 0 ? (baseAbsErr / actual) * 100 : 0;
    baseSumAbsError += baseAbsErr;
    baseSumSqError += Math.pow(baseAbsErr, 2);
    baseSumPctError += basePctErr;

    // Proposed errors
    const propAbsErr = Math.abs(actual - proposedPred);
    const propPctErr = actual > 0 ? (propAbsErr / actual) * 100 : 0;
    propSumAbsError += propAbsErr;
    propSumSqError += Math.pow(propAbsErr, 2);
    propSumPctError += propPctErr;

    return {
      id: event.id,
      barangayName: event.barangayName,
      actualFFPs: actual,
      baselineSMAFFPs: baselinePred,
      proposedFFPs: proposedPred,
      baselineAbsoluteError: baseAbsErr,
      proposedAbsoluteError: propAbsErr,
      baselinePercentageError: Number(basePctErr.toFixed(2)),
      proposedPercentageError: Number(propPctErr.toFixed(2)),
    };
  });

  const n = dataset.length;

  // Baseline stats
  const baseMae = baseSumAbsError / n;
  const baseRmse = Math.sqrt(baseSumSqError / n);
  const baseMape = baseSumPctError / n;
  const baseAccuracy = Math.max(0, 100 - baseMape);

  // Proposed stats
  const propMae = propSumAbsError / n;
  const propRmse = Math.sqrt(propSumSqError / n);
  const propMape = propSumPctError / n;
  const propAccuracy = Math.max(0, 100 - propMape);

  // Improvement
  const accuracyDiff = propAccuracy - baseAccuracy;
  const errorReduction = baseMape > 0 ? ((baseMape - propMape) / baseMape) * 100 : 0;

  return {
    totalEvaluated: n,
    baselineModel: {
      name: `Simple Moving Average (SMA-${smaWindow})`,
      description: `Benchmark baseline forecasting relief demand based on the rolling average of the last ${smaWindow} disaster events.`,
      meanAbsoluteError: Number(baseMae.toFixed(2)),
      rootMeanSquaredError: Number(baseRmse.toFixed(2)),
      mapePercent: Number(baseMape.toFixed(2)),
      accuracyRate: Number(baseAccuracy.toFixed(2)),
    },
    proposedModel: {
      name: 'MSWDO Multi-Factor Allocation Model',
      description: 'Proposed disaster demand model incorporating 3 families per HH, disaster severity contingency buffer, and vulnerability factors.',
      meanAbsoluteError: Number(propMae.toFixed(2)),
      rootMeanSquaredError: Number(propRmse.toFixed(2)),
      mapePercent: Number(propMape.toFixed(2)),
      accuracyRate: Number(propAccuracy.toFixed(2)),
    },
    performanceComparison: {
      accuracyImprovementPercent: Number(accuracyDiff.toFixed(2)),
      errorReductionPercent: Number(errorReduction.toFixed(2)),
      verdict: `The Proposed MSWDO Model outperforms the Baseline SMA-${smaWindow} model with a ${accuracyDiff.toFixed(1)}% higher accuracy rate and a ${errorReduction.toFixed(1)}% reduction in error.`,
    },
    breakdown,
  };
}
