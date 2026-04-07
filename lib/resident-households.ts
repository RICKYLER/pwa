import type { Household } from '@/lib/db/schema';
import { getHouseholdRegistrationStatus } from '@/lib/household-registration';

type ResidentActiveHouseholdCandidate = Pick<
  Household,
  'status' | 'registration_status' | 'registration_reviewed_at' | 'updatedAt' | 'createdAt'
>;

function toTimestamp(value: Date | string | number | null | undefined): number {
  if (!value) {
    return 0;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export function isResidentActiveApprovedHousehold(
  household: Pick<Household, 'status' | 'registration_status'>,
): boolean {
  return household.status === 'active' && getHouseholdRegistrationStatus(household) === 'approved';
}

export function compareResidentActiveHouseholds<T extends ResidentActiveHouseholdCandidate>(
  left: T,
  right: T,
): number {
  return (
    toTimestamp(right.registration_reviewed_at) - toTimestamp(left.registration_reviewed_at)
    || toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt)
    || toTimestamp(right.createdAt) - toTimestamp(left.createdAt)
  );
}

export function resolveResidentActiveApprovedHousehold<T extends ResidentActiveHouseholdCandidate>(
  households: T[],
): T | null {
  const approvedHouseholds = households.filter(isResidentActiveApprovedHousehold);
  if (!approvedHouseholds.length) {
    return null;
  }

  return [...approvedHouseholds].sort(compareResidentActiveHouseholds)[0] ?? null;
}
