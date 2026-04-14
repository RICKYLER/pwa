import { db, STORE_NAMES } from './indexeddb';
import { getHouseholds } from './households';
import { getResidents } from './residents';
import {
  getBrokenVulnerabilityFlagIssues,
  getBlockedPackageTemplates,
  getHouseholdsMissingLocation,
  getResidentsMissingBirthdate,
  summarizeOperationalDataQuality,
  type DataQualityIssue,
  type BrokenVulnerabilityFlagIssue,
  type DataQualitySummary,
  type PackageTemplateReadiness,
} from '@/lib/data-quality';
import type { DistributionEligibilitySummary } from '@/lib/distribution-insights';
import {
  buildResidentAnalyticsRecords,
  calculateDashboardStats,
  calculateHeatmapData,
  calculateTopPuroksByHouseholds,
  calculateTopPuroksByPopulation,
  calculateTopPuroksByVulnerability,
  filterResidentAnalyticsRecords,
} from './reporting';
import { getDistributionAudienceContext, getDistributionEvents } from './distribution';
import { getInventoryItems, getPackageTemplates } from './inventory';
import { getCurrentVulnerabilityFlagsMapForResidents } from './vulnerability';
import type { DistributionEvent, Resident, VulnerabilityFlags, Household } from './schema';

async function getBarangayAnalyticsContext(barangay_id?: string | null): Promise<{
  households: Household[];
  residents: Resident[];
  records: Array<{
    resident: Resident;
    household: Household;
    flags: VulnerabilityFlags;
  }>;
}> {
  const households = await getHouseholds({
    ...(barangay_id ? { barangay_id } : {}),
    status: 'active',
    registration_status: 'approved',
  });
  const householdIds = new Set(households.map((household) => household.id));
  const residents = (await getResidents({ status: 'active' }))
    .filter((resident) => householdIds.has(resident.household_id));
  const flagsByResidentId = await getCurrentVulnerabilityFlagsMapForResidents(residents, households);
  const records = buildResidentAnalyticsRecords({
    households,
    residents,
    flagsByResidentId,
  });

  return {
    households,
    residents,
    records,
  };
}

async function getApprovedActiveHouseholdResidentContext(barangay_id?: string | null) {
  const households = await getHouseholds({
    ...(barangay_id ? { barangay_id } : {}),
    status: 'active',
    registration_status: 'approved',
  });
  const householdIds = new Set(households.map((household) => household.id));
  const residents = (await getResidents({ status: 'active' }))
    .filter((resident) => householdIds.has(resident.household_id));

  return {
    households,
    residents,
    householdsById: new Map(households.map((household) => [household.id, household])),
    residentsById: new Map(residents.map((resident) => [resident.id, resident])),
  };
}

async function getBrokenFlagLookupContext() {
  const [households, residents] = await Promise.all([
    getHouseholds(),
    getResidents(),
  ]);

  return {
    householdsById: new Map(households.map((household) => [household.id, household])),
    residentsById: new Map(residents.map((resident) => [resident.id, resident])),
  };
}

/**
 * Get dashboard statistics for municipality
 */
export async function getDashboardStats(barangay_id?: string | null) {
  try {
    const { households, records } = await getBarangayAnalyticsContext(barangay_id);
    return calculateDashboardStats(households, records);
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    throw error;
  }
}

/**
 * Get top puroks by population
 */
export async function getTopPuroksByPopulation(
  barangay_id?: string | null,
  limit: number = 3
): Promise<Array<{ purok: string; population: number }>> {
  try {
    const { records } = await getBarangayAnalyticsContext(barangay_id);
    return calculateTopPuroksByPopulation(records, limit);
  } catch (error) {
    console.error('Error getting top puroks by population:', error);
    throw error;
  }
}

/**
 * Get top puroks by household count
 */
export async function getTopPuroksByHouseholds(
  barangay_id?: string | null,
  limit: number = 3
): Promise<Array<{ purok: string; households: number }>> {
  try {
    const { households } = await getBarangayAnalyticsContext(barangay_id);
    return calculateTopPuroksByHouseholds(households, limit);
  } catch (error) {
    console.error('Error getting top puroks by households:', error);
    throw error;
  }
}

/**
 * Get top puroks by vulnerability count
 */
export async function getTopPuroksByVulnerability(
  barangay_id?: string | null,
  limit: number = 3
): Promise<Array<{ purok: string; vulnerable_count: number }>> {
  try {
    const { records } = await getBarangayAnalyticsContext(barangay_id);
    return calculateTopPuroksByVulnerability(records, limit);
  } catch (error) {
    console.error('Error getting top puroks by vulnerability:', error);
    throw error;
  }
}

/**
 * Get all vulnerable residents with filters
 */
export async function getVulnerableResidents(
  barangay_id?: string | null,
  filters?: {
    vulnerability_type?: 'child' | 'senior' | 'pwd' | 'pregnant' | 'chronic' | 'low_income';
    purok_sitio?: string;
  }
): Promise<Array<{
  resident: Resident;
  household: Household;
  flags: VulnerabilityFlags;
}>> {
  try {
    const { records } = await getBarangayAnalyticsContext(barangay_id);
    return filterResidentAnalyticsRecords(records, filters);
  } catch (error) {
    console.error('Error getting vulnerable residents:', error);
    throw error;
  }
}

/**
 * Search residents globally by name
 */
export async function searchResidents(query: string): Promise<Resident[]> {
  try {
    const search = query.toLowerCase();
    return await getResidents({ search });
  } catch (error) {
    console.error('Error searching residents:', error);
    throw error;
  }
}

/**
 * Get heatmap data by purok
 */
export async function getHeatmapData(barangay_id?: string | null): Promise<Array<{
  purok: string;
  total_residents: number;
  vulnerable_count: number;
  intensity: number; // 0-1 scale
}>> {
  try {
    const { households, records } = await getBarangayAnalyticsContext(barangay_id);
    return calculateHeatmapData(households, records);
  } catch (error) {
    console.error('Error getting heatmap data:', error);
    throw error;
  }
}

/**
 * Get recent activities (last 10 changes)
 */
export async function getRecentActivities(limit: number = 10) {
  try {
    const logs = await db.getAll(STORE_NAMES.audit_logs);
    return logs
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  } catch (error) {
    console.error('Error getting recent activities:', error);
    throw error;
  }
}

export async function getResidentsMissingBirthdateRecords(
  barangay_id?: string | null,
): Promise<Array<{ resident: Resident; household: Household }>> {
  const context = await getApprovedActiveHouseholdResidentContext(barangay_id);
  return getResidentsMissingBirthdate({
    residents: context.residents,
    householdsById: context.householdsById,
  }).map((resident) => ({
    resident,
    household: context.householdsById.get(resident.household_id)!,
  }));
}

export async function getBrokenVulnerabilityFlagRecords(
  barangay_id?: string | null,
): Promise<BrokenVulnerabilityFlagIssue[]> {
  const context = await getBrokenFlagLookupContext();
  const flags = await db.getAll<VulnerabilityFlags>(STORE_NAMES.vulnerability_flags);
  const issues = getBrokenVulnerabilityFlagIssues({
    flags,
    residentsById: context.residentsById,
    householdsById: context.householdsById,
  });

  if (!barangay_id) {
    return issues;
  }

  return issues.filter((issue) => issue.household?.barangay_id === barangay_id);
}

export async function getBlockedPackageTemplateReadiness(): Promise<PackageTemplateReadiness[]> {
  const [templates, inventoryItems] = await Promise.all([
    getPackageTemplates(),
    getInventoryItems(),
  ]);

  return getBlockedPackageTemplates(templates, inventoryItems);
}

export async function getZeroEligibilityDistributionEvents(
  barangay_id?: string | null,
): Promise<Array<{ event: DistributionEvent; eligibility_summary: DistributionEligibilitySummary }>> {
  const events = await getDistributionEvents();
  const scopedEvents = barangay_id
    ? events.filter((event) => event.barangay_id === barangay_id)
    : events;

  const summaries = await Promise.all(
    scopedEvents
      .filter((event) => event.status === 'planned' || event.status === 'ongoing')
      .map(async (event) => ({
        event,
        context: await getDistributionAudienceContext({
          barangay_id: event.barangay_id || barangay_id,
          target_group: event.target_group,
          target_scope: event.target_scope,
          scope_label: 'the event scope',
        }),
      })),
  );

  return summaries
    .filter(({ context }) => context.eligibility_summary.eligible_residents === 0 || context.eligibility_summary.eligible_households === 0)
    .map(({ event, context }) => ({
      event,
      eligibility_summary: context.eligibility_summary,
    }));
}

export async function getDataQualitySummary(
  barangay_id?: string | null,
): Promise<DataQualitySummary> {
  const context = await getApprovedActiveHouseholdResidentContext(barangay_id);
  const [flags, brokenFlagContext, zeroMatchEvents, blockedTemplates] = await Promise.all([
    db.getAll<VulnerabilityFlags>(STORE_NAMES.vulnerability_flags),
    getBrokenFlagLookupContext(),
    getZeroEligibilityDistributionEvents(barangay_id),
    getBlockedPackageTemplateReadiness(),
  ]);

  const brokenFlags = getBrokenVulnerabilityFlagIssues({
    flags,
    residentsById: brokenFlagContext.residentsById,
    householdsById: brokenFlagContext.householdsById,
  }).filter((issue) => !barangay_id || issue.household?.barangay_id === barangay_id);

  return summarizeOperationalDataQuality({
    householdsMissingLocation: getHouseholdsMissingLocation(context.households),
    residentsMissingBirthdate: getResidentsMissingBirthdate({
      residents: context.residents,
      householdsById: context.householdsById,
    }),
    brokenFlags,
    zeroMatchEvents,
    blockedTemplates,
  });
}
