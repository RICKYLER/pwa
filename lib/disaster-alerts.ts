import type {
  DisasterAlertNotificationPayload,
  DisasterAlertSeverity,
  DisasterAlertTriggerSource,
  DisasterRiskLevel,
  HazardType,
  PurokFloodControlStatus,
  UserNotification,
} from '@/lib/db/schema';
import { BARANGAY_OPTIONS } from '@/lib/barangays';
import { PUROK_FLOOD_CONTROL_STATUS_LABELS } from '@/lib/purok-risk-profiles';

export const HAZARD_LABELS: Record<HazardType, string> = {
  flood: 'Flood',
  typhoon: 'Typhoon',
  landslide: 'Landslide',
  storm_surge: 'Storm surge',
  fire: 'Fire',
  earthquake: 'Earthquake',
};

export const DISASTER_RISK_LEVEL_LABELS: Record<DisasterRiskLevel, string> = {
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
};

export const DISASTER_ALERT_SEVERITY_LABELS: Record<DisasterAlertSeverity, string> = {
  watch: 'Watch',
  warning: 'Warning',
};

export const DISASTER_ALERT_TRIGGER_SOURCE_LABELS: Record<DisasterAlertTriggerSource, string> = {
  official: 'Official advisory',
  threshold: 'Threshold trigger',
  hybrid: 'Official + threshold',
};

export const PUROK_FLOOD_CONTROL_STATUS_NOTIFICATION_LABELS: Record<PurokFloodControlStatus, string> =
  PUROK_FLOOD_CONTROL_STATUS_LABELS;

export function isHazardType(value: unknown): value is HazardType {
  return value === 'flood'
    || value === 'typhoon'
    || value === 'landslide'
    || value === 'storm_surge'
    || value === 'fire'
    || value === 'earthquake';
}

export function isDisasterRiskLevel(value: unknown): value is DisasterRiskLevel {
  return value === 'low' || value === 'medium' || value === 'high';
}

export function isDisasterAlertSeverity(value: unknown): value is DisasterAlertSeverity {
  return value === 'watch' || value === 'warning';
}

export function isDisasterAlertTriggerSource(value: unknown): value is DisasterAlertTriggerSource {
  return value === 'official' || value === 'threshold' || value === 'hybrid';
}

export function isPurokFloodControlStatus(value: unknown): value is PurokFloodControlStatus {
  return value === 'protected'
    || value === 'partial'
    || value === 'none'
    || value === 'unknown';
}

export function parseHazardTags(value: unknown): HazardType[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(
    value.filter((entry): entry is HazardType => isHazardType(entry)),
  ));
}

export function getBarangayLabelForAlert(barangayId?: string | null) {
  return BARANGAY_OPTIONS.find((option) => option.id === barangayId)?.label ?? barangayId ?? '';
}

export function buildAffectedAreaLabel(input: {
  barangay_id: string;
  purok_sitio?: string | null;
  municipality?: string | null;
}) {
  const parts = [
    input.purok_sitio?.trim() || '',
    getBarangayLabelForAlert(input.barangay_id),
    input.municipality?.trim() || '',
  ].filter(Boolean);

  return parts.join(', ');
}

export function buildDisasterAlertNotificationBody(payload: {
  hazard: HazardType;
  severity: DisasterAlertSeverity;
  barangay_id: string;
  purok_sitio?: string | null;
  municipality?: string | null;
  trigger_reason: string;
  weather_summary?: string | null;
  flood_control_status?: PurokFloodControlStatus | null;
  default_evacuation_site?: string | null;
  warning_notes?: string | null;
}) {
  const area = buildAffectedAreaLabel(payload);
  const summaryParts = [
    `${HAZARD_LABELS[payload.hazard]} ${DISASTER_ALERT_SEVERITY_LABELS[payload.severity].toLowerCase()}`,
    area ? `Affected area: ${area}.` : '',
    payload.weather_summary?.trim() ? `Weather: ${payload.weather_summary.trim()}.` : '',
    payload.flood_control_status
      ? `Flood control: ${PUROK_FLOOD_CONTROL_STATUS_NOTIFICATION_LABELS[payload.flood_control_status]}.`
      : '',
    payload.default_evacuation_site?.trim()
      ? `Default evacuation site: ${payload.default_evacuation_site.trim()}.`
      : '',
    payload.warning_notes?.trim() ? `Purok note: ${payload.warning_notes.trim()}.` : '',
    payload.trigger_reason.trim() ? `Basis: ${payload.trigger_reason.trim()}.` : '',
  ].filter(Boolean);

  return summaryParts.join(' ');
}

export function parseDisasterAlertNotification(
  notification: Pick<UserNotification, 'type' | 'payload'>,
): DisasterAlertNotificationPayload | null {
  if (notification.type !== 'disaster_alert') {
    return null;
  }

  const payload = notification.payload;
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const payloadRecord = payload as Record<string, unknown>;

  const alertId = typeof payloadRecord.alert_id === 'string' ? payloadRecord.alert_id : '';
  const ruleId = typeof payloadRecord.rule_id === 'string' ? payloadRecord.rule_id : '';
  const municipality = typeof payloadRecord.municipality === 'string' ? payloadRecord.municipality : '';
  const barangayId = typeof payloadRecord.barangay_id === 'string' ? payloadRecord.barangay_id : '';
  const purokSitio = typeof payloadRecord.purok_sitio === 'string' ? payloadRecord.purok_sitio : undefined;
  const hazard = payloadRecord.hazard;
  const severity = payloadRecord.severity;
  const title = typeof payloadRecord.title === 'string' ? payloadRecord.title : '';
  const message = typeof payloadRecord.message === 'string' ? payloadRecord.message : '';
  const triggerSource = payloadRecord.trigger_source;
  const triggerReason = typeof payloadRecord.trigger_reason === 'string' ? payloadRecord.trigger_reason : '';
  const weatherSummary = typeof payloadRecord.weather_summary === 'string' ? payloadRecord.weather_summary : undefined;
  const evacuationSite = typeof payloadRecord.evacuation_site === 'string' ? payloadRecord.evacuation_site : undefined;
  const specialAssistanceNotes =
    typeof payloadRecord.special_assistance_notes === 'string'
      ? payloadRecord.special_assistance_notes
      : undefined;
  const floodControlStatus = isPurokFloodControlStatus(payloadRecord.flood_control_status)
    ? payloadRecord.flood_control_status
    : undefined;
  const floodControlNotes = typeof payloadRecord.flood_control_notes === 'string'
    ? payloadRecord.flood_control_notes
    : undefined;
  const defaultEvacuationSite = typeof payloadRecord.default_evacuation_site === 'string'
    ? payloadRecord.default_evacuation_site
    : undefined;
  const warningNotes = typeof payloadRecord.warning_notes === 'string'
    ? payloadRecord.warning_notes
    : undefined;
  const issuedAt = typeof payloadRecord.issued_at === 'string' ? payloadRecord.issued_at : '';

  if (
    !alertId
    || !ruleId
    || !municipality
    || !barangayId
    || !title
    || !message
    || !triggerReason
    || !issuedAt
    || !isHazardType(hazard)
    || !isDisasterAlertSeverity(severity)
    || !isDisasterAlertTriggerSource(triggerSource)
  ) {
    return null;
  }

  return {
    alert_id: alertId,
    rule_id: ruleId,
    municipality,
    barangay_id: barangayId,
    purok_sitio: purokSitio,
    hazard,
    severity,
    title,
    message,
    trigger_source: triggerSource,
    trigger_reason: triggerReason,
    weather_summary: weatherSummary,
    evacuation_site: evacuationSite,
    special_assistance_notes: specialAssistanceNotes,
    flood_control_status: floodControlStatus,
    flood_control_notes: floodControlNotes,
    default_evacuation_site: defaultEvacuationSite,
    warning_notes: warningNotes,
    issued_at: issuedAt,
  };
}
