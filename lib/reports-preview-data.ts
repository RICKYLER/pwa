export interface ReportsPreviewStats {
  total_households: number;
  total_population: number;
  children_count: number;
  seniors_count: number;
  pwd_count: number;
  pregnant_count: number;
  chronic_count: number;
  low_income_count: number;
}

export interface ReportsHouseholdPreviewRow {
  purok: string;
  households: number;
}

function getTrackedAdultsCount(stats: ReportsPreviewStats | null | undefined) {
  if (!stats) {
    return 0;
  }

  return Math.max(0, stats.total_population - stats.children_count - stats.seniors_count);
}

export function buildReportsAgePreviewData(stats: ReportsPreviewStats | null | undefined) {
  return [
    { key: 'children', label: 'Children', value: stats?.children_count ?? 0 },
    { key: 'adults', label: 'Adults', value: getTrackedAdultsCount(stats) },
    { key: 'seniors', label: 'Seniors', value: stats?.seniors_count ?? 0 },
  ].map((entry) => ({
    ...entry,
    shortLabel: entry.label.slice(0, 3),
  }));
}

export function buildReportsVulnerabilityPreviewData(stats: ReportsPreviewStats | null | undefined) {
  return [
    { key: 'children', label: 'Children', value: stats?.children_count ?? 0 },
    { key: 'seniors', label: 'Seniors', value: stats?.seniors_count ?? 0 },
    { key: 'pwd', label: 'PWD', value: stats?.pwd_count ?? 0 },
    { key: 'pregnant', label: 'Pregnant', value: stats?.pregnant_count ?? 0 },
    { key: 'chronic', label: 'Chronic', value: stats?.chronic_count ?? 0 },
    { key: 'lowIncome', label: 'Low-income', value: stats?.low_income_count ?? 0 },
  ].map((entry) => ({
    ...entry,
    shortLabel: entry.label === 'Low-income' ? 'Low' : entry.label.slice(0, 4),
  }));
}

export function buildReportsHouseholdPreviewData(
  rows: ReportsHouseholdPreviewRow[],
  limit = 4,
) {
  return rows
    .slice(0, limit)
    .map((row, index) => ({
      key: `households-${index + 1}`,
      purok: row.purok,
      households: row.households,
      rank: index + 1,
      shortLabel: row.purok.replace(/^Purok\s+/i, 'P').replace(/^Sitio\s+/i, 'S '),
    }));
}

export function getReportsVulnerableTotal(stats: ReportsPreviewStats | null | undefined) {
  if (!stats) {
    return 0;
  }

  return stats.children_count
    + stats.seniors_count
    + stats.pwd_count
    + stats.pregnant_count
    + stats.chronic_count;
}
