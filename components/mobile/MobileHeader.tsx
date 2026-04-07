'use client';

import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import PwaInstallAction from '@/components/PwaInstallAction';
import { getCurrentUser } from '@/lib/auth';
import { getPageMeta } from '@/lib/navigation';
import { cn } from '@/lib/utils';

interface MobileHeaderProps {
  title?: string;
  onMenuClick: () => void;
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
    .join('') ?? 'U';

  return (
    <header className="civic-topbar civic-hairline sticky top-0 z-30">
      <div className="mx-auto flex items-center justify-between gap-3 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.7rem)]">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Open more menu"
            className="flex h-11 w-11 items-center justify-center rounded-[20px] border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              {user?.barangay_id || meta.eyebrow}
            </p>
            <p className="truncate text-base font-black tracking-tight text-slate-950">{title || meta.title}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <PwaInstallAction
            iconOnly
            label="Download App"
            className="border-cyan-200 bg-cyan-50 text-cyan-950 hover:border-cyan-300 hover:bg-cyan-100"
          />
          <div className={cn(
            'flex h-11 min-w-11 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm',
            initials.length > 1 ? 'tracking-[0.12em]' : '',
          )}>
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
}
