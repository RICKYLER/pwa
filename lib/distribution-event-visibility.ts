import type { User } from '@/lib/db/schema';

// Barangay visibility rules for distribution events. Residents may only see
// (and receive notifications for) events inside their own barangay: their
// user profile's barangay plus any barangay they have an approved household
// in. Without this filter, every resident — including brand-new accounts from
// other barangays — would receive a notification and QR access for every
// event in the system.

export function collectResidentAllowedBarangayIds(
  user: Pick<User, 'barangay_id'>,
  linkedHouseholdBarangayIds: Array<string | null | undefined>,
): Set<string> {
  const allowed = new Set<string>();
  const userBarangayId = user.barangay_id?.trim();
  if (userBarangayId) {
    allowed.add(userBarangayId);
  }

  for (const barangayId of linkedHouseholdBarangayIds) {
    const trimmed = typeof barangayId === 'string' ? barangayId.trim() : '';
    if (trimmed) {
      allowed.add(trimmed);
    }
  }

  return allowed;
}

export function isDistributionEventVisibleToResident(
  event: { barangay_id?: string | null },
  allowedBarangayIds: Set<string>,
): boolean {
  const eventBarangayId = typeof event.barangay_id === 'string' ? event.barangay_id.trim() : '';
  return Boolean(eventBarangayId) && allowedBarangayIds.has(eventBarangayId);
}

// The QR generation route only receives the event id, so the notification
// fan-out cannot be trusted to gate access on its own. A household may only
// claim from an event when both barangays are known and match; a missing
// barangay on either side fails open, matching the legacy behavior for data
// recorded before barangay scoping.
export function isHouseholdAllowedToClaimFromEvent(
  eventBarangayId: string | null | undefined,
  householdBarangayId: string | null | undefined,
): boolean {
  const trimmedEventBarangayId = typeof eventBarangayId === 'string' ? eventBarangayId.trim() : '';
  const trimmedHouseholdBarangayId = typeof householdBarangayId === 'string' ? householdBarangayId.trim() : '';

  if (!trimmedEventBarangayId || !trimmedHouseholdBarangayId) {
    return true;
  }

  return trimmedEventBarangayId === trimmedHouseholdBarangayId;
}
