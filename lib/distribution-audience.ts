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

export function isResidentOnlyTargetGroup(targetGroup: DistributionTargetGroup): boolean {
  return targetGroup === 'senior'
    || targetGroup === 'pwd'
    || targetGroup === 'pregnant'
    || targetGroup === 'minor';
}

export function coerceDistributionTargetScope(
  targetScope: DistributionTargetScope,
  targetGroup: DistributionTargetGroup,
): DistributionTargetScope {
  return isResidentOnlyTargetGroup(targetGroup) ? 'resident' : targetScope;
}

export function matchesDistributionTargetGroup(
  resident: Resident,
  flags: VulnerabilityFlags | undefined,
  targetGroup: DistributionTargetGroup,
): boolean {
  switch (targetGroup) {
    case 'all':
      return true;
    case 'senior':
      return Boolean(flags?.is_senior);
    case 'pwd':
      return Boolean(flags?.is_pwd);
    case 'pregnant':
      return Boolean(flags?.is_pregnant);
    case 'minor':
      return Boolean(flags?.is_child);
    case 'low_income':
      return Boolean(flags?.is_low_income || resident.income_level === 'low');
    default:
      return true;
  }
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
