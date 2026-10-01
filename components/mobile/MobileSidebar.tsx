'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, LogOut, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getCurrentUser, hasPermission, logout } from '@/lib/auth';
import {
  ADMIN_NAV_GROUP,
  ADMIN_NAV_ITEMS,
  type AppNavItem,
  isPathActive,
  STAFF_NAV_GROUPS,
  STAFF_NAV_ITEMS,
} from '@/lib/navigation';
import { usePendingMemberApprovalCount } from '@/hooks/usePendingMemberApprovalCount';
import { usePendingLocationReviewCount } from '@/hooks/usePendingLocationReviewCount';
import { cn } from '@/lib/utils';

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

function NavSection({
  title,
  icon: GroupIcon,
  items,
  pathname,
  onClose,
  badges,
  badgeLabel,
}: {
  title: string;
  icon?: LucideIcon;
  items: AppNavItem[];
  pathname: string;
  onClose: () => void;
  badges?: Record<string, number>;
  badgeLabel?: string;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          {GroupIcon ? <GroupIcon className="h-3.5 w-3.5 text-cyan-800/60" /> : null}
          <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-slate-400">{title}</p>
        </div>
        {badgeLabel && (
          <span className="rounded-full bg-cyan-100/70 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-cyan-950 uppercase">
            {badgeLabel}
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {items.map((item) => {
          const active = isPathActive(pathname, item.href);
          const Icon = item.icon;
          const badge = badges?.[item.href] ?? 0;
          const isConfidential = item.href === '/cases' || item.href === '/cases/dashboard';

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-2.5 rounded-[18px] border px-3 py-2.5 transition',
                active
                  ? 'border-cyan-900/15 bg-cyan-950 text-white'
                  : 'border-slate-200/70 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border',
                  active
                    ? 'border-white/15 bg-white/12 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-500',
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={active ? 2.2 : 1.9} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-xs font-semibold">{item.label}</p>
                  {isConfidential && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                        active ? 'bg-cyan-800 text-cyan-100' : 'border border-rose-200/60 bg-rose-50 text-rose-700',
                      )}
                    >
                      Confidential
                    </span>
                  )}
                </div>
                <p className={cn('mt-0.5 truncate text-[11px]', active ? 'text-cyan-100/80' : 'text-slate-400')}>
                  {item.description}
                </p>
              </div>
              {badge > 0 ? (
                <span
                  className={cn(
                    'flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10.5px] font-bold',
                    active ? 'bg-white/20 text-white' : 'bg-rose-600 text-white',
                  )}
                >
                  {badge > 99 ? '99+' : badge}
                </span>
              ) : null}
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

  const visibleItems = STAFF_NAV_ITEMS.filter((item) => {
    if (user?.role === 'admin') return true;
    return !item.perm || hasPermission(item.perm as never);
  });
  const adminItems = user?.role === 'admin' ? ADMIN_NAV_ITEMS : [];
  const pendingApprovals = usePendingMemberApprovalCount();
  const pendingLocationReviews = usePendingLocationReviewCount();

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
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-[18px] border border-slate-200/70 bg-white p-1.5 shadow-sm">
                <img src="/dswd-logo.png" alt="DSWD Logo" className="h-full w-full object-contain" />
              </div>
              <div className="min-w-0">
                <SheetTitle className="truncate text-base font-bold text-slate-950">MSWDO Portal</SheetTitle>
                <SheetDescription className="mt-0.5 truncate text-xs text-slate-500">
                  {user?.barangay_id || 'Municipal Operations'}
                </SheetDescription>
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-4 overflow-y-auto px-4 py-4 pb-0">
          <div className="rounded-[20px] border border-slate-200/70 bg-white/90 p-3.5 shadow-[0_18px_46px_-36px_rgba(15,23,42,0.24)]">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Signed in</p>
              <span className="rounded-full border border-cyan-100/60 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold capitalize text-cyan-800">
                {user?.role ? `${user.role.replace('_', ' ')}` : 'Staff'}
              </span>
            </div>
            <p className="mt-1 truncate text-xs font-bold text-slate-950">{user?.name || 'Staff user'}</p>
          </div>

          {STAFF_NAV_GROUPS.map((group) => {
            const items = visibleItems.filter((item) => item.group === group.id);
            if (items.length === 0) return null;

            return (
              <NavSection
                key={group.id}
                title={group.label}
                icon={group.icon}
                items={items}
                pathname={pathname}
                onClose={onClose}
              />
            );
          })}

          {adminItems.length > 0 && (
            <NavSection
              title={ADMIN_NAV_GROUP.label}
              icon={ADMIN_NAV_GROUP.icon}
              items={adminItems}
              pathname={pathname}
              onClose={onClose}
              badges={{
                '/admin/member-approvals': pendingApprovals,
                '/admin/location-review': pendingLocationReviews,
              }}
              badgeLabel="Admin"
            />
          )}
        </div>

        <SheetFooter className="border-t border-slate-200/70 bg-white/70 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3.5">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void handleLogout();
            }}
            className="h-11 w-full rounded-[16px] border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
