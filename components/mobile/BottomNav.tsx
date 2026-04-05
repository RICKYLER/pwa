'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid } from 'lucide-react';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { ADMIN_NAV_ITEMS, getMobileBottomNavItems, isPathActive, STAFF_NAV_ITEMS } from '@/lib/navigation';
import { cn } from '@/lib/utils';

interface BottomNavProps {
  onMoreClick: () => void;
}

export default function BottomNav({ onMoreClick }: BottomNavProps) {
  const pathname = usePathname();
  const user = getCurrentUser();
  const visibleItems = STAFF_NAV_ITEMS.filter((item) => !item.perm || hasPermission(item.perm as never));
  const bottomItems = getMobileBottomNavItems(visibleItems);
  const moreItems = visibleItems.filter((item) => !item.showInBottomNav);
  const adminItems = user?.role === 'admin' ? ADMIN_NAV_ITEMS : [];
  const moreActive = [...moreItems, ...adminItems].some((item) => isPathActive(pathname, item.href));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(env(safe-area-inset-bottom),0.4rem)] pt-2">
      <div className="civic-topbar civic-soft-shadow mx-auto flex max-w-lg items-center gap-1 rounded-[28px] border border-white/85 px-2 py-1.5">
        {bottomItems.map((item) => {
          const active = isPathActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className="group flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[20px] px-1.5 py-2.5 transition"
            >
              <div
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-[18px] transition',
                  active
                    ? 'bg-cyan-950 text-white shadow-[0_14px_28px_-20px_rgba(8,47,73,0.8)]'
                    : 'text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-700',
                )}
              >
                <Icon className="h-4.5 w-4.5" strokeWidth={active ? 2.35 : 1.95} />
              </div>
              <span className={cn('truncate text-[11px] font-semibold', active ? 'text-cyan-950' : 'text-slate-400')}>
                {item.mobileLabel}
              </span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={onMoreClick}
          aria-label="Open more destinations"
          className="group flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[20px] px-1.5 py-2.5 transition"
        >
          <div
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-[18px] transition',
              moreActive
                ? 'bg-cyan-950 text-white shadow-[0_14px_28px_-20px_rgba(8,47,73,0.8)]'
                : 'text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-700',
            )}
          >
            <LayoutGrid className="h-4.5 w-4.5" strokeWidth={moreActive ? 2.35 : 1.95} />
          </div>
          <span className={cn('truncate text-[11px] font-semibold', moreActive ? 'text-cyan-950' : 'text-slate-400')}>
            More
          </span>
        </button>
      </div>
    </nav>
  );
}
