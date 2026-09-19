/**
 * Standard Forecasting Accuracy Evaluation Metrics
 *
 * Implements standard statistical verification formulas:
 * 1. MAPE (Mean Absolute Percentage Error): (1/n) * SUM(|Actual - Forecast| / Actual) * 100%
 * 2. Accuracy Rate (%): 100% - MAPE
 * 3. MAE (Mean Absolute Error): (1/n) * SUM(|Actual - Forecast|)
 * 4. RMSE (Root Mean Squared Error): SQRT((1/n) * SUM((Actual - Forecast)^2))
 */

import { HistoricalDisasterEvent, MABINI_SYNTHETIC_DISASTER_HISTORY } from './mabini-relief-dataset';
import { predictReliefDemand, ForecastDemandResult } from './demand-predictor';

export interface EventEvaluationMetric {
  id: string;
  barangayName: string;
  eventName: string;
  hazardType: string;
  severityLevel: string;
  affectedHouseholds: number;
  actualFFPs: number;
  predictedFFPs: number;
  absoluteError: number;
  percentageError: number;
  accuracyPercent: number;
}

export interface ModelAccuracyReport {
  totalEvaluatedEvents: number;
  totalActualPacks: number;
  totalPredictedPacks: number;
  meanAbsoluteError: number; // MAE
  rootMeanSquaredError: number; // RMSE
  meanAbsolutePercentageError: number; // MAPE in %
  overallAccuracyRate: number; // 100% - MAPE
  interpretation: string;
  eventBreakdown: EventEvaluationMetric[];
}

/**
 * Computes MAPE, MAE, RMSE and Accuracy % across historical disaster events
 */
export function evaluateForecastingAccuracy(
  dataset: HistoricalDisasterEvent[] = MABINI_SYNTHETIC_DISASTER_HISTORY
): ModelAccuracyReport {
  if (!dataset || dataset.length === 0) {
    return {
      totalEvaluatedEvents: 0,
      totalActualPacks: 0,
      totalPredictedPacks: 0,
      meanAbsoluteError: 0,
      rootMeanSquaredError: 0,
      meanAbsolutePercentageError: 0,
      overallAccuracyRate: 0,
      interpretation: 'No historical events provided for evaluation.',
      eventBreakdown: [],
    };
  }

  let sumAbsoluteError = 0;
  let sumSquaredError = 0;
  let sumPercentageError = 0;
  let totalActual = 0;
  let totalPredicted = 0;

  const eventBreakdown: EventEvaluationMetric[] = dataset.map((event) => {
    // Run prediction using the model
    const forecast: ForecastDemandResult = predictReliefDemand({
      barangayId: event.barangayId,
      barangayName: event.barangayName,
      affectedHouseholds: event.affectedHouseholds,
      hazardType: event.hazardType,
      severityLevel: event.severityLevel,
      estimatedDisplacementDays: event.displacementDays,
      vulnerabilityData: {
        seniorsCount: event.vulnerability.seniorsCount,
        pwdsCount: event.vulnerability.pwdsCount,
        infantsCount: event.vulnerability.infantsCount,
        lactatingMothersCount: event.vulnerability.lactatingMothersCount,
      },
    });

    const actual = event.actualDistributed.familyFoodPacks;
    const predicted = forecast.predictedDemand.familyFoodPacks;

    const absError = Math.abs(actual - predicted);
    const pctError = actual > 0 ? (absError / actual) * 100 : 0;
    const itemAccuracy = Math.max(0, 100 - pctError);

    sumAbsoluteError += absError;
    sumSquaredError += Math.pow(absError, 2);
    sumPercentageError += pctError;
    totalActual += actual;
    totalPredicted += predicted;

    return {
      id: event.id,
      barangayName: event.barangayName,
      eventName: event.eventName,
      hazardType: event.hazardType,
      severityLevel: event.severityLevel,
      affectedHouseholds: event.affectedHouseholds,
      actualFFPs: actual,
      predictedFFPs: predicted,
      absoluteError: absError,
      percentageError: Number(pctError.toFixed(2)),
      accuracyPercent: Number(itemAccuracy.toFixed(2)),
    };
  });

  const n = dataset.length;
  const mae = sumAbsoluteError / n;
  const rmse = Math.sqrt(sumSquaredError / n);
  const mape = sumPercentageError / n;
  const overallAccuracy = Math.max(0, 100 - mape);

  let interpretation = '';
  if (mape <= 10) {
    interpretation = 'High Forecasting Accuracy (MAPE <= 10%). Highly reliable for LGU prepositioning and MSWDO relief mobilization.';
  } else if (mape <= 20) {
    interpretation = 'Good Forecasting Accuracy (10% < MAPE <= 20%). Acceptable for contingency buffer planning.';
  } else {
    interpretation = 'Needs Calibration (MAPE > 20%). Contingency buffer adjustments recommended.';
  }

  return {
    totalEvaluatedEvents: n,
    totalActualPacks: totalActual,
    totalPredictedPacks: totalPredicted,
    meanAbsoluteError: Number(mae.toFixed(2)),
    rootMeanSquaredError: Number(rmse.toFixed(2)),
    meanAbsolutePercentageError: Number(mape.toFixed(2)),
    overallAccuracyRate: Number(overallAccuracy.toFixed(2)),
    interpretation,
    eventBreakdown,
  };
}
