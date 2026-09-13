'use client';

import { AlertTriangle, Home, LandPlot, Radio, ShieldCheck, Siren, TentTree, X } from 'lucide-react';
import { CivicBadge, CivicPanel } from '@/components/ui/civic-primitives';
import { cn } from '@/lib/utils';
import {
  BARANGAY_RESPONSE_STATUS_LABELS,
  type BarangayResponseSummary,
} from '@/lib/barangay-response';
import { formatBarangayArea, getBarangayBoundaryColors } from '@/lib/mabini-barangays';

const STATUS_STYLES: Record<BarangayResponseSummary['responseStatus'], string> = {
  active_response: 'border-red-200 bg-red-50 text-red-700',
  monitoring: 'border-amber-200 bg-amber-50 text-amber-700',
  clear: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const STATUS_DOTS: Record<BarangayResponseSummary['responseStatus'], string> = {
  active_response: 'bg-red-500',
  monitoring: 'bg-amber-500',
  clear: 'bg-emerald-500',
};

function SummaryRow({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  tone?: 'danger' | 'warn';
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200/80 bg-slate-50/60 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon className={cn('h-4 w-4 flex-shrink-0', tone === 'danger' ? 'text-red-500' : tone === 'warn' ? 'text-amber-500' : 'text-slate-400')} />
        <span className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</span>
      </div>
      <span className={cn(
        'text-sm font-black tabular-nums',
        tone === 'danger' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-slate-900',
      )}>
        {value}
      </span>
    </div>
  );
}

export default function BarangayResponsePanel({
  summary,
  compact = false,
  onClose,
}: {
  summary: BarangayResponseSummary;
  compact?: boolean;
  onClose?: () => void;
}) {
  const colors = getBarangayBoundaryColors(summary.barangayId);

  return (
    <CivicPanel className={cn('space-y-3', compact && 'p-4')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 h-10 w-10 flex-shrink-0 rounded-lg border"
            style={{ backgroundColor: `${colors.fill}1f`, borderColor: `${colors.stroke}66` }}
            aria-hidden
          >
            <LandPlot className="m-auto h-5 w-5" style={{ color: colors.stroke }} />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Barangay response
            </p>
            <h3 className="text-lg font-black tracking-tight text-slate-950">{summary.label}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              PSGC {summary.psgc || '—'} · Mabini, Davao de Oro
            </p>
          </div>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
            aria-label="Close barangay response panel"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div
        className={cn(
          'flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5',
          STATUS_STYLES[summary.responseStatus],
        )}
      >
        <div className="flex items-center gap-2.5">
          <span className={cn('h-2.5 w-2.5 flex-shrink-0 rounded-full', STATUS_DOTS[summary.responseStatus])} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-70">Response status</p>
            <p className="text-sm font-black tracking-tight">
              {BARANGAY_RESPONSE_STATUS_LABELS[summary.responseStatus]}
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold tabular-nums opacity-80">
          {formatBarangayArea(summary.areaKm2)}
        </span>
      </div>

      <div className={cn('grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-2')}>
        <SummaryRow label="Active incidents" value={summary.activeIncidents} tone={summary.activeIncidents > 0 ? 'warn' : undefined} icon={Siren} />
        <SummaryRow label="Critical incidents" value={summary.criticalIncidents} tone={summary.criticalIncidents > 0 ? 'danger' : undefined} icon={AlertTriangle} />
        <SummaryRow label="High risk households" value={summary.highRiskHouseholds} tone={summary.highRiskHouseholds > 0 ? 'warn' : undefined} icon={Home} />
        <SummaryRow label="Responding teams" value={summary.respondingTeams} icon={Radio} />
        <SummaryRow label="Pending tasks" value={summary.pendingTasks} icon={ShieldCheck} />
        <SummaryRow label="Flood-prone puroks" value={summary.floodPronePuroks} tone={summary.floodPronePuroks > 0 ? 'warn' : undefined} icon={TentTree} />
      </div>

      {summary.evacuationSites.length > 0 ? (
        <div className="rounded-lg border border-teal-200/70 bg-teal-50/70 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-800/70">
            Designated evacuation sites
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {summary.evacuationSites.map((site) => (
              <CivicBadge key={site} label={site} tone="teal" className="text-[10px]" />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs leading-relaxed text-slate-500">
          No evacuation sites recorded for this barangay yet.
        </p>
      )}
    </CivicPanel>
  );
}
