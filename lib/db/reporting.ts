import type { Household, PurokRiskProfile, Resident, VulnerabilityFlags } from './schema';
import {
  calculateResidentRisk,
  getFloodRiskLevel,
  getRiskTier,
  getSectorCompositeScore,
  type FloodRiskLevel,
  type RiskTier,
} from './risk-scoring';
import {
  buildPurokRiskProfileMap,
  getPurokRiskProfileKeyForHousehold,
} from '@/lib/purok-risk-profiles';

export interface ResidentAnalyticsRecord {
  resident: Resident;
  household: Household;
  flags: VulnerabilityFlags;
}

export interface DashboardStats {
  total_households: number;
  total_population: number;
  children_count: number;
  seniors_count: number;
  pwd_count: number;
  pregnant_count: number;
  chronic_count: number;
  low_income_count: number;
}

export type VulnerabilityTypeFilter =
  | 'child'
  | 'senior'
  | 'pwd'
  | 'pregnant'
  | 'chronic'
  | 'low_income';

function comparePurokCounts<T extends { purok: string }>(
  left: T,
  right: T,
  value: (item: T) => number,
) {
  return value(right) - value(left) || left.purok.localeCompare(right.purok);
}

export function isResidentCountedAsVulnerable(flags: VulnerabilityFlags): boolean {
  return (
    flags.is_child ||
    flags.is_senior ||
    flags.is_pwd ||
    flags.is_pregnant ||
    flags.has_chronic_illness
  );
}

export function buildResidentAnalyticsRecords(params: {
  households: Household[];
  residents: Resident[];
  flagsByResidentId: Map<string, VulnerabilityFlags>;
}): ResidentAnalyticsRecord[] {
  const householdById = new Map(params.households.map((household) => [household.id, household]));

  return params.residents
    .map((resident) => {
      const household = householdById.get(resident.household_id);
      const flags = params.flagsByResidentId.get(resident.id);

      if (!household || !flags) {
        return null;
      }

      return {
        resident,
        household,
        flags,
      } satisfies ResidentAnalyticsRecord;
    })
    .filter((record): record is ResidentAnalyticsRecord => Boolean(record))
    .sort((left, right) => left.resident.full_name.localeCompare(right.resident.full_name));
}

export function calculateDashboardStats(
  households: Household[],
  records: ResidentAnalyticsRecord[],
): DashboardStats {
  return records.reduce<DashboardStats>((summary, record) => {
    if (record.flags.is_child) summary.children_count += 1;
    if (record.flags.is_senior) summary.seniors_count += 1;
    if (record.flags.is_pwd) summary.pwd_count += 1;
    if (record.flags.is_pregnant) summary.pregnant_count += 1;
    if (record.flags.has_chronic_illness) summary.chronic_count += 1;
    if (record.flags.is_low_income) summary.low_income_count += 1;
    summary.total_population += 1;
    return summary;
  }, {
    total_households: households.length,
    total_population: 0,
    children_count: 0,
    seniors_count: 0,
    pwd_count: 0,
    pregnant_count: 0,
    chronic_count: 0,
    low_income_count: 0,
  });
}

export function calculateTopPuroksByPopulation(
  records: ResidentAnalyticsRecord[],
  limit = 3,
): Array<{ purok: string; population: number }> {
  const counts = new Map<string, number>();

  records.forEach((record) => {
    counts.set(
      record.household.purok_sitio,
      (counts.get(record.household.purok_sitio) || 0) + 1,
    );
  });

  return Array.from(counts.entries())
    .map(([purok, population]) => ({ purok, population }))
    .sort((left, right) => comparePurokCounts(left, right, (item) => item.population))
    .slice(0, limit);
}

export function calculateTopPuroksByHouseholds(
  households: Household[],
  limit = 3,
): Array<{ purok: string; households: number }> {
  const counts = new Map<string, number>();

  households.forEach((household) => {
    counts.set(
      household.purok_sitio,
      (counts.get(household.purok_sitio) || 0) + 1,
    );
  });

  return Array.from(counts.entries())
    .map(([purok, households]) => ({ purok, households }))
    .sort((left, right) => comparePurokCounts(left, right, (item) => item.households))
    .slice(0, limit);
}

export interface PurokVulnerabilityRank {
  purok: string;
  vulnerable_count: number;
  /** Total severity-weighted score across vulnerable residents. */
  score: number;
  /** Average severity per vulnerable resident — a severity rank, not a count. */
  average_score: number;
  tier: RiskTier;
}

export function calculateTopPuroksByVulnerability(
  records: ResidentAnalyticsRecord[],
  limit = 3,
): PurokVulnerabilityRank[] {
  const counts = new Map<string, { vulnerable_count: number; score: number }>();

  records.forEach((record) => {
    if (!isResidentCountedAsVulnerable(record.flags)) {
      return;
    }

    const risk = calculateResidentRisk(record.flags);
    const entry = counts.get(record.household.purok_sitio) ?? { vulnerable_count: 0, score: 0 };
    entry.vulnerable_count += 1;
    entry.score += risk.score;
    counts.set(record.household.purok_sitio, entry);
  });

  return Array.from(counts.entries())
    .map(([purok, entry]) => {
      const average_score = entry.vulnerable_count > 0
        ? Math.round((entry.score / entry.vulnerable_count) * 10) / 10
        : 0;
      return {
        purok,
        vulnerable_count: entry.vulnerable_count,
        score: entry.score,
        average_score,
        tier: getRiskTier(average_score),
      };
    })
    .sort((left, right) => comparePurokCounts(left, right, (item) => item.vulnerable_count))
    .slice(0, limit);
}

export interface PurokRiskRanking {
  purok: string;
  barangay_id?: string;
  population: number;
  vulnerable_count: number;
  /** Total severity-weighted social score across residents. */
  score: number;
  /** Average social severity per resident. */
  average_score: number;
  /** Social severity plus flood-exposure bonus. */
  composite_score: number;
  tier: RiskTier;
  flood_prone: boolean;
  flood_control_status: PurokRiskProfile['flood_control_status'];
  flood_risk: FloodRiskLevel;
}

/**
 * Rank puroks/sectors by risk — social vulnerability score combined with
 * flood/disaster exposure. Unlike {@link calculateTopPuroksByVulnerability},
 * this ranks by severity, so a purok with a few severely-vulnerable residents
 * in a flood-prone area outranks a purok with many mildly-vulnerable ones.
 */
export function calculatePurokRiskRankings(
  records: ResidentAnalyticsRecord[],
  riskProfiles: PurokRiskProfile[],
  limit?: number,
): PurokRiskRanking[] {
  const profileMap = buildPurokRiskProfileMap(riskProfiles);
  const byPurok = new Map<string, { population: number; vulnerable: number; score: number }>();
  const barangayByPurok = new Map<string, string>();

  records.forEach((record) => {
    const purok = record.household.purok_sitio;
    const entry = byPurok.get(purok) ?? { population: 0, vulnerable: 0, score: 0 };
    entry.population += 1;
    if (isResidentCountedAsVulnerable(record.flags)) {
      entry.vulnerable += 1;
    }
    entry.score += calculateResidentRisk(record.flags).score;
    byPurok.set(purok, entry);
    barangayByPurok.set(purok, record.household.barangay_id);
  });

  const rankings = Array.from(byPurok.entries()).map(([purok, entry]) => {
    const barangayId = barangayByPurok.get(purok) ?? '';
    const profile = profileMap.get(getPurokRiskProfileKeyForHousehold({ barangay_id: barangayId, purok_sitio: purok }));
    const flood_prone = Boolean(profile?.flood_prone);
    const flood_control_status = profile?.flood_control_status ?? 'unknown';
    const flood_risk = getFloodRiskLevel(flood_prone, flood_control_status);
    const average_score = entry.population > 0
      ? Math.round((entry.score / entry.population) * 10) / 10
      : 0;

    return {
      purok,
      barangay_id: barangayId,
      population: entry.population,
      vulnerable_count: entry.vulnerable,
      score: entry.score,
      average_score,
      composite_score: Math.round(getSectorCompositeScore(average_score, flood_risk) * 10) / 10,
      tier: getRiskTier(getSectorCompositeScore(average_score, flood_risk)),
      flood_prone,
      flood_control_status,
      flood_risk,
    };
  });

  return rankings
    .filter((ranking) => ranking.vulnerable_count > 0 || ranking.flood_prone)
    .sort((left, right) => {
      const tierWeight = (tier: RiskTier) => (tier === 'high' ? 2 : tier === 'medium' ? 1 : 0);
      return tierWeight(right.tier) - tierWeight(left.tier)
        || right.composite_score - left.composite_score
        || left.purok.localeCompare(right.purok, undefined, { numeric: true });
    })
    .slice(0, limit);
}

export function filterResidentAnalyticsRecords(
  records: ResidentAnalyticsRecord[],
  filters?: {
    vulnerability_type?: VulnerabilityTypeFilter;
    purok_sitio?: string;
  },
): ResidentAnalyticsRecord[] {
  return records.filter((record) => {
    if (filters?.purok_sitio && record.household.purok_sitio !== filters.purok_sitio) {
      return false;
    }

    if (!filters?.vulnerability_type) {
      return true;
    }

    switch (filters.vulnerability_type) {
      case 'child':
        return record.flags.is_child;
      case 'senior':
        return record.flags.is_senior;
      case 'pwd':
        return record.flags.is_pwd;
      case 'pregnant':
        return record.flags.is_pregnant;
      case 'chronic':
        return record.flags.has_chronic_illness;
      case 'low_income':
        return record.flags.is_low_income;
      default:
        return true;
    }
  });
}

export function calculateHeatmapData(
  households: Household[],
  records: ResidentAnalyticsRecord[],
): Array<{
  purok: string;
  total_residents: number;
  vulnerable_count: number;
  intensity: number;
}> {
  const purokData = new Map<string, { total: number; vulnerable: number }>();

  households.forEach((household) => {
    if (!purokData.has(household.purok_sitio)) {
      purokData.set(household.purok_sitio, { total: 0, vulnerable: 0 });
    }
  });

  records.forEach((record) => {
    const data = purokData.get(record.household.purok_sitio);
    if (!data) {
      return;
    }

    data.total += 1;
    if (isResidentCountedAsVulnerable(record.flags)) {
      data.vulnerable += 1;
    }
  });

  const maxVulnerable = Math.max(
    ...Array.from(purokData.values()).map((entry) => entry.vulnerable),
    1,
  );

  return Array.from(purokData.entries())
    .map(([purok, data]) => ({
      purok,
      total_residents: data.total,
      vulnerable_count: data.vulnerable,
      intensity: data.vulnerable / maxVulnerable,
    }))
    .sort((left, right) => left.purok.localeCompare(right.purok));
}
