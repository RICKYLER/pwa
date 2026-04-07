import type { User } from '@/lib/db/schema';

type AnalyticsUser = Pick<User, 'role' | 'barangay_id'>;

export function getAnalyticsBarangayScope(user: AnalyticsUser | null | undefined): string | undefined {
  if (!user || user.role === 'admin') {
    return undefined;
  }

  const normalizedBarangayId = user.barangay_id?.trim();
  return normalizedBarangayId ? normalizedBarangayId : undefined;
}

export function getAnalyticsScopeLabel(user: AnalyticsUser | null | undefined): string {
  if (!user || user.role === 'admin') {
    return 'all barangays';
  }

  return user.barangay_id?.trim() || 'current barangay';
}
