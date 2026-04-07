'use client';

import Link from 'next/link';
import { ArrowUpRight, BarChart3, Home, ShieldAlert } from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  Label,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { CivicBadge } from '@/components/ui/civic-primitives';
import {
  buildReportsAgePreviewData,
  buildReportsHouseholdPreviewData,
  buildReportsVulnerabilityPreviewData,
  getReportsVulnerableTotal,
  type ReportsHouseholdPreviewRow,
  type ReportsPreviewStats,
} from '@/lib/reports-preview-data';
import { cn } from '@/lib/utils';

const monthlyChartConfig = {
  children: { label: 'Children', color: 'var(--color-chart-1)' },
  adults: { label: 'Adults', color: 'var(--color-chart-2)' },
  seniors: { label: 'Seniors', color: 'var(--color-chart-3)' },
};

const vulnerabilityChartConfig = {
  children: { label: 'Children', color: 'var(--color-chart-1)' },
  seniors: { label: 'Seniors', color: 'var(--color-chart-3)' },
  pwd: { label: 'PWD', color: 'var(--color-chart-5)' },
  pregnant: { label: 'Pregnant', color: 'var(--color-chart-4)' },
  chronic: { label: 'Chronic', color: '#334155' },
  lowIncome: { label: 'Low-income', color: '#059669' },
};

const householdChartConfig = {
  households: { label: 'Households', color: 'var(--color-chart-2)' },
};

type ReportsLivePreviewCardsProps = {
  stats: ReportsPreviewStats | null;
  topHouseholdPuroks: ReportsHouseholdPreviewRow[];
  compact?: boolean;
};

function PreviewCardShell({
  href,
  title,
  description,
  badgeTone,
  icon: Icon,
  compact = false,
  children,
}: {
  href: string;
  title: string;
  description: string;
  badgeTone: 'navy' | 'rose' | 'emerald';
  icon: typeof BarChart3;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.3)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_22px_56px_-36px_rgba(15,23,42,0.35)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-800">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-950">{title}</h3>
            <p className={cn('mt-1 text-sm text-slate-500', compact ? 'max-w-none' : 'max-w-[28ch]')}>
              {description}
            </p>
          </div>
        </div>
        <CivicBadge label="Live" tone={badgeTone} />
      </div>

      <div className={cn('mt-4', compact ? 'min-h-[176px]' : 'min-h-[196px]')}>{children}</div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          Open report
        </span>
        <div className="flex items-center gap-1 text-sm font-semibold text-slate-700 transition group-hover:text-slate-950">
          View
          <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}

function MonthlyPreview({
  stats,
  compact = false,
}: {
  stats: ReportsPreviewStats | null;
  compact?: boolean;
}) {
  const data = buildReportsAgePreviewData(stats);
  const totalPopulation = stats?.total_population ?? 0;

  return (
    <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-[150px_minmax(0,1fr)]')}>
      <ChartContainer
        config={monthlyChartConfig}
        className={cn('aspect-auto w-full', compact ? 'h-[138px]' : 'h-[156px]')}
      >
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent nameKey="key" labelKey="label" hideLabel />}
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="key"
            innerRadius={compact ? 38 : 46}
            outerRadius={compact ? 60 : 68}
            paddingAngle={4}
            strokeWidth={0}
          >
            {data.map((entry) => (
              <Cell key={entry.key} fill={`var(--color-${entry.key})`} />
            ))}
            <Label
              content={({ viewBox }) => {
                if (
                  !viewBox
                  || !('cx' in viewBox)
                  || !('cy' in viewBox)
                  || typeof viewBox.cx !== 'number'
                  || typeof viewBox.cy !== 'number'
                ) {
                  return null;
                }

                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan
                      x={viewBox.cx}
                      y={viewBox.cy}
                      className="fill-slate-950 text-[16px] font-black"
                    >
                      {totalPopulation.toLocaleString()}
                    </tspan>
                    <tspan
                      x={viewBox.cx}
                      y={viewBox.cy + 16}
                      className="fill-slate-500 text-[10px] font-medium"
                    >
                      people
                    </tspan>
                  </text>
                );
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>

      <div className="grid grid-cols-3 gap-2">
        {data.map((entry) => (
          <div key={entry.key} className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: `var(--color-${entry.key})` }}
              />
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                {entry.shortLabel}
              </span>
            </div>
            <p className="mt-2 text-lg font-black tracking-tight text-slate-950">
              {entry.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function VulnerabilityPreview({
  stats,
  compact = false,
}: {
  stats: ReportsPreviewStats | null;
  compact?: boolean;
}) {
  const data = buildReportsVulnerabilityPreviewData(stats);
  const totalVulnerable = getReportsVulnerableTotal(stats);

  return (
    <div>
      <ChartContainer
        config={vulnerabilityChartConfig}
        className={cn('aspect-auto w-full', compact ? 'h-[160px]' : 'h-[182px]')}
      >
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="shortLabel"
            axisLine={false}
            tickLine={false}
            width={compact ? 38 : 44}
            tick={{ fontSize: 11 }}
          />
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent nameKey="key" labelKey="label" hideLabel />}
          />
          <Bar dataKey="value" radius={10} background={{ fill: 'rgba(226,232,240,0.55)', radius: 10 }}>
            {data.map((entry) => (
              <Cell key={entry.key} fill={`var(--color-${entry.key})`} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
      <p className="mt-3 text-xs text-slate-500">
        <span className="font-semibold text-slate-700">{totalVulnerable.toLocaleString()}</span> residents
        currently flagged for priority monitoring.
      </p>
    </div>
  );
}

function HouseholdPreview({
  topHouseholdPuroks,
  compact = false,
}: {
  topHouseholdPuroks: ReportsHouseholdPreviewRow[];
  compact?: boolean;
}) {
  const data = buildReportsHouseholdPreviewData(topHouseholdPuroks, compact ? 4 : 5).map((entry) => ({
    ...entry,
    series: 'households',
  }));

  return (
    <div>
      <ChartContainer
        config={householdChartConfig}
        className={cn('aspect-auto w-full', compact ? 'h-[160px]' : 'h-[182px]')}
      >
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="shortLabel"
            axisLine={false}
            tickLine={false}
            width={compact ? 42 : 54}
            tick={{ fontSize: 11 }}
          />
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent nameKey="series" labelKey="purok" hideLabel />}
          />
          <Bar
            dataKey="households"
            radius={10}
            fill="var(--color-households)"
            background={{ fill: 'rgba(226,232,240,0.55)', radius: 10 }}
          />
        </BarChart>
      </ChartContainer>
      <div className="mt-3 flex flex-wrap gap-2">
        {data.slice(0, compact ? 2 : 3).map((entry) => (
          <CivicBadge
            key={entry.key}
            label={`#${entry.rank} ${entry.purok}: ${entry.households}`}
            tone="emerald"
            className="text-[10px]"
          />
        ))}
      </div>
    </div>
  );
}

export function ReportsLivePreviewCards({
  stats,
  topHouseholdPuroks,
  compact = false,
}: ReportsLivePreviewCardsProps) {
  return (
    <div className={cn('grid gap-4', compact ? 'grid-cols-1' : 'grid-cols-3')}>
      <PreviewCardShell
        href="/reports/monthly"
        title="Monthly Demographic Summary"
        description="Children, adults, and seniors in one live snapshot."
        badgeTone="navy"
        icon={BarChart3}
        compact={compact}
      >
        <MonthlyPreview stats={stats} compact={compact} />
      </PreviewCardShell>

      <PreviewCardShell
        href="/reports/vulnerable"
        title="Vulnerable Groups Summary"
        description="Live category counts for residents needing closer monitoring."
        badgeTone="rose"
        icon={ShieldAlert}
        compact={compact}
      >
        <VulnerabilityPreview stats={stats} compact={compact} />
      </PreviewCardShell>

      <PreviewCardShell
        href="/reports/households"
        title="Household Census Listing"
        description="Top puroks by approved active household count."
        badgeTone="emerald"
        icon={Home}
        compact={compact}
      >
        <HouseholdPreview topHouseholdPuroks={topHouseholdPuroks} compact={compact} />
      </PreviewCardShell>
    </div>
  );
}
