'use client';

import { TrendingUp, Menu } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';

interface MobileHeaderProps {
    title?: string;
    onMenuClick: () => void;
}

export default function MobileHeader({ title, onMenuClick }: MobileHeaderProps) {
    const user = getCurrentUser();

    return (
        <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3.5 bg-white/90 backdrop-blur-xl border-b border-slate-200/60">
            <div className="flex items-center gap-3">
                <button
                    onClick={onMenuClick}
                    aria-label="Open menu"
                    className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all"
                >
                    <Menu className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center shadow-sm">
                        <TrendingUp className="w-3.5 h-3.5 text-white" />
                    </div>
                    <p className="text-sm font-bold text-slate-900">{title || 'MSWDO Census'}</p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold select-none">
                    {user?.name?.charAt(0) ?? 'U'}
                </div>
            </div>
        </header>
    );
}
