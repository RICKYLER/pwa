'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, FolderLock, Plus, FileSpreadsheet } from 'lucide-react';
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
    <div className="space-y-4">
      {/* Main Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950 text-white shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute right-0 top-0 -mt-6 -mr-6 w-56 h-56 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <FolderLock className="h-4 w-4" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                MSWDO Social Welfare &amp; VAWC Protection Desk
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
                Confidential
              </span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              {isDashboard ? 'Social Work Cases & VAWC Analytics' : 'Confidential Case Management'}
            </h1>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Centralized digital case folders for VAWC (RA 9262), Child Abuse (RA 7610), Rape, and special protection cases.
              Protected under Republic Act 10173 (Data Privacy Act of 2012).
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {onUploadExcel && (
              <button
                type="button"
                onClick={onUploadExcel}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-500 text-white transition flex items-center gap-2 cursor-pointer shadow-md shadow-amber-900/20"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Bulk Upload
              </button>
            )}

            {onNewCase && (
              <button
                type="button"
                onClick={onNewCase}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-white text-slate-950 hover:bg-slate-100 transition flex items-center gap-2 cursor-pointer shadow-md"
              >
                <Plus className="h-4 w-4 text-amber-600" />
                New Case Intake
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sub-Navigation Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <Link
          href="/cases/dashboard"
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer',
            isDashboard
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
          )}
        >
          <BarChart3 className="h-4 w-4 text-amber-400" />
          <span>Case Analytics &amp; Charts</span>
        </Link>

        <Link
          href="/cases"
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer',
            isDirectory
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
          )}
        >
          <FolderLock className="h-4 w-4 text-amber-500" />
          <span>Case Records Directory &amp; Intakes</span>
          {typeof totalCases === 'number' && (
            <span
              className={cn(
                'px-1.5 py-0.2 rounded-full text-[10px] font-black',
                isDirectory ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700',
              )}
            >
              {totalCases}
            </span>
          )}
        </Link>
      </div>
    </div>
  );
}
