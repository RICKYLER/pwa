import type { LucideIcon } from 'lucide-react';
import type { User } from './db/schema';
import { hasPermission } from './auth';
import {
  Activity,
  BarChart3,
  Bell,
  FileText,
  FolderLock,
  HandCoins,
  HeartHandshake,
  Home,
  MapPinned,
  Package,
  Radio,
  ShieldAlert,
  TentTree,
  TrendingUp,
  Truck,
  UserCheck,
  UserCog,
  Users,
} from 'lucide-react';

export type NavGroup =
  | 'Overview'
  | 'Social Work'
  | 'Disaster Response'
  | 'Relief & Logistics'
  | 'Reports & Records'
  | 'Administration'
  | 'Resident';

export interface NavGroupConfig {
  id: NavGroup;
  label: string;
  icon: LucideIcon;
}

export interface AppNavItem {
  href: string;
  label: string;
  mobileLabel: string;
  description: string;
  pageTitle: string;
  pageEyebrow: string;
  icon: LucideIcon;
  perm: string | null;
  group: NavGroup;
  showInBottomNav?: boolean;
  mobilePriority?: number;
}

export const STAFF_NAV_GROUPS: NavGroupConfig[] = [
  { id: 'Overview', label: 'Overview', icon: Home },
  { id: 'Social Work', label: 'Social Work', icon: HeartHandshake },
  { id: 'Disaster Response', label: 'Disaster Response', icon: ShieldAlert },
  { id: 'Relief & Logistics', label: 'Relief & Logistics', icon: Truck },
  { id: 'Reports & Records', label: 'Reports & Analytics', icon: FileText },
];

export const ADMIN_NAV_GROUP: NavGroupConfig = {
  id: 'Administration',
  label: 'Administration',
  icon: UserCog,
};

export const MOBILE_BOTTOM_NAV_LIMIT = 4;

export const STAFF_NAV_ITEMS: AppNavItem[] = [
  // ── Overview ─────────────────────────────────────────────
  {
    href: '/dashboard',
    label: 'Dashboard',
    mobileLabel: 'Home',
    description: 'Operational overview and civic KPIs',
    pageTitle: 'Dashboard',
    pageEyebrow: 'Municipal Operations',
    icon: Home,
    perm: null,
    group: 'Overview',
    showInBottomNav: true,
    mobilePriority: 1,
  },

  // ── Social Work ──────────────────────────────────────────
  {
    href: '/cases/dashboard',
    label: 'Case Analytics',
    mobileLabel: 'Case Stats',
    description: 'Category graphs, KPIs & trends',
    pageTitle: 'Social Cases Dashboard',
    pageEyebrow: 'Social Welfare Analytics',
    icon: BarChart3,
    perm: 'view_cases',
    group: 'Social Work',
  },
  {
    href: '/cases',
    label: 'Social Cases',
    mobileLabel: 'Cases',
    description: 'Confidential VAWC, VAC & GIS folders',
    pageTitle: 'Social Cases & VAWC',
    pageEyebrow: 'Social Welfare Operations',
    icon: FolderLock,
    perm: 'view_cases',
    group: 'Social Work',
    showInBottomNav: true,
    mobilePriority: 2,
  },
  {
    href: '/aics',
    label: 'AICS Crisis Desk',
    mobileLabel: 'AICS',
    description: 'Crisis walk-in intake, GIS forms & assistance records',
    pageTitle: 'AICS Crisis Assistance',
    pageEyebrow: 'Social Welfare Operations',
    icon: HandCoins,
    perm: 'view_aics',
    group: 'Social Work',
    showInBottomNav: true,
    mobilePriority: 2,
  },
  {
    href: '/solo-parents',
    label: 'Solo Parents',
    mobileLabel: 'Solo Parents',
    description: 'Walk-in desk, ID card printing & ROSP',
    pageTitle: 'Solo Parents Registry',
    pageEyebrow: 'Social Welfare Operations',
    icon: HeartHandshake,
    perm: 'view_solo_parents',
    group: 'Social Work',
    showInBottomNav: true,
    mobilePriority: 2,
  },
  {
    href: '/households',
    label: 'Households',
    mobileLabel: 'Homes',
    description: 'Household records and registration review',
    pageTitle: 'Households',
    pageEyebrow: 'Census Records',
    icon: Users,
    perm: 'view_households',
    group: 'Social Work',
    showInBottomNav: true,
    mobilePriority: 2,
  },
  {
    href: '/vulnerability',
    label: 'Vulnerability',
    mobileLabel: 'Risks',
    description: 'Priority residents and risk profiles',
    pageTitle: 'Vulnerability',
    pageEyebrow: 'Risk Monitoring',
    icon: ShieldAlert,
    perm: 'view_vulnerability',
    group: 'Social Work',
    showInBottomNav: true,
    mobilePriority: 3,
  },

  // ── Disaster Response ────────────────────────────────────
  {
    href: '/responder',
    label: 'Field Response',
    mobileLabel: 'Field',
    description: 'Incidents, map operations, and dispatch',
    pageTitle: 'Field Response',
    pageEyebrow: 'Response Operations',
    icon: Radio,
    perm: 'view_incidents',
    group: 'Disaster Response',
    showInBottomNav: true,
    mobilePriority: 4,
  },
  {
    href: '/evacuation',
    label: 'Evacuation',
    mobileLabel: 'Evac',
    description: 'Evacuation centers, QR check-in & evacuee tracking',
    pageTitle: 'Evacuation Operations',
    pageEyebrow: 'Disaster Management',
    icon: TentTree,
    perm: 'view_incidents',
    group: 'Disaster Response',
  },
  {
    href: '/alerts',
    label: 'Alerts',
    mobileLabel: 'Alerts',
    description: 'Automatic disaster rules and alert history',
    pageTitle: 'Alerts',
    pageEyebrow: 'Response Operations',
    icon: Bell,
    perm: 'view_incidents',
    group: 'Disaster Response',
  },
  {
    href: '/forecast',
    label: 'Forecasting',
    mobileLabel: 'Forecast',
    description: 'Relief demand predictions & disaster simulation',
    pageTitle: 'Relief Demand Forecasting',
    pageEyebrow: 'MSWDO Predictive Analytics',
    icon: TrendingUp,
    perm: 'view_reports',
    group: 'Disaster Response',
  },

  // ── Relief & Logistics ───────────────────────────────────
  {
    href: '/distribution',
    label: 'Distribution',
    mobileLabel: 'Relief',
    description: 'Relief events and assignment tracking',
    pageTitle: 'Distribution',
    pageEyebrow: 'Relief Operations',
    icon: Truck,
    perm: 'view_reports',
    group: 'Relief & Logistics',
  },
  {
    href: '/inventory',
    label: 'Inventory',
    mobileLabel: 'Supply',
    description: 'Stock visibility and warehouse readiness',
    pageTitle: 'Inventory',
    pageEyebrow: 'Resource Readiness',
    icon: Package,
    perm: 'view_reports',
    group: 'Relief & Logistics',
  },

  // ── Reports & Records ────────────────────────────────────
  {
    href: '/reports',
    label: 'Reports',
    mobileLabel: 'Reports',
    description: 'Exports, summaries, and reporting',
    pageTitle: 'Reports',
    pageEyebrow: 'Analytics',
    icon: FileText,
    perm: 'view_reports',
    group: 'Reports & Records',
  },
];

export const ADMIN_NAV_ITEMS: AppNavItem[] = [
  {
    href: '/admin/member-approvals',
    label: 'Member Approvals',
    mobileLabel: 'Approvals',
    description: 'Review new household members residents added',
    pageTitle: 'Member Approvals',
    pageEyebrow: 'Administration',
    icon: UserCheck,
    perm: null,
    group: 'Administration',
  },
  {
    href: '/admin/users',
    label: 'User Accounts',
    mobileLabel: 'Users',
    description: 'User provisioning and role controls',
    pageTitle: 'User Accounts',
    pageEyebrow: 'Administration',
    icon: UserCog,
    perm: null,
    group: 'Administration',
  },
  {
    href: '/admin/location-review',
    label: 'Location Review',
    mobileLabel: 'Pins',
    description: 'Pin quality and location verification',
    pageTitle: 'Location Review',
    pageEyebrow: 'Administration',
    icon: MapPinned,
    perm: null,
    group: 'Administration',
  },
  {
    href: '/admin/api-health',
    label: 'API Health',
    mobileLabel: 'Health',
    description: 'Service readiness and integration status',
    pageTitle: 'API Health',
    pageEyebrow: 'Administration',
    icon: Activity,
    perm: null,
    group: 'Administration',
  },
];

const RESIDENT_PORTAL_NAV_ITEM: AppNavItem = {
  href: '/resident',
  label: 'Resident Portal',
  mobileLabel: 'Portal',
  description: 'Submitted records and approval status',
  pageTitle: 'Resident Portal',
  pageEyebrow: 'Resident Services',
  icon: Home,
  perm: null,
  group: 'Resident',
};

const RESIDENT_NOTIFICATIONS_NAV_ITEM: AppNavItem = {
  href: '/resident/notifications',
  label: 'Notifications',
  mobileLabel: 'Inbox',
  description: 'Distribution notices and resident updates',
  pageTitle: 'Notifications',
  pageEyebrow: 'Resident Services',
  icon: Bell,
  perm: null,
  group: 'Resident',
};

const RESIDENT_HOUSEHOLD_NAV_ITEM: AppNavItem = {
  href: '/resident/household',
  label: 'My Household',
  mobileLabel: 'Household',
  description: 'Approved household members and resident details',
  pageTitle: 'My Household',
  pageEyebrow: 'Resident Services',
  icon: Users,
  perm: null,
  group: 'Resident',
};

const RESIDENT_REGISTER_NAV_ITEM: AppNavItem = {
  href: '/households/register',
  label: 'New Registration',
  mobileLabel: 'Register',
  description: 'Create and submit a new household record',
  pageTitle: 'New Registration',
  pageEyebrow: 'Resident Services',
  icon: FileText,
  perm: null,
  group: 'Resident',
};

const RESIDENT_ALL_NAV_ITEMS: AppNavItem[] = [
  RESIDENT_PORTAL_NAV_ITEM,
  RESIDENT_NOTIFICATIONS_NAV_ITEM,
  RESIDENT_HOUSEHOLD_NAV_ITEM,
  RESIDENT_REGISTER_NAV_ITEM,
];

export function getResidentNavItems(options?: {
  hasActiveHousehold?: boolean;
  pathname?: string | null;
}): AppNavItem[] {
  const showHousehold = Boolean(options?.hasActiveHousehold)
    || Boolean(options?.pathname && isPathActive(options.pathname, RESIDENT_HOUSEHOLD_NAV_ITEM.href));

  return [
    RESIDENT_PORTAL_NAV_ITEM,
    RESIDENT_NOTIFICATIONS_NAV_ITEM,
    showHousehold ? RESIDENT_HOUSEHOLD_NAV_ITEM : RESIDENT_REGISTER_NAV_ITEM,
  ];
}

export const RESIDENT_NAV_ITEMS: AppNavItem[] = getResidentNavItems();

export function isPathActive(pathname: string, href: string): boolean {
  if (href === '/cases') {
    return pathname === '/cases';
  }
  return pathname === href || (href !== '/dashboard' && href !== '/resident' && pathname.startsWith(href));
}

export function isNavItemVisibleForUser(item: AppNavItem, user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;

  // Dedicated departmental roles: restricted strictly to their modules
  if (user.role === 'aics_focal') {
    return item.href === '/aics';
  }
  if (user.role === 'solo_parent_focal') {
    return item.href === '/solo-parents';
  }
  if (user.role === 'social_worker') {
    return item.href === '/cases' || item.href === '/cases/dashboard';
  }
  if (user.role === 'responder') {
    return item.href === '/responder' || item.href === '/evacuation' || item.href === '/alerts';
  }
  if (user.role === 'encoder') {
    if (item.href === '/dashboard') return true;
    if (item.perm) return hasPermission(item.perm as never);
    return false;
  }

  // Fallback for any other roles: check permissions or false for dashboard
  if (item.perm) {
    return hasPermission(item.perm as never);
  }
  return false;
}

export function getVisibleNavItemsForUser(
  items: AppNavItem[] = STAFF_NAV_ITEMS,
  user: User | null | undefined,
): AppNavItem[] {
  return items.filter((item) => isNavItemVisibleForUser(item, user));
}

export function getMobileBottomNavItems(items: AppNavItem[] = STAFF_NAV_ITEMS): AppNavItem[] {
  const marked = items
    .filter((item) => item.showInBottomNav)
    .sort((left, right) => (left.mobilePriority ?? Number.MAX_SAFE_INTEGER) - (right.mobilePriority ?? Number.MAX_SAFE_INTEGER));

  if (marked.length > 0) {
    return marked.slice(0, MOBILE_BOTTOM_NAV_LIMIT);
  }
  return items.slice(0, MOBILE_BOTTOM_NAV_LIMIT);
}

function matchPath(items: AppNavItem[], pathname: string): AppNavItem | null {
  return items.find((item) => isPathActive(pathname, item.href)) ?? null;
}

export function getPageMeta(pathname: string) {
  const matched =
    matchPath(STAFF_NAV_ITEMS, pathname)
    ?? matchPath(ADMIN_NAV_ITEMS, pathname)
    ?? matchPath(RESIDENT_ALL_NAV_ITEMS, pathname);

  if (matched) {
    return {
      title: matched.pageTitle,
      eyebrow: matched.pageEyebrow,
      description: matched.description,
    };
  }

  return {
    title: 'MSWDO Census',
    eyebrow: 'Municipal Operations',
    description: 'Municipal census, risk, and field-response workspace.',
  };
}
