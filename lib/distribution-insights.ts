import {
  matchesDistributionTargetGroup,
  type DistributionAudienceMatches,
} from '@/lib/distribution-audience';
import type {
  DistributedItem,
  DistributionEvent,
  DistributionRecord,
  DistributionTargetGroup,
  DistributionTargetScope,
  Household,
  InventoryItem,
  Resident,
  VulnerabilityFlags,
} from '@/lib/db/schema';
import { calculateAge, hasValidResidentBirthdate } from '@/lib/db/vulnerability';

export type DistributionEligibilitySummary = {
  total_households: number;
  total_residents: number;
  eligible_households: number;
  eligible_residents: number;
  match_label: string;
  match_support: string;
  target_count_label: string;
};

export type DistributionInventoryLine = DistributedItem & {
  available: number;
  availableAfterRelease: number;
  remainingPackages: number;
  remainingPackagesAfterRelease: number;
  isBlocking: boolean;
  isLowStock: boolean;
  shortageQuantity: number;
  reorderLevel: number;
};

export type DistributionInventorySummary = {
  available_packages: number;
  blocking_items: DistributionInventoryLine[];
  low_stock_items: DistributionInventoryLine[];
  lines: DistributionInventoryLine[];
};

export type DistributionServedSummary = {
  households_served: number;
  residents_served: number;
  packages_released: number;
  units_released: number;
};

export type DistributionSelectionPreview = {
  heading: string;
  support: string;
  qualification: string;
  packagePreview: Array<{
    item_id: string;
    item_name: string;
    unit: string;
    per_release: number;
    current_stock: number;
    stock_after_release: number;
    packages_left_after_release: number;
    is_blocking: boolean;
  }>;
  warnings: string[];
  errors: string[];
};

function getTargetGroupLabel(targetGroup: DistributionTargetGroup) {
  switch (targetGroup) {
    case 'all':
      return 'All';
    case 'senior':
      return 'Senior';
    case 'pwd':
      return 'PWD';
    case 'pregnant':
      return 'Pregnant';
    case 'minor':
      return 'Minor';
    case 'low_income':
      return 'Low Income';
    default:
      return 'Audience';
  }
}

function getResidentAgeSupport(resident: Resident) {
  return hasValidResidentBirthdate(resident.birthdate)
    ? `age ${calculateAge(resident.birthdate)}`
    : 'birthdate missing';
}

function getResidentQualificationReason(
  resident: Resident,
  flags: VulnerabilityFlags | undefined,
  targetGroup: DistributionTargetGroup,
): string {
  switch (targetGroup) {
    case 'all':
      return 'Resident is active and belongs to an approved household in scope.';
    case 'senior':
      return hasValidResidentBirthdate(resident.birthdate)
        ? `Matched as senior based on ${getResidentAgeSupport(resident)}.`
        : 'Resident needs a valid birthdate before senior targeting can include them.';
    case 'minor':
      return hasValidResidentBirthdate(resident.birthdate)
        ? `Matched as minor based on ${getResidentAgeSupport(resident)}.`
        : 'Resident needs a valid birthdate before minor targeting can include them.';
    case 'pwd':
      return flags?.is_pwd
        ? 'Matched through the current PWD vulnerability flag.'
        : 'PWD targeting requires an active PWD vulnerability flag.';
    case 'pregnant':
      return flags?.is_pregnant
        ? 'Matched through the current pregnancy vulnerability flag.'
        : 'Pregnant targeting requires an active pregnancy vulnerability flag.';
    case 'low_income':
      return flags?.is_low_income || resident.income_level === 'low'
        ? 'Matched through the low-income flag or low income level.'
        : 'Low-income targeting requires a low-income indicator.';
    default:
      return 'Resident matches the configured event audience.';
  }
}

function buildHouseholdQualificationReason(params: {
  household: Household;
  matchedResidents: Resident[];
  flagsByResidentId: Map<string, VulnerabilityFlags>;
  targetGroup: DistributionTargetGroup;
}) {
  if (params.targetGroup === 'all') {
    return 'Qualified because this event serves all approved active households in scope.';
  }

  const names = params.matchedResidents
    .slice(0, 3)
    .map((resident) => resident.full_name)
    .join(', ');
  const extraCount = Math.max(0, params.matchedResidents.length - 3);
  const suffix = extraCount > 0 ? `, plus ${extraCount} more` : '';

  return `${params.matchedResidents.length} ${getTargetGroupLabel(params.targetGroup).toLowerCase()} match${
    params.matchedResidents.length === 1 ? '' : 'es'
  } in this household: ${names}${suffix}.`;
}

export function buildDistributionEligibilitySummary(params: {
  matches: DistributionAudienceMatches;
  targetScope: DistributionTargetScope;
  targetGroup: DistributionTargetGroup;
  scopeLabel: string;
  totalHouseholds: number;
  totalResidents: number;
}): DistributionEligibilitySummary {
  const { matches, targetGroup, targetScope, scopeLabel, totalHouseholds, totalResidents } = params;
  const targetGroupLabel = getTargetGroupLabel(targetGroup);
  const eligibleHouseholds = matches.eligibleHouseholds.length;
  const eligibleResidents = matches.eligibleResidents.length;

  const match_label =
    targetScope === 'household'
      ? targetGroup === 'all'
        ? 'Eligible Households'
        : `${targetGroupLabel} Matches`
      : targetGroup === 'all'
        ? 'Eligible Residents'
        : `${targetGroupLabel} Matches`;

  const match_support =
    targetScope === 'household'
      ? targetGroup === 'all'
        ? `${totalResidents} resident${totalResidents === 1 ? '' : 's'} covered across ${scopeLabel}.`
        : `${eligibleHouseholds} matched household${eligibleHouseholds === 1 ? '' : 's'} across ${scopeLabel}.`
      : `${eligibleHouseholds} household${eligibleHouseholds === 1 ? '' : 's'} covered across ${scopeLabel}.`;

  const target_count_label =
    targetScope === 'household'
      ? targetGroup === 'all'
        ? `${eligibleHouseholds} eligible household${eligibleHouseholds === 1 ? '' : 's'}`
        : `${eligibleHouseholds} household${eligibleHouseholds === 1 ? '' : 's'} · ${eligibleResidents} ${targetGroupLabel.toLowerCase()} match${eligibleResidents === 1 ? '' : 'es'}`
      : targetGroup === 'all'
        ? `${eligibleResidents} eligible resident${eligibleResidents === 1 ? '' : 's'}`
        : `${eligibleResidents} ${targetGroupLabel.toLowerCase()} resident${eligibleResidents === 1 ? '' : 's'}`;

  return {
    total_households: totalHouseholds,
    total_residents: totalResidents,
    eligible_households: eligibleHouseholds,
    eligible_residents: eligibleResidents,
    match_label,
    match_support,
    target_count_label,
  };
}

export function buildDistributionInventorySummary(
  packageItems: DistributedItem[],
  inventoryItems: InventoryItem[],
): DistributionInventorySummary {
  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));

  const lines = packageItems.map((packageItem) => {
    const stock = inventoryById.get(packageItem.item_id);
    const available = stock?.quantity_available ?? 0;
    const reorderLevel = stock?.reorder_level ?? 0;
    const remainingPackages = packageItem.quantity > 0
      ? Math.floor(available / packageItem.quantity)
      : 0;
    const availableAfterRelease = Math.max(0, available - packageItem.quantity);
    const remainingPackagesAfterRelease = packageItem.quantity > 0
      ? Math.floor(availableAfterRelease / packageItem.quantity)
      : 0;
    const shortageQuantity = Math.max(0, packageItem.quantity - available);
    const isBlocking = available < packageItem.quantity;
    const isLowStock = !isBlocking && (
      availableAfterRelease <= reorderLevel
      || remainingPackages <= 3
    );

    return {
      ...packageItem,
      item_name: packageItem.item_name || stock?.item_name || 'Inventory item',
      unit: packageItem.unit || stock?.unit || 'pcs',
      available,
      availableAfterRelease,
      remainingPackages,
      remainingPackagesAfterRelease,
      isBlocking,
      isLowStock,
      shortageQuantity,
      reorderLevel,
    } satisfies DistributionInventoryLine;
  });

  return {
    available_packages: lines.length > 0
      ? Math.min(...lines.map((line) => line.remainingPackages))
      : 0,
    blocking_items: lines.filter((line) => line.isBlocking),
    low_stock_items: lines.filter((line) => line.isLowStock),
    lines,
  };
}

export function buildDistributionServedSummary(
  records: DistributionRecord[],
): DistributionServedSummary {
  const servedHouseholdIds = new Set(records.map((record) => record.household_id).filter(Boolean));
  const servedResidentIds = new Set(records.map((record) => record.resident_id).filter(Boolean));

  return {
    households_served: servedHouseholdIds.size,
    residents_served: servedResidentIds.size,
    packages_released: records.length,
    units_released: records.reduce(
      (sum, record) => sum + record.items_distributed.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0,
    ),
  };
}

export function buildDistributionSelectionPreview(params: {
  event: Pick<DistributionEvent, 'target_scope' | 'target_group'>;
  selectedHousehold: Household | null;
  selectedResident: Resident | null;
  matchedResidentsByHouseholdId: Map<string, Resident[]>;
  flagsByResidentId: Map<string, VulnerabilityFlags>;
  inventorySummary: DistributionInventorySummary;
  servedHouseholdIds?: Set<string>;
  servedResidentIds?: Set<string>;
  eligibleHouseholds?: Household[];
  eligibleResidents?: Resident[];
  requireSelection?: boolean;
}): DistributionSelectionPreview {
  const {
    event,
    selectedHousehold,
    selectedResident,
    matchedResidentsByHouseholdId,
    flagsByResidentId,
    inventorySummary,
    servedHouseholdIds,
    servedResidentIds,
    eligibleHouseholds = [],
    eligibleResidents = [],
    requireSelection = false,
  } = params;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (inventorySummary.lines.length === 0) {
    errors.push('This event has no package items configured yet.');
  }

  if (inventorySummary.blocking_items.length > 0) {
    const names = inventorySummary.blocking_items.map((item) => item.item_name).join(', ');
    errors.push(`Restock required before release: ${names}.`);
  }

  if (inventorySummary.low_stock_items.length > 0) {
    warnings.push(
      `Low stock watch: ${inventorySummary.low_stock_items.map((item) => item.item_name).join(', ')} may hit the reorder threshold after release.`,
    );
  }

  if (event.target_scope === 'household') {
    if (!selectedHousehold) {
      if (requireSelection) {
        errors.push('Select one qualifying household before releasing the package.');
      }

      return {
        heading: 'Select a household',
        support: 'Search and select one qualifying household to preview the release.',
        qualification: '',
        packagePreview: inventorySummary.lines.map((line) => ({
          item_id: line.item_id,
          item_name: line.item_name || 'Inventory item',
          unit: line.unit || 'pcs',
          per_release: line.quantity,
          current_stock: line.available,
          stock_after_release: line.availableAfterRelease,
          packages_left_after_release: line.remainingPackagesAfterRelease,
          is_blocking: line.isBlocking,
        })),
        warnings,
        errors,
      };
    }

    if (!eligibleHouseholds.some((household) => household.id === selectedHousehold.id)) {
      errors.push('This household no longer qualifies for the configured event audience.');
    }

    if (servedHouseholdIds?.has(selectedHousehold.id)) {
      errors.push('This household already received the package for this event.');
    }

    const matchedResidents = matchedResidentsByHouseholdId.get(selectedHousehold.id) ?? [];
    return {
      heading: selectedHousehold.head_name,
      support: `${selectedHousehold.purok_sitio} · ${selectedHousehold.street_address}`,
      qualification: buildHouseholdQualificationReason({
        household: selectedHousehold,
        matchedResidents,
        flagsByResidentId,
        targetGroup: event.target_group,
      }),
      packagePreview: inventorySummary.lines.map((line) => ({
        item_id: line.item_id,
        item_name: line.item_name || 'Inventory item',
        unit: line.unit || 'pcs',
        per_release: line.quantity,
        current_stock: line.available,
        stock_after_release: line.availableAfterRelease,
        packages_left_after_release: line.remainingPackagesAfterRelease,
        is_blocking: line.isBlocking,
      })),
      warnings,
      errors,
    };
  }

  if (!selectedResident) {
    if (requireSelection) {
      errors.push('Select one qualifying resident before releasing the package.');
    }

    return {
      heading: 'Select a resident',
      support: 'Search and select one qualifying resident to preview the release.',
      qualification: '',
      packagePreview: inventorySummary.lines.map((line) => ({
        item_id: line.item_id,
        item_name: line.item_name || 'Inventory item',
        unit: line.unit || 'pcs',
        per_release: line.quantity,
        current_stock: line.available,
        stock_after_release: line.availableAfterRelease,
        packages_left_after_release: line.remainingPackagesAfterRelease,
        is_blocking: line.isBlocking,
      })),
      warnings,
      errors,
    };
  }

  const residentFlags = flagsByResidentId.get(selectedResident.id);
  if (!eligibleResidents.some((resident) => resident.id === selectedResident.id)) {
    errors.push('This resident no longer qualifies for the configured event audience.');
  }

  if (
    !matchesDistributionTargetGroup(
      selectedResident,
      residentFlags,
      event.target_group,
    )
  ) {
    errors.push('The selected resident no longer matches the configured target group.');
  }

  if (servedResidentIds?.has(selectedResident.id)) {
    errors.push('This resident already received the package for this event.');
  }

  if (
    (event.target_group === 'senior' || event.target_group === 'minor')
    && !hasValidResidentBirthdate(selectedResident.birthdate)
  ) {
    errors.push('A valid birthdate is required before this resident can be released under an age-based event.');
  }

  return {
    heading: selectedResident.full_name,
    support: `${selectedResident.relationship_to_head} · ${getResidentAgeSupport(selectedResident)}`,
    qualification: getResidentQualificationReason(selectedResident, residentFlags, event.target_group),
    packagePreview: inventorySummary.lines.map((line) => ({
      item_id: line.item_id,
      item_name: line.item_name || 'Inventory item',
      unit: line.unit || 'pcs',
      per_release: line.quantity,
      current_stock: line.available,
      stock_after_release: line.availableAfterRelease,
      packages_left_after_release: line.remainingPackagesAfterRelease,
      is_blocking: line.isBlocking,
    })),
    warnings,
    errors,
  };
}
