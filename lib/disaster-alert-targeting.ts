import type { HazardType, Household, PurokRiskProfile } from '@/lib/db/schema';
import { parseHazardTags } from '@/lib/disaster-alerts';
import { normalizePurokRiskProfile } from '@/lib/purok-risk-profiles';

const DEFAULT_MAP_TRIGGER_RADIUS_METERS = 1000;
const EARTH_RADIUS_METERS = 6371000;

type AlertTargetHousehold = Pick<Household, 'purok_sitio' | 'hazard_tags' | 'gps_lat' | 'gps_long'>;
type AlertTargetProfile = Pick<PurokRiskProfile, 'purok_sitio' | 'flood_prone'>;

function toRadians(value: number) {
  return value * Math.PI / 180;
}

function hasFiniteCoordinates(input: Pick<AlertTargetHousehold, 'gps_lat' | 'gps_long'>) {
  return typeof input.gps_lat === 'number'
    && Number.isFinite(input.gps_lat)
    && typeof input.gps_long === 'number'
    && Number.isFinite(input.gps_long);
}

function getDistanceMeters(
  left: { lat: number; lng: number },
  right: { lat: number; lng: number },
) {
  const deltaLat = toRadians(right.lat - left.lat);
  const deltaLng = toRadians(right.lng - left.lng);
  const startLat = toRadians(left.lat);
  const endLat = toRadians(right.lat);
  const halfChord = Math.sin(deltaLat / 2) ** 2
    + Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(halfChord));
}

export function selectAlertTargetHouseholds<T extends AlertTargetHousehold>(input: {
  households: T[];
  hazard: HazardType;
  purokSitio?: string | null;
  purokRiskProfiles?: AlertTargetProfile[];
  triggerLat?: number | null;
  triggerLng?: number | null;
  mapTriggerRadiusMeters?: number;
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

  const canUseMapTrigger = typeof input.triggerLat === 'number'
    && Number.isFinite(input.triggerLat)
    && typeof input.triggerLng === 'number'
    && Number.isFinite(input.triggerLng);

  if (canUseMapTrigger) {
    const radiusMeters = Math.max(
      100,
      Math.round(input.mapTriggerRadiusMeters ?? DEFAULT_MAP_TRIGGER_RADIUS_METERS),
    );
    const nearbyHouseholds = scopedHouseholds.filter((household) => (
      hasFiniteCoordinates(household)
      && getDistanceMeters(
        { lat: input.triggerLat!, lng: input.triggerLng! },
        { lat: household.gps_lat!, lng: household.gps_long! },
      ) <= radiusMeters
    ));

    if (nearbyHouseholds.length > 0) {
      return {
        households: nearbyHouseholds,
        strategy: 'map_trigger_radius',
      } as const;
    }
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
