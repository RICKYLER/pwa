'use client';

import React from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import AicsMobile from '@/views/mobile/AicsMobile';
import AicsDesktop from '@/views/desktop/AicsDesktop';
import AppShell from '@/components/AppShell';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { HeartHandshake, Lock } from 'lucide-react';
import Link from 'next/link';

export default function AicsPage() {
  const isMobile = useIsMobile();
  const user = getCurrentUser();

  // Role Security Guard: Accessible to Admin and designated AICS Focal Officers
  const canView =
    user &&
    (user.role === 'admin' ||
      user.role === 'aics_focal' ||
      hasPermission('view_aics'));

  if (!canView) {
    return (
      <AppShell title="Access Restricted">
        <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 mb-4 border border-emerald-200 shadow-sm">
            <Lock className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">AICS Desk Access Restricted</h2>
          <p className="text-xs text-slate-600 max-w-md mt-2 leading-relaxed">
            Only designated <strong>AICS Focal Officers</strong> and{' '}
            <strong>MSWDO Administrators</strong> can access the AICS Crisis Assistance Desk and General Intake Sheet (GIS) records.
          </p>

          {user?.role === 'social_worker' ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-950 max-w-md text-left shadow-xs space-y-2">
              <p className="font-bold text-amber-900 flex items-center gap-1.5">
                <span>🛡️</span> Social Worker Notice
              </p>
              <p className="text-[11.5px] text-amber-800 leading-relaxed">
                Social Workers are assigned to confidential VAWC, child protection, and legal casework. The frontline AICS crisis desk is managed by the AICS Focal Officer.
              </p>
              <div className="pt-1">
                <Link
                  href="/cases"
                  className="inline-block rounded-xl bg-amber-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-600 transition"
                >
                  Open Confidential Cases
                </Link>
              </div>
            </div>
          ) : user?.role === 'solo_parent_focal' ? (
            <div className="mt-5 rounded-2xl border border-teal-200 bg-teal-50/70 p-4 text-xs text-teal-950 max-w-md text-left shadow-xs space-y-2">
              <p className="font-bold text-teal-900 flex items-center gap-1.5">
                <span>❤️</span> Solo Parents Desk Notice
              </p>
              <p className="text-[11.5px] text-teal-800 leading-relaxed">
                As the Solo Parent Focal Officer, your workstation is dedicated to RA 11861 walk-in evaluations and ID issuance.
              </p>
              <div className="pt-1">
                <Link
                  href="/solo-parents"
                  className="inline-block rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-teal-600 transition"
                >
                  Open Solo Parents Registry
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
      <AppShell title="AICS Crisis Assistance">
        <div className="h-screen" />
      </AppShell>
    );
  }

  return (
    <AppShell title="AICS Crisis Assistance">
      {isMobile ? <AicsMobile /> : <AicsDesktop />}
    </AppShell>
  );
}
