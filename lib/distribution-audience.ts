import type {
  DistributionTargetGroup,
  DistributionTargetScope,
  Household,
  Resident,
  VulnerabilityFlags,
} from '@/lib/db/schema';

export type DistributionAudienceMatches = {
  eligibleHouseholds: Household[];
  eligibleResidents: Resident[];
  matchedResidentsByHouseholdId: Map<string, Resident[]>;
};

// Vulnerability categories used to tag and filter people in distribution
// event lists (badges, filter chips, PDF report). Mirrors the target groups
// minus the catch-all 'all'.
export type DistributionCategory = 'senior' | 'pwd' | 'pregnant' | 'minor' | 'low_income';

export const DISTRIBUTION_CATEGORY_LABELS: Record<DistributionCategory, string> = {
  senior: 'Senior',
  pwd: 'PWD',
  pregnant: 'Pregnant',
  minor: 'Minor',
  low_income: 'Low Income',
};

// CivicBadge tone per category, mirroring the vulnerability module
// (PWD/Pregnant -> rose, Senior -> amber, Low Income -> emerald, Minor -> navy).
export const DISTRIBUTION_CATEGORY_TONES: Record<
  DistributionCategory,
  'rose' | 'amber' | 'emerald' | 'navy'
> = {
  pwd: 'rose',
  pregnant: 'rose',
  senior: 'amber',
  low_income: 'emerald',
  minor: 'navy',
};

export const DISTRIBUTION_CATEGORY_KEYS: DistributionCategory[] = [
  'senior',
  'pwd',
  'pregnant',
  'minor',
  'low_income',
];

export function getResidentCategories(
  resident: Resident,
  flags: VulnerabilityFlags | undefined,
): DistributionCategory[] {
  const categories: DistributionCategory[] = [];
  if (flags?.is_senior) categories.push('senior');
  if (flags?.is_pwd) categories.push('pwd');
  if (flags?.is_pregnant) categories.push('pregnant');
  if (flags?.is_child) categories.push('minor');
  if (flags?.is_low_income || resident.income_level === 'low') categories.push('low_income');
  return categories;
}

export function isResidentOnlyTargetGroup(_targetGroup: DistributionTargetGroup): boolean {
  return false;
}

export function coerceDistributionTargetScope(
  targetScope: DistributionTargetScope,
  _targetGroup: DistributionTargetGroup,
): DistributionTargetScope {
  return targetScope;
}

export function matchesDistributionTargetGroup(
  resident: Resident,
  flags: VulnerabilityFlags | undefined,
  targetGroup: DistributionTargetGroup,
): boolean {
  if (targetGroup === 'all') {
    return true;
  }

  return getResidentCategories(resident, flags).includes(targetGroup);
}

export function resolveDistributionAudienceMatches(params: {
  households: Household[];
  residents: Resident[];
  flagsByResidentId: Map<string, VulnerabilityFlags>;
  targetGroup: DistributionTargetGroup;
}): DistributionAudienceMatches {
  const { households, residents, flagsByResidentId, targetGroup } = params;
  const eligibleResidents = residents.filter((resident) =>
    matchesDistributionTargetGroup(resident, flagsByResidentId.get(resident.id), targetGroup),
  );

  const matchedResidentsByHouseholdId = new Map<string, Resident[]>();
  eligibleResidents.forEach((resident) => {
    const current = matchedResidentsByHouseholdId.get(resident.household_id) ?? [];
    current.push(resident);
    matchedResidentsByHouseholdId.set(resident.household_id, current);
  });

  const eligibleHouseholds = targetGroup === 'all'
    ? households
    : households.filter((household) => matchedResidentsByHouseholdId.has(household.id));

  return {
    eligibleHouseholds,
    eligibleResidents,
    matchedResidentsByHouseholdId,
  };
}
