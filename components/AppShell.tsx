'use client';

import { ReactNode, useState } from 'react';
import { usePathname } from 'next/navigation';
import MobileHeader from '@/components/mobile/MobileHeader';
import MobileSidebar from '@/components/mobile/MobileSidebar';
import BottomNav from '@/components/mobile/BottomNav';
import DesktopSidebar from '@/components/desktop/DesktopSidebar';

const PAGE_TITLES: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/households': 'Households',
    '/vulnerability': 'Vulnerability',
    '/distribution': 'Distribution',
    '/reports': 'Reports',
    '/inventory': 'Inventory',
};

interface AppShellProps {
    children: ReactNode;
    title?: string;
}

// ─── Mobile Shell ────────────────────────────────────────────────────────────
function MobileShell({ children, title }: AppShellProps) {
    const pathname = usePathname();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const pageTitle = title || PAGE_TITLES[pathname] || 'MSWDO Census';

    return (
        <div className="flex flex-col min-h-screen bg-slate-50">
            <MobileHeader title={pageTitle} onMenuClick={() => setDrawerOpen(true)} />
            <MobileSidebar isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
            <main className="flex-1 pb-20">
                {children}
            </main>
            <BottomNav />
        </div>
    );
}

// ─── Desktop Shell ───────────────────────────────────────────────────────────
function DesktopShell({ children }: AppShellProps) {
    return (
        <div className="flex h-screen overflow-hidden bg-slate-50">
            <DesktopSidebar />
            <main className="flex-1 ml-64 overflow-y-auto">
                {children}
            </main>
        </div>
    );
}

// ─── AppShell ────────────────────────────────────────────────────────────────
/**
 * Thin orchestrator used by page view components.
 * Mobile (<1024px): MobileShell  →  MobileHeader + MobileSidebar + BottomNav
 * Desktop (≥1024px): DesktopShell  →  DesktopSidebar
 *
 * Responsive switching via Tailwind — no JS matchMedia needed at this level
 * because the *page* orchestrator (page.tsx) already picks the right view.
 * AppShell itself always renders both shells; Tailwind hides the wrong one.
 * That means zero layout flash and proper SSR.
 */
export default function AppShell({ children, title }: AppShellProps) {
    return (
        <>
            {/* Mobile shell — hidden on desktop */}
            <div className="lg:hidden">
                <MobileShell title={title}>{children}</MobileShell>
            </div>
            {/* Desktop shell — hidden on mobile */}
            <div className="hidden lg:block">
                <DesktopShell title={title}>{children}</DesktopShell>
            </div>
        </>
    );
}
