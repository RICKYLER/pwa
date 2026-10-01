'use client';

import { useIsMobile } from '@/hooks/useIsMobile';
import CasesMobile from '@/views/mobile/CasesMobile';
import CasesDesktop from '@/views/desktop/CasesDesktop';
import AppShell from '@/components/AppShell';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { ShieldAlert, Lock } from 'lucide-react';
import Link from 'next/link';

export default function CasesPage() {
  const isMobile = useIsMobile();
  const user = getCurrentUser();

  // Role Security Guard: Only Social Workers and Administrators can access confidential case folders
  const canViewCases = user && (user.role === 'admin' || user.role === 'social_worker' || hasPermission('view_cases'));

  if (!canViewCases) {
    return (
      <AppShell title="Confidential Access Restricted">
        <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 mb-4 border border-rose-200 shadow-sm">
            <Lock className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Confidential Case Files Restricted</h2>
          <p className="text-xs text-slate-600 max-w-md mt-2 leading-relaxed">
            Case records on VAWC (RA 9262), Child Abuse (RA 7610), and Special Social Protection are strictly confidential.
            Only authorized <strong>Social Workers</strong> and <strong>MSWDO Administrators</strong> may access these files.
          </p>

          {user?.role === 'aics_focal' && (
            <div className="mt-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 max-w-md text-left">
              <p className="font-bold flex items-center gap-1.5 text-emerald-800">
                <span>📋</span> AICS Focal Officer Notice
              </p>
              <p className="mt-1 text-[11.5px] text-emerald-700 leading-relaxed">
                As an AICS Focal Officer, your workstation is assigned to the AICS Crisis Assistance Desk and General Intake Sheet (GIS) processing. Confidential legal case files are handled exclusively by licensed Social Workers.
              </p>
              <div className="mt-2.5">
                <Link
                  href="/aics"
                  className="inline-block px-3.5 py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-semibold hover:bg-emerald-800 transition"
                >
                  Go to AICS Crisis Desk
                </Link>
              </div>
            </div>
          )}

          <div className="mt-6">
            <Link
              href={user?.role === 'aics_focal' ? '/aics' : '/dashboard'}
              className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold shadow hover:bg-slate-800 transition"
            >
              {user?.role === 'aics_focal' ? 'Go to AICS Desk' : 'Return to Dashboard'}
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  if (isMobile === null) {
    return (
      <AppShell title="Social Cases & VAWC">
        <div className="h-screen" />
      </AppShell>
    );
  }

  return (
    <AppShell title="Social Cases & VAWC">
      {isMobile ? <CasesMobile /> : <CasesDesktop />}
    </AppShell>
  );
}
