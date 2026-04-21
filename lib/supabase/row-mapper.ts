import { STORE_NAMES } from '@/lib/db/indexeddb';

export type SupabaseBootstrapTable =
  | 'households'
  | 'residents'
  | 'vulnerability_flags'
  | 'inventory_items'
  | 'inventory_movements'
  | 'package_templates'
  | 'distribution_events'
  | 'distribution_records'
  | 'user_notifications'
  | 'disaster_alert_rules'
  | 'disaster_alerts'
  | 'incidents'
  | 'location_master_lists'
  | 'purok_risk_profiles'
  | 'programs'
  | 'beneficiaries'
  | 'audit_logs';

export const SUPABASE_BOOTSTRAP_TABLES: Array<{
  table: SupabaseBootstrapTable;
  storeName: (typeof STORE_NAMES)[keyof typeof STORE_NAMES];
}> = [
  { table: 'households', storeName: STORE_NAMES.households },
  { table: 'residents', storeName: STORE_NAMES.residents },
  { table: 'vulnerability_flags', storeName: STORE_NAMES.vulnerability_flags },
  { table: 'inventory_items', storeName: STORE_NAMES.inventory_items },
  { table: 'inventory_movements', storeName: STORE_NAMES.inventory_movements },
  { table: 'package_templates', storeName: STORE_NAMES.package_templates },
  { table: 'distribution_events', storeName: STORE_NAMES.distribution_events },
  { table: 'distribution_records', storeName: STORE_NAMES.distribution_records },
  { table: 'user_notifications', storeName: STORE_NAMES.user_notifications },
  { table: 'disaster_alert_rules', storeName: STORE_NAMES.disaster_alert_rules },
  { table: 'disaster_alerts', storeName: STORE_NAMES.disaster_alerts },
  { table: 'incidents', storeName: STORE_NAMES.incidents },
  { table: 'location_master_lists', storeName: STORE_NAMES.location_master_lists },
  { table: 'purok_risk_profiles', storeName: STORE_NAMES.purok_risk_profiles },
  { table: 'programs', storeName: STORE_NAMES.programs },
  { table: 'beneficiaries', storeName: STORE_NAMES.beneficiaries },
  { table: 'audit_logs', storeName: STORE_NAMES.audit_logs },
];

function toOptionalDate(value: unknown) {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  return undefined;
}

export function mapSupabaseRow(table: SupabaseBootstrapTable, row: Record<string, unknown>) {
  const {
    created_at,
    updated_at,
    updated_by,
    record_version,
    sync_status: _syncStatus,
    ...base
  } = row;

  const metadata = {
    ...(toOptionalDate(created_at) ? { createdAt: toOptionalDate(created_at) } : {}),
    ...(toOptionalDate(updated_at) ? { updatedAt: toOptionalDate(updated_at) } : {}),
    ...(typeof record_version === 'number' ? { recordVersion: record_version } : {}),
  };

  switch (table) {
    case 'households':
      return {
        ...base,
        ...metadata,
        syncStatus: 'synced' as const,
      };
    case 'residents':
      return {
        ...base,
        ...metadata,
        syncStatus: 'synced' as const,
      };
    case 'vulnerability_flags':
      return {
        ...base,
        ...metadata,
        syncStatus: 'synced' as const,
      };
    case 'programs':
      return {
        ...base,
        ...metadata,
      };
    case 'beneficiaries':
      return {
        ...base,
        ...metadata,
        enrollment_date:
          typeof base.enrollment_date === 'string'
            ? new Date(`${base.enrollment_date}T00:00:00.000Z`)
            : base.enrollment_date,
        syncStatus: 'synced' as const,
      };
    case 'package_templates':
      return {
        ...base,
        ...metadata,
        syncStatus: 'synced' as const,
      };
    case 'user_notifications':
      return {
        ...base,
        ...metadata,
        alert_id: typeof base.alert_id === 'string' ? base.alert_id : undefined,
        event_id: typeof base.event_id === 'string' ? base.event_id : undefined,
        read_at: toOptionalDate(base.read_at),
        payload: base.payload && typeof base.payload === 'object' ? base.payload : {},
      };
    case 'disaster_alert_rules':
      return {
        ...base,
        ...metadata,
        official_keywords: Array.isArray(base.official_keywords)
          ? base.official_keywords.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
          : [],
        enabled: Boolean(base.enabled),
        notify_responders: Boolean(base.notify_responders),
        last_triggered_at: toOptionalDate(base.last_triggered_at),
        syncStatus: 'synced' as const,
      };
    case 'disaster_alerts':
      return {
        ...base,
        ...metadata,
        issued_at: toOptionalDate(base.issued_at) ?? new Date(),
        weather_snapshot:
          base.weather_snapshot && typeof base.weather_snapshot === 'object'
            ? base.weather_snapshot
            : {},
        syncStatus: 'synced' as const,
      };
    case 'location_master_lists':
    case 'purok_risk_profiles':
      return {
        ...base,
        ...metadata,
        syncStatus: 'synced' as const,
        updatedBy: typeof updated_by === 'string' ? updated_by : undefined,
      };
    default:
      return {
        ...base,
        ...metadata,
        syncStatus: 'synced' as const,
      };
  }
}
