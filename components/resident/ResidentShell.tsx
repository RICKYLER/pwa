'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AlertTriangle, LogOut } from 'lucide-react';
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
import { getUserNotifications } from '@/lib/db/user-notifications';
import { resolveResidentActiveApprovedHousehold } from '@/lib/resident-households';
import ResidentProfileModal from '@/components/resident/ResidentProfileModal';
import ResidentBottomNav from '@/components/resident/ResidentBottomNav';
import LanguageSwitcher from '@/components/resident/LanguageSwitcher';
import { ResidentLanguageProvider, useResidentLanguage } from '@/lib/i18n/resident-language';
import type { Household } from '@/lib/db/schema';

declare global {
  interface WindowEventMap {
    'mswdo-data-changed': CustomEvent<{
      source: 'supabase';
      table: string;
      mode: 'hydrate' | 'change';
    }>;
    'mswdo-open-resident-profile': CustomEvent<void>;
  }
}

interface ResidentShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

function ResidentShellContent({ title, subtitle, children }: ResidentShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const user = getCurrentUser();
  const meta = getPageMeta(pathname);
  const accessIssue = useSessionAccessIssue(user, user?.role === 'resident');
  const { t, lang } = useResidentLanguage();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [hasActiveHousehold, setHasActiveHousehold] = useState(() => pathname.startsWith('/resident/household'));
  const [activeHousehold, setActiveHousehold] = useState<Household | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

  useEffect(() => {
    function handleOpenProfileEvent() {
      setIsProfileModalOpen(true);
    }
    window.addEventListener('mswdo-open-resident-profile', handleOpenProfileEvent);
    return () => {
      window.removeEventListener('mswdo-open-resident-profile', handleOpenProfileEvent);
    };
  }, []);

  // Fetch unread notifications for badge
  useEffect(() => {
    if (!user || user.role !== 'resident') {
      return;
    }

    let cancelled = false;

    async function loadNotifications() {
      try {
        const notifications = await getUserNotifications();
        if (!cancelled) {
          const unread = notifications.filter((item) => !item.read_at).length;
          setUnreadNotificationsCount(unread);
        }
      } catch (err) {
        console.error('Failed to load resident notifications count:', err);
      }
    }

    void loadNotifications();

    function handleDataChanged(event: WindowEventMap['mswdo-data-changed']) {
      if (event.detail.table === 'user_notifications' || event.detail.table === 'distribution_events') {
        void loadNotifications();
      }
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('mswdo-data-changed', handleDataChanged);
    };
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== 'resident') {
      return;
    }

    const residentUser = user;
    let cancelled = false;

    async function loadActiveHouseholdState() {
      try {
        const households = await getHouseholds({
          applicant_user_id: residentUser.id,
          applicant_email: residentUser.email,
        });
        if (!cancelled) {
          const activeHh = resolveResidentActiveApprovedHousehold(households);
          setHasActiveHousehold(Boolean(activeHh));
          setActiveHousehold(activeHh);
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
    try {
      setIsLoggingOut(true);
      await logout();
      router.push('/login');
    } finally {
      setIsLoggingOut(false);
    }
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
    <div className="civic-shell-noise min-h-screen bg-slate-50/50">
      <header className="civic-topbar civic-hairline sticky top-0 z-30 bg-white/95 backdrop-blur-md shadow-xs">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-3.5 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/resident"
              className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-white border border-slate-200/80 overflow-hidden p-1 shadow-xs transition-transform hover:scale-105 active:scale-95"
              title={t('home')}
            >
              <img src="/dswd-logo.png" alt="DSWD Logo" className="h-full w-full object-contain" />
            </Link>

            {/* Interactive Resident Profile Chip */}
            <button
              type="button"
              onClick={() => setIsProfileModalOpen(true)}
              className="group flex items-center gap-2.5 rounded-2xl border border-slate-200/90 bg-white/90 py-1.5 pl-2 pr-3.5 text-left shadow-xs transition hover:border-emerald-400 hover:bg-emerald-50/40 hover:shadow-sm active:scale-[0.98]"
              title={t('profileChipTooltip')}
            >
              <div className="relative flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-[11px] sm:text-xs font-black text-white shadow-xs transition-transform group-hover:scale-105">
                {user?.email ? user.email.slice(0, 2).toUpperCase() : 'RP'}
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-white text-emerald-600 shadow-xs">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </span>
              </div>
              <div className="min-w-0 max-w-[140px] sm:max-w-[200px]">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[10px] font-bold uppercase tracking-wider text-cyan-800">
                    {t('municipalityLabel')}
                  </p>
                  <span className="rounded-md bg-emerald-100 px-1.5 py-0.2 text-[9px] font-extrabold uppercase text-emerald-800">
                    ID Pass
                  </span>
                </div>
                <p className="truncate text-xs font-bold text-slate-900 transition-colors group-hover:text-emerald-950">
                  {user?.email || t('residentPortalLabel')}
                </p>
              </div>
            </button>
          </div>

          {/* Desktop Navigation (Visible on md and up - Clean single row) */}
          <nav className="hidden md:flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 rounded-full bg-slate-100/80 p-1 border border-slate-200/60">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isPathActive(pathname, item.href);
                const label =
                  item.href === '/resident'
                    ? t('home')
                    : item.href === '/resident/notifications'
                      ? t('notifications')
                      : item.href === '/resident/household'
                        ? t('household')
                        : item.href === '/households/register'
                          ? t('newRegistration')
                          : item.mobileLabel;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all',
                      active
                        ? 'bg-cyan-950 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-950 hover:bg-white/80',
                    )}
                  >
                    <div className="relative flex items-center">
                      <Icon className={cn('h-3.5 w-3.5', active ? 'text-cyan-300' : 'text-slate-500')} />
                      {item.href === '/resident/notifications' && unreadNotificationsCount > 0 && (
                        <span className="absolute -top-1.5 -right-2 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-rose-600 px-0.5 text-[8px] font-black text-white">
                          {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                        </span>
                      )}
                    </div>
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>

            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <PwaInstallAction
                label={t('downloadApp')}
                className="border-cyan-900/15 bg-cyan-50/70 text-cyan-950 hover:border-cyan-300 hover:bg-cyan-100 text-xs py-1.5 px-3"
              />

              <LanguageSwitcher variant="default" />

              <button
                type="button"
                onClick={() => setIsLogoutConfirmOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 shadow-xs"
                title={t('signOut')}
              >
                <LogOut className="h-3.5 w-3.5 text-rose-500" />
                <span>{t('signOut')}</span>
              </button>
            </div>
          </nav>

          {/* Mobile Header Quick Actions */}
          <div className="flex items-center gap-1.5 md:hidden">
            {/* Language Switcher on Mobile */}
            <LanguageSwitcher variant="compact" />

            <PwaInstallAction
              iconOnly
              label={t('downloadApp')}
              className="h-9 w-9 rounded-2xl border-cyan-900/15 bg-cyan-50 text-cyan-950 hover:bg-cyan-100"
            />
            <button
              type="button"
              onClick={() => setIsLogoutConfirmOpen(true)}
              aria-label={t('signOut')}
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 active:scale-95"
              title={t('signOut')}
            >
              <LogOut className="h-4.5 w-4.5 text-rose-500" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container with wide desktop layout and bottom padding for mobile bottom nav */}
      <main className="mx-auto max-w-[1400px] px-4 py-6 pb-28 sm:px-6 md:pb-12 lg:px-8">
        <CivicHero
          eyebrow={lang === 'ceb' && meta.eyebrow === 'Resident Services' ? 'Mga Serbisyo sa Residente' : meta.eyebrow}
          title={title}
          description={subtitle || meta.description}
          aside={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(true)}
                className="hidden sm:inline-flex items-center gap-2 rounded-full border border-cyan-900/20 bg-cyan-50 px-4 py-2 text-xs font-bold text-cyan-950 hover:bg-cyan-100 transition shadow-xs"
              >
                <span>💳 {t('digitalIdPass')}</span>
              </button>
              <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 shadow-xs">
                {t('residentActiveBadge')}
              </div>
            </div>
          }
        />
        <div className="mt-6">{children}</div>
      </main>

      {/* Fixed Bottom Navigation Bar for Mobile */}
      <ResidentBottomNav
        pathname={pathname}
        hasActiveHousehold={hasActiveHousehold}
        unreadCount={unreadNotificationsCount}
        isProfileOpen={isProfileModalOpen}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        onLogoutClick={() => setIsLogoutConfirmOpen(true)}
      />

      {/* Confirmation Dialog for Sign Out */}
      <Dialog open={isLogoutConfirmOpen} onOpenChange={setIsLogoutConfirmOpen}>
        <DialogContent
          className="max-w-sm rounded-[28px] border-slate-200 bg-white p-6 shadow-[0_28px_80px_-38px_rgba(15,23,42,0.4)]"
        >
          <div className="flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <LogOut className="h-7 w-7" />
            </div>
            <DialogHeader className="mt-4 text-center">
              <DialogTitle className="text-lg font-bold text-slate-900">
                {t('signOutDialogTitle')}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs text-slate-600">
                {t('signOutDialogDesc')}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 flex w-full flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsLogoutConfirmOpen(false);
                  void handleLogout();
                }}
                disabled={isLoggingOut}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-rose-700 active:scale-98 disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" />
                {isLoggingOut ? t('signingOutState') : t('signOutConfirmBtn')}
              </button>
              <button
                type="button"
                onClick={() => setIsLogoutConfirmOpen(false)}
                className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-98"
              >
                {t('signOutCancelBtn')}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Access Issue Dialog */}
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
                    ? t('accountRemovedTitle')
                    : accessIssue === 'account-deactivated'
                      ? t('accountDeactivatedTitle')
                      : t('accessUpdatedTitle')}
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
              {t('accountMistakeNotice')}
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
                {isLoggingOut ? t('signingOutState') : t('signOutAndContinue')}
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ResidentProfileModal
        open={isProfileModalOpen}
        onOpenChange={setIsProfileModalOpen}
        household={activeHousehold}
      />
    </div>
  );
}

export default function ResidentShell(props: ResidentShellProps) {
  return <ResidentShellContent {...props} />;
}
