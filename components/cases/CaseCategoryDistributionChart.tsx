'use client';

import React, { useState } from 'react';
import {
  BarChart3,
  PieChart as PieIcon,
  ChevronDown,
  ChevronUp,
  Filter,
  X,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MainCategoryTab } from '@/views/desktop/CasesDesktop';

export interface CategoryChartItem {
  id: MainCategoryTab;
  label: string;
  shortLabel: string;
  count: number;
  color: string;
  bgGradient: string;
  textColor: string;
  borderColor: string;
  lightBg: string;
}

interface CaseCategoryDistributionChartProps {
  categoryCounts: Record<MainCategoryTab, number>;
  totalCases: number;
  selectedCategory: MainCategoryTab;
  onSelectCategory: (cat: MainCategoryTab) => void;
  className?: string;
  defaultExpanded?: boolean;
}

export default function CaseCategoryDistributionChart({
  categoryCounts,
  totalCases,
  selectedCategory,
  onSelectCategory,
  className,
  defaultExpanded = true,
}: CaseCategoryDistributionChartProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const categories: CategoryChartItem[] = [
    {
      id: 'vawc',
      label: 'VAWC (RA 9262)',
      shortLabel: 'VAWC',
      count: categoryCounts.vawc || 0,
      color: '#9333ea', // Purple 600
      bgGradient: 'from-purple-600 to-indigo-600',
      textColor: 'text-purple-700',
      borderColor: 'border-purple-200',
      lightBg: 'bg-purple-50',
    },
    {
      id: 'rape',
      label: 'Rape / Attempted Rape',
      shortLabel: 'Rape',
      count: categoryCounts.rape || 0,
      color: '#e11d48', // Rose 600
      bgGradient: 'from-rose-600 to-red-600',
      textColor: 'text-rose-700',
      borderColor: 'border-rose-200',
      lightBg: 'bg-rose-50',
    },
    {
      id: 'acts_of_lasciviousness',
      label: 'Acts of Lasciviousness',
      shortLabel: 'Lasciviousness',
      count: categoryCounts.acts_of_lasciviousness || 0,
      color: '#d97706', // Amber 600
      bgGradient: 'from-amber-500 to-orange-600',
      textColor: 'text-amber-800',
      borderColor: 'border-amber-200',
      lightBg: 'bg-amber-50',
    },
    {
      id: 'child_abuse_vac',
      label: 'Child Abuse & Custody (VAC)',
      shortLabel: 'Children / VAC',
      count: categoryCounts.child_abuse_vac || 0,
      color: '#2563eb', // Blue 600
      bgGradient: 'from-blue-600 to-sky-600',
      textColor: 'text-blue-700',
      borderColor: 'border-blue-200',
      lightBg: 'bg-blue-50',
    },
    {
      id: 'other',
      label: 'Others / Special Cases',
      shortLabel: 'Others',
      count: categoryCounts.other || 0,
      color: '#475569', // Slate 600
      bgGradient: 'from-slate-600 to-slate-700',
      textColor: 'text-slate-700',
      borderColor: 'border-slate-200',
      lightBg: 'bg-slate-50',
    },
  ];

  // Highest category calculation
  const highestCategory = [...categories].sort((a, b) => b.count - a.count)[0];

  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden transition-all',
        className,
      )}
    >
      {/* Top Header Card */}
      <div className="p-4 sm:px-6 sm:py-3.5 bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide">
                Case Category & Classification Distribution
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/25 text-amber-300 border border-amber-500/40">
                Visual Analytics
              </span>
            </div>
            <p className="text-[11px] text-slate-300">
              Breakdown of registered confidential cases. Click any bar or category to filter the list.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          {selectedCategory !== 'all' && (
            <button
              type="button"
              onClick={() => onSelectCategory('all')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition cursor-pointer shadow-sm"
              title="Clear Category Filter"
            >
              <Filter className="h-3 w-3" />
              <span>
                Filtered:{' '}
                {categories.find((c) => c.id === selectedCategory)?.shortLabel || selectedCategory}
              </span>
              <X className="h-3 w-3 ml-0.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold text-slate-200 hover:text-white bg-white/10 hover:bg-white/20 transition cursor-pointer"
          >
            <span>{isExpanded ? 'Hide Graph' : 'Show Graph'}</span>
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Expandable Chart Body */}
      {isExpanded && (
        <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-50/40 animate-in slide-in-from-top-2 duration-200">
          {/* Left Column: Interactive Frequency Bars (7 cols on lg) */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500 font-semibold px-1">
              <span>Category / Classification</span>
              <span>Case Count (% of Total)</span>
            </div>

            <div className="space-y-2.5">
              {categories.map((cat) => {
                const percentage =
                  totalCases > 0 ? Math.round((cat.count / totalCases) * 100) : 0;
                const isSelected = selectedCategory === cat.id;

                return (
                  <div
                    key={cat.id}
                    onClick={() => onSelectCategory(isSelected ? 'all' : cat.id)}
                    className={cn(
                      'group p-3 rounded-xl border transition-all cursor-pointer bg-white flex flex-col gap-1.5',
                      isSelected
                        ? 'border-amber-500 ring-2 ring-amber-500/20 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 hover:shadow-xs',
                    )}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span
                          className={cn(
                            'font-bold transition',
                            isSelected ? 'text-slate-900 font-black' : 'text-slate-700 group-hover:text-slate-900',
                          )}
                        >
                          {cat.label}
                        </span>
                        {isSelected && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-300">
                            Active Filter
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 font-mono">
                        <span className="font-black text-slate-900 text-sm">
                          {cat.count} {cat.count === 1 ? 'case' : 'cases'}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-400">
                          ({percentage}%)
                        </span>
                      </div>
                    </div>

                    {/* Visual Progress Bar */}
                    <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden relative">
                      <div
                        className={cn(
                          'h-full rounded-full bg-gradient-to-r transition-all duration-500 ease-out',
                          cat.bgGradient,
                        )}
                        style={{
                          width: `${Math.max(percentage, cat.count > 0 ? 6 : 0)}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Donut & Distribution Summary (5 cols on lg) */}
          <div className="lg:col-span-5 flex flex-col justify-between p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <PieIcon className="h-3.5 w-3.5 text-amber-600" />
                  Category Share
                </span>
                <span className="text-xs font-bold text-slate-700">
                  Total: {totalCases} {totalCases === 1 ? 'Case' : 'Cases'}
                </span>
              </div>

              {/* Visual SVG Donut Chart */}
              <div className="flex items-center justify-center py-2">
                <div className="relative w-36 h-36 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    {/* Background Ring */}
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      stroke="#f1f5f9"
                      strokeWidth="14"
                      fill="transparent"
                    />

                    {/* Donut Segments */}
                    {(() => {
                      if (totalCases === 0) return null;
                      let accumulatedPercent = 0;
                      const circumference = 2 * Math.PI * 40; // ~251.32

                      return categories
                        .filter((c) => c.count > 0)
                        .map((c) => {
                          const percent = c.count / totalCases;
                          const strokeDasharray = `${percent * circumference} ${circumference}`;
                          const strokeDashoffset = -accumulatedPercent * circumference;
                          accumulatedPercent += percent;

                          return (
                            <circle
                              key={c.id}
                              cx="50"
                              cy="50"
                              r="40"
                              stroke={c.color}
                              strokeWidth="14"
                              strokeDasharray={strokeDasharray}
                              strokeDashoffset={strokeDashoffset}
                              fill="transparent"
                              className="transition-all duration-500 cursor-pointer hover:opacity-85"
                              onClick={() => onSelectCategory(selectedCategory === c.id ? 'all' : c.id)}
                            />
                          );
                        });
                    })()}
                  </svg>

                  {/* Center Total Count */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                    <span className="text-2xl font-black text-slate-900 leading-none">
                      {totalCases}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                      {totalCases === 1 ? 'Case' : 'Cases'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Summary Insight */}
            <div className="pt-3 border-t border-slate-100 text-xs space-y-2">
              <div className="flex items-start gap-2 text-slate-600 leading-snug">
                <Sparkles className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  {totalCases === 0 ? (
                    'No confidential cases registered yet in the system.'
                  ) : highestCategory && highestCategory.count > 0 ? (
                    <>
                      Highest active classification:{' '}
                      <strong className="text-slate-900">{highestCategory.label}</strong> (
                      {highestCategory.count} {highestCategory.count === 1 ? 'case' : 'cases'}).
                    </>
                  ) : (
                    'Cases are categorized and ready for monitoring.'
                  )}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelectCategory(selectedCategory === c.id ? 'all' : c.id)}
                    className={cn(
                      'px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer flex items-center gap-1',
                      selectedCategory === c.id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : `${c.lightBg} ${c.textColor} ${c.borderColor} hover:opacity-80`,
                    )}
                  >
                    <span>{c.shortLabel}</span>
                    <span className="opacity-75">({c.count})</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
