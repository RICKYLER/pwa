'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import type { CaseRecord } from '@/lib/db/schema';

interface CaseTrendAreaChartProps {
  cases: CaseRecord[];
}

export type TimeHorizon = '7d' | '30d' | '6m' | 'all';

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getCaseDateString(c: CaseRecord): string {
  const val = c.reported_at || c.createdAt || c.incident_date;
  if (!val) return '';
  if (typeof val === 'string') {
    const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    try {
      const parsed = new Date(val);
      if (!Number.isNaN(parsed.getTime())) return formatLocalDate(parsed);
    } catch {
      // fallback
    }
    return val.split('T')[0];
  }
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return formatLocalDate(val);
  }
  return '';
}

function getCaseResolvedDateString(c: CaseRecord): string {
  if (c.status !== 'resolved_closed') return '';
  const val = c.updatedAt || c.reported_at || c.createdAt;
  if (!val) return '';
  if (typeof val === 'string') {
    const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    try {
      const parsed = new Date(val);
      if (!Number.isNaN(parsed.getTime())) return formatLocalDate(parsed);
    } catch {
      // fallback
    }
    return val.split('T')[0];
  }
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return formatLocalDate(val);
  }
  return '';
}

export default function CaseTrendAreaChart({ cases }: CaseTrendAreaChartProps) {
  const [horizon, setHorizon] = useState<TimeHorizon>('30d');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hasAutoSwitched, setHasAutoSwitched] = useState(false);

  // Auto-switch to 'all' if all existing cases are historical (e.g., recorded in 2024)
  // so the user never sees an empty 0 graph when they have cases registered.
  useEffect(() => {
    if (!hasAutoSwitched && cases.length > 0) {
      const validCases = cases.filter((c) => !c.is_deleted);
      if (validCases.length === 0) return;

      const nowMs = Date.now();
      const past30dMs = nowMs - 30 * 86400000;
      const recentCount = validCases.filter((c) => {
        const raw = c.reported_at || c.createdAt;
        const t = new Date(raw).getTime();
        return !Number.isNaN(t) && t >= past30dMs;
      }).length;

      if (recentCount === 0) {
        setHorizon('all');
        setHasAutoSwitched(true);
      }
    }
  }, [cases, hasAutoSwitched]);

  // Generate dynamic trend series based on horizon from REAL case data
  const series = useMemo(() => {
    const validCases = cases.filter((c) => !c.is_deleted);
    const now = new Date();

    // ─────────────────────────────────────────────────────────────
    // Horizon: ALL TIME (covers from earliest case date to current)
    // ─────────────────────────────────────────────────────────────
    if (horizon === 'all') {
      let earliestDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      for (const c of validCases) {
        const raw = c.reported_at || c.createdAt;
        if (!raw) continue;
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime()) && d.getTime() < earliestDate.getTime()) {
          earliestDate = d;
        }
      }

      // Generate month-by-month intervals from earliest year/month to current year/month
      const result: Array<{
        dateLabel: string;
        fullDate: string;
        intake: number;
        resolved: number;
        monthKey: string;
      }> = [];

      let curYear = earliestDate.getFullYear();
      let curMonth = earliestDate.getMonth();
      const targetYear = now.getFullYear();
      const targetMonth = now.getMonth();

      // Ensure at least 6 points if range is very narrow
      const totalMonths = (targetYear - curYear) * 12 + (targetMonth - curMonth) + 1;
      if (totalMonths < 6) {
        curMonth = curMonth - (6 - totalMonths);
        while (curMonth < 0) {
          curMonth += 12;
          curYear -= 1;
        }
      }

      while (curYear < targetYear || (curYear === targetYear && curMonth <= targetMonth)) {
        const d = new Date(curYear, curMonth, 1);
        const monthKey = `${curYear}-${String(curMonth + 1).padStart(2, '0')}`;
        const dateLabel = d.toLocaleDateString('en-US', {
          month: 'short',
          year: '2-digit',
        });
        const fullDate = d.toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric',
        });

        // Count cases falling in this month
        let matchingIntakes = 0;
        let matchingResolved = 0;

        for (const c of validCases) {
          const cDate = getCaseDateString(c);
          if (cDate.startsWith(monthKey)) {
            matchingIntakes++;
          }
          const rDate = getCaseResolvedDateString(c);
          if (rDate && rDate.startsWith(monthKey)) {
            matchingResolved++;
          }
        }

        result.push({
          dateLabel,
          fullDate,
          intake: matchingIntakes,
          resolved: matchingResolved,
          monthKey,
        });

        curMonth++;
        if (curMonth > 11) {
          curMonth = 0;
          curYear++;
        }
      }

      return result;
    }

    // ─────────────────────────────────────────────────────────────
    // Horizon: 7 DAYS, 30 DAYS, 6 MONTHS
    // ─────────────────────────────────────────────────────────────
    const intervals = horizon === '7d' ? 7 : horizon === '30d' ? 30 : 24;
    const stepDays = horizon === '6m' ? 7 : 1;

    const result: Array<{
      dateLabel: string;
      fullDate: string;
      intake: number;
      resolved: number;
    }> = [];

    for (let i = intervals - 1; i >= 0; i--) {
      // Local calendar day calculation (immune to UTC timezone offset)
      const d = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - i * stepDays,
      );
      const dateStr = formatLocalDate(d);

      const dateLabel = d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      const fullDate = d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      let matchingIntakes = 0;
      let matchingResolved = 0;

      if (horizon === '6m') {
        const windowStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).getTime();
        const windowEnd = windowStart + stepDays * 86400000 - 1;

        for (const c of validCases) {
          const rawDate = c.reported_at || c.createdAt;
          const t = new Date(rawDate).getTime();
          if (!Number.isNaN(t) && t >= windowStart && t <= windowEnd) {
            matchingIntakes++;
          }
          if (c.status === 'resolved_closed') {
            const rawResolved = c.updatedAt || c.reported_at || c.createdAt;
            const rt = new Date(rawResolved).getTime();
            if (!Number.isNaN(rt) && rt >= windowStart && rt <= windowEnd) {
              matchingResolved++;
            }
          }
        }
      } else {
        for (const c of validCases) {
          const cDate = getCaseDateString(c);
          if (cDate === dateStr) {
            matchingIntakes++;
          }
          const rDate = getCaseResolvedDateString(c);
          if (rDate === dateStr) {
            matchingResolved++;
          }
        }
      }

      result.push({
        dateLabel,
        fullDate,
        intake: matchingIntakes,
        resolved: matchingResolved,
      });
    }

    return result;
  }, [cases, horizon]);

  // Check if there are cases outside the currently selected horizon window
  const outsideCasesInfo = useMemo(() => {
    if (horizon === 'all') return null;
    const valid = cases.filter((c) => !c.is_deleted);
    if (valid.length === 0) return null;

    const currentTotalIntakes = series.reduce((sum, s) => sum + s.intake, 0);
    const outsideCount = valid.length - currentTotalIntakes;

    if (outsideCount > 0) {
      // Find oldest outside case for preview
      const outsideCases = valid.filter((c) => {
        const cDate = getCaseDateString(c);
        if (horizon === '7d' || horizon === '30d') {
          return !series.some((s) => s.fullDate.includes(cDate) || (s as any).dateStr === cDate);
        }
        return true;
      });

      const sample = outsideCases[0] || valid[0];
      return {
        count: outsideCount,
        sampleCaseNumber: sample.case_number,
        sampleClient: sample.victim_name,
        sampleDate: sample.reported_at || 'earlier date',
      };
    }
    return null;
  }, [cases, horizon, series]);

  // Overall trajectory calculation comparing current horizon vs prior horizon
  const trendMetrics = useMemo(() => {
    const validCases = cases.filter((c) => !c.is_deleted);
    if (validCases.length === 0) {
      return { text: '0% stable', direction: 'neutral' as const };
    }

    if (horizon === 'all') {
      return { text: `${validCases.length} total recorded`, direction: 'up' as const };
    }

    const horizonDays = horizon === '7d' ? 7 : horizon === '30d' ? 30 : 180;
    const nowMs = Date.now();
    const currentWindowStart = nowMs - horizonDays * 86400000;
    const priorWindowStart = nowMs - 2 * horizonDays * 86400000;

    let currentCount = 0;
    let priorCount = 0;

    for (const c of validCases) {
      const t = new Date(c.reported_at || c.createdAt).getTime();
      if (Number.isNaN(t)) continue;
      if (t >= currentWindowStart && t <= nowMs) {
        currentCount++;
      } else if (t >= priorWindowStart && t < currentWindowStart) {
        priorCount++;
      }
    }

    if (priorCount === 0) {
      if (currentCount > 0) {
        return { text: `+${currentCount} this period`, direction: 'up' as const };
      }
      return { text: '0% stable', direction: 'neutral' as const };
    }

    const diff = currentCount - priorCount;
    const pct = Math.round((diff / priorCount) * 100);
    if (pct > 0) {
      return { text: `+${pct}% vs prior period`, direction: 'up' as const };
    }
    if (pct < 0) {
      return { text: `${pct}% vs prior period`, direction: 'down' as const };
    }
    return { text: '0% vs prior period', direction: 'neutral' as const };
  }, [cases, horizon]);

  const maxVal = useMemo(() => {
    const m = Math.max(...series.map((s) => Math.max(s.intake, s.resolved)), 0);
    return Math.max(m + 2, 4);
  }, [series]);

  // SVG Coordinates calculation
  const width = 680;
  const height = 230;
  const paddingX = 40;
  const paddingY = 25;

  const points = useMemo(() => {
    if (series.length === 0) return [];
    const step = (width - paddingX * 2) / Math.max(series.length - 1, 1);
    return series.map((s, idx) => {
      const x = paddingX + idx * step;
      const y = height - paddingY - (s.intake / maxVal) * (height - paddingY * 2);
      return { x, y, ...s };
    });
  }, [series, maxVal, width, height, paddingX, paddingY]);

  // Construct smooth SVG path using Catmull-Rom or cubic Bezier
  const areaPath = useMemo(() => {
    if (points.length === 0) return null;
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const mx = (p0.x + p1.x) / 2;
      d += ` C ${mx} ${p0.y}, ${mx} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    const lastX = points[points.length - 1].x;
    const firstX = points[0].x;
    const bottomY = height - paddingY;
    const closed = `${d} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
    return { line: d, area: closed };
  }, [points, height, paddingY]);

  // Default active point: Pick the point with highest intakes, or the latest date point
  const activePoint = useMemo(() => {
    if (hoverIndex !== null && points[hoverIndex]) {
      return points[hoverIndex];
    }
    // Find point with highest intake > 0
    const highest = [...points].reverse().find((p) => p.intake > 0);
    if (highest) return highest;
    return points[points.length - 1] ?? null;
  }, [hoverIndex, points]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              Case Influx &amp; Resolution Velocity
            </h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
              {trendMetrics.direction === 'up' && <TrendingUp className="h-3 w-3" />}
              {trendMetrics.direction === 'down' && <TrendingDown className="h-3 w-3" />}
              {trendMetrics.direction === 'neutral' && <Minus className="h-3 w-3" />}
              {trendMetrics.text}
            </span>
          </div>
          <p className="text-xs text-slate-400 font-medium">
            Active casework intake trajectory vs resolution closure rate
          </p>
        </div>

        {/* Date Filter Pills & Realtime Indicator */}
        <div className="flex items-center gap-3">
          {/* Live indicator badge */}
          <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-2xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Realtime Live</span>
          </div>

          <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 text-xs font-semibold border border-slate-200/70">
            <button
              type="button"
              onClick={() => setHorizon('7d')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                horizon === '7d' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7 Days
            </button>
            <button
              type="button"
              onClick={() => setHorizon('30d')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                horizon === '30d' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              30 Days
            </button>
            <button
              type="button"
              onClick={() => setHorizon('6m')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                horizon === '6m' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              6 Months
            </button>
            <button
              type="button"
              onClick={() => setHorizon('all')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                horizon === 'all' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Time
            </button>
          </div>
        </div>
      </div>

      {/* Helpful notification if registered cases exist outside the current horizon */}
      {outsideCasesInfo && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200/80 text-xs text-amber-900 animate-fadeIn">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-amber-700 shrink-0" />
            <span>
              <strong>{outsideCasesInfo.count} case dossier</strong> ({outsideCasesInfo.sampleCaseNumber}: {outsideCasesInfo.sampleClient}) was recorded on {outsideCasesInfo.sampleDate}, which is outside the {horizon === '7d' ? '7-Day' : horizon === '30d' ? '30-Day' : '6-Month'} filter.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setHorizon('all')}
            className="font-bold text-amber-950 underline hover:no-underline cursor-pointer ml-auto text-xs"
          >
            Switch to All Time &rarr;
          </button>
        </div>
      )}

      {/* SVG Canvas Area */}
      <div className="relative pt-2 select-none">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible"
        >
          <defs>
            {/* Emerald Gradient for Area Fill */}
            <linearGradient id="caseAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>

            {/* Stroke Line Gradient */}
            <linearGradient id="caseLineGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#059669" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = height - paddingY - ratio * (height - paddingY * 2);
            const val = Math.round(ratio * maxVal);
            return (
              <g key={ratio}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={width - paddingX}
                  y2={y}
                  stroke="#f1f5f9"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <text
                  x={paddingX - 10}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-mono font-medium"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Area Fill */}
          {areaPath && (
            <path d={areaPath.area} fill="url(#caseAreaGradient)" />
          )}

          {/* Main Trend Line */}
          {areaPath && (
            <path
              d={areaPath.line}
              fill="none"
              stroke="url(#caseLineGradient)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Visible node circles for points with data > 0 */}
          {points.map((pt, idx) => {
            if (pt.intake === 0) return null;
            return (
              <g key={`data-node-${idx}`}>
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="5"
                  fill="#ffffff"
                  stroke="#10b981"
                  strokeWidth="2.5"
                  className="drop-shadow-xs"
                />
              </g>
            );
          })}

          {/* Interactive Hover Vertical Guide and Highlighted Node */}
          {activePoint && (
            <g>
              <line
                x1={activePoint.x}
                y1={paddingY}
                x2={activePoint.x}
                y2={height - paddingY}
                stroke="#cbd5e1"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r="6.5"
                fill="#ffffff"
                stroke="#059669"
                strokeWidth="3.5"
                className="drop-shadow-sm"
              />
            </g>
          )}

          {/* Invisible hover zones */}
          {points.map((pt, idx) => {
            const step = (width - paddingX * 2) / Math.max(points.length - 1, 1);
            return (
              <rect
                key={idx}
                x={pt.x - step / 2}
                y={0}
                width={step}
                height={height}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoverIndex(idx)}
              />
            );
          })}

          {/* X-axis labels */}
          {points.map((pt, idx) => {
            const interval = horizon === '30d' ? 5 : horizon === 'all' ? Math.max(Math.floor(points.length / 6), 1) : horizon === '6m' ? 4 : 1;
            if (idx % interval !== 0 && idx !== points.length - 1) return null;
            return (
              <text
                key={idx}
                x={pt.x}
                y={height - 6}
                textAnchor="middle"
                className="fill-slate-400 text-[10px] font-medium"
              >
                {pt.dateLabel}
              </text>
            );
          })}
        </svg>

        {/* Floating Tooltip Card */}
        {activePoint && (
          <div
            className="absolute pointer-events-none transition-all duration-150 ease-out z-20"
            style={{
              left: `${(activePoint.x / width) * 100}%`,
              top: `${Math.max(8, (activePoint.y / height) * 100 - 28)}%`,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className="bg-white rounded-xl shadow-lg border border-slate-200/90 px-3.5 py-2 text-center whitespace-nowrap min-w-[130px]">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {activePoint.fullDate}
              </p>
              <div className="flex items-center justify-center gap-1.5 mt-0.5">
                <span className="text-base font-black text-slate-900 font-mono">
                  {activePoint.intake} {activePoint.intake === 1 ? 'case' : 'cases'}
                </span>
                <span className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded border ${
                  activePoint.intake > 0
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200/80'
                    : 'text-slate-500 bg-slate-50 border-slate-200/80'
                }`}>
                  {activePoint.intake > 0 ? `${activePoint.intake} intake` : '0 intake'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
