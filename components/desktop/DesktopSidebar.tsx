'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowUpRight, LogOut, ShieldCheck } from 'lucide-react';
import { getCurrentUser, hasPermission, logout } from '@/lib/auth';
import {
  ADMIN_NAV_GROUP,
  ADMIN_NAV_ITEMS,
  isPathActive,
  STAFF_NAV_GROUPS,
  STAFF_NAV_ITEMS,
} from '@/lib/navigation';
import { usePendingMemberApprovalCount } from '@/hooks/usePendingMemberApprovalCount';
import { usePendingLocationReviewCount } from '@/hooks/usePendingLocationReviewCount';
import { cn } from '@/lib/utils';

function SidebarLink({
  href,
  label,
  description,
  Icon,
  active,
  badge,
  isConfidential,
}: {
  href: string;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active: boolean;
  badge?: number;
  isConfidential?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-[18px] border px-3 py-2.5 transition-all duration-200',
        active
          ? 'border-cyan-900/15 bg-cyan-950 text-white shadow-[0_14px_32px_-18px_rgba(8,47,73,0.85)]'
          : 'border-transparent bg-white/60 text-slate-600 hover:border-slate-200/80 hover:bg-white hover:text-slate-900 hover:shadow-[0_4px_16px_-6px_rgba(15,23,42,0.08)]',
      )}
    >
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border transition-all duration-200',
          active
            ? 'border-white/20 bg-white/12 text-white shadow-inner'
            : 'border-slate-200/80 bg-slate-50/80 text-slate-500 group-hover:border-cyan-200 group-hover:bg-cyan-50/80 group-hover:text-cyan-900',
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={active ? 2.25 : 1.9} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className={cn('truncate text-[13px] font-semibold leading-tight', active ? 'text-white' : 'text-slate-800')}>
            {label}
          </p>
          {isConfidential && (
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                active ? 'bg-cyan-800/80 text-cyan-100' : 'border border-rose-200/60 bg-rose-50 text-rose-700',
              )}
            >
              Confidential
            </span>
          )}
        </div>
        <p className={cn('mt-0.5 truncate text-[11px] leading-normal', active ? 'text-cyan-100/75' : 'text-slate-400')}>
          {description}
        </p>
      </div>
      {badge && badge > 0 ? (
        <span
          className={cn(
            'flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded-full px-1.5 text-[10.5px] font-bold',
            active ? 'bg-white/20 text-white' : 'bg-rose-600 text-white shadow-sm',
          )}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      ) : active ? (
        <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-cyan-200" />
      ) : null}
    </Link>
  );
}

export default function DesktopSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = getCurrentUser();

  const visibleItems = STAFF_NAV_ITEMS.filter((item) => !item.perm || hasPermission(item.perm as never));
  const adminItems = user?.role === 'admin' ? ADMIN_NAV_ITEMS : [];
  const pendingApprovals = usePendingMemberApprovalCount();
  const pendingLocationReviews = usePendingLocationReviewCount();

  function handleLogout() {
    logout();
    router.push('/login');
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-slate-200/70 bg-[linear-gradient(180deg,rgba(248,251,255,0.98),rgba(239,246,255,0.96))] shadow-[22px_0_60px_-42px_rgba(15,23,42,0.35)] backdrop-blur print:hidden">
      <div className="border-b border-slate-200/70 px-4 pb-4 pt-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-[18px] border border-slate-100 bg-white p-1.5 shadow-[0_12px_32px_-16px_rgba(8,47,73,0.2)] transition-transform hover:scale-105">
            <img src="/dswd-logo.png" alt="DSWD Logo" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight text-slate-950">MSWDO Portal</p>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">{user?.barangay_id || 'Municipal Operations'}</p>
          </div>
        </div>
        <div className="mt-3.5 rounded-[18px] border border-white/80 bg-white/85 px-3.5 py-2.5 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.25)]">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Active Profile</p>
            <span className="rounded-full border border-cyan-100/60 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold capitalize text-cyan-800">
              {user?.role?.replace('_', ' ') || 'Staff'}
            </span>
          </div>
          <p className="mt-1 truncate text-xs font-bold text-slate-900">{user?.name || 'Authorized Staff'}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3.5 py-3.5">
        {STAFF_NAV_GROUPS.map((group) => {
          const itemsInGroup = visibleItems.filter((item) => item.group === group.id);
          if (itemsInGroup.length === 0) return null;

          const GroupIcon = group.icon;

          return (
            <div key={group.id} className="space-y-1.5">
              <div className="flex items-center gap-2 px-2.5 pt-1 pb-0.5">
                <GroupIcon className="h-3.5 w-3.5 text-cyan-800/70" />
                <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  {group.label}
                </p>
              </div>

              <div className="space-y-1.5">
                {itemsInGroup.map((item) => (
                  <SidebarLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    description={item.description}
                    Icon={item.icon}
                    active={isPathActive(pathname, item.href)}
                    isConfidential={item.href === '/cases' || item.href === '/cases/dashboard'}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {adminItems.length > 0 ? (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between px-2.5 pt-1.5 pb-0.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-cyan-800/70" />
                <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Administration
                </p>
              </div>
              <span className="rounded-full bg-cyan-100/80 px-2 py-0.5 text-[9px] font-bold tracking-wider text-cyan-950 uppercase">
                Admin
              </span>
            </div>

            <div className="space-y-1.5">
              {adminItems.map((item) => (
                <SidebarLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  description={item.description}
                  Icon={item.icon}
                  active={isPathActive(pathname, item.href)}
                  badge={
                    item.href === '/admin/member-approvals'
                      ? pendingApprovals
                      : item.href === '/admin/location-review'
                        ? pendingLocationReviews
                        : undefined
                  }
                />
              ))}
            </div>
          </div>
        ) : null}
      </nav>

      <div className="border-t border-slate-200/70 px-4 py-3.5">
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-[16px] border border-slate-200/80 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
