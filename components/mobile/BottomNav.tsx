'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, ShieldAlert, FileText, Package, Radio } from 'lucide-react';
import { hasPermission } from '@/lib/auth';

const NAV_ITEMS = [
    { href: '/dashboard', icon: Home, label: 'Home', perm: null },
    { href: '/households', icon: Users, label: 'Households', perm: 'view_households' },
    { href: '/vulnerability', icon: ShieldAlert, label: 'Risks', perm: 'view_vulnerability' },
    { href: '/responder', icon: Radio, label: 'Field', perm: 'view_incidents' },
    { href: '/reports', icon: FileText, label: 'Reports', perm: 'view_reports' },
    { href: '/inventory', icon: Package, label: 'Inventory', perm: 'view_reports' },
] as const;

export default function BottomNav() {
    const pathname = usePathname();
    const visible = NAV_ITEMS.filter(n => !n.perm || hasPermission(n.perm as any));

    return (
        <nav className="fixed bottom-0 inset-x-0 z-30">
            <div className="absolute inset-0 bg-white/90 backdrop-blur-xl border-t border-slate-200/60" />
            <div className="relative flex items-center justify-around px-2 py-1.5 pb-[env(safe-area-inset-bottom)]">
                {visible.slice(0, 5).map(item => {
                    const Icon = item.icon;
                    const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="group relative flex flex-col items-center gap-0.5 min-w-[52px] py-1.5 px-2 rounded-2xl transition-all"
                        >
                            {active && <span className="absolute inset-0 rounded-2xl bg-indigo-50" />}
                            <Icon
                                className={`relative w-5 h-5 transition-colors ${active ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'}`}
                                strokeWidth={active ? 2.5 : 1.8}
                            />
                            <span className={`relative text-[10px] font-semibold leading-none ${active ? 'text-indigo-600' : 'text-slate-400'}`}>
                                {item.label.length > 6 ? item.label.slice(0, 5) + '…' : item.label}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
