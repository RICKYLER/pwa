import type {
  DistributionEventNotificationPayload,
  DistributionStatus,
  DistributionTargetGroup,
  DistributionTargetScope,
  DistributionType,
  UserNotification,
} from '@/lib/db/schema';

export const DISTRIBUTION_NOTIFICATION_TYPE_LABELS: Record<DistributionType, string> = {
  regular: 'Regular',
  emergency: 'Emergency',
  disaster_relief: 'Disaster Relief',
};

export const DISTRIBUTION_NOTIFICATION_GROUP_LABELS: Record<DistributionTargetGroup, string> = {
  all: 'All',
  senior: 'Senior',
  pwd: 'PWD',
  pregnant: 'Pregnant',
  minor: 'Minor',
  low_income: 'Low Income',
};

export const DISTRIBUTION_NOTIFICATION_SCOPE_LABELS: Record<DistributionTargetScope, string> = {
  household: 'Household',
  resident: 'Resident',
};

export const DISTRIBUTION_NOTIFICATION_STATUS_LABELS: Record<DistributionStatus, string> = {
  planned: 'Planned',
  ongoing: 'Ongoing',
  completed: 'Completed',
};

export function isDistributionStatus(value: unknown): value is DistributionStatus {
  return value === 'planned' || value === 'ongoing' || value === 'completed';
}

export function isDistributionType(value: unknown): value is DistributionType {
  return value === 'regular' || value === 'emergency' || value === 'disaster_relief';
}

export function isDistributionTargetScope(value: unknown): value is DistributionTargetScope {
  return value === 'household' || value === 'resident';
}

export function isDistributionTargetGroup(value: unknown): value is DistributionTargetGroup {
  return value === 'all'
    || value === 'senior'
    || value === 'pwd'
    || value === 'pregnant'
    || value === 'minor'
    || value === 'low_income';
}

export function getDistributionNotificationAudienceLabel(
  scope: DistributionTargetScope,
  group: DistributionTargetGroup,
) {
  if (group === 'all') {
    return scope === 'household' ? 'All households' : 'All residents';
  }

  return `${DISTRIBUTION_NOTIFICATION_GROUP_LABELS[group]} ${scope === 'household' ? 'households' : 'residents'}`;
}

export function buildDistributionNotificationBody(input: {
  type?: string | null;
  status?: string | null;
  scheduled_date?: string | null;
  location?: string | null;
  target_scope?: string | null;
  target_group?: string | null;
}) {
  const type = isDistributionType(input.type) ? input.type : 'regular';
  const status = isDistributionStatus(input.status) ? input.status : 'planned';
  const targetScope = isDistributionTargetScope(input.target_scope) ? input.target_scope : 'household';
  const targetGroup = isDistributionTargetGroup(input.target_group) ? input.target_group : 'all';
  const scheduledDate = typeof input.scheduled_date === 'string' && input.scheduled_date.trim()
    ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(
      new Date(`${input.scheduled_date}T00:00:00.000Z`),
    )
    : 'the scheduled date';
  const location = input.location?.trim() || 'the barangay venue';

  return `${DISTRIBUTION_NOTIFICATION_TYPE_LABELS[type]} distribution status: ${DISTRIBUTION_NOTIFICATION_STATUS_LABELS[status]}. Schedule: ${scheduledDate}. Location: ${location}. Audience: ${getDistributionNotificationAudienceLabel(targetScope, targetGroup)}.`;
}

export function parseDistributionEventNotification(
  notification: Pick<UserNotification, 'type' | 'payload'>,
): DistributionEventNotificationPayload | null {
  if (notification.type !== 'distribution_event') {
    return null;
  }

  const payload = notification.payload;
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const payloadRecord = payload as Record<string, unknown>;

  const eventId = typeof payloadRecord.event_id === 'string' ? payloadRecord.event_id : '';
  const eventName = typeof payloadRecord.event_name === 'string' ? payloadRecord.event_name : '';
  const type = payloadRecord.type;
  const status = payloadRecord.status;
  const targetScope = payloadRecord.target_scope;
  const targetGroup = payloadRecord.target_group;
  const scheduledDate = typeof payloadRecord.scheduled_date === 'string' ? payloadRecord.scheduled_date : '';
  const location = typeof payloadRecord.location === 'string' ? payloadRecord.location : '';
  const notes = typeof payloadRecord.notes === 'string' ? payloadRecord.notes : undefined;

  if (
    !eventId
    || !eventName
    || !scheduledDate
    || !location
    || !isDistributionType(type)
    || !isDistributionTargetScope(targetScope)
    || !isDistributionTargetGroup(targetGroup)
  ) {
    return null;
  }

  return {
    event_id: eventId,
    event_name: eventName,
    type,
    status: isDistributionStatus(status) ? status : 'planned',
    target_scope: targetScope,
    target_group: targetGroup,
    scheduled_date: scheduledDate,
    location,
    notes,
  };
}
