import type { LucideIcon } from 'lucide-react';
import {
  Activity,
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
}

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
