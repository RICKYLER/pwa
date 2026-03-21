import { db, STORE_NAMES } from './indexeddb';
import { getHouseholds } from './households';
import { getResidents } from './residents';
import {
  buildResidentAnalyticsRecords,
  calculateDashboardStats,
  calculateHeatmapData,
  calculateTopPuroksByPopulation,
  calculateTopPuroksByVulnerability,
  filterResidentAnalyticsRecords,
} from './reporting';
import { getCurrentVulnerabilityFlagsMapForResidents } from './vulnerability';
import type { Resident, VulnerabilityFlags, Household } from './schema';

async function getBarangayAnalyticsContext(barangay_id: string): Promise<{
  households: Household[];
  residents: Resident[];
  records: Array<{
    resident: Resident;
    household: Household;
    flags: VulnerabilityFlags;
  }>;
}> {
  const households = await getHouseholds({
    barangay_id,
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

/**
 * Get dashboard statistics for municipality
 */
export async function getDashboardStats(barangay_id: string) {
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
  barangay_id: string,
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
 * Get top puroks by vulnerability count
 */
export async function getTopPuroksByVulnerability(
  barangay_id: string,
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
  barangay_id: string,
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
export async function getHeatmapData(barangay_id: string): Promise<Array<{
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
