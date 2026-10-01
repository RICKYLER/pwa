'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, FolderLock, Plus, FileSpreadsheet, Landmark, ShieldCheck, Scale } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CaseNavigationHeaderProps {
  onNewCase?: () => void;
  onUploadExcel?: () => void;
  totalCases?: number;
}

export default function CaseNavigationHeader({
  onNewCase,
  onUploadExcel,
  totalCases,
}: CaseNavigationHeaderProps) {
  const pathname = usePathname();
  const isDashboard = pathname === '/cases/dashboard';
  const isDirectory = pathname === '/cases';

  return (
    <div className="space-y-3.5">
      {/* Official Philippine LGU Government Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            {/* Formal Republic & LGU Insignia Tag */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10.5px] font-bold tracking-wide uppercase border border-slate-200">
                <Landmark className="h-3 w-3 text-slate-600" />
                Republic of the Philippines • Municipality of Mabini • MSWDO
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[10.5px] font-extrabold uppercase tracking-wide border border-rose-200/80">
                <ShieldCheck className="h-3 w-3 text-rose-600" />
                Confidential • RA 10173 Protected
              </span>
            </div>

            {/* Main Portal Title */}
            <div className="flex items-center gap-2.5 pt-0.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-800 border border-slate-200/80 shrink-0">
                <Scale className="h-5 w-5 text-slate-700" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                  {isDashboard ? 'Social Work Cases & Protection Analytics' : 'Confidential Case Management & Protection Desk'}
                </h1>
                <p className="text-xs text-slate-500 font-medium">
                  Official casework dossiers for VAWC (RA 9262), Child Abuse (RA 7610), Custody Support, and Special Protection.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {onUploadExcel && (
              <button
                type="button"
                onClick={onUploadExcel}
                className="px-3.5 py-2 text-xs font-bold rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-2xs transition flex items-center gap-2 cursor-pointer active:scale-98"
                title="Upload Excel records or download official monitoring templates"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
                <span>Bulk Upload / Forms</span>
              </button>
            )}

            {onNewCase && (
              <button
                type="button"
                onClick={onNewCase}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition flex items-center gap-2 cursor-pointer active:scale-98"
              >
                <Plus className="h-4 w-4 text-white" />
                <span>New Case Intake</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Government Segmented Sub-Navigation Switcher Tabs */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 pb-2">
        <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200/80 gap-1 text-xs">
          <Link
            href="/cases/dashboard"
            className={cn(
              'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer',
              isDashboard
                ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/60 font-black'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50',
            )}
          >
            <BarChart3 className={cn('h-3.5 w-3.5', isDashboard ? 'text-emerald-700' : 'text-slate-500')} />
            <span>Case Analytics &amp; Trends</span>
          </Link>

          <Link
            href="/cases"
            className={cn(
              'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer',
              isDirectory
                ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/60 font-black'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50',
            )}
          >
            <FolderLock className={cn('h-3.5 w-3.5', isDirectory ? 'text-emerald-700' : 'text-slate-500')} />
            <span>Case Records Directory &amp; Intakes</span>
            {typeof totalCases === 'number' && (
              <span
                className={cn(
                  'px-1.5 py-0.2 rounded-full text-[10.5px] font-black',
                  isDirectory ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700',
                )}
              >
                {totalCases}
              </span>
            )}
          </Link>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-600 font-semibold">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-[10.5px] font-bold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Realtime Live</span>
          </div>
          <span>• Encrypted Local &amp; Cloud Ledger</span>
        </div>
      </div>
    </div>
  );
}
