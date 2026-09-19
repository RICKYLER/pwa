/**
 * MSWDO Mabini Relief Demand Forecasting & Bodega Inventory Allocation Engine
 *
 * Operational Rules:
 * - 3 families per physical household (HH)
 * - 1 Family Food Pack (FFP) per family (3 FFPs per physical household)
 * - 1 FFP rations a typical family for up to 3 days
 * - 1 Kitchen / Cooking set per displaced physical household
 * - 2,000 FFPs baseline stockpile buffer in MDRRMO Bodega
 */

import { DisasterHazardType } from './mabini-relief-dataset';

export const MSWDO_CONSTANTS = {
  FAMILIES_PER_HOUSEHOLD: 3,
  FFP_PER_FAMILY: 1,
  FFP_RATION_DAYS: 3,
  KITCHEN_SETS_PER_HOUSEHOLD: 1,
  MDRRMO_BODEGA_STOCKPILE_BUFFER: 2000,
  REORDER_LEVEL_THRESHOLD: 500,
} as const;

export interface ForecastInputParameters {
  barangayId: string;
  barangayName?: string;
  affectedHouseholds: number;
  hazardType: DisasterHazardType;
  severityLevel: 'low' | 'moderate' | 'severe' | 'critical';
  distributionWaves?: number;
  estimatedDisplacementDays?: number;
  currentBodegaStockpile?: number;
  vulnerabilityData?: {
    seniorsCount?: number;
    pwdsCount?: number;
    infantsCount?: number;
    lactatingMothersCount?: number;
  };
}

export interface ForecastDemandResult {
  barangayId: string;
  barangayName: string;
  input: {
    affectedHouseholds: number;
    computedFamilies: number;
    hazardType: DisasterHazardType;
    severityLevel: 'low' | 'moderate' | 'severe' | 'critical';
    displacementDays: number;
  };
  predictedDemand: {
    familyFoodPacks: number;
    baseFoodPacks: number;
    contingencyBufferPacks: number;
    contingencyBufferRate: number;
    kitchenSets: number;
    hygieneKits: number;
    infantCarePacks: number;
    seniorCarePacks: number;
  };
  bodegaStatus: {
    currentStockpile: number;
    allocatedFromBodega: number;
    projectedRemaining: number;
    deficitAugmentationNeeded: number;
    isStockpileDepleted: boolean;
    isBelowReorderThreshold: boolean;
    requiresDswdAugmentation: boolean;
    operationalNote: string;
  };
}

/**
 * Contingency buffer factor depending on disaster severity
 */
export function getSeverityBufferRate(severity: 'low' | 'moderate' | 'severe' | 'critical'): number {
  switch (severity) {
    case 'low':
      return 0.02; // 2% buffer
    case 'moderate':
      return 0.035; // 3.5% buffer
    case 'severe':
      return 0.045; // 4.5% buffer
    case 'critical':
      return 0.06; // 6% buffer
  }
}

/**
 * Predicts relief goods demand according to MSWDO Mabini's 3-families-per-HH formula
 * and evaluates against the 2,000 FFP MDRRMO bodega stockpile.
 */
export function predictReliefDemand(params: ForecastInputParameters): ForecastDemandResult {
  const households = Math.max(0, Math.round(params.affectedHouseholds));
  // Rule: 3 families per household -> 3 FFPs per household
  const families = households * MSWDO_CONSTANTS.FAMILIES_PER_HOUSEHOLD;

  const displacementDays = Math.max(1, params.estimatedDisplacementDays ?? 2);
  const waves = Math.max(1, params.distributionWaves ?? 1);

  // Base FFP need for the relief distribution = (Families * 1 FFP) * waves
  const basePacks = families * MSWDO_CONSTANTS.FFP_PER_FAMILY * waves;

  // Contingency buffer based on disaster intensity
  const bufferRate = getSeverityBufferRate(params.severityLevel);
  const bufferPacks = Math.ceil(basePacks * bufferRate);
  const totalPredictedFFP = basePacks + bufferPacks;

  // Kitchen Sets: 1 set per affected physical household
  // Severely affected / relocated homes get kitchen sets
  const kitchenRatio = params.severityLevel === 'critical' ? 0.95 :
                       params.severityLevel === 'severe' ? 0.85 :
                       params.severityLevel === 'moderate' ? 0.55 : 0.40;
  const predictedKitchenSets = Math.round(households * kitchenRatio);

  // Hygiene kits: 1 kit per physical household
  const predictedHygieneKits = households;

  // Specialized vulnerability care kits
  const seniors = params.vulnerabilityData?.seniorsCount ?? Math.round(households * 0.38);
  const infants = params.vulnerabilityData?.infantsCount ?? Math.round(households * 0.25);

  // Bodega stockpile check against 2,000 buffer
  const stockpile = params.currentBodegaStockpile ?? MSWDO_CONSTANTS.MDRRMO_BODEGA_STOCKPILE_BUFFER;
  const allocated = Math.min(stockpile, totalPredictedFFP);
  const projectedRemaining = Math.max(0, stockpile - totalPredictedFFP);
  const deficit = Math.max(0, totalPredictedFFP - stockpile);

  const isBelowReorder = projectedRemaining < MSWDO_CONSTANTS.REORDER_LEVEL_THRESHOLD;
  const isDepleted = projectedRemaining === 0 && deficit > 0;
  const requiresAugmentation = deficit > 0;

  let note = 'MDRRMO Bodega stockpile is sufficient for initial response dispatch.';
  if (requiresAugmentation) {
    note = `CRITICAL DEFICIT: Predicted demand (${totalPredictedFFP} packs) exceeds available stockpile (${stockpile} packs). Immediate DSWD FO-XI augmentation required for ${deficit} FFPs.`;
  } else if (isBelowReorder) {
    note = `WARNING: Post-distribution stock (${projectedRemaining} packs) drops below ${MSWDO_CONSTANTS.REORDER_LEVEL_THRESHOLD} buffer threshold. Initiate monthly replenishment request.`;
  }

  return {
    barangayId: params.barangayId,
    barangayName: params.barangayName ?? params.barangayId,
    input: {
      affectedHouseholds: households,
      computedFamilies: families,
      hazardType: params.hazardType,
      severityLevel: params.severityLevel,
      displacementDays,
    },
    predictedDemand: {
      familyFoodPacks: totalPredictedFFP,
      baseFoodPacks: basePacks,
      contingencyBufferPacks: bufferPacks,
      contingencyBufferRate: bufferRate,
      kitchenSets: predictedKitchenSets,
      hygieneKits: predictedHygieneKits,
      infantCarePacks: infants,
      seniorCarePacks: seniors,
    },
    bodegaStatus: {
      currentStockpile: stockpile,
      allocatedFromBodega: allocated,
      projectedRemaining,
      deficitAugmentationNeeded: deficit,
      isStockpileDepleted: isDepleted,
      isBelowReorderThreshold: isBelowReorder,
      requiresDswdAugmentation: requiresAugmentation,
      operationalNote: note,
    },
  };
}
