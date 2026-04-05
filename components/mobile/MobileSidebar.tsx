'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, LogOut, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getCurrentUser, hasPermission, logout } from '@/lib/auth';
import { ADMIN_NAV_ITEMS, type AppNavItem, isPathActive, STAFF_NAV_ITEMS } from '@/lib/navigation';
import { cn } from '@/lib/utils';

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

function NavSection({
  title,
  items,
  pathname,
  onClose,
}: {
  title: string;
  items: AppNavItem[];
  pathname: string;
  onClose: () => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</p>
      <div className="space-y-2">
        {items.map((item) => {
          const active = isPathActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 rounded-[22px] border px-3 py-3 transition',
                active
                  ? 'border-cyan-900/15 bg-cyan-950 text-white'
                  : 'border-slate-200/70 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              <div className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border',
                active
                  ? 'border-white/15 bg-white/12 text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-500',
              )}>
                <Icon className="h-4 w-4" strokeWidth={active ? 2.2 : 1.9} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{item.label}</p>
                <p className={cn('mt-1 truncate text-[11px]', active ? 'text-cyan-100/80' : 'text-slate-400')}>
                  {item.description}
                </p>
              </div>
              <ChevronRight className={cn('h-4 w-4 shrink-0', active ? 'text-cyan-100/80' : 'text-slate-300')} />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default function MobileSidebar({ isOpen, onClose }: MobileSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const user = getCurrentUser();

  const visibleItems = STAFF_NAV_ITEMS.filter((item) => !item.perm || hasPermission(item.perm as never));
  const adminItems = user?.role === 'admin' ? ADMIN_NAV_ITEMS : [];

  function handleOpenChange(open: boolean) {
    if (!open) {
      onClose();
    }
  }

  async function handleLogout() {
    await logout();
    onClose();
    router.push('/login');
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="h-[min(88vh,46rem)] rounded-t-[30px] border-slate-200 bg-[linear-gradient(180deg,rgba(248,251,255,0.98),rgba(239,246,255,0.96))] p-0">
        <SheetHeader className="border-b border-slate-200/70 px-4 pb-4 pt-5 text-left">
          <div className="pr-10">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-cyan-950 text-white">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <SheetTitle className="truncate text-base font-bold text-slate-950">MSWDO Civic Console</SheetTitle>
                <SheetDescription className="mt-1 truncate text-sm text-slate-500">
                  {user?.barangay_id || 'Municipal workspace'}
                </SheetDescription>
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-5 overflow-y-auto px-4 py-4 pb-0">
          <div className="rounded-[24px] border border-slate-200/70 bg-white/90 p-4 shadow-[0_18px_46px_-36px_rgba(15,23,42,0.24)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Signed in</p>
            <p className="mt-2 text-sm font-bold text-slate-950">{user?.name || 'Staff user'}</p>
            <p className="mt-1 text-sm text-slate-500">{user?.role ? `${user.role} access` : 'Municipal access'}</p>
          </div>

          <NavSection title="Core" items={visibleItems.filter((item) => item.group === 'Core')} pathname={pathname} onClose={onClose} />
          <NavSection title="Operations" items={visibleItems.filter((item) => item.group === 'Operations')} pathname={pathname} onClose={onClose} />
          <NavSection title="Administration" items={adminItems} pathname={pathname} onClose={onClose} />
        </div>

        <SheetFooter className="border-t border-slate-200/70 bg-white/70 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void handleLogout();
            }}
            className="h-12 w-full rounded-[18px] border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
