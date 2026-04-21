import type { HazardType, Household, PurokRiskProfile } from '@/lib/db/schema';
import { parseHazardTags } from '@/lib/disaster-alerts';
import { normalizePurokRiskProfile } from '@/lib/purok-risk-profiles';

type AlertTargetHousehold = Pick<Household, 'purok_sitio' | 'hazard_tags'>;
type AlertTargetProfile = Pick<PurokRiskProfile, 'purok_sitio' | 'flood_prone'>;

export function selectAlertTargetHouseholds<T extends AlertTargetHousehold>(input: {
  households: T[];
  hazard: HazardType;
  purokSitio?: string | null;
  purokRiskProfiles?: AlertTargetProfile[];
}) {
  const scopedToPurok = typeof input.purokSitio === 'string' && input.purokSitio.trim().length > 0;
  const normalizedPurok = input.purokSitio?.trim();
  const scopedHouseholds = scopedToPurok
    ? input.households.filter((household) => household.purok_sitio === normalizedPurok)
    : input.households;

  if (input.hazard !== 'flood') {
    return {
      households: scopedHouseholds.filter((household) => parseHazardTags(household.hazard_tags).includes(input.hazard)),
      strategy: scopedToPurok ? 'scoped_purok' : 'hazard_tags',
    } as const;
  }

  if (scopedToPurok) {
    return {
      households: scopedHouseholds,
      strategy: 'scoped_purok',
    } as const;
  }

  const profiles = (input.purokRiskProfiles ?? []).map((profile) => normalizePurokRiskProfile({
    ...profile,
    id: `temp::${profile.purok_sitio}`,
    barangay_id: 'temp',
    flood_control_status: 'unknown',
    updatedAt: new Date(),
    syncStatus: 'synced',
  }));

  if (profiles.length > 0) {
    const floodPronePuroks = new Set(
      profiles
        .filter((profile) => profile.flood_prone)
        .map((profile) => profile.purok_sitio),
    );

    return {
      households: scopedHouseholds.filter((household) => floodPronePuroks.has(household.purok_sitio)),
      strategy: 'purok_profiles',
    } as const;
  }

  return {
    households: scopedHouseholds.filter((household) => parseHazardTags(household.hazard_tags).includes('flood')),
    strategy: 'household_hazard_tags',
  } as const;
}
