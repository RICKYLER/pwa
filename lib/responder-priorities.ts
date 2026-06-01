import { getBarangayLabel } from '@/lib/barangays';
import { normalizePurokSitio } from '@/lib/geocoding';
import type {
  DisasterAlert,
  DisasterAlertRule,
  Household,
  Incident,
  PurokFloodControlStatus,
  PurokRiskProfile,
  Resident,
  VulnerabilityFlags,
} from '@/lib/db/schema';
import {
  buildPurokRiskProfileId,
  getPurokRiskProfileForHousehold,
  PUROK_FLOOD_CONTROL_STATUS_LABELS,
} from '@/lib/purok-risk-profiles';

export type PurokPriorityLevel = 'critical' | 'high' | 'medium' | 'low';

export interface PriorityHousehold {
  household: Household;
  residents: Resident[];
  flags: VulnerabilityFlags[];
  score: number;
  reasons: string[];
}

export interface PurokPriorityGroup {
  id: string;
  barangayId: string;
  barangayLabel: string;
  purokSitio: string;
  score: number;
  level: PurokPriorityLevel;
  reasons: string[];
  households: PriorityHousehold[];
  householdCount: number;
  vulnerableResidentCount: number;
  floodProne: boolean;
  floodControlStatus: PurokFloodControlStatus;
  floodControlLabel: string;
  defaultEvacuationSite?: string;
  warningNotes?: string;
}

export interface BuildPurokPriorityGroupsInput {
  households: Household[];
  residents: Resident[];
  flags: VulnerabilityFlags[];
  purokRiskProfiles: PurokRiskProfile[];
  alertRules?: DisasterAlertRule[];
  alerts?: DisasterAlert[];
  incidents?: Incident[];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function getRiskLevelScore(level: Household['disaster_risk_level']) {
  if (level === 'high') return 18;
  if (level === 'medium') return 8;
  if (level === 'low') return 2;
  return 0;
}

function getFloodControlScore(status: PurokFloodControlStatus) {
  if (status === 'none') return 30;
  if (status === 'partial') return 16;
  if (status === 'unknown') return 12;
  return 0;
}

function getPriorityLevel(score: number): PurokPriorityLevel {
  if (score >= 90) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

function matchesScopedPurok(
  scope: Pick<DisasterAlert | DisasterAlertRule, 'barangay_id' | 'purok_sitio'>,
  barangayId: string,
  purokSitio: string,
) {
  if (scope.barangay_id !== barangayId) {
    return false;
  }

  if (!scope.purok_sitio?.trim()) {
    return true;
  }

  return normalizePurokSitio(scope.purok_sitio) === normalizePurokSitio(purokSitio);
}

function incidentMatchesPurok(incident: Incident, barangayLabel: string, purokSitio: string) {
  if (incident.status === 'resolved') {
    return false;
  }

  const isFloodRelated = incident.type === 'flood' || incident.hazard_context === 'flood';
  if (!isFloodRelated) {
    return false;
  }

  const haystack = `${incident.location} ${incident.description}`.toLowerCase();
  const purok = normalizePurokSitio(purokSitio).toLowerCase();
  const barangay = barangayLabel.toLowerCase();

  return haystack.includes(purok) || haystack.includes(barangay);
}

export function getVulnerabilityPriorityScore(flags: VulnerabilityFlags[]) {
  let score = 0;

  for (const flag of flags) {
    if (flag.is_pwd) score += 5;
    if (flag.is_pregnant) score += 5;
    if (flag.is_senior) score += 4;
    if (flag.is_infant) score += 4;
    if (flag.has_chronic_illness) score += 3;
    if (flag.is_child && !flag.is_infant) score += 2;
    if (flag.is_low_income || flag.is_indigent) score += 2;
    if (flag.is_4ps) score += 1;
  }

  return score;
}

export function getVulnerabilityPriorityLabels(flags: VulnerabilityFlags[]) {
  const labels: string[] = [];
  if (flags.some((flag) => flag.is_pwd)) labels.push('PWD');
  if (flags.some((flag) => flag.is_pregnant)) labels.push('Pregnant');
  if (flags.some((flag) => flag.is_senior)) labels.push('Senior');
  if (flags.some((flag) => flag.is_infant)) labels.push('Infant');
  if (flags.some((flag) => flag.is_child && !flag.is_infant)) labels.push('Child');
  if (flags.some((flag) => flag.has_chronic_illness)) labels.push('Chronic');
  if (flags.some((flag) => flag.is_low_income || flag.is_indigent)) labels.push('Low income');
  if (flags.some((flag) => flag.is_4ps)) labels.push('4Ps');
  return labels;
}

export function buildPurokPriorityGroups(input: BuildPurokPriorityGroupsInput): PurokPriorityGroup[] {
  const residentsByHouseholdId = new Map<string, Resident[]>();
  input.residents.forEach((resident) => {
    if (resident.status !== 'active') return;
    const current = residentsByHouseholdId.get(resident.household_id) ?? [];
    current.push(resident);
    residentsByHouseholdId.set(resident.household_id, current);
  });

  const flagsByResidentId = new Map(input.flags.map((flag) => [flag.resident_id, flag]));
  const groups = new Map<string, {
    barangayId: string;
    barangayLabel: string;
    purokSitio: string;
    profile?: PurokRiskProfile;
    households: PriorityHousehold[];
  }>();

  input.households.forEach((household) => {
    const purokSitio = normalizePurokSitio(household.purok_sitio);
    const barangayId = household.barangay_id.trim();
    const groupId = buildPurokRiskProfileId(barangayId, purokSitio);
    const householdResidents = residentsByHouseholdId.get(household.id) ?? [];
    const householdFlags = householdResidents
      .map((resident) => flagsByResidentId.get(resident.id))
      .filter((flag): flag is VulnerabilityFlags => Boolean(flag));
    const vulnerabilityScore = getVulnerabilityPriorityScore(householdFlags);
    const riskScore = getRiskLevelScore(household.disaster_risk_level);
    const householdReasons = uniqueStrings([
      household.disaster_risk_level === 'high' ? 'High household risk' : '',
      household.special_assistance_notes?.trim() ? 'Special assistance noted' : '',
      ...getVulnerabilityPriorityLabels(householdFlags),
    ]);
    const householdScore = vulnerabilityScore + riskScore + (household.special_assistance_notes?.trim() ? 3 : 0);

    const existing = groups.get(groupId) ?? {
      barangayId,
      barangayLabel: getBarangayLabel(barangayId) ?? household.barangay_name ?? barangayId,
      purokSitio,
      profile: getPurokRiskProfileForHousehold(household, input.purokRiskProfiles),
      households: [],
    };

    existing.households.push({
      household,
      residents: householdResidents,
      flags: householdFlags,
      score: householdScore,
      reasons: householdReasons,
    });
    groups.set(groupId, existing);
  });

  return Array.from(groups.entries())
    .map(([id, group]) => {
      const floodProne = Boolean(group.profile?.flood_prone);
      const floodControlStatus = group.profile?.flood_control_status ?? 'unknown';
      const scopedAlerts = (input.alerts ?? []).filter((alert) =>
        alert.hazard === 'flood' && matchesScopedPurok(alert, group.barangayId, group.purokSitio),
      );
      const scopedRules = (input.alertRules ?? []).filter((rule) =>
        rule.enabled && rule.hazard === 'flood' && matchesScopedPurok(rule, group.barangayId, group.purokSitio),
      );
      const scopedIncidents = (input.incidents ?? []).filter((incident) =>
        incidentMatchesPurok(incident, group.barangayLabel, group.purokSitio),
      );
      const vulnerableResidentCount = group.households.reduce(
        (total, priority) => total + priority.flags.filter((flag) => getVulnerabilityPriorityScore([flag]) > 0).length,
        0,
      );
      const householdScore = group.households.reduce((sum, priority) => sum + priority.score, 0);
      const operationalScore =
        scopedAlerts.reduce((sum, alert) => sum + (alert.severity === 'warning' ? 40 : 28), 0)
        + scopedIncidents.reduce((sum, incident) => {
          if (incident.severity === 'critical') return sum + 45;
          if (incident.severity === 'high') return sum + 35;
          if (incident.severity === 'medium') return sum + 25;
          return sum + 15;
        }, 0)
        + (scopedRules.length > 0 ? 10 : 0);
      const score =
        (floodProne ? 35 : 0)
        + getFloodControlScore(floodControlStatus)
        + householdScore
        + operationalScore;
      const reasons = uniqueStrings([
        floodProne ? 'Flood-prone purok' : '',
        floodControlStatus !== 'protected' ? PUROK_FLOOD_CONTROL_STATUS_LABELS[floodControlStatus] : '',
        scopedAlerts.length ? 'Active flood alert' : '',
        scopedIncidents.length ? 'Active flood incident' : '',
        vulnerableResidentCount ? `${vulnerableResidentCount} vulnerable resident${vulnerableResidentCount === 1 ? '' : 's'}` : '',
        group.profile?.warning_notes?.trim() ? 'Purok warning notes' : '',
      ]);

      return {
        id,
        barangayId: group.barangayId,
        barangayLabel: group.barangayLabel,
        purokSitio: group.purokSitio,
        score,
        level: getPriorityLevel(score),
        reasons,
        households: group.households.sort((left, right) => {
          if (right.score !== left.score) return right.score - left.score;
          return left.household.head_name.localeCompare(right.household.head_name);
        }),
        householdCount: group.households.length,
        vulnerableResidentCount,
        floodProne,
        floodControlStatus,
        floodControlLabel: PUROK_FLOOD_CONTROL_STATUS_LABELS[floodControlStatus],
        defaultEvacuationSite: group.profile?.default_evacuation_site,
        warningNotes: group.profile?.warning_notes,
      };
    })
    .filter((group) => group.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.vulnerableResidentCount !== left.vulnerableResidentCount) {
        return right.vulnerableResidentCount - left.vulnerableResidentCount;
      }
      if (right.householdCount !== left.householdCount) return right.householdCount - left.householdCount;
      return left.purokSitio.localeCompare(right.purokSitio, undefined, { numeric: true });
    });
}

export function matchesPurokPriorityFilters(
  group: Pick<PurokPriorityGroup, 'floodProne' | 'floodControlStatus'>,
  filters: {
    floodProne: 'all' | 'flood_prone' | 'not_flood_prone';
    floodControlStatus: PurokFloodControlStatus | 'all';
  },
) {
  if (filters.floodProne === 'flood_prone' && !group.floodProne) return false;
  if (filters.floodProne === 'not_flood_prone' && group.floodProne) return false;
  if (filters.floodControlStatus !== 'all' && group.floodControlStatus !== filters.floodControlStatus) return false;
  return true;
}
