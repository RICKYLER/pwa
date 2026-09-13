import type {
  EvacuationCenter,
  EvacuationCenterActivationSource,
  EvacuationCenterStatus,
} from '@/lib/db/schema';
import { getBarangayLabel, MABINI_MUNICIPALITY } from '@/lib/barangays';

export const EVACUATION_CENTER_STATUS_LABELS: Record<EvacuationCenterStatus, string> = {
  closed: 'Closed',
  open: 'Open',
};

export const EVACUATION_CENTER_ACTIVATION_SOURCE_LABELS: Record<EvacuationCenterActivationSource, string> = {
  alert: 'Auto-opened by disaster alert',
  manual: 'Opened manually',
};

export function isEvacuationCenterStatus(value: unknown): value is EvacuationCenterStatus {
  return value === 'closed' || value === 'open';
}

export function isEvacuationCenterActivationSource(value: unknown): value is EvacuationCenterActivationSource {
  return value === 'alert' || value === 'manual';
}

export function normalizeEvacuationCenterName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

export function buildEvacuationCenterId(barangayId: string, name: string) {
  return `evac::${barangayId.trim().toLowerCase()}::${normalizeEvacuationCenterName(name).toLowerCase()}`;
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeOptionalDate(value: unknown) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  return undefined;
}

function normalizeDate(value: unknown) {
  return normalizeOptionalDate(value) ?? new Date();
}

export function normalizeEvacuationCenter(center: EvacuationCenter): EvacuationCenter {
  return {
    ...center,
    id: center.id.trim(),
    municipality: center.municipality?.trim() || MABINI_MUNICIPALITY,
    barangay_id: center.barangay_id.trim(),
    name: normalizeEvacuationCenterName(center.name),
    gps_lat: normalizeOptionalNumber(center.gps_lat),
    gps_lng: normalizeOptionalNumber(center.gps_lng),
    capacity: typeof center.capacity === 'number' && Number.isFinite(center.capacity) && center.capacity >= 0
      ? Math.round(center.capacity)
      : undefined,
    status: isEvacuationCenterStatus(center.status) ? center.status : 'closed',
    activation_source: isEvacuationCenterActivationSource(center.activation_source)
      ? center.activation_source
      : undefined,
    activated_at: normalizeOptionalDate(center.activated_at),
    activated_by: normalizeOptionalText(center.activated_by),
    activated_by_alert_id: normalizeOptionalText(center.activated_by_alert_id),
    deactivated_at: normalizeOptionalDate(center.deactivated_at),
    notes: normalizeOptionalText(center.notes),
    updatedAt: normalizeDate(center.updatedAt),
    updatedBy: normalizeOptionalText(center.updatedBy),
    syncStatus: center.syncStatus ?? 'synced',
  };
}

export function getEvacuationCenterLabel(center: Pick<EvacuationCenter, 'name' | 'barangay_id'>) {
  const barangayLabel = getBarangayLabel(center.barangay_id) ?? center.barangay_id;
  return `${normalizeEvacuationCenterName(center.name)} · ${barangayLabel}`;
}

/**
 * Resolve which registered evacuation centers an emitted disaster alert should
 * activate. Purok risk profiles carry free-text `default_evacuation_site`
 * names, so the registry is matched by name first (same barangay preferred,
 * then any barangay in the municipality); with no name match the alert falls
 * back to every center registered in the affected barangay.
 */
export function resolveEvacuationCentersForAlert(input: {
  barangay_id: string;
  purok_sitio?: string | null;
  defaultEvacuationSite?: string | null;
  centers: EvacuationCenter[];
}): EvacuationCenter[] {
  const barangayId = input.barangay_id.trim();
  const centers = input.centers.map(normalizeEvacuationCenter);
  const defaultSite = normalizeOptionalText(input.defaultEvacuationSite);

  const sameBarangay = centers.filter((center) => center.barangay_id === barangayId);

  if (defaultSite) {
    const normalizedSite = defaultSite.toLowerCase();
    const nameMatchesSameBarangay = sameBarangay.filter(
      (center) => center.name.toLowerCase() === normalizedSite,
    );
    if (nameMatchesSameBarangay.length > 0) {
      return sortCenters(nameMatchesSameBarangay);
    }

    const nameMatchesAnyBarangay = centers.filter(
      (center) => center.name.toLowerCase() === normalizedSite,
    );
    if (nameMatchesAnyBarangay.length > 0) {
      return sortCenters(nameMatchesAnyBarangay);
    }
  }

  return sortCenters(sameBarangay);
}

function sortCenters(centers: EvacuationCenter[]) {
  return [...centers].sort((left, right) => left.name.localeCompare(right.name));
}

/** Mark a center as opened by an emitted disaster alert (idempotent for already-open centers). */
export function applyEvacuationCenterAlertActivation(input: {
  center: EvacuationCenter;
  alertId: string;
  activatedAt: Date;
}): EvacuationCenter {
  const center = normalizeEvacuationCenter(input.center);
  if (center.status === 'open') {
    return center;
  }

  return {
    ...center,
    status: 'open',
    activation_source: 'alert',
    activated_at: input.activatedAt,
    activated_by: undefined,
    activated_by_alert_id: input.alertId,
    deactivated_at: undefined,
    updatedAt: input.activatedAt,
  };
}

/** Manual override: a responder or admin opens/closes a center by hand. */
export function applyEvacuationCenterManualStatus(input: {
  center: EvacuationCenter;
  status: EvacuationCenterStatus;
  updatedAt: Date;
  updatedBy?: string;
}): EvacuationCenter {
  const center = normalizeEvacuationCenter(input.center);
  if (center.status === input.status) {
    return {
      ...center,
      updatedAt: input.updatedAt,
      updatedBy: normalizeOptionalText(input.updatedBy) ?? center.updatedBy,
    };
  }

  if (input.status === 'open') {
    return {
      ...center,
      status: 'open',
      activation_source: 'manual',
      activated_at: input.updatedAt,
      activated_by: normalizeOptionalText(input.updatedBy),
      activated_by_alert_id: undefined,
      deactivated_at: undefined,
      updatedAt: input.updatedAt,
      updatedBy: normalizeOptionalText(input.updatedBy) ?? center.updatedBy,
    };
  }

  return {
    ...center,
    status: 'closed',
    deactivated_at: input.updatedAt,
    updatedAt: input.updatedAt,
    updatedBy: normalizeOptionalText(input.updatedBy) ?? center.updatedBy,
  };
}

export function summarizeEvacuationCenters(centers: EvacuationCenter[]) {
  const normalized = centers.map(normalizeEvacuationCenter);
  return {
    total: normalized.length,
    open: normalized.filter((center) => center.status === 'open').length,
    closed: normalized.filter((center) => center.status === 'closed').length,
  };
}
