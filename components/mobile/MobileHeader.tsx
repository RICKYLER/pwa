'use client';

import { usePathname } from 'next/navigation';
import { Menu, ShieldCheck } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { getPageMeta } from '@/lib/navigation';

interface MobileHeaderProps {
  title?: string;
  onMenuClick: () => void;
}

export default function MobileHeader({ title, onMenuClick }: MobileHeaderProps) {
  const user = getCurrentUser();
  const pathname = usePathname();
  const meta = getPageMeta(pathname);

  return (
    <header className="civic-topbar civic-hairline sticky top-0 z-30">
      <div className="mx-auto flex items-center justify-between gap-3 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            aria-label="Open menu"
            className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[18px] bg-cyan-950 text-white shadow-[0_18px_36px_-24px_rgba(8,47,73,0.75)]">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{meta.eyebrow}</p>
              <p className="truncate text-sm font-bold text-slate-950">{title || meta.title}</p>
            </div>
          </div>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-sm">
          {user?.name?.charAt(0) ?? 'U'}
        </div>
      </div>
    </header>
  );
}
