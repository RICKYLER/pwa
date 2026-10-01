'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CaseMiniBarMetricCardProps {
  title: string;
  count: number | string;
  countSuffix?: string;
  trendText: string;
  trendDirection?: 'up' | 'down' | 'neutral';
  barColor?: 'emerald' | 'amber' | 'indigo' | 'rose';
  seeAllHref?: string;
  bars?: number[]; // Array of 6-8 heights from 10 to 100
}

export default function CaseMiniBarMetricCard({
  title,
  count,
  countSuffix,
  trendText,
  trendDirection = 'up',
  barColor = 'emerald',
  seeAllHref = '/cases',
  bars = [25, 45, 30, 80, 50, 65, 90],
}: CaseMiniBarMetricCardProps) {
  const isUp = trendDirection === 'up';

  const colorStyles = {
    emerald: {
      bar: 'bg-emerald-500 hover:bg-emerald-600',
      activeBar: 'bg-emerald-600',
      trend: 'text-emerald-700 bg-emerald-50 border-emerald-200/80',
    },
    amber: {
      bar: 'bg-amber-500 hover:bg-amber-600',
      activeBar: 'bg-amber-600',
      trend: 'text-amber-800 bg-amber-50 border-amber-200/80',
    },
    indigo: {
      bar: 'bg-indigo-500 hover:bg-indigo-600',
      activeBar: 'bg-indigo-600',
      trend: 'text-indigo-700 bg-indigo-50 border-indigo-200/80',
    },
    rose: {
      bar: 'bg-rose-500 hover:bg-rose-600',
      activeBar: 'bg-rose-600',
      trend: 'text-rose-700 bg-rose-50 border-rose-200/80',
    },
  }[barColor];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 flex flex-col justify-between space-y-4">
      {/* Top Title & See All */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          {title}
        </h4>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="text-[11px] font-bold text-slate-400 hover:text-slate-800 transition"
          >
            See All
          </Link>
        )}
      </div>

      {/* Metric & Trend Indicator */}
      <div className="space-y-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight">
            {count}
          </span>
          {countSuffix && (
            <span className="text-xs font-bold text-slate-500">
              {countSuffix}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10.5px] font-bold border',
              colorStyles.trend
            )}
          >
            {isUp ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {trendText}
          </span>
          <span className="text-[10px] text-slate-400 font-medium">vs Last Month</span>
        </div>
      </div>

      {/* Mini Bar Columns (Aspire reference style) */}
      <div className="pt-2 flex items-end gap-2 h-16 w-full">
        {bars.map((heightPercent, idx) => {
          const isLast = idx === bars.length - 1;
          return (
            <div
              key={idx}
              className="flex-1 bg-slate-100 rounded-t-md h-full flex items-end overflow-hidden"
              title={`Week ${idx + 1}: ${heightPercent}% activity`}
            >
              <div
                className={cn(
                  'w-full rounded-t-md transition-all duration-500 cursor-pointer',
                  isLast ? colorStyles.activeBar : colorStyles.bar
                )}
                style={{ height: `${Math.max(12, heightPercent)}%` }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
