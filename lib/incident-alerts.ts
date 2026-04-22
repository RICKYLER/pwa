import type {
  DisasterAlertNotificationPayload,
  DisasterAlertSeverity,
  HazardType,
  Incident,
  IncidentContextSnapshot,
  IncidentSeverity,
  IncidentType,
} from '@/lib/db/schema';
import {
  buildAffectedAreaLabel,
  HAZARD_LABELS,
  PUROK_FLOOD_CONTROL_STATUS_NOTIFICATION_LABELS,
} from '@/lib/disaster-alerts';

export function mapAlertHazardToIncidentType(hazard: HazardType): IncidentType {
  switch (hazard) {
    case 'flood':
      return 'flood';
    case 'typhoon':
      return 'typhoon';
    case 'landslide':
      return 'landslide';
    case 'fire':
      return 'fire';
    case 'storm_surge':
      return 'flood';
    case 'earthquake':
    default:
      return 'other';
  }
}

export function mapAlertSeverityToIncidentSeverity(severity: DisasterAlertSeverity): IncidentSeverity {
  return severity === 'warning' ? 'high' : 'medium';
}

export function buildIncidentLocationFromAlert(payload: DisasterAlertNotificationPayload) {
  return buildAffectedAreaLabel(payload) || payload.title;
}

export function buildIncidentContextSnapshotFromAlert(
  payload: DisasterAlertNotificationPayload,
): IncidentContextSnapshot {
  return {
    alert_title: payload.title,
    trigger_reason: payload.trigger_reason,
    weather_summary: payload.weather_summary,
    flood_control_status: payload.flood_control_status,
    flood_control_notes: payload.flood_control_notes,
    default_evacuation_site: payload.default_evacuation_site ?? payload.evacuation_site,
    warning_notes: payload.warning_notes,
  };
}

export function buildIncidentDescriptionFromAlert(payload: DisasterAlertNotificationPayload) {
  const snapshot = buildIncidentContextSnapshotFromAlert(payload);
  const parts = [
    `${HAZARD_LABELS[payload.hazard]} alert basis: ${payload.trigger_reason}.`,
    snapshot.weather_summary ? `Weather: ${snapshot.weather_summary}.` : '',
    snapshot.flood_control_status
      ? `Flood control: ${PUROK_FLOOD_CONTROL_STATUS_NOTIFICATION_LABELS[snapshot.flood_control_status]}.`
      : '',
    snapshot.flood_control_notes ? `Flood-control note: ${snapshot.flood_control_notes}.` : '',
    snapshot.default_evacuation_site ? `Evacuation site: ${snapshot.default_evacuation_site}.` : '',
    snapshot.warning_notes ? `Purok note: ${snapshot.warning_notes}.` : '',
  ].filter(Boolean);

  return parts.join(' ');
}

export function buildAlertDerivedIncidentDraft(input: {
  payload: DisasterAlertNotificationPayload;
  reportedBy: string;
  gps_lat?: number;
  gps_lng?: number;
}): Omit<Incident, 'id' | 'syncStatus'> {
  const { payload, reportedBy, gps_lat, gps_lng } = input;

  return {
    type: mapAlertHazardToIncidentType(payload.hazard),
    location: buildIncidentLocationFromAlert(payload),
    gps_lat,
    gps_lng,
    severity: mapAlertSeverityToIncidentSeverity(payload.severity),
    status: 'reported',
    reported_by: reportedBy,
    reported_at: new Date(payload.issued_at),
    description: buildIncidentDescriptionFromAlert(payload),
    source: 'alert',
    source_alert_id: payload.alert_id,
    source_rule_id: payload.rule_id,
    hazard_context: payload.hazard,
    context_snapshot: buildIncidentContextSnapshotFromAlert(payload),
  };
}
