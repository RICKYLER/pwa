import {
  bootstrapAllDataFromSupabase,
  bootstrapSupabaseTables,
} from '@/lib/supabase/bootstrap';
import type { SupabaseBootstrapTable } from '@/lib/supabase/row-mapper';

const ROUTE_TABLES: Array<{
  prefix: string;
  tables: SupabaseBootstrapTable[];
}> = [
  {
    prefix: '/admin/location-review',
    tables: ['households', 'residents', 'location_master_lists', 'purok_risk_profiles'],
  },
  {
    prefix: '/dashboard',
    tables: ['households', 'residents', 'vulnerability_flags', 'audit_logs', 'distribution_events', 'inventory_items', 'package_templates'],
  },
  {
    prefix: '/alerts',
    tables: ['disaster_alerts', 'user_notifications', 'location_master_lists', 'purok_risk_profiles', 'disaster_alert_rules'],
  },
  {
    prefix: '/households',
    tables: ['households', 'residents', 'vulnerability_flags', 'location_master_lists', 'purok_risk_profiles'],
  },
  {
    prefix: '/vulnerability',
    tables: ['households', 'residents', 'vulnerability_flags'],
  },
  {
    prefix: '/responder',
    tables: [
      'households',
      'residents',
      'vulnerability_flags',
      'incidents',
      'distribution_events',
      'purok_risk_profiles',
      'disaster_alert_rules',
      'disaster_alerts',
      'user_notifications',
    ],
  },
  {
    prefix: '/inventory',
    tables: ['inventory_items', 'inventory_movements', 'package_templates'],
  },
  {
    prefix: '/distribution',
    tables: ['households', 'residents', 'vulnerability_flags', 'distribution_events', 'distribution_records', 'inventory_items', 'location_master_lists'],
  },
  {
    prefix: '/resident/household',
    tables: ['households', 'residents', 'vulnerability_flags', 'user_notifications', 'purok_risk_profiles'],
  },
  {
    prefix: '/resident',
    tables: ['households', 'user_notifications', 'purok_risk_profiles'],
  },
];

const SKIPPED_PREFIXES = [
  '/',
  '/login',
  '/forgot-password',
  '/setup-password',
  '/resident/register',
  '/resident/verify-email',
];

function normalizePathname(pathname: string | null | undefined) {
  if (!pathname) {
    return '';
  }

  if (pathname === '/') {
    return '/';
  }

  return pathname.replace(/\/+$/, '');
}

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function getRouteBootstrapTables(pathname: string | null | undefined) {
  const normalizedPathname = normalizePathname(pathname);

  if (!normalizedPathname || SKIPPED_PREFIXES.includes(normalizedPathname)) {
    return null;
  }

  const match = ROUTE_TABLES.find((entry) => matchesPrefix(normalizedPathname, entry.prefix));
  return match?.tables ?? null;
}

export async function bootstrapPathnameData(pathname: string | null | undefined, force = false) {
  const routeTables = getRouteBootstrapTables(pathname);

  if (!pathname || normalizePathname(pathname) === '') {
    return;
  }

  if (routeTables) {
    return bootstrapSupabaseTables(routeTables, { force });
  }

  if (SKIPPED_PREFIXES.includes(normalizePathname(pathname))) {
    return;
  }

  return bootstrapAllDataFromSupabase(force);
}

export async function bootstrapCurrentPathData(force = false) {
  if (typeof window === 'undefined') {
    return;
  }

  return bootstrapPathnameData(window.location.pathname, force);
}
