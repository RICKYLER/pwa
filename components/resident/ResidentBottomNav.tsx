'use client';

import Link from 'next/link';
import { Bell, Home, IdCard, LogOut, Users, FileText } from 'lucide-react';
import { isPathActive } from '@/lib/navigation';
import { useResidentLanguage } from '@/lib/i18n/resident-language';
import { cn } from '@/lib/utils';

interface ResidentBottomNavProps {
  pathname: string;
  hasActiveHousehold: boolean;
  unreadCount?: number;
  isProfileOpen?: boolean;
  onOpenProfile: () => void;
  onLogoutClick: () => void;
}

export default function ResidentBottomNav({
  pathname,
  hasActiveHousehold,
  unreadCount = 0,
  isProfileOpen = false,
  onOpenProfile,
  onLogoutClick,
}: ResidentBottomNavProps) {
  const { t } = useResidentLanguage();
  const isBalayActive = isPathActive(pathname, '/resident') && !isProfileOpen;
  const isPahibaloActive = isPathActive(pathname, '/resident/notifications') && !isProfileOpen;
  const householdHref = hasActiveHousehold ? '/resident/household' : '/households/register';
  const isHouseholdActive =
    (isPathActive(pathname, '/resident/household') || isPathActive(pathname, '/households/register')) &&
    !isProfileOpen;

  const HouseholdIcon = hasActiveHousehold ? Users : FileText;
  const householdLabel = hasActiveHousehold ? t('householdShort') : t('registerShort');

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 backdrop-blur-md px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] md:hidden"
    >
      <div className="mx-auto flex max-w-md items-center justify-between">
        {/* 1. Balay / Home */}
        <Link
          href="/resident"
          aria-current={isBalayActive ? 'page' : undefined}
          className="group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-1 px-1 transition active:scale-95"
        >
          <div
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
              isBalayActive
                ? 'bg-emerald-100 text-emerald-800 shadow-sm'
                : 'text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-700',
            )}
          >
            <Home className="h-5 w-5" strokeWidth={isBalayActive ? 2.4 : 1.9} />
          </div>
          <span
            className={cn(
              'truncate text-[10px] font-bold tracking-tight transition-colors',
              isBalayActive ? 'text-emerald-900 font-extrabold' : 'text-slate-500',
            )}
          >
            {t('home')}
          </span>
        </Link>

        {/* 2. Pahibalo / Notifications */}
        <Link
          href="/resident/notifications"
          aria-current={isPahibaloActive ? 'page' : undefined}
          className="group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-1 px-1 transition active:scale-95"
        >
          <div
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
              isPahibaloActive
                ? 'bg-emerald-100 text-emerald-800 shadow-sm'
                : 'text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-700',
            )}
          >
            <Bell className="h-5 w-5" strokeWidth={isPahibaloActive ? 2.4 : 1.9} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-black text-white shadow-sm ring-2 ring-white animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          <span
            className={cn(
              'truncate text-[10px] font-bold tracking-tight transition-colors',
              isPahibaloActive ? 'text-emerald-900 font-extrabold' : 'text-slate-500',
            )}
          >
            {t('notifications')}
          </span>
        </Link>

        {/* 3. Akong Pamilya / Household */}
        <Link
          href={householdHref}
          aria-current={isHouseholdActive ? 'page' : undefined}
          className="group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-1 px-1 transition active:scale-95"
        >
          <div
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
              isHouseholdActive
                ? 'bg-emerald-100 text-emerald-800 shadow-sm'
                : 'text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-700',
            )}
          >
            <HouseholdIcon className="h-5 w-5" strokeWidth={isHouseholdActive ? 2.4 : 1.9} />
          </div>
          <span
            className={cn(
              'truncate text-[10px] font-bold tracking-tight transition-colors',
              isHouseholdActive ? 'text-emerald-900 font-extrabold' : 'text-slate-500',
            )}
          >
            {householdLabel}
          </span>
        </Link>

        {/* 4. Digital ID / Profile */}
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label={t('profileChipTooltip')}
          className="group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-1 px-1 transition active:scale-95"
        >
          <div
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
              isProfileOpen
                ? 'bg-emerald-100 text-emerald-800 shadow-sm'
                : 'text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-700',
            )}
          >
            <IdCard className="h-5 w-5" strokeWidth={isProfileOpen ? 2.4 : 1.9} />
          </div>
          <span
            className={cn(
              'truncate text-[10px] font-bold tracking-tight transition-colors',
              isProfileOpen ? 'text-emerald-900 font-extrabold' : 'text-slate-500',
            )}
          >
            {t('digitalId')}
          </span>
        </button>

        {/* 5. Gawas / Sign Out */}
        <button
          type="button"
          onClick={onLogoutClick}
          aria-label={t('signOut')}
          className="group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-1 px-1 transition active:scale-95"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors group-hover:bg-rose-50 group-hover:text-rose-600">
            <LogOut className="h-5 w-5 text-rose-500/80 group-hover:text-rose-600" strokeWidth={1.9} />
          </div>
          <span className="truncate text-[10px] font-bold tracking-tight text-slate-500 group-hover:text-rose-600">
            {t('signOut')}
          </span>
        </button>
      </div>
    </nav>
  );
}
