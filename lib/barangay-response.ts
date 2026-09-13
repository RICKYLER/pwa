import type { BarangayId } from '@/lib/barangays';
import { getBarangayLabel } from '@/lib/barangays';
import { getBarangayRegistryEntry } from '@/lib/mabini-barangays';
import { findBarangayForPoint, type BarangayBoundary } from '@/lib/barangay-geometry';
import {
  normalizePurokRiskProfile,
} from '@/lib/purok-risk-profiles';
import type {
  Household,
  Incident,
  PurokRiskProfile,
} from '@/lib/db/schema';

export type BarangayResponseStatus = 'active_response' | 'monitoring' | 'clear';

export interface BarangayResponseSummary {
  barangayId: BarangayId;
  label: string;
  psgc: string;
  areaKm2: number;
  activeIncidents: number;
  criticalIncidents: number;
  highRiskHouseholds: number;
  respondingTeams: number;
  pendingTasks: number;
  responseStatus: BarangayResponseStatus;
  evacuationSites: string[];
  floodPronePuroks: number;
}

export const BARANGAY_RESPONSE_STATUS_LABELS: Record<BarangayResponseStatus, string> = {
  active_response: 'ACTIVE RESPONSE',
  monitoring: 'MONITORING',
  clear: 'CLEAR',
};

/**
 * Determine which barangay an incident belongs to: GIS spatial lookup on its
 * coordinates first, then a barangay-name match in the location/description
 * text as fallback.
 */
export function assignIncidentBarangay(
  incident: Pick<Incident, 'gps_lat' | 'gps_lng' | 'location' | 'description'>,
  boundaries: readonly BarangayBoundary[],
): BarangayId | null {
  if (
    typeof incident.gps_lat === 'number'
    && Number.isFinite(incident.gps_lat)
    && typeof incident.gps_lng === 'number'
    && Number.isFinite(incident.gps_lng)
  ) {
    const match = findBarangayForPoint(incident.gps_lat, incident.gps_lng, boundaries);
    if (match) return match.barangayId;
  }

  const haystack = `${incident.location ?? ''} ${incident.description ?? ''}`.toLowerCase();
  if (!haystack.trim()) return null;

  for (const boundary of boundaries) {
    if (haystack.includes(boundary.label.toLowerCase())) {
      return boundary.barangayId;
    }
  }
  return null;
}

function isActiveIncident(incident: Incident): boolean {
  return incident.status !== 'resolved';
}

function deriveResponseStatus(
  attributedIncidents: Incident[],
): BarangayResponseStatus {
  if (
    attributedIncidents.some(
      (incident) => incident.severity === 'critical' || incident.status === 'responding',
    )
  ) {
    return 'active_response';
  }
  if (attributedIncidents.length > 0) {
    return 'monitoring';
  }
  return 'clear';
}

export function buildBarangayResponseSummary(input: {
  barangayId: BarangayId;
  boundaries: readonly BarangayBoundary[];
  households: readonly Household[];
  incidents: readonly Incident[];
  purokRiskProfiles?: readonly PurokRiskProfile[];
}): BarangayResponseSummary {
  const { barangayId, boundaries, households, incidents } = input;
  const registryEntry = getBarangayRegistryEntry(barangayId);
  const label = getBarangayLabel(barangayId) ?? registryEntry?.label ?? barangayId;

  const attributedIncidents = incidents.filter(
    (incident) => isActiveIncident(incident) && assignIncidentBarangay(incident, boundaries) === barangayId,
  );

  const highRiskHouseholds = households.filter(
    (household) => household.barangay_id.trim() === barangayId
      && household.disaster_risk_level === 'high',
  ).length;

  const evacuationSites = new Set<string>();
  let floodPronePuroks = 0;
  (input.purokRiskProfiles ?? []).forEach((profile) => {
    if (profile.barangay_id.trim() !== barangayId) return;
    const normalized = normalizePurokRiskProfile(profile);
    if (normalized.flood_prone) floodPronePuroks += 1;
    const site = normalized.default_evacuation_site?.trim();
    if (site) evacuationSites.add(site);
  });

  return {
    barangayId,
    label,
    psgc: registryEntry?.psgc ?? '',
    areaKm2: registryEntry?.areaKm2 ?? 0,
    activeIncidents: attributedIncidents.length,
    criticalIncidents: attributedIncidents.filter((incident) => incident.severity === 'critical').length,
    highRiskHouseholds,
    respondingTeams: attributedIncidents.filter((incident) => incident.status === 'responding').length,
    pendingTasks: attributedIncidents.filter(
      (incident) => incident.status === 'reported' || incident.status === 'verified',
    ).length,
    responseStatus: deriveResponseStatus(attributedIncidents),
    evacuationSites: [...evacuationSites],
    floodPronePuroks,
  };
}

export function buildAllBarangaySummaries(input: {
  boundaries: readonly BarangayBoundary[];
  households: readonly Household[];
  incidents: readonly Incident[];
  purokRiskProfiles?: readonly PurokRiskProfile[];
}): Map<BarangayId, BarangayResponseSummary> {
  const summaries = new Map<BarangayId, BarangayResponseSummary>();
  if (input.boundaries.length === 0) return summaries;

  input.boundaries.forEach((boundary) => {
    summaries.set(
      boundary.barangayId,
      buildBarangayResponseSummary({
        barangayId: boundary.barangayId,
        boundaries: input.boundaries,
        households: input.households,
        incidents: input.incidents,
        purokRiskProfiles: input.purokRiskProfiles,
      }),
    );
  });
  return summaries;
}
