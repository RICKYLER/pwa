import { buildDistributionInventorySummary, type DistributionEligibilitySummary } from '@/lib/distribution-insights';
import type {
  DistributionEvent,
  DistributedItem,
  Household,
  InventoryItem,
  PackageTemplate,
  Resident,
  VulnerabilityFlags,
} from '@/lib/db/schema';
import { hasValidResidentBirthdate } from '@/lib/db/vulnerability';

export type DataQualityIssueKey =
  | 'households_missing_location'
  | 'residents_missing_birthdate'
  | 'broken_vulnerability_flags'
  | 'events_with_zero_matches'
  | 'blocked_package_templates';

export type DataQualityIssue = {
  key: DataQualityIssueKey;
  label: string;
  description: string;
  count: number;
  href: string;
  sample_labels: string[];
};

export type BrokenVulnerabilityFlagIssue = {
  flag: VulnerabilityFlags;
  resident: Resident | null;
  household: Household | null;
  label: string;
  detail: string;
  reason: string;
  categories: string[];
};

export type PackageTemplateReadiness = {
  template: PackageTemplate;
  inventory_summary: ReturnType<typeof buildDistributionInventorySummary>;
};

export type DataQualitySummary = {
  total_issues: number;
  blocking_issues: number;
  issues: DataQualityIssue[];
};

function formatStatusLabel(value: string): string {
  return value.replace(/_/g, ' ');
}

function getBrokenFlagCategories(flag: VulnerabilityFlags): string[] {
  const categories: string[] = [];

  if (flag.is_child) categories.push('Child');
  if (flag.is_senior) categories.push('Senior');
  if (flag.is_pwd) categories.push('PWD');
  if (flag.is_pregnant) categories.push('Pregnant');
  if (flag.has_chronic_illness) categories.push('Chronic');
  if (flag.is_low_income) categories.push('Low-income');

  return categories.length > 0 ? categories : ['Flag record'];
}

export function getHouseholdsMissingLocation(households: Household[]) {
  return households.filter((household) => (
    household.status === 'active'
    && household.registration_status === 'approved'
    && (
      typeof household.gps_lat !== 'number'
      || typeof household.gps_long !== 'number'
    )
  ));
}

export function getResidentsMissingBirthdate(params: {
  residents: Resident[];
  householdsById: Map<string, Household>;
}) {
  return params.residents.filter((resident) => {
    if (resident.status !== 'active' || hasValidResidentBirthdate(resident.birthdate)) {
      return false;
    }

    const household = params.householdsById.get(resident.household_id);
    return Boolean(household && household.status === 'active' && household.registration_status === 'approved');
  });
}

export function getBrokenVulnerabilityFlagIssues(params: {
  flags: VulnerabilityFlags[];
  residentsById: Map<string, Resident>;
  householdsById: Map<string, Household>;
}) {
  return params.flags.reduce<BrokenVulnerabilityFlagIssue[]>((issues, flag) => {
    const resident = params.residentsById.get(flag.resident_id) ?? null;
    const household = resident ? (params.householdsById.get(resident.household_id) ?? null) : null;

    if (!resident) {
      issues.push({
        flag,
        resident: null,
        household: null,
        label: 'Missing resident record',
        detail: `Resident ID: ${flag.resident_id}`,
        reason: 'This vulnerability flag points to a resident record that no longer exists.',
        categories: getBrokenFlagCategories(flag),
      });
      return issues;
    }

    if (resident.status !== 'active') {
      issues.push({
        flag,
        resident,
        household,
        label: resident.full_name,
        detail: `Resident ID: ${resident.id}`,
        reason: `Resident status is ${formatStatusLabel(resident.status)}.`,
        categories: getBrokenFlagCategories(flag),
      });
      return issues;
    }

    if (!household) {
      issues.push({
        flag,
        resident,
        household: null,
        label: resident.full_name,
        detail: `Household ID: ${resident.household_id}`,
        reason: 'Linked household record is missing.',
        categories: getBrokenFlagCategories(flag),
      });
      return issues;
    }

    if (household.status !== 'active') {
      issues.push({
        flag,
        resident,
        household,
        label: resident.full_name,
        detail: `${household.head_name} · ${household.purok_sitio}`,
        reason: `Linked household status is ${formatStatusLabel(household.status)}.`,
        categories: getBrokenFlagCategories(flag),
      });
      return issues;
    }

    if (household.registration_status !== 'approved') {
      issues.push({
        flag,
        resident,
        household,
        label: resident.full_name,
        detail: `${household.head_name} · ${household.purok_sitio}`,
        reason: `Linked household registration is ${formatStatusLabel(household.registration_status ?? 'pending')}.`,
        categories: getBrokenFlagCategories(flag),
      });
    }

    return issues;
  }, []);
}

export function getBlockedPackageTemplates(
  templates: PackageTemplate[],
  inventoryItems: InventoryItem[],
): PackageTemplateReadiness[] {
  return templates
    .map((template) => ({
      template,
      inventory_summary: buildDistributionInventorySummary(template.items, inventoryItems),
    }))
    .filter((entry) => entry.inventory_summary.blocking_items.length > 0);
}

export function summarizeOperationalDataQuality(params: {
  householdsMissingLocation: Household[];
  residentsMissingBirthdate: Resident[];
  brokenFlags: BrokenVulnerabilityFlagIssue[];
  zeroMatchEvents: Array<{ event: DistributionEvent; eligibility_summary: DistributionEligibilitySummary }>;
  blockedTemplates: PackageTemplateReadiness[];
}): DataQualitySummary {
  const issues: DataQualityIssue[] = [
    {
      key: 'households_missing_location',
      label: 'Households Missing Coordinates',
      description: 'Approved active households that still need a usable map pin.',
      count: params.householdsMissingLocation.length,
      href: '/households?issue=missing_location',
      sample_labels: params.householdsMissingLocation.slice(0, 3).map((household) => household.head_name),
    },
    {
      key: 'residents_missing_birthdate',
      label: 'Residents Missing Birthdate',
      description: 'These residents are excluded from age-based targeting until the birthdate is fixed.',
      count: params.residentsMissingBirthdate.length,
      href: '/vulnerability?issue=missing_birthdate',
      sample_labels: params.residentsMissingBirthdate.slice(0, 3).map((resident) => resident.full_name),
    },
    {
      key: 'broken_vulnerability_flags',
      label: 'Broken Vulnerability Flags',
      description: 'Flag records point to missing or inactive residents or households.',
      count: params.brokenFlags.length,
      href: '/vulnerability?issue=broken_flags',
      sample_labels: params.brokenFlags.slice(0, 3).map((issue) => (
        issue.label === 'Missing resident record' ? issue.detail : issue.label
      )),
    },
    {
      key: 'events_with_zero_matches',
      label: 'Events With Zero Matches',
      description: 'Planned or ongoing distribution events that currently have no qualifying audience.',
      count: params.zeroMatchEvents.length,
      href: '/distribution?issue=zero_matches',
      sample_labels: params.zeroMatchEvents.slice(0, 3).map((entry) => entry.event.event_name),
    },
    {
      key: 'blocked_package_templates',
      label: 'Blocked Package Templates',
      description: 'Template bundles that cannot be fulfilled with the current stock.',
      count: params.blockedTemplates.length,
      href: '/inventory?issue=package_blockers',
      sample_labels: params.blockedTemplates.slice(0, 3).map((entry) => entry.template.name),
    },
  ];

  return {
    total_issues: issues.reduce((sum, issue) => sum + issue.count, 0),
    blocking_issues: issues.filter((issue) => issue.count > 0).length,
    issues,
  };
}
