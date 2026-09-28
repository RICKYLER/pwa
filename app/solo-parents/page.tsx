'use client';

import { useIsMobile } from '@/hooks/useIsMobile';
import SoloParentsMobile from '@/views/mobile/SoloParentsMobile';
import SoloParentsDesktop from '@/views/desktop/SoloParentsDesktop';
import AppShell from '@/components/AppShell';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { HeartHandshake, Lock } from 'lucide-react';
import Link from 'next/link';

export default function SoloParentsPage() {
  const isMobile = useIsMobile();
  const user = getCurrentUser();

  // Role security: Accessible to Admin and designated Solo Parent Focal Officers
  const canView =
    user &&
    (user.role === 'admin' ||
      user.role === 'solo_parent_focal' ||
      hasPermission('view_solo_parents'));

  if (!canView) {
    return (
      <AppShell title="Access Restricted">
        <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 mb-4 border border-teal-200 shadow-sm">
            <Lock className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Solo Parents Desk Restricted</h2>
          <p className="text-xs text-slate-600 max-w-md mt-2 leading-relaxed">
            Only designated <strong>Solo Parent Focal Officers</strong> and{' '}
            <strong>MSWDO Administrators</strong> can access the Solo Parent Walk-In Desk and ROSP Registry.
          </p>

          {user?.role === 'encoder' ? (
            <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-950 max-w-md text-left shadow-xs space-y-2">
              <p className="font-bold text-blue-900 flex items-center gap-1.5">
                <span>📋</span> Census Encoder Access Notice
              </p>
              <p className="text-[11.5px] text-blue-800 leading-relaxed">
                As a Census & Inventory Encoder, your workstation is assigned to household census profiling and bodega relief inventory. The Solo Parent desk is managed exclusively by the designated Solo Parent Focal Officer.
              </p>
              <div className="pt-1">
                <Link
                  href="/households"
                  className="inline-block rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-600 transition"
                >
                  Open Household Census Module
                </Link>
              </div>
            </div>
          ) : user?.role === 'social_worker' ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-950 max-w-md text-left shadow-xs space-y-2">
              <p className="font-bold text-amber-900 flex items-center gap-1.5">
                <span>🛡️</span> Social Worker Access Notice
              </p>
              <p className="text-[11.5px] text-amber-800 leading-relaxed">
                Social Workers are assigned to confidential VAWC and child protection case management. The Solo Parent registry is handled exclusively by the Solo Parent Focal Officer.
              </p>
              <div className="pt-1">
                <Link
                  href="/cases"
                  className="inline-block rounded-xl bg-amber-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-600 transition"
                >
                  Open Social Cases Module
                </Link>
              </div>
            </div>
          ) : user?.role === 'responder' ? (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-950 max-w-md text-left shadow-xs space-y-2">
              <p className="font-bold text-rose-900 flex items-center gap-1.5">
                <span>🚨</span> Responder Access Notice
              </p>
              <p className="text-[11.5px] text-rose-800 leading-relaxed">
                Disaster Responders access Solo Parent priority evacuation and relief distribution targeting via the <strong>Field Response module</strong>.
              </p>
              <div className="pt-1">
                <Link
                  href="/responder"
                  className="inline-block rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-600 transition"
                >
                  Open Field Response Module
                </Link>
              </div>
            </div>
          ) : user?.role === 'resident' ? (
            <div className="mt-5 rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4 text-xs text-cyan-950 max-w-md text-left shadow-xs space-y-2">
              <p className="font-bold text-cyan-900 flex items-center gap-1.5">
                <span>🪪</span> Resident Portal Notice
              </p>
              <p className="text-[11.5px] text-cyan-800 leading-relaxed">
                Residents can view their personal verified Solo Parent ID card, digital QR code, and enrolled dependents directly inside the <strong>Resident Portal</strong>.
              </p>
              <div className="pt-1">
                <Link
                  href="/resident"
                  className="inline-block rounded-xl bg-cyan-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-cyan-600 transition"
                >
                  Go to Resident Portal
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <Link
                href="/dashboard"
                className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold shadow hover:bg-slate-800 transition"
              >
                Return to Dashboard
              </Link>
            </div>
          )}
        </div>
      </AppShell>
    );
  }

  if (isMobile === null) {
    return (
      <AppShell title="Solo Parents Registry">
        <div className="h-screen" />
      </AppShell>
    );
  }

  return (
    <AppShell title="Solo Parents Registry">
      {isMobile ? <SoloParentsMobile /> : <SoloParentsDesktop />}
    </AppShell>
  );
}
