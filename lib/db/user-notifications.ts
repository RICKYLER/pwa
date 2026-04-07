import { db, STORE_NAMES } from './indexeddb';
import type { UserNotification } from './schema';
import { runServerMutation } from '@/lib/mutations';

function normalizeDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  return undefined;
}

export function normalizeUserNotification(notification: UserNotification): UserNotification {
  return {
    ...notification,
    read_at: normalizeDate(notification.read_at),
    createdAt: normalizeDate(notification.createdAt) ?? new Date(),
    updatedAt: normalizeDate(notification.updatedAt) ?? new Date(),
    payload:
      notification.payload && typeof notification.payload === 'object'
        ? notification.payload
        : {},
  };
}

export function getUserNotificationActivityTime(notification: UserNotification) {
  const createdAt = notification.createdAt instanceof Date
    ? notification.createdAt.getTime()
    : normalizeDate(notification.createdAt)?.getTime() ?? 0;
  const updatedAt = notification.updatedAt instanceof Date
    ? notification.updatedAt.getTime()
    : normalizeDate(notification.updatedAt)?.getTime() ?? 0;

  return Math.max(createdAt, updatedAt);
}

export function isFallbackUserNotificationId(notificationId: string) {
  return notificationId.startsWith('legacy_dist_notice_');
}

export async function getUserNotifications(): Promise<UserNotification[]> {
  try {
    const notifications = await db.getAll<UserNotification>(STORE_NAMES.user_notifications);
    return notifications
      .map(normalizeUserNotification)
      .sort((left, right) => getUserNotificationActivityTime(right) - getUserNotificationActivityTime(left));
  } catch (error) {
    console.error('Error fetching user notifications:', error);
    throw error;
  }
}

export async function markUserNotificationRead(notificationId: string): Promise<UserNotification> {
  try {
    const payload = await runServerMutation<{ notification: Record<string, unknown> }>({
      action: 'mark_user_notification_read',
      notificationId,
    });

    const updatedNotification = payload.notification as unknown as UserNotification | undefined;
    if (!updatedNotification) {
      throw new Error('Notification was updated on the server, but no notification payload was returned.');
    }

    const normalized = normalizeUserNotification(updatedNotification);
    await db.put(STORE_NAMES.user_notifications, normalized);
    return normalized;
  } catch (error) {
    console.error('Error marking user notification as read:', error);
    throw error;
  }
}

export async function markUserNotificationReadLocally(notification: UserNotification): Promise<UserNotification> {
  const normalized = normalizeUserNotification({
    ...notification,
    read_at: notification.read_at ?? new Date(),
    updatedAt: new Date(),
  });

  await db.put(STORE_NAMES.user_notifications, normalized);
  return normalized;
}
