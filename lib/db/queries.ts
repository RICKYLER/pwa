import { db, STORE_NAMES } from './indexeddb';
import { getHouseholds, getHouseholdsByPurok } from './households';
import { getResidents } from './residents';
import type { Resident, VulnerabilityFlags, Household } from './schema';

/**
 * Get dashboard statistics for municipality
 */
export async function getDashboardStats(barangay_id: string) {
  try {
    const households = await getHouseholds({ barangay_id, status: 'active' });
    const residents = await getResidents({ status: 'active' });
    const allFlags = await db.getAll<VulnerabilityFlags>(STORE_NAMES.vulnerability_flags);

    // Count vulnerabilities
    let children = 0, seniors = 0, pwd = 0, pregnant = 0, chronic = 0, low_income = 0;
    
    residents.forEach(resident => {
      const flags = allFlags.find(f => f.resident_id === resident.id);
      if (!flags) return;

      if (flags.is_child) children++;
      if (flags.is_senior) seniors++;
      if (flags.is_pwd) pwd++;
      if (flags.is_pregnant) pregnant++;
      if (flags.has_chronic_illness) chronic++;
      if (flags.is_low_income) low_income++;
    });

    return {
      total_households: households.length,
      total_population: residents.length,
      children_count: children,
      seniors_count: seniors,
      pwd_count: pwd,
      pregnant_count: pregnant,
      chronic_count: chronic,
      low_income_count: low_income,
    };
  } catch (error) {
    console.error('[v0] Error getting dashboard stats:', error);
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
    const households = await getHouseholds({ barangay_id });
    const puroks = new Map<string, number>();

    households.forEach(h => {
      puroks.set(h.purok_sitio, (puroks.get(h.purok_sitio) || 0) + 1);
    });

    return Array.from(puroks.entries())
      .map(([purok, population]) => ({ purok, population }))
      .sort((a, b) => b.population - a.population)
      .slice(0, limit);
  } catch (error) {
    console.error('[v0] Error getting top puroks by population:', error);
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
    const households = await getHouseholds({ barangay_id });
    const residents = await getResidents();
    const allFlags = await db.getAll<VulnerabilityFlags>(STORE_NAMES.vulnerability_flags);

    const purokVulnerability = new Map<string, number>();

    households.forEach(h => {
      purokVulnerability.set(h.purok_sitio, 0);
    });

    // Count vulnerable residents per purok
    residents.forEach(resident => {
      const household = households.find(h => h.id === resident.household_id);
      if (!household) return;

      const flags = allFlags.find(f => f.resident_id === resident.id);
      if (!flags) return;

      const isVulnerable = 
        flags.is_child || 
        flags.is_senior || 
        flags.is_pwd || 
        flags.is_pregnant ||
        flags.has_chronic_illness;

      if (isVulnerable) {
        purokVulnerability.set(
          household.purok_sitio,
          (purokVulnerability.get(household.purok_sitio) || 0) + 1
        );
      }
    });

    return Array.from(purokVulnerability.entries())
      .map(([purok, vulnerable_count]) => ({ purok, vulnerable_count }))
      .filter(item => item.vulnerable_count > 0)
      .sort((a, b) => b.vulnerable_count - a.vulnerable_count)
      .slice(0, limit);
  } catch (error) {
    console.error('[v0] Error getting top puroks by vulnerability:', error);
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
    const households = await getHouseholds({ barangay_id });
    const residents = await getResidents({ status: 'active' });
    const allFlags = await db.getAll<VulnerabilityFlags>(STORE_NAMES.vulnerability_flags);

    const vulnerable = [];

    for (const resident of residents) {
      const household = households.find(h => h.id === resident.household_id);
      const flags = allFlags.find(f => f.resident_id === resident.id);

      if (!household || !flags) continue;

      // Check if resident matches filter
      if (filters?.purok_sitio && household.purok_sitio !== filters.purok_sitio) {
        continue;
      }

      if (filters?.vulnerability_type) {
        const isMatch = 
          (filters.vulnerability_type === 'child' && flags.is_child) ||
          (filters.vulnerability_type === 'senior' && flags.is_senior) ||
          (filters.vulnerability_type === 'pwd' && flags.is_pwd) ||
          (filters.vulnerability_type === 'pregnant' && flags.is_pregnant) ||
          (filters.vulnerability_type === 'chronic' && flags.has_chronic_illness) ||
          (filters.vulnerability_type === 'low_income' && flags.is_low_income);

        if (!isMatch) continue;
      }

      vulnerable.push({ resident, household, flags });
    }

    return vulnerable.sort((a, b) => 
      a.resident.full_name.localeCompare(b.resident.full_name)
    );
  } catch (error) {
    console.error('[v0] Error getting vulnerable residents:', error);
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
    console.error('[v0] Error searching residents:', error);
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
    const households = await getHouseholds({ barangay_id });
    const residents = await getResidents({ status: 'active' });
    const allFlags = await db.getAll<VulnerabilityFlags>(STORE_NAMES.vulnerability_flags);

    const purokData = new Map<string, { total: number; vulnerable: number }>();

    // Initialize purok counts
    households.forEach(h => {
      if (!purokData.has(h.purok_sitio)) {
        purokData.set(h.purok_sitio, { total: 0, vulnerable: 0 });
      }
    });

    // Count residents and vulnerabilities
    residents.forEach(resident => {
      const household = households.find(h => h.id === resident.household_id);
      if (!household) return;

      const data = purokData.get(household.purok_sitio);
      if (!data) return;

      data.total++;

      const flags = allFlags.find(f => f.resident_id === resident.id);
      if (flags) {
        const isVulnerable = 
          flags.is_child || 
          flags.is_senior || 
          flags.is_pwd || 
          flags.is_pregnant ||
          flags.has_chronic_illness;

        if (isVulnerable) {
          data.vulnerable++;
        }
      }
    });

    // Convert to heatmap format
    const maxVulnerable = Math.max(
      ...Array.from(purokData.values()).map(d => d.vulnerable),
      1
    );

    return Array.from(purokData.entries())
      .map(([purok, data]) => ({
        purok,
        total_residents: data.total,
        vulnerable_count: data.vulnerable,
        intensity: data.vulnerable / maxVulnerable,
      }))
      .sort((a, b) => a.purok.localeCompare(b.purok));
  } catch (error) {
    console.error('[v0] Error getting heatmap data:', error);
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
    console.error('[v0] Error getting recent activities:', error);
    throw error;
  }
}
