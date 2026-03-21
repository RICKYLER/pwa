'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Users, ShieldAlert, FileText, Package, Truck, LogOut, TrendingUp, UserCog, Radio, Activity, MapPinned } from 'lucide-react';
import { getCurrentUser, hasPermission, logout } from '@/lib/auth';

const NAV_ITEMS = [
    { href: '/dashboard', icon: Home, label: 'Dashboard', desc: 'Overview & KPIs', perm: null },
    { href: '/households', icon: Users, label: 'Households', desc: 'Manage households', perm: 'view_households' },
    { href: '/vulnerability', icon: ShieldAlert, label: 'Vulnerability', desc: 'At-risk residents', perm: 'view_vulnerability' },
    { href: '/responder', icon: Radio, label: 'Field Response', desc: 'Incidents & check-ins', perm: 'view_incidents' },
    { href: '/distribution', icon: Truck, label: 'Distribution', desc: 'Relief events', perm: 'view_reports' },
    { href: '/reports', icon: FileText, label: 'Reports', desc: 'Generate reports', perm: 'view_reports' },
    { href: '/inventory', icon: Package, label: 'Inventory', desc: 'Track supplies', perm: 'view_reports' },
] as const;

export default function DesktopSidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const user = getCurrentUser();
    const visible = NAV_ITEMS.filter(n => !n.perm || hasPermission(n.perm as any));

    function handleLogout() {
        logout();
        router.push('/login');
    }

    return (
        <aside className="fixed inset-y-0 left-0 z-30 w-64 flex flex-col bg-white border-r border-slate-200/70">
            {/* Branding */}
            <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center shadow-md shadow-indigo-500/30 flex-shrink-0">
                    <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 leading-tight">MSWDO Census</p>
                    <p className="text-[11px] text-slate-400 truncate">{user?.barangay_id}</p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
                {visible.map(item => {
                    const Icon = item.icon;
                    const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${active
                                ? 'bg-indigo-50 text-indigo-700'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                        >
                            <Icon
                                className={`w-4 h-4 flex-shrink-0 ${active ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'}`}
                                strokeWidth={active ? 2.5 : 1.8}
                            />
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold leading-none ${active ? 'text-indigo-700' : ''}`}>{item.label}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5 leading-none">{item.desc}</p>
                            </div>
                            {active && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />}
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
                            className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${pathname.startsWith('/admin/users')
                                ? 'bg-violet-50 text-violet-700'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                        >
                            <UserCog className={`w-4 h-4 flex-shrink-0 ${pathname.startsWith('/admin/users') ? 'text-violet-600' : 'text-slate-400 group-hover:text-slate-600'}`} strokeWidth={pathname.startsWith('/admin/users') ? 2.5 : 1.8} />
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold leading-none ${pathname.startsWith('/admin/users') ? 'text-violet-700' : ''}`}>User Accounts</p>
                                <p className="text-[10px] text-slate-400 mt-0.5 leading-none">Create & manage users</p>
                            </div>
                            {pathname.startsWith('/admin/users') && <div className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0" />}
                        </Link>
                        <Link
                            href="/admin/location-review"
                            className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${pathname.startsWith('/admin/location-review')
                                ? 'bg-violet-50 text-violet-700'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                        >
                            <MapPinned className={`w-4 h-4 flex-shrink-0 ${pathname.startsWith('/admin/location-review') ? 'text-violet-600' : 'text-slate-400 group-hover:text-slate-600'}`} strokeWidth={pathname.startsWith('/admin/location-review') ? 2.5 : 1.8} />
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold leading-none ${pathname.startsWith('/admin/location-review') ? 'text-violet-700' : ''}`}>Location Review</p>
                                <p className="text-[10px] text-slate-400 mt-0.5 leading-none">Master list & pin QA</p>
                            </div>
                            {pathname.startsWith('/admin/location-review') && <div className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0" />}
                        </Link>
                        <Link
                            href="/admin/api-health"
                            className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${pathname.startsWith('/admin/api-health')
                                ? 'bg-violet-50 text-violet-700'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                        >
                            <Activity className={`w-4 h-4 flex-shrink-0 ${pathname.startsWith('/admin/api-health') ? 'text-violet-600' : 'text-slate-400 group-hover:text-slate-600'}`} strokeWidth={pathname.startsWith('/admin/api-health') ? 2.5 : 1.8} />
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold leading-none ${pathname.startsWith('/admin/api-health') ? 'text-violet-700' : ''}`}>API Health</p>
                                <p className="text-[10px] text-slate-400 mt-0.5 leading-none">Check service status</p>
                            </div>
                            {pathname.startsWith('/admin/api-health') && <div className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0" />}
                        </Link>
                    </>
                )}
            </nav>

            {/* User + Logout */}
            <div className="px-3 py-4 border-t border-slate-100 space-y-2">
                <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-slate-50">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 select-none">
                        {user?.name?.charAt(0) ?? 'U'}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-900 truncate">{user?.name}</p>
                        <p className="text-[10px] text-slate-400 capitalize">{user?.role?.replace('_', ' ')}</p>
                    </div>
                </div>
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                >
                    <LogOut className="w-4 h-4" />
                    Sign out
                </button>
            </div>
        </aside>
    );
}
