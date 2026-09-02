// Risk scoring for the vulnerability module.
//
// The MSWDO census tracks several vulnerability flags. Some are derived
// automatically (age category, low income); others are entered by a health
// worker (PWD, pregnancy, chronic illness). This module turns the flags into a
// single severity-weighted score and a High/Medium/Low risk tier, plus
// auto-suggestions for flags that still need human confirmation.
//
// All functions here are pure — the score/tier/suggestions are recomputed on
// read, so they are always fresh after any data change without needing a
// stored column or a migration.

import type { PurokFloodControlStatus, VulnerabilityFlags } from './schema';

export type RiskTier = 'high' | 'medium' | 'low';

export const RISK_TIER_LABELS: Record<RiskTier, string> = {
  high: 'High risk',
  medium: 'Medium risk',
  low: 'Low risk',
};

export type FloodRiskLevel = 'high' | 'medium' | 'low' | 'none';

export interface VulnerabilitySuggestion {
  /** Stable key for the suggestion. */
  flag: 'pregnant' | 'reverify';
  label: string;
  reason: string;
}

export interface ResidentRisk {
  score: number;
  tier: RiskTier;
  suggestions: VulnerabilitySuggestion[];
}

/**
 * Severity weight per flag. Compound needs weigh more than a single one, so
 * PWD ranks highest, followed by senior / pregnant / chronic, then economic
 * disadvantage (indigent > low income / 4Ps).
 */
const SEVERITY_WEIGHTS: Array<{ active: (flags: VulnerabilityFlags) => boolean; weight: number }> = [
  { active: (f) => f.is_pwd, weight: 5 },
  { active: (f) => f.is_senior, weight: 4 },
  { active: (f) => f.is_pregnant, weight: 4 },
  { active: (f) => f.has_chronic_illness, weight: 4 },
  { active: (f) => Boolean(f.is_indigent), weight: 3 },
  { active: (f) => f.is_child, weight: 2 },
  { active: (f) => Boolean(f.is_infant), weight: 2 },
  { active: (f) => f.is_low_income, weight: 2 },
  { active: (f) => Boolean(f.is_4ps), weight: 2 },
];

/** Number of months without a health-worker confirmation before review is due. */
export const REVERIFY_AFTER_MONTHS = 12;
const REVERIFY_MS = REVERIFY_AFTER_MONTHS * 30 * 24 * 60 * 60 * 1000;

/** Manual (health-worker-entered) flags that need periodic re-verification. */
function hasManualFlags(flags: VulnerabilityFlags): boolean {
  return Boolean(
    flags.is_pwd
    || flags.is_pregnant
    || flags.has_chronic_illness
    || flags.is_4ps
    || flags.is_indigent,
  );
}

/** Severity-weighted composite score for a resident (0 = no flags). */
export function getResidentVulnerabilityScore(flags: VulnerabilityFlags): number {
  let score = 0;
  let severeFlags = 0;

  SEVERITY_WEIGHTS.forEach(({ active, weight }) => {
    if (active(flags)) {
      score += weight;
      if (weight >= 4) {
        severeFlags += 1;
      }
    }
  });

  // Overlap bonus: someone with multiple severe needs is at higher risk than
  // the sum of the parts would suggest.
  if (severeFlags >= 2) score += 3;
  if (severeFlags >= 3) score += 2;

  return score;
}

/**
 * Map a score to a tier. High requires compound severe need (or PWD combined
 * with economic disadvantage); medium is a single at-risk flag.
 */
export function getRiskTier(score: number): RiskTier {
  if (score >= 7) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

/**
 * Auto-suggestions for flags that still need a human decision:
 *
 *  - "pregnant" when pregnancy data exists but the flag is not confirmed;
 *  - "reverify" when manual flags have not been re-verified in 12 months.
 *
 * The confirmation step stays manual — a health worker editing the flags
 * clears the "pregnant" suggestion, and stamping {@link last_verified_at}
 * clears the "reverify" one.
 */
export function getVulnerabilitySuggestions(
  flags: VulnerabilityFlags,
  today: Date = new Date(),
): VulnerabilitySuggestion[] {
  const suggestions: VulnerabilitySuggestion[] = [];

  if (
    !flags.is_pregnant
    && (typeof flags.pregnancy_months === 'number' || Boolean(flags.expected_delivery_date))
  ) {
    suggestions.push({
      flag: 'pregnant',
      label: 'Suggested: Pregnant',
      reason: 'Pregnancy record is present but the flag is not yet confirmed.',
    });
  }

  if (hasManualFlags(flags)) {
    const reference = flags.last_verified_at ?? flags.updatedAt;
    if (reference) {
      const elapsed = today.getTime() - new Date(reference).getTime();
      if (elapsed >= REVERIFY_MS) {
        suggestions.push({
          flag: 'reverify',
          label: 'Re-verification due',
          reason: `Health flags have not been re-verified in ${REVERIFY_AFTER_MONTHS} months.`,
        });
      }
    }
  }

  return suggestions;
}

/** Full per-resident risk summary (score + tier + suggestions). */
export function calculateResidentRisk(flags: VulnerabilityFlags, today: Date = new Date()): ResidentRisk {
  const score = getResidentVulnerabilityScore(flags);
  return {
    score,
    tier: getRiskTier(score),
    suggestions: getVulnerabilitySuggestions(flags, today),
  };
}

/** Disaster-exposure level of a purok based on its flood profile. */
export function getFloodRiskLevel(
  floodProne: boolean,
  floodControlStatus: PurokFloodControlStatus,
): FloodRiskLevel {
  if (!floodProne) {
    return 'none';
  }

  switch (floodControlStatus) {
    case 'none':
      return 'high';
    case 'partial':
      return 'medium';
    case 'protected':
      return 'low';
    default:
      // Unknown control status — assume exposure until the admin confirms.
      return 'medium';
  }
}

/** Composite score for a sector: average social severity plus flood exposure. */
export function getSectorCompositeScore(averageSocialScore: number, floodRisk: FloodRiskLevel): number {
  const floodBonus = floodRisk === 'high' ? 3 : floodRisk === 'medium' ? 2 : floodRisk === 'low' ? 1 : 0;
  return averageSocialScore + floodBonus;
}
