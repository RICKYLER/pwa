'use client';

import React from 'react';
import {
  Landmark,
  PhoneCall,
  Plus,
  Coins,
  History,
  AlertTriangle,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import {
  formatAicsCurrency,
  type AicsDailyBudgetSummary,
} from '@/lib/db/aics-budget';

interface AicsDailyBudgetHeroProps {
  summary: AicsDailyBudgetSummary;
  onOpenBudgetModal: (tab?: 'set_base' | 'top_up' | 'history') => void;
}

export default function AicsDailyBudgetHero({
  summary,
  onOpenBudgetModal,
}: AicsDailyBudgetHeroProps) {
  const isHealthy = summary.status === 'healthy';
  const isWarning = summary.status === 'warning';
  const isCritical = summary.status === 'critical';
  const isDepleted = summary.status === 'depleted';
  const isNotSet = summary.status === 'not_set';

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-3.5 sm:p-4 transition hover:border-emerald-300">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4">
        {/* Left Section: Core Balance & Status */}
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200/80 flex items-center justify-center shrink-0">
            <Landmark className="h-5 w-5" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Daily Assistance Fund (AICS)
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-[11px] font-semibold text-slate-500">
                {formattedDate}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                  isHealthy
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : isWarning
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : isCritical
                    ? 'bg-orange-50 text-orange-800 border-orange-200'
                    : isDepleted
                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isHealthy
                      ? 'bg-emerald-600'
                      : isWarning
                      ? 'bg-amber-500'
                      : isCritical
                      ? 'bg-orange-500'
                      : isDepleted
                      ? 'bg-rose-600'
                      : 'bg-slate-400'
                  }`}
                />
                {isHealthy
                  ? 'Funds Available'
                  : isWarning
                  ? 'Low Allocation'
                  : isCritical
                  ? 'Critical Level'
                  : isDepleted
                  ? 'Quota Exhausted'
                  : 'No Budget Set'}
              </span>
            </div>

            <div className="flex flex-wrap items-baseline gap-2.5 mt-1">
              <span
                className={`text-xl sm:text-2xl font-black tracking-tight ${
                  isDepleted
                    ? 'text-rose-700'
                    : isCritical
                    ? 'text-orange-700'
                    : isWarning
                    ? 'text-amber-800'
                    : 'text-slate-900'
                }`}
              >
                {isNotSet ? '₱0.00' : formatAicsCurrency(summary.remainingAmount)}
              </span>
              <span className="text-xs text-slate-500 font-medium">
                {isNotSet ? (
                  '(Set today’s target quota)'
                ) : (
                  <>
                    remaining of{' '}
                    <strong className="text-slate-800 font-bold">
                      {formatAicsCurrency(summary.allocatedAmount)}
                    </strong>{' '}
                    ceiling
                  </>
                )}
              </span>
              {!isNotSet && (
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  (Disbursed: {formatAicsCurrency(summary.disbursedToday)} across {summary.todayBeneficiaryCount} client{summary.todayBeneficiaryCount === 1 ? '' : 's'})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center / Right Section: Compact Progress & Hotline & Action */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
          {/* Compact Utilization & Hotline Bar */}
          {!isNotSet && (
            <div className="flex items-center gap-3 bg-slate-50/80 px-3 py-1.5 rounded-xl border border-slate-200/70 text-xs">
              <div className="w-28 sm:w-32 space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                  <span>Utilization</span>
                  <span className="text-slate-800">{summary.percentageUsed}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isDepleted
                        ? 'bg-rose-600'
                        : isCritical
                        ? 'bg-orange-500'
                        : isWarning
                        ? 'bg-amber-500'
                        : 'bg-emerald-600'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(isNotSet ? 0 : 4, summary.percentageUsed))}%` }}
                  />
                </div>
              </div>

              <div className="h-6 w-px bg-slate-200 hidden sm:block" />

              <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <PhoneCall className="h-3 w-3 text-emerald-600 shrink-0" />
                <span className="truncate max-w-[200px] sm:max-w-[220px]" title={summary.hotlineStatusText}>
                  Hotline: <strong>~{summary.estimatedClientsLeft} slots</strong> available today
                </span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onOpenBudgetModal('history')}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap border border-slate-200"
              title="View Complete Fund Input History & Ledger"
            >
              <History className="h-3.5 w-3.5 text-slate-600" />
              <span>History</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenBudgetModal(isNotSet ? 'set_base' : 'top_up')}
              className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer active:scale-95 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{isNotSet ? 'Set Daily Budget' : 'Manage / Top-Up'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
