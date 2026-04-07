import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Bell,
  FileText,
  Home,
  MapPinned,
  Package,
  Radio,
  ShieldAlert,
  Truck,
  UserCog,
  Users,
} from 'lucide-react';

export interface AppNavItem {
  href: string;
  label: string;
  mobileLabel: string;
  description: string;
  pageTitle: string;
  pageEyebrow: string;
  icon: LucideIcon;
  perm: string | null;
  group: 'Core' | 'Operations' | 'Administration' | 'Resident';
  showInBottomNav?: boolean;
  mobilePriority?: number;
}

export const MOBILE_BOTTOM_NAV_LIMIT = 4;

export const STAFF_NAV_ITEMS: AppNavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    mobileLabel: 'Home',
    description: 'Operational overview and civic KPIs',
    pageTitle: 'Dashboard',
    pageEyebrow: 'Municipal Operations',
    icon: Home,
    perm: null,
    group: 'Core',
    showInBottomNav: true,
    mobilePriority: 1,
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
    group: 'Core',
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
    group: 'Core',
    showInBottomNav: true,
    mobilePriority: 3,
  },
  {
    href: '/responder',
    label: 'Field Response',
    mobileLabel: 'Field',
    description: 'Incidents, map operations, and dispatch',
    pageTitle: 'Field Response',
    pageEyebrow: 'Response Operations',
    icon: Radio,
    perm: 'view_incidents',
    group: 'Operations',
    showInBottomNav: true,
    mobilePriority: 4,
  },
  {
    href: '/distribution',
    label: 'Distribution',
    mobileLabel: 'Relief',
    description: 'Relief events and assignment tracking',
    pageTitle: 'Distribution',
    pageEyebrow: 'Relief Operations',
    icon: Truck,
    perm: 'view_reports',
    group: 'Operations',
  },
  {
    href: '/reports',
    label: 'Reports',
    mobileLabel: 'Reports',
    description: 'Exports, summaries, and reporting',
    pageTitle: 'Reports',
    pageEyebrow: 'Analytics',
    icon: FileText,
    perm: 'view_reports',
    group: 'Operations',
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
    group: 'Operations',
  },
];

export const ADMIN_NAV_ITEMS: AppNavItem[] = [
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

export const RESIDENT_NAV_ITEMS: AppNavItem[] = [
  {
    href: '/resident',
    label: 'Resident Portal',
    mobileLabel: 'Portal',
    description: 'Submitted records and approval status',
    pageTitle: 'Resident Portal',
    pageEyebrow: 'Resident Services',
    icon: Home,
    perm: null,
    group: 'Resident',
  },
  {
    href: '/resident/notifications',
    label: 'Notifications',
    mobileLabel: 'Inbox',
    description: 'Distribution notices and resident updates',
    pageTitle: 'Notifications',
    pageEyebrow: 'Resident Services',
    icon: Bell,
    perm: null,
    group: 'Resident',
  },
  {
    href: '/households/register',
    label: 'New Registration',
    mobileLabel: 'Register',
    description: 'Create and submit a new household record',
    pageTitle: 'New Registration',
    pageEyebrow: 'Resident Services',
    icon: FileText,
    perm: null,
    group: 'Resident',
  },
];

export function isPathActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/dashboard' && href !== '/resident' && pathname.startsWith(href));
}

export function getMobileBottomNavItems(items: AppNavItem[] = STAFF_NAV_ITEMS): AppNavItem[] {
  return items
    .filter((item) => item.showInBottomNav)
    .sort((left, right) => (left.mobilePriority ?? Number.MAX_SAFE_INTEGER) - (right.mobilePriority ?? Number.MAX_SAFE_INTEGER))
    .slice(0, MOBILE_BOTTOM_NAV_LIMIT);
}

function matchPath(items: AppNavItem[], pathname: string): AppNavItem | null {
  return items.find((item) => isPathActive(pathname, item.href)) ?? null;
}

export function getPageMeta(pathname: string) {
  const matched =
    matchPath(STAFF_NAV_ITEMS, pathname)
    ?? matchPath(ADMIN_NAV_ITEMS, pathname)
    ?? matchPath(RESIDENT_NAV_ITEMS, pathname);

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
