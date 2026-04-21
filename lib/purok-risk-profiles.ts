import type {
  DisasterAlertRule,
  HazardType,
  Household,
  PurokFloodControlStatus,
  PurokRiskProfile,
} from '@/lib/db/schema';
import { getBarangayLabel } from '@/lib/barangays';
import { normalizePurokSitio } from '@/lib/geocoding';

export const PUROK_FLOOD_CONTROL_STATUS_LABELS: Record<PurokFloodControlStatus, string> = {
  protected: 'Protected',
  partial: 'Partial flood control',
  none: 'No flood control',
  unknown: 'Flood control unknown',
};

export function isPurokFloodControlStatus(value: unknown): value is PurokFloodControlStatus {
  return value === 'protected'
    || value === 'partial'
    || value === 'none'
    || value === 'unknown';
}

export function buildPurokRiskProfileId(barangayId: string, purokSitio: string) {
  return `${barangayId.trim()}::${normalizePurokSitio(purokSitio)}`;
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeDate(value: unknown) {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  return new Date();
}

export function createDefaultPurokRiskProfile(input: {
  barangay_id: string;
  purok_sitio: string;
  updatedBy?: string;
  updatedAt?: Date;
}): PurokRiskProfile {
  const normalizedPurok = normalizePurokSitio(input.purok_sitio);
  return {
    id: buildPurokRiskProfileId(input.barangay_id, normalizedPurok),
    barangay_id: input.barangay_id.trim(),
    purok_sitio: normalizedPurok,
    flood_prone: false,
    flood_control_status: 'unknown',
    updatedAt: input.updatedAt ?? new Date(),
    updatedBy: normalizeOptionalText(input.updatedBy),
    syncStatus: 'synced',
  };
}

export function normalizePurokRiskProfile(profile: PurokRiskProfile): PurokRiskProfile {
  const normalizedPurok = normalizePurokSitio(profile.purok_sitio);
  return {
    ...profile,
    id: buildPurokRiskProfileId(profile.barangay_id, normalizedPurok),
    barangay_id: profile.barangay_id.trim(),
    purok_sitio: normalizedPurok,
    flood_prone: Boolean(profile.flood_prone),
    flood_control_status: isPurokFloodControlStatus(profile.flood_control_status)
      ? profile.flood_control_status
      : 'unknown',
    flood_control_notes: normalizeOptionalText(profile.flood_control_notes),
    default_evacuation_site: normalizeOptionalText(profile.default_evacuation_site),
    warning_notes: normalizeOptionalText(profile.warning_notes),
    updatedAt: normalizeDate(profile.updatedAt),
    updatedBy: normalizeOptionalText(profile.updatedBy),
    syncStatus: profile.syncStatus ?? 'synced',
  };
}

export function buildPurokRiskProfileMap(
  profiles: PurokRiskProfile[],
) {
  return new Map(
    profiles.map((profile) => {
      const normalized = normalizePurokRiskProfile(profile);
      return [normalized.id, normalized] as const;
    }),
  );
}

export function getPurokRiskProfileKeyForHousehold(
  household: Pick<Household, 'barangay_id' | 'purok_sitio'>,
) {
  return buildPurokRiskProfileId(household.barangay_id, household.purok_sitio);
}

export function getPurokRiskProfileForHousehold(
  household: Pick<Household, 'barangay_id' | 'purok_sitio'>,
  profiles: PurokRiskProfile[] | Map<string, PurokRiskProfile>,
) {
  if (profiles instanceof Map) {
    return profiles.get(getPurokRiskProfileKeyForHousehold(household));
  }

  const profileMap = buildPurokRiskProfileMap(profiles);
  return profileMap.get(getPurokRiskProfileKeyForHousehold(household));
}

export function buildHouseholdPurokRiskSummary(
  household: Pick<Household, 'barangay_id' | 'purok_sitio' | 'evacuation_site'>,
  profile?: PurokRiskProfile | null,
) {
  const normalizedProfile = profile ? normalizePurokRiskProfile(profile) : undefined;
  const householdEvacuationSite = normalizeOptionalText(household.evacuation_site);
  const defaultEvacuationSite = normalizedProfile?.default_evacuation_site;

  return {
    hasProfile: Boolean(normalizedProfile),
    purokSitio: normalizePurokSitio(household.purok_sitio),
    floodProne: Boolean(normalizedProfile?.flood_prone),
    floodControlStatus: normalizedProfile?.flood_control_status ?? 'unknown',
    floodControlLabel: PUROK_FLOOD_CONTROL_STATUS_LABELS[
      normalizedProfile?.flood_control_status ?? 'unknown'
    ],
    floodControlNotes: normalizedProfile?.flood_control_notes,
    defaultEvacuationSite,
    householdEvacuationSite,
    effectiveEvacuationSite: householdEvacuationSite ?? defaultEvacuationSite,
    warningNotes: normalizedProfile?.warning_notes,
    updatedAt: normalizedProfile?.updatedAt,
  };
}

export interface FloodProneZoneMarker {
  id: string;
  barangayId: string;
  purokSitio: string;
  lat: number;
  lng: number;
  householdCount: number;
  floodControlStatus: PurokFloodControlStatus;
  warningNotes?: string;
}

export interface FieldResponseZoneMarker {
  id: string;
  barangayId: string;
  label: string;
  subtitle: string;
  lat: number;
  lng: number;
  source: 'purok_profile' | 'alert_rule';
  hazard: HazardType;
  purokSitio?: string;
  householdCount?: number;
  floodControlStatus?: PurokFloodControlStatus;
  warningNotes?: string;
}

function formatMappedHouseholdCount(count: number) {
  return count === 1 ? '1 mapped household' : `${count} mapped households`;
}

function formatHazardLabel(hazard: HazardType) {
  return hazard
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function hasFiniteCoordinates(
  input: Pick<DisasterAlertRule, 'trigger_lat' | 'trigger_lng'>,
): input is Pick<DisasterAlertRule, 'trigger_lat' | 'trigger_lng'> & {
  trigger_lat: number;
  trigger_lng: number;
} {
  return Number.isFinite(input.trigger_lat) && Number.isFinite(input.trigger_lng);
}

function roundZoneCoordinate(value: number) {
  return Math.round(value * 100000) / 100000;
}

function buildAlertRuleZoneScopeKey(
  rule: Pick<DisasterAlertRule, 'barangay_id' | 'purok_sitio' | 'hazard' | 'trigger_lat' | 'trigger_lng'>,
) {
  const normalizedPurok = normalizeOptionalText(rule.purok_sitio);
  if (normalizedPurok) {
    return `purok::${buildPurokRiskProfileId(rule.barangay_id, normalizedPurok)}`;
  }

  return `trigger::${rule.hazard}::${rule.barangay_id.trim()}::${roundZoneCoordinate(rule.trigger_lat)}::${roundZoneCoordinate(rule.trigger_lng)}`;
}

export function buildFloodProneZoneMarkers(
  households: Array<Pick<Household, 'barangay_id' | 'purok_sitio' | 'gps_lat' | 'gps_long'>>,
  profiles: PurokRiskProfile[],
): FloodProneZoneMarker[] {
  const profileMap = buildPurokRiskProfileMap(profiles);
  const coordinatesByProfile = new Map<string, {
    latTotal: number;
    lngTotal: number;
    householdCount: number;
  }>();

  households.forEach((household) => {
    if (typeof household.gps_lat !== 'number' || typeof household.gps_long !== 'number') {
      return;
    }

    const profile = profileMap.get(getPurokRiskProfileKeyForHousehold(household));
    if (!profile?.flood_prone) {
      return;
    }

    const current = coordinatesByProfile.get(profile.id) ?? {
      latTotal: 0,
      lngTotal: 0,
      householdCount: 0,
    };

    current.latTotal += household.gps_lat;
    current.lngTotal += household.gps_long;
    current.householdCount += 1;
    coordinatesByProfile.set(profile.id, current);
  });

  const markers: FloodProneZoneMarker[] = [];

  profiles
    .map((profile) => normalizePurokRiskProfile(profile))
    .filter((profile) => profile.flood_prone)
    .forEach((profile) => {
      const coordinates = coordinatesByProfile.get(profile.id);
      if (!coordinates || coordinates.householdCount === 0) {
        return;
      }

      markers.push({
        id: profile.id,
        barangayId: profile.barangay_id,
        purokSitio: profile.purok_sitio,
        lat: coordinates.latTotal / coordinates.householdCount,
        lng: coordinates.lngTotal / coordinates.householdCount,
        householdCount: coordinates.householdCount,
        floodControlStatus: profile.flood_control_status,
        warningNotes: profile.warning_notes,
      });
    });

  return markers.sort((left, right) => {
    if (right.householdCount !== left.householdCount) {
      return right.householdCount - left.householdCount;
    }

    return left.purokSitio.localeCompare(right.purokSitio, undefined, { numeric: true });
  });
}

export function buildFieldResponseZoneMarkers(
  households: Array<Pick<Household, 'barangay_id' | 'purok_sitio' | 'gps_lat' | 'gps_long'>>,
  profiles: PurokRiskProfile[],
  alertRules: DisasterAlertRule[] = [],
): FieldResponseZoneMarker[] {
  const profileMarkers: FieldResponseZoneMarker[] = buildFloodProneZoneMarkers(households, profiles).map((marker) => ({
    id: marker.id,
    barangayId: marker.barangayId,
    label: marker.purokSitio,
    subtitle: formatMappedHouseholdCount(marker.householdCount),
    lat: marker.lat,
    lng: marker.lng,
    source: 'purok_profile' as const,
    hazard: 'flood' as const,
    purokSitio: marker.purokSitio,
    householdCount: marker.householdCount,
    floodControlStatus: marker.floodControlStatus,
    warningNotes: marker.warningNotes,
  }));

  const profileKeysWithVisibleZones = new Set(
    profileMarkers
      .filter((marker) => marker.purokSitio)
      .map((marker) => buildPurokRiskProfileId(marker.barangayId, marker.purokSitio!)),
  );
  const seenAlertScopeKeys = new Set<string>();
  const alertRuleMarkers: FieldResponseZoneMarker[] = [];

  alertRules
    .filter((rule) => rule.enabled && rule.hazard === 'flood' && hasFiniteCoordinates(rule))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .forEach((rule) => {
      const normalizedPurok = normalizeOptionalText(rule.purok_sitio)
        ? normalizePurokSitio(rule.purok_sitio!)
        : undefined;

      if (normalizedPurok && profileKeysWithVisibleZones.has(buildPurokRiskProfileId(rule.barangay_id, normalizedPurok))) {
        return;
      }

      const scopeKey = buildAlertRuleZoneScopeKey(rule);
      if (seenAlertScopeKeys.has(scopeKey)) {
        return;
      }
      seenAlertScopeKeys.add(scopeKey);

      const barangayLabel = getBarangayLabel(rule.barangay_id) ?? rule.barangay_id.trim();
      const hazardLabel = formatHazardLabel(rule.hazard);
      const subtitle = normalizedPurok
        ? `${barangayLabel} · ${hazardLabel} auto-alert trigger`
        : `${hazardLabel} auto-alert trigger`;

      alertRuleMarkers.push({
        id: `alert-rule::${rule.id}`,
        barangayId: rule.barangay_id.trim(),
        label: normalizedPurok ?? barangayLabel,
        subtitle,
        lat: rule.trigger_lat,
        lng: rule.trigger_lng,
        source: 'alert_rule',
        hazard: rule.hazard,
        purokSitio: normalizedPurok,
      });
    });

  return [...profileMarkers, ...alertRuleMarkers];
}

export function matchesPurokRiskFilters(
  household: Pick<Household, 'barangay_id' | 'purok_sitio'>,
  profiles: Map<string, PurokRiskProfile>,
  filters: {
    floodProne: 'all' | 'flood_prone' | 'not_flood_prone';
    floodControlStatus: PurokFloodControlStatus | 'all';
  },
) {
  const profile = getPurokRiskProfileForHousehold(household, profiles);
  const floodProne = Boolean(profile?.flood_prone);
  const floodControlStatus = profile?.flood_control_status ?? 'unknown';

  if (filters.floodProne === 'flood_prone' && !floodProne) {
    return false;
  }

  if (filters.floodProne === 'not_flood_prone' && floodProne) {
    return false;
  }

  if (filters.floodControlStatus !== 'all' && floodControlStatus !== filters.floodControlStatus) {
    return false;
  }

  return true;
}
