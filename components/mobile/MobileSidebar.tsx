'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, LogOut, ShieldCheck } from 'lucide-react';
import { getCurrentUser, hasPermission, logout } from '@/lib/auth';
import { ADMIN_NAV_ITEMS, isPathActive, STAFF_NAV_ITEMS } from '@/lib/navigation';
import { cn } from '@/lib/utils';

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MobileSidebar({ isOpen, onClose }: MobileSidebarProps) {
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
    <>
      {isOpen ? <div className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" /> : null}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[19rem] flex-col border-r border-slate-200/70 bg-[linear-gradient(180deg,rgba(248,251,255,0.98),rgba(239,246,255,0.96))] shadow-[22px_0_60px_-42px_rgba(15,23,42,0.35)] transition-transform duration-300',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="border-b border-slate-200/70 px-5 pb-5 pt-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-cyan-950 text-white">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-950">MSWDO Civic Console</p>
                <p className="truncate text-[11px] text-slate-500">{user?.barangay_id || 'Municipal workspace'}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
              aria-label="Close menu"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-5">
          <div>
            <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Core</p>
            <div className="mt-3 space-y-2">
              {visibleItems
                .filter((item) => item.group === 'Core')
                .map((item) => {
                  const active = isPathActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        'flex items-center gap-3 rounded-[20px] border px-3 py-3 transition',
                        active
                          ? 'border-cyan-900/15 bg-cyan-950 text-white'
                          : 'border-transparent bg-white/65 text-slate-600 hover:border-slate-200 hover:bg-white',
                      )}
                    >
                      <div className={cn('flex h-10 w-10 items-center justify-center rounded-2xl border', active ? 'border-white/10 bg-white/12 text-white' : 'border-slate-200 bg-slate-50 text-slate-500')}>
                        <Icon className="h-4 w-4" strokeWidth={active ? 2.3 : 1.9} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{item.label}</p>
                        <p className={cn('mt-1 truncate text-[11px]', active ? 'text-cyan-100/80' : 'text-slate-400')}>
                          {item.description}
                        </p>
                      </div>
                    </Link>
                  );
                })}
            </div>
          </div>

          <div>
            <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Operations</p>
            <div className="mt-3 space-y-2">
              {visibleItems
                .filter((item) => item.group === 'Operations')
                .map((item) => {
                  const active = isPathActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        'flex items-center gap-3 rounded-[20px] border px-3 py-3 transition',
                        active
                          ? 'border-cyan-900/15 bg-cyan-950 text-white'
                          : 'border-transparent bg-white/65 text-slate-600 hover:border-slate-200 hover:bg-white',
                      )}
                    >
                      <div className={cn('flex h-10 w-10 items-center justify-center rounded-2xl border', active ? 'border-white/10 bg-white/12 text-white' : 'border-slate-200 bg-slate-50 text-slate-500')}>
                        <Icon className="h-4 w-4" strokeWidth={active ? 2.3 : 1.9} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{item.label}</p>
                        <p className={cn('mt-1 truncate text-[11px]', active ? 'text-cyan-100/80' : 'text-slate-400')}>
                          {item.description}
                        </p>
                      </div>
                    </Link>
                  );
                })}
            </div>
          </div>

          {adminItems.length > 0 ? (
            <div>
              <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Administration</p>
              <div className="mt-3 space-y-2">
                {adminItems.map((item) => {
                  const active = isPathActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        'flex items-center gap-3 rounded-[20px] border px-3 py-3 transition',
                        active
                          ? 'border-cyan-900/15 bg-cyan-950 text-white'
                          : 'border-transparent bg-white/65 text-slate-600 hover:border-slate-200 hover:bg-white',
                      )}
                    >
                      <div className={cn('flex h-10 w-10 items-center justify-center rounded-2xl border', active ? 'border-white/10 bg-white/12 text-white' : 'border-slate-200 bg-slate-50 text-slate-500')}>
                        <Icon className="h-4 w-4" strokeWidth={active ? 2.3 : 1.9} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{item.label}</p>
                        <p className={cn('mt-1 truncate text-[11px]', active ? 'text-cyan-100/80' : 'text-slate-400')}>
                          {item.description}
                        </p>
                      </div>
                    </Link>
                  );
                })}
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
    </>
  );
}
