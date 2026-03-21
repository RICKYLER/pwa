import type {
  Household,
  HouseholdRegistrationStatus,
  PinQaStatus,
} from '@/lib/db/schema';
import { hasHouseholdPin } from '@/lib/map-pins';

const EARTH_RADIUS_METERS = 6_371_000;
const DUPLICATE_PIN_THRESHOLD_METERS = 20;

export const HOUSEHOLD_REGISTRATION_STATUSES: HouseholdRegistrationStatus[] = [
  'pending',
  'approved',
  'rejected',
  'needs_correction',
];

export const PIN_QA_STATUSES: PinQaStatus[] = ['valid', 'duplicate', 'needs_verification'];

export function getHouseholdRegistrationStatus(
  household: Pick<Household, 'registration_status'>,
): HouseholdRegistrationStatus {
  return household.registration_status ?? 'approved';
}

export function isHouseholdApproved(
  household: Pick<Household, 'registration_status'>,
): boolean {
  return getHouseholdRegistrationStatus(household) === 'approved';
}

export function formatRegistrationStatusLabel(status: HouseholdRegistrationStatus): string {
  switch (status) {
    case 'needs_correction':
      return 'Needs Correction';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

export function formatPinQaStatusLabel(status: PinQaStatus): string {
  switch (status) {
    case 'needs_verification':
      return 'Needs Verification';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function calculateDistanceMeters(
  first: Pick<Household, 'gps_lat' | 'gps_long'>,
  second: Pick<Household, 'gps_lat' | 'gps_long'>,
): number {
  if (!hasHouseholdPin(first) || !hasHouseholdPin(second)) {
    return Number.POSITIVE_INFINITY;
  }

  const latDelta = toRadians(second.gps_lat - first.gps_lat);
  const lngDelta = toRadians(second.gps_long - first.gps_long);
  const firstLat = toRadians(first.gps_lat);
  const secondLat = toRadians(second.gps_lat);

  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(lngDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

export function getDuplicatePinMatches(
  household: Pick<Household, 'id' | 'gps_lat' | 'gps_long'>,
  households: Array<Pick<Household, 'id' | 'gps_lat' | 'gps_long'>>,
  thresholdMeters = DUPLICATE_PIN_THRESHOLD_METERS,
): string[] {
  if (!hasHouseholdPin(household)) {
    return [];
  }

  return households
    .filter((candidate) => candidate.id !== household.id)
    .filter(hasHouseholdPin)
    .filter((candidate) => calculateDistanceMeters(household, candidate) <= thresholdMeters)
    .map((candidate) => candidate.id);
}

export function derivePinQaStatus(
  household: Pick<Household, 'id' | 'gps_lat' | 'gps_long' | 'location_verified'>,
  households: Array<Pick<Household, 'id' | 'gps_lat' | 'gps_long'>>,
): PinQaStatus {
  if (!hasHouseholdPin(household)) {
    return 'needs_verification';
  }

  if (getDuplicatePinMatches(household, households).length > 0) {
    return 'duplicate';
  }

  if (!household.location_verified) {
    return 'needs_verification';
  }

  return 'valid';
}

export function getStoredOrDerivedPinQaStatus(
  household: Pick<Household, 'id' | 'gps_lat' | 'gps_long' | 'location_verified' | 'pin_qa_status'>,
  households: Array<Pick<Household, 'id' | 'gps_lat' | 'gps_long'>>,
): PinQaStatus {
  return household.pin_qa_status ?? derivePinQaStatus(household, households);
}

export interface RegistrationTimelineStep {
  key: 'submitted' | 'location_review' | 'admin_approval' | 'final';
  label: string;
  state: 'done' | 'current' | 'upcoming';
}

export function buildRegistrationTimeline(
  household: Pick<Household, 'registration_status' | 'location_verified'>,
): RegistrationTimelineStep[] {
  const status = getHouseholdRegistrationStatus(household);

  if (status === 'pending') {
    return [
      { key: 'submitted', label: 'Submitted', state: 'done' },
      {
        key: 'location_review',
        label: 'Location Review',
        state: household.location_verified ? 'done' : 'current',
      },
      {
        key: 'admin_approval',
        label: 'Admin Approval',
        state: household.location_verified ? 'current' : 'upcoming',
      },
      { key: 'final', label: 'Approved / Rejected', state: 'upcoming' },
    ];
  }

  return [
    { key: 'submitted', label: 'Submitted', state: 'done' },
    { key: 'location_review', label: 'Location Review', state: 'done' },
    { key: 'admin_approval', label: 'Admin Approval', state: 'done' },
    {
      key: 'final',
      label: formatRegistrationStatusLabel(status),
      state: 'current',
    },
  ];
}
