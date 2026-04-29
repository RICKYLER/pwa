'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowUpRight, LogOut } from 'lucide-react';
import { getCurrentUser, hasPermission, logout } from '@/lib/auth';
import { ADMIN_NAV_ITEMS, isPathActive, STAFF_NAV_ITEMS } from '@/lib/navigation';
import { cn } from '@/lib/utils';

function SidebarLink({
  href,
  label,
  description,
  Icon,
  active,
}: {
  href: string;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-3 rounded-[22px] border px-3 py-3 transition',
        active
          ? 'border-cyan-900/15 bg-cyan-950 text-white shadow-[0_18px_42px_-24px_rgba(8,47,73,0.8)]'
          : 'border-transparent bg-white/65 text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900',
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-2xl border transition',
          active
            ? 'border-white/15 bg-white/12 text-white'
            : 'border-slate-200 bg-slate-50 text-slate-500 group-hover:border-cyan-100 group-hover:bg-cyan-50 group-hover:text-cyan-900',
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={active ? 2.3 : 1.9} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-semibold', active && 'text-white')}>{label}</p>
        <p className={cn('mt-1 truncate text-[11px]', active ? 'text-cyan-100/80' : 'text-slate-400')}>
          {description}
        </p>
      </div>
      {active ? <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-cyan-100" /> : null}
    </Link>
  );
}

export default function DesktopSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = getCurrentUser();

  const visibleItems = STAFF_NAV_ITEMS.filter((item) => !item.perm || hasPermission(item.perm as never));
  const adminItems = user?.role === 'admin' ? ADMIN_NAV_ITEMS : [];

  function handleLogout() {
    logout();
    router.push('/login');
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-slate-200/70 bg-[linear-gradient(180deg,rgba(248,251,255,0.98),rgba(239,246,255,0.96))] shadow-[22px_0_60px_-42px_rgba(15,23,42,0.35)] backdrop-blur">
      <div className="border-b border-slate-200/70 px-5 pb-5 pt-6">
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-white shadow-[0_22px_48px_-24px_rgba(8,47,73,0.2)] overflow-hidden p-2 transition-transform hover:scale-105">
            <img src="/dswd-logo.png" alt="DSWD Logo" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-950">MSWDO Civic Console</p>
            <p className="truncate text-[11px] text-slate-500">{user?.barangay_id || 'Municipal workspace'}</p>
          </div>
        </div>
        <div className="mt-4 rounded-[22px] border border-white/70 bg-white/90 px-4 py-3 shadow-[0_16px_44px_-34px_rgba(15,23,42,0.35)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Active Profile</p>
          <p className="mt-2 truncate text-sm font-bold text-slate-900">{user?.name}</p>
          <p className="mt-1 text-[11px] capitalize text-slate-500">{user?.role?.replace('_', ' ')}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-5">
        <div>
          <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Core</p>
          <div className="mt-3 space-y-2">
            {visibleItems
              .filter((item) => item.group === 'Core')
              .map((item) => (
                <SidebarLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  description={item.description}
                  Icon={item.icon}
                  active={isPathActive(pathname, item.href)}
                />
              ))}
          </div>
        </div>

        <div>
          <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Operations</p>
          <div className="mt-3 space-y-2">
            {visibleItems
              .filter((item) => item.group === 'Operations')
              .map((item) => (
                <SidebarLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  description={item.description}
                  Icon={item.icon}
                  active={isPathActive(pathname, item.href)}
                />
              ))}
          </div>
        </div>

        {adminItems.length > 0 ? (
          <div>
            <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Administration</p>
            <div className="mt-3 space-y-2">
              {adminItems.map((item) => (
                <SidebarLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  description={item.description}
                  Icon={item.icon}
                  active={isPathActive(pathname, item.href)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </nav>

      <div className="border-t border-slate-200/70 px-4 py-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
