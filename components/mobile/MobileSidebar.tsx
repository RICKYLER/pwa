'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, ShieldAlert, FileText, Package, Truck, LogOut, TrendingUp, ChevronRight, UserCog, Radio, Activity, MapPinned } from 'lucide-react';
import { getCurrentUser, hasPermission, logout } from '@/lib/auth';
import { useRouter } from 'next/navigation';

const NAV_ITEMS = [
    { href: '/dashboard', icon: Home, label: 'Dashboard', desc: 'Overview & KPIs', perm: null },
    { href: '/households', icon: Users, label: 'Households', desc: 'Manage households', perm: 'view_households' },
    { href: '/vulnerability', icon: ShieldAlert, label: 'Vulnerability', desc: 'At-risk residents', perm: 'view_vulnerability' },
    { href: '/responder', icon: Radio, label: 'Field Response', desc: 'Incidents & check-ins', perm: 'view_incidents' },
    { href: '/distribution', icon: Truck, label: 'Distribution', desc: 'Relief events', perm: 'view_reports' },
    { href: '/reports', icon: FileText, label: 'Reports', desc: 'Generate reports', perm: 'view_reports' },
    { href: '/inventory', icon: Package, label: 'Inventory', desc: 'Track supplies', perm: 'view_reports' },
] as const;

interface MobileSidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function MobileSidebar({ isOpen, onClose }: MobileSidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const user = getCurrentUser();
    const visible = NAV_ITEMS.filter(n => !n.perm || hasPermission(n.perm as any));

    function handleLogout() {
        logout();
        router.push('/login');
    }

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                    onClick={onClose}
                    aria-hidden="true"
                />
            )}

            {/* Drawer */}
            <aside
                className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200/70 shadow-xl transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                {/* Brand */}
                <div className="flex items-center justify-between px-5 py-5 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center shadow-md shadow-indigo-500/30">
                            <TrendingUp className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-900">MSWDO Census</p>
                            <p className="text-[11px] text-slate-400 truncate max-w-[8rem]">{user?.barangay_id}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close menu"
                        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>

                {/* Nav */}
                <nav className="px-3 py-4 space-y-0.5">
                    {visible.map(item => {
                        const Icon = item.icon;
                        const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={onClose}
                                className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                    }`}
                            >
                                <Icon
                                    className={`w-4 h-4 flex-shrink-0 ${active ? 'text-indigo-600' : 'text-slate-400'}`}
                                    strokeWidth={active ? 2.5 : 1.8}
                                />
                                <span className="text-sm font-semibold">{item.label}</span>
                                {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                            </Link>
                        );
                    })}
                    {/* Admin section */}
                    {user?.role === 'admin' && (
                        <>
                            <div className="px-3 pt-4 pb-1">
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Administration</p>
                            </div>
                            <Link
                                href="/admin/users"
                                onClick={onClose}
                                className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${pathname.startsWith('/admin/users') ? 'bg-violet-50 text-violet-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                    }`}
                            >
                                <UserCog className={`w-4 h-4 flex-shrink-0 ${pathname.startsWith('/admin/users') ? 'text-violet-600' : 'text-slate-400'}`} strokeWidth={pathname.startsWith('/admin/users') ? 2.5 : 1.8} />
                                <span className="text-sm font-semibold">User Accounts</span>
                                {pathname.startsWith('/admin/users') && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-500" />}
                            </Link>
                            <Link
                                href="/admin/location-review"
                                onClick={onClose}
                                className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${pathname.startsWith('/admin/location-review') ? 'bg-violet-50 text-violet-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                    }`}
                            >
                                <MapPinned className={`w-4 h-4 flex-shrink-0 ${pathname.startsWith('/admin/location-review') ? 'text-violet-600' : 'text-slate-400'}`} strokeWidth={pathname.startsWith('/admin/location-review') ? 2.5 : 1.8} />
                                <span className="text-sm font-semibold">Location Review</span>
                                {pathname.startsWith('/admin/location-review') && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-500" />}
                            </Link>
                            <Link
                                href="/admin/api-health"
                                onClick={onClose}
                                className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${pathname.startsWith('/admin/api-health') ? 'bg-violet-50 text-violet-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                    }`}
                            >
                                <Activity className={`w-4 h-4 flex-shrink-0 ${pathname.startsWith('/admin/api-health') ? 'text-violet-600' : 'text-slate-400'}`} strokeWidth={pathname.startsWith('/admin/api-health') ? 2.5 : 1.8} />
                                <span className="text-sm font-semibold">API Health</span>
                                {pathname.startsWith('/admin/api-health') && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-500" />}
                            </Link>
                        </>
                    )}
                </nav>

                {/* Logout */}
                <div className="absolute bottom-0 inset-x-0 px-3 py-4 border-t border-slate-100">
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                    >
                        <LogOut className="w-4 h-4" />
                        Sign out
                    </button>
                </div>
            </aside>
        </>
    );
}
