'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { hasPermission } from '@/lib/auth';
import { STAFF_NAV_ITEMS, isPathActive } from '@/lib/navigation';
import { cn } from '@/lib/utils';

export default function BottomNav() {
  const pathname = usePathname();
  const visibleItems = STAFF_NAV_ITEMS.filter((item) => !item.perm || hasPermission(item.perm as never));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(env(safe-area-inset-bottom),0.35rem)] pt-2">
      <div className="civic-topbar civic-soft-shadow mx-auto flex max-w-lg items-center justify-between rounded-[26px] border border-white/80 px-2 py-1.5">
        {visibleItems.slice(0, 5).map((item) => {
          const active = isPathActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex min-w-[58px] flex-1 flex-col items-center gap-1 rounded-[18px] px-2 py-2 transition"
            >
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-2xl transition',
                  active ? 'bg-cyan-950 text-white shadow-[0_14px_28px_-20px_rgba(8,47,73,0.8)]' : 'text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-700',
                )}
              >
                <Icon className="h-4.5 w-4.5" strokeWidth={active ? 2.35 : 1.9} />
              </div>
              <span className={cn('text-[10px] font-semibold', active ? 'text-cyan-950' : 'text-slate-400')}>
                {item.mobileLabel}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
