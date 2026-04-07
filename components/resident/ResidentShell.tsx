'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AlertTriangle, LogOut, ShieldCheck } from 'lucide-react';
import { getCurrentUser, logout } from '@/lib/auth';
import { useSessionAccessIssue } from '@/hooks/useSessionAccessIssue';
import { getResidentNavItems, getPageMeta, isPathActive } from '@/lib/navigation';
import PwaInstallAction from '@/components/PwaInstallAction';
import { CivicHero } from '@/components/ui/civic-primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { getHouseholds } from '@/lib/db/households';
import { resolveResidentActiveApprovedHousehold } from '@/lib/resident-households';

declare global {
  interface WindowEventMap {
    'mswdo-data-changed': CustomEvent<{
      source: 'supabase';
      table: string;
      mode: 'hydrate' | 'change';
    }>;
  }
}

interface ResidentShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

type ResidentAccessIssue = 'account-removed' | 'account-deactivated' | 'access-updated' | null;

export default function ResidentShell({ title, subtitle, children }: ResidentShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const user = getCurrentUser();
  const meta = getPageMeta(pathname);
  const accessIssue = useSessionAccessIssue(user, user?.role === 'resident');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [hasActiveHousehold, setHasActiveHousehold] = useState(() => pathname.startsWith('/resident/household'));

  useEffect(() => {
    if (!user || user.role !== 'resident') {
      return;
    }

    const residentUser = user;
    let cancelled = false;

    async function loadActiveHouseholdState() {
      try {
        const households = await getHouseholds({ applicant_user_id: residentUser.id });
        if (!cancelled) {
          setHasActiveHousehold(Boolean(resolveResidentActiveApprovedHousehold(households)));
        }
      } catch (error) {
        console.error('Failed to resolve resident household navigation state:', error);
        if (!cancelled && pathname.startsWith('/resident/household')) {
          setHasActiveHousehold(true);
        }
      }
    }

    void loadActiveHouseholdState();

    function handleDataChanged(event: WindowEventMap['mswdo-data-changed']) {
      if (event.detail.table !== 'households') {
        return;
      }

      void loadActiveHouseholdState();
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged);

    return () => {
      cancelled = true;
      window.removeEventListener('mswdo-data-changed', handleDataChanged);
    };
  }, [pathname, user]);

  const navItems = useMemo(
    () => getResidentNavItems({ hasActiveHousehold, pathname }),
    [hasActiveHousehold, pathname],
  );

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  async function handleAccountIssueConfirm() {
    if (!accessIssue) {
      return;
    }

    try {
      setIsLoggingOut(true);
      await logout();
      router.replace(`/login?reason=${accessIssue}`);
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="civic-shell-noise min-h-screen">
      <header className="civic-topbar civic-hairline sticky top-0 z-30">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-cyan-950 text-white shadow-[0_18px_36px_-24px_rgba(8,47,73,0.75)]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Resident Services</p>
              <p className="truncate text-sm font-bold text-slate-950">{user?.email || 'Resident portal'}</p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isPathActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition',
                    active
                      ? 'border-cyan-900 bg-cyan-950 text-white shadow-[0_14px_28px_-20px_rgba(8,47,73,0.8)]'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.mobileLabel}
                </Link>
              );
            })}
            <PwaInstallAction className="border-cyan-900/15 bg-cyan-50 text-cyan-950 hover:border-cyan-300 hover:bg-cyan-100" />
            <button
              type="button"
              onClick={() => {
                void handleLogout();
              }}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8">
        <CivicHero
          eyebrow={meta.eyebrow}
          title={title}
          description={subtitle || meta.description}
          aside={
            <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">
              Resident access active
            </div>
          }
        />
        <div className="mt-6">{children}</div>
      </main>

      <Dialog open={Boolean(accessIssue)}>
        <DialogContent
          showCloseButton={false}
          className="max-w-md rounded-[28px] border-slate-200 bg-white p-0 shadow-[0_28px_80px_-38px_rgba(15,23,42,0.4)]"
        >
          <div className="rounded-t-[28px] bg-amber-50 px-6 py-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <DialogHeader className="text-left">
                <DialogTitle className="text-lg font-bold text-slate-950">
                  {accessIssue === 'account-removed'
                    ? 'Resident account removed'
                    : accessIssue === 'account-deactivated'
                      ? 'Resident account deactivated'
                      : 'Resident access changed'}
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm leading-6 text-slate-600">
                  {accessIssue === 'account-removed'
                    ? 'Your resident account is no longer available. For security, this session must end now.'
                    : accessIssue === 'account-deactivated'
                      ? 'Your resident account was deactivated by an administrator. Please sign out and contact MSWDO if you need help.'
                      : 'Your account access was updated by an administrator. Please sign in again to continue.'}
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>

          <div className="px-6 pb-6 pt-5">
            <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
              If you believe this was a mistake, contact the MSWDO administrator before signing in again.
            </div>

            <DialogFooter className="mt-5">
              <button
                type="button"
                onClick={() => {
                  void handleAccountIssueConfirm();
                }}
                disabled={isLoggingOut}
                className="inline-flex h-[48px] w-full items-center justify-center gap-2 rounded-[18px] bg-cyan-950 px-4 text-sm font-semibold text-white transition hover:bg-cyan-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" />
                {isLoggingOut ? 'Signing out...' : 'Sign out and continue'}
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
