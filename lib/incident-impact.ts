import { getBarangayLabel } from '@/lib/barangays';
import { getDistanceMeters } from '@/lib/disaster-alert-targeting';
import {
  buildPurokRiskProfileId,
  normalizePurokRiskProfile,
} from '@/lib/purok-risk-profiles';
import { normalizePurokSitio } from '@/lib/geocoding';
import { getResidentCategories, type DistributionCategory } from '@/lib/distribution-audience';
import {
  buildPriorityHousehold,
  getVulnerabilityPriorityScore,
  type PriorityHousehold,
} from '@/lib/responder-priorities';
import type {
  DisasterAlert,
  DisasterAlertRule,
  Household,
  Incident,
  PurokRiskProfile,
  Resident,
  VulnerabilityFlags,
} from '@/lib/db/schema';

export type IncidentImpactMatchStrategy = 'alert_scope' | 'gps_radius' | 'text_fallback' | 'none';

export interface IncidentImpactAffectedPurok {
  barangayId: string;
  barangayLabel: string;
  purokSitio: string;
}

export interface IncidentImpactAnalysis {
  incidentId: string;
  matchStrategy: IncidentImpactMatchStrategy;
  matchNote: string;
  affectedPuroks: IncidentImpactAffectedPurok[];
  affectedHouseholdCount: number;
  affectedResidentCount: number;
  vulnerableResidentCount: number;
  categoryCounts: Record<DistributionCategory, number>;
  evacuationSite?: string;
  queue: PriorityHousehold[];
}

export const DEFAULT_INCIDENT_IMPACT_GPS_RADIUS_METERS = 1000;

export function buildIncidentImpactAnalysis(input: {
  incident: Incident;
  households: Household[];
  residents: Resident[];
  flags: VulnerabilityFlags[];
  alerts?: DisasterAlert[];
  alertRules?: DisasterAlertRule[];
  purokRiskProfiles?: PurokRiskProfile[];
  gpsRadiusMeters?: number;
}): IncidentImpactAnalysis {
  const { incident, households, residents, flags } = input;

  const residentsByHouseholdId = new Map<string, Resident[]>();
  residents.forEach((resident) => {
    if (resident.status !== 'active') return;
    const current = residentsByHouseholdId.get(resident.household_id) ?? [];
    current.push(resident);
    residentsByHouseholdId.set(resident.household_id, current);
  });
  const flagsByResidentId = new Map(flags.map((flag) => [flag.resident_id, flag]));
  const profilesByGroupId = new Map<string, PurokRiskProfile>();
  (input.purokRiskProfiles ?? []).forEach((profile) => {
    profilesByGroupId.set(
      buildPurokRiskProfileId(profile.barangay_id, normalizePurokSitio(profile.purok_sitio)),
      profile,
    );
  });

  const match = resolveAffectedHouseholds(input);
  const affectedHouseholds = match.households;

  const affectedPuroks: IncidentImpactAffectedPurok[] = [];
  const seenPurokIds = new Set<string>();
  affectedHouseholds.forEach((household) => {
    const purokSitio = normalizePurokSitio(household.purok_sitio);
    const barangayId = household.barangay_id.trim();
    const purokId = buildPurokRiskProfileId(barangayId, purokSitio);
    if (seenPurokIds.has(purokId)) return;
    seenPurokIds.add(purokId);
    affectedPuroks.push({
      barangayId,
      barangayLabel: getBarangayLabel(barangayId) ?? household.barangay_name ?? barangayId,
      purokSitio,
    });
  });

  const categoryCounts: Record<DistributionCategory, number> = {
    senior: 0,
    pwd: 0,
    pregnant: 0,
    minor: 0,
    low_income: 0,
  };
  let affectedResidentCount = 0;
  let vulnerableResidentCount = 0;

  const queue = affectedHouseholds
    .map((household) => {
      const householdResidents = residentsByHouseholdId.get(household.id) ?? [];
      affectedResidentCount += householdResidents.length;
      householdResidents.forEach((resident) => {
        const flag = flagsByResidentId.get(resident.id);
        if (flag && getVulnerabilityPriorityScore([flag]) > 0) vulnerableResidentCount += 1;
        getResidentCategories(resident, flag).forEach((category) => {
          categoryCounts[category] += 1;
        });
      });
      return buildPriorityHousehold(household, householdResidents, flagsByResidentId);
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.household.head_name.localeCompare(right.household.head_name);
    });

  const evacuationSite = resolveEvacuationSite(affectedHouseholds, affectedPuroks, profilesByGroupId, incident);

  return {
    incidentId: incident.id,
    matchStrategy: match.strategy,
    matchNote: match.note,
    affectedPuroks,
    affectedHouseholdCount: affectedHouseholds.length,
    affectedResidentCount,
    vulnerableResidentCount,
    categoryCounts,
    evacuationSite,
    queue,
  };
}

type IncidentImpactMatch = {
  households: Household[];
  strategy: IncidentImpactMatchStrategy;
  note: string;
};

function resolveAffectedHouseholds(input: {
  incident: Incident;
  households: Household[];
  alerts?: DisasterAlert[];
  alertRules?: DisasterAlertRule[];
  purokRiskProfiles?: PurokRiskProfile[];
  gpsRadiusMeters?: number;
}): IncidentImpactMatch {
  const alertMatch = matchByAlertScope(input);
  if (alertMatch) return alertMatch;

  const gpsMatch = matchByGpsRadius(input);
  if (gpsMatch) return gpsMatch;

  const textMatch = matchByTextFallback(input);
  if (textMatch) return textMatch;

  return {
    households: [],
    strategy: 'none',
    note: 'No affected-area match — incident needs an alert scope, GPS pin, or a purok/barangay name in its location.',
  };
}

function matchByAlertScope(input: {
  incident: Incident;
  households: Household[];
  alerts?: DisasterAlert[];
  alertRules?: DisasterAlertRule[];
}): IncidentImpactMatch | null {
  const { incident, households, alerts, alertRules } = input;

  const alert = incident.source_alert_id
    ? (alerts ?? []).find((candidate) => candidate.id === incident.source_alert_id)
    : undefined;
  const rule = incident.source_rule_id
    ? (alertRules ?? []).find((candidate) => candidate.id === incident.source_rule_id)
    : undefined;
  const scope = alert ?? rule;

  if (!scope) return null;

  const scopeLabel = alert
    ? `Matched from alert scope: ${getBarangayLabel(alert.barangay_id) ?? alert.barangay_id}${alert.purok_sitio?.trim() ? ` · ${normalizePurokSitio(alert.purok_sitio)}` : ''}`
    : `Matched from alert rule scope: ${getBarangayLabel(rule!.barangay_id) ?? rule!.barangay_id}${rule!.purok_sitio?.trim() ? ` · ${normalizePurokSitio(rule!.purok_sitio)}` : ''}`;

  const matched = households.filter((household) => {
    const barangayId = household.barangay_id.trim();
    if (scope.barangay_id !== barangayId) return false;
    if (!scope.purok_sitio?.trim()) return true;
    return normalizePurokSitio(scope.purok_sitio) === normalizePurokSitio(household.purok_sitio);
  });

  if (matched.length === 0) return null;

  return { households: matched, strategy: 'alert_scope', note: scopeLabel };
}

function hasFiniteHouseholdCoordinates(household: Household) {
  return typeof household.gps_lat === 'number'
    && Number.isFinite(household.gps_lat)
    && typeof household.gps_long === 'number'
    && Number.isFinite(household.gps_long);
}

function matchByGpsRadius(input: {
  incident: Incident;
  households: Household[];
  gpsRadiusMeters?: number;
}): IncidentImpactMatch | null {
  const { incident, households } = input;

  const canUseGps = typeof incident.gps_lat === 'number'
    && Number.isFinite(incident.gps_lat)
    && typeof incident.gps_lng === 'number'
    && Number.isFinite(incident.gps_lng);
  if (!canUseGps) return null;

  const origin = { lat: incident.gps_lat!, lng: incident.gps_lng! };
  const radiusMeters = Math.max(
    100,
    Math.round(input.gpsRadiusMeters ?? DEFAULT_INCIDENT_IMPACT_GPS_RADIUS_METERS),
  );

  const inRadius = households.filter((household) => (
    hasFiniteHouseholdCoordinates(household)
    && getDistanceMeters(origin, { lat: household.gps_lat!, lng: household.gps_long! }) <= radiusMeters
  ));

  if (inRadius.length > 0) {
    return {
      households: inRadius,
      strategy: 'gps_radius',
      note: `Matched by GPS radius: households within ${radiusMeters} m of the incident pin.`,
    };
  }

  // No household pins inside the radius — fall back to the nearest purok
  // (purok whose household-pin centroid is closest to the incident).
  const purokBuckets = new Map<string, { household: Household; lat: number; lng: number }[]>();
  households.filter(hasFiniteHouseholdCoordinates).forEach((household) => {
    const purokSitio = normalizePurokSitio(household.purok_sitio);
    const barangayId = household.barangay_id.trim();
    const purokId = buildPurokRiskProfileId(barangayId, purokSitio);
    const current = purokBuckets.get(purokId) ?? [];
    current.push({ household, lat: household.gps_lat!, lng: household.gps_long! });
    purokBuckets.set(purokId, current);
  });

  let nearestPurokId: string | null = null;
  let nearestDistance = Infinity;
  purokBuckets.forEach((pins, purokId) => {
    const centroid = {
      lat: pins.reduce((sum, pin) => sum + pin.lat, 0) / pins.length,
      lng: pins.reduce((sum, pin) => sum + pin.lng, 0) / pins.length,
    };
    const distance = getDistanceMeters(origin, centroid);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestPurokId = purokId;
    }
  });

  if (!nearestPurokId) return null;
  const nearestPins = purokBuckets.get(nearestPurokId)!;
  const nearestHousehold = nearestPins[0].household;
  const nearestLabel = `${getBarangayLabel(nearestHousehold.barangay_id) ?? nearestHousehold.barangay_name ?? nearestHousehold.barangay_id} · ${normalizePurokSitio(nearestHousehold.purok_sitio)}`;

  return {
    households: nearestPins.map((pin) => pin.household),
    strategy: 'gps_radius',
    note: `No households within ${radiusMeters} m — matched the nearest purok instead (${nearestLabel}).`,
  };
}

function matchByTextFallback(input: {
  incident: Incident;
  households: Household[];
}): IncidentImpactMatch | null {
  const { incident, households } = input;

  const haystack = `${incident.location} ${incident.description}`.toLowerCase();
  if (!haystack.trim()) return null;

  const matched = households.filter((household) => {
    const purok = normalizePurokSitio(household.purok_sitio).toLowerCase();
    const barangay = (
      household.barangay_name
      ?? getBarangayLabel(household.barangay_id)
      ?? household.barangay_id
    )?.toLowerCase() ?? '';
    return (purok.length > 0 && haystack.includes(purok))
      || (barangay.length > 0 && haystack.includes(barangay));
  });

  if (matched.length === 0) return null;

  return {
    households: matched,
    strategy: 'text_fallback',
    note: 'Matched by purok/barangay name found in the incident location or description.',
  };
}

function resolveEvacuationSite(
  affectedHouseholds: Household[],
  affectedPuroks: IncidentImpactAffectedPurok[],
  profilesByGroupId: Map<string, PurokRiskProfile>,
  incident: Incident,
) {
  for (const purok of affectedPuroks) {
    const profile = profilesByGroupId.get(buildPurokRiskProfileId(purok.barangayId, purok.purokSitio));
    if (profile) {
      const normalized = normalizePurokRiskProfile(profile);
      if (normalized.default_evacuation_site?.trim()) {
        return normalized.default_evacuation_site.trim();
      }
    }
  }

  const householdSite = affectedHouseholds.find((household) => household.evacuation_site?.trim());
  if (householdSite?.evacuation_site?.trim()) {
    return householdSite.evacuation_site.trim();
  }

  return incident.context_snapshot?.default_evacuation_site?.trim() || undefined;
}
