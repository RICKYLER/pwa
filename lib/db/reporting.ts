import type { Household, Resident, VulnerabilityFlags } from './schema';

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

export function calculateTopPuroksByVulnerability(
  records: ResidentAnalyticsRecord[],
  limit = 3,
): Array<{ purok: string; vulnerable_count: number }> {
  const counts = new Map<string, number>();

  records.forEach((record) => {
    if (!isResidentCountedAsVulnerable(record.flags)) {
      return;
    }

    counts.set(
      record.household.purok_sitio,
      (counts.get(record.household.purok_sitio) || 0) + 1,
    );
  });

  return Array.from(counts.entries())
    .map(([purok, vulnerable_count]) => ({ purok, vulnerable_count }))
    .sort((left, right) => comparePurokCounts(left, right, (item) => item.vulnerable_count))
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
