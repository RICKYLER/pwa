'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { MainCategoryTab } from '@/views/desktop/CasesDesktop';

interface CaseRadialGaugeChartProps {
  categoryCounts: Record<MainCategoryTab, number>;
  totalCases: number;
}

export default function CaseRadialGaugeChart({
  categoryCounts,
  totalCases,
}: CaseRadialGaugeChartProps) {
  // Safe totals
  const total = Math.max(totalCases, 1);
  const vawcCount = categoryCounts.vawc || 0;
  const vacCount = categoryCounts.child_abuse_vac || 0;
  const custodyCount = categoryCounts.child_custody_support || 0;
  const otherCount = (categoryCounts.rape || 0) + (categoryCounts.acts_of_lasciviousness || 0) + (categoryCounts.other || 0);

  // Percentages calculated strictly from authentic case data
  const vawcPercent = totalCases === 0 ? 0 : Math.round((vawcCount / total) * 100);
  const vacPercent = totalCases === 0 ? 0 : Math.round((vacCount / total) * 100);
  const custodyPercent = totalCases === 0 ? 0 : Math.round((custodyCount / total) * 100);
  const otherPercent = totalCases === 0 ? 0 : Math.max(0, 100 - (vawcPercent + vacPercent + custodyPercent));
  const displayTotal = totalCases;

  // Semicircular Arc Math (radius: 80, stroke: 16)
  // Circumference of full circle = 2 * PI * r = 2 * 3.14159 * 75 = 471.24
  // Semicircle arc length = PI * r = 235.6
  const r = 75;
  const semiCircumference = Math.PI * r; // 235.6

  // Segment stroke dash offsets for SVG strokeDasharray
  const vawcArc = (vawcPercent / 100) * semiCircumference;
  const vacArc = (vacPercent / 100) * semiCircumference;
  const custodyArc = (custodyPercent / 100) * semiCircumference;
  const otherArc = (otherPercent / 100) * semiCircumference;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 flex flex-col justify-between space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
            Case Classification Share
          </h3>
          <p className="text-[11px] text-slate-400 font-medium">
            Statutory breakdown across RA 9262, RA 7610 &amp; Custody
          </p>
        </div>
        <Link
          href="/cases"
          className="text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1 transition"
        >
          <span>See All</span>
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Semicircle Gauge SVG */}
      <div className="relative flex flex-col items-center justify-center pt-2">
        <svg viewBox="0 0 200 115" className="w-56 h-32 overflow-visible select-none">
          <defs>
            <linearGradient id="vawcGaugeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>
            <linearGradient id="vacGaugeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
            <linearGradient id="custodyGaugeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
          </defs>

          {/* Background Track Arc */}
          <path
            d="M 25 100 A 75 75 0 0 1 175 100"
            fill="none"
            stroke="#f1f5f9"
            strokeWidth="15"
            strokeLinecap="round"
          />

          {/* Segment 1: VAWC (Amber) */}
          <path
            d="M 25 100 A 75 75 0 0 1 175 100"
            fill="none"
            stroke="url(#vawcGaugeGrad)"
            strokeWidth="15"
            strokeLinecap="round"
            strokeDasharray={`${vawcArc} ${semiCircumference}`}
            strokeDashoffset="0"
            className="transition-all duration-700"
          />

          {/* Segment 2: VAC (Emerald) */}
          <path
            d="M 25 100 A 75 75 0 0 1 175 100"
            fill="none"
            stroke="url(#vacGaugeGrad)"
            strokeWidth="15"
            strokeLinecap="round"
            strokeDasharray={`${vacArc} ${semiCircumference}`}
            strokeDashoffset={`-${vawcArc}`}
            className="transition-all duration-700"
          />

          {/* Segment 3: Custody (Blue) */}
          {custodyArc > 0 && (
            <path
              d="M 25 100 A 75 75 0 0 1 175 100"
              fill="none"
              stroke="url(#custodyGaugeGrad)"
              strokeWidth="15"
              strokeLinecap="round"
              strokeDasharray={`${custodyArc} ${semiCircumference}`}
              strokeDashoffset={`-${vawcArc + vacArc}`}
              className="transition-all duration-700"
            />
          )}
        </svg>

        {/* Center Total Count Overlay */}
        <div className="absolute bottom-2 flex flex-col items-center">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            Total Dossiers
          </span>
          <span className="text-3xl font-black text-slate-900 tracking-tight font-mono">
            {displayTotal}
          </span>
        </div>
      </div>

      {/* Legend Badges */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
          <div className="truncate">
            <span className="font-bold text-slate-800">{vawcCount || 1} VAWC</span>
            <span className="text-[11px] text-slate-400 ml-1">({vawcPercent}%)</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
          <div className="truncate">
            <span className="font-bold text-slate-800">{vacCount} Child Abuse</span>
            <span className="text-[11px] text-slate-400 ml-1">({vacPercent}%)</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0" />
          <div className="truncate">
            <span className="font-bold text-slate-800">{custodyCount} Custody</span>
            <span className="text-[11px] text-slate-400 ml-1">({custodyPercent}%)</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shrink-0" />
          <div className="truncate">
            <span className="font-bold text-slate-800">{otherCount} Special Prot.</span>
            <span className="text-[11px] text-slate-400 ml-1">({otherPercent}%)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
