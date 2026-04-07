import type { Household, User } from '@/lib/db/schema';
import {
  getHouseholdRegistrationStatus,
  getStoredOrDerivedPinQaStatus,
} from '@/lib/household-registration';
import { hasHouseholdPin } from '@/lib/map-pins';

type ResponderUserScope = Pick<User, 'role' | 'barangay_id'>;

function getResponderScopedHouseholds(
  households: Household[],
  user: ResponderUserScope,
) {
  if (user.role === 'admin') {
    return households;
  }

  return households.filter((household) => household.barangay_id === user.barangay_id);
}

export function isResponderMappedHousehold(
  household: Household,
  householdsInScope: Household[],
) {
  return (
    household.status === 'active'
    && getHouseholdRegistrationStatus(household) === 'approved'
    && Boolean(household.location_verified)
    && hasHouseholdPin(household)
    && getStoredOrDerivedPinQaStatus(household, householdsInScope) === 'valid'
  );
}

export function getResponderMappedHouseholds(
  households: Household[],
  user: ResponderUserScope,
) {
  const scoped = getResponderScopedHouseholds(households, user);
  return scoped.filter((household) => isResponderMappedHousehold(household, scoped));
}

export function getResponderCoverageLabel(user: ResponderUserScope) {
  return user.role === 'admin'
    ? 'Field response across all barangays'
    : `Field responder for ${user.barangay_id}`;
}
