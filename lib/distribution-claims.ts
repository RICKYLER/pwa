import { matchesDistributionTargetGroup } from '@/lib/distribution-audience';
import type {
  DistributionEventNotificationPayload,
  Household,
  Resident,
  VulnerabilityFlags,
} from '@/lib/db/schema';

export type HouseholdDistributionEligibility = {
  eligible: boolean;
  matchedResidents: Resident[];
};

export function resolveMatchedResidentsForDistributionNotification(params: {
  notification: Pick<DistributionEventNotificationPayload, 'target_group'>;
  residents: Resident[];
  flagsByResidentId: Map<string, VulnerabilityFlags>;
}) {
  const { notification, residents, flagsByResidentId } = params;

  if (notification.target_group === 'all') {
    return residents;
  }

  return residents.filter((resident) =>
    matchesDistributionTargetGroup(
      resident,
      flagsByResidentId.get(resident.id),
      notification.target_group,
    ),
  );
}

export function evaluateHouseholdDistributionEligibility(params: {
  household: Pick<Household, 'id'> | null | undefined;
  notification: DistributionEventNotificationPayload | null;
  residents: Resident[];
  flagsByResidentId: Map<string, VulnerabilityFlags>;
}): HouseholdDistributionEligibility {
  const { household, notification, residents, flagsByResidentId } = params;

  if (!household || !notification) {
    return {
      eligible: false,
      matchedResidents: [],
    };
  }

  const householdResidents = residents.filter((resident) => resident.household_id === household.id);
  const matchedResidents = resolveMatchedResidentsForDistributionNotification({
    notification,
    residents: householdResidents,
    flagsByResidentId,
  });

  return {
    eligible: notification.target_group === 'all'
      ? householdResidents.length > 0 || residents.length === 0
      : matchedResidents.length > 0,
    matchedResidents,
  };
}
