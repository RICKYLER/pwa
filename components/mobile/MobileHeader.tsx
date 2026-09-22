'use client';

import { usePathname } from 'next/navigation';
import PwaInstallAction from '@/components/PwaInstallAction';
import { getCurrentUser } from '@/lib/auth';
import { getPageMeta } from '@/lib/navigation';
import { cn } from '@/lib/utils';

interface MobileHeaderProps {
  title?: string;
  onMenuClick?: () => void;
}

export default function MobileHeader({ title, onMenuClick }: MobileHeaderProps) {
  const user = getCurrentUser();
  const pathname = usePathname();
  const meta = getPageMeta(pathname);
  const initials = user?.name
    ?.split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') ?? (user?.email ? user.email.slice(0, 2).toUpperCase() : 'U');

  return (
    <header className="civic-topbar civic-hairline sticky top-0 z-30">
      <div className="mx-auto flex items-center justify-between gap-3 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.7rem)]">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white p-1 shadow-xs">
            <img src="/dswd-logo.png" alt="DSWD Logo" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-black tracking-tight text-slate-950">
              {title || meta.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <PwaInstallAction
            iconOnly
            label="Download App"
            className="border-cyan-200 bg-cyan-50 text-cyan-950 hover:border-cyan-300 hover:bg-cyan-100"
          />
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Account details"
            className={cn(
              'flex h-10 min-w-10 items-center justify-center rounded-full border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95',
              initials.length > 1 ? 'tracking-[0.12em]' : '',
            )}
          >
            {initials}
          </button>
        </div>
      </div>
    </header>
  );
}
