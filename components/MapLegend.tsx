'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Map as MapIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BARANGAY_REGISTRY, getBarangayBoundaryColors } from '@/lib/mabini-barangays';

const INCIDENT_SEVERITY_LEGEND = [
  { label: 'Critical', color: '#ef4444' },
  { label: 'High', color: '#f97316' },
  { label: 'Medium', color: '#f59e0b' },
  { label: 'Low', color: '#94a3b8' },
];

function LegendRow({
  swatch,
  label,
  note,
}: {
  swatch: React.ReactNode;
  label: string;
  note?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-4 w-6 flex-shrink-0 items-center justify-center">{swatch}</span>
        <span className="text-[11px] font-semibold text-slate-600">{label}</span>
      </div>
      {note ? <span className="text-[10px] text-slate-400">{note}</span> : null}
    </div>
  );
}

export default function MapLegend({
  showBarangayColors = false,
  className,
}: {
  showBarangayColors?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div
      className={cn(
        'pointer-events-auto absolute top-4 right-4 z-[420] w-56 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-[0_18px_36px_-24px_rgba(15,23,42,0.5)] backdrop-blur',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 transition hover:bg-slate-50"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
          <MapIcon className="h-3.5 w-3.5" />
          Legend
        </span>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronUp className="h-3.5 w-3.5 text-slate-400" />}
      </button>

      {open ? (
        <div className="space-y-2.5 border-t border-slate-100 px-3.5 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Boundaries</p>
          <LegendRow
            swatch={
              <span className="flex h-4 w-6 items-center justify-center">
                <span className="h-3.5 w-5 rounded-[3px] border-[1.5px] border-teal-800 bg-teal-500/15" />
              </span>
            }
            label="Barangay boundary"
          />

          {showBarangayColors ? (
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 rounded-lg border border-slate-100 bg-slate-50/70 px-2 py-2">
              {BARANGAY_REGISTRY.map((entry) => {
                const colors = getBarangayBoundaryColors(entry.id);
                return (
                  <div key={entry.id} className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-[3px] border"
                      style={{ backgroundColor: `${colors.fill}33`, borderColor: colors.stroke }}
                    />
                    <span className="truncate text-[10px] font-semibold text-slate-600">{entry.label}</span>
                  </div>
                );
              })}
            </div>
          ) : null}

          <p className="pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Markers</p>
          <LegendRow
            swatch={<span className="h-2.5 w-2.5 rotate-45 rounded-[3px] bg-red-500" />}
            label="Incident"
            note="by severity"
          />
          <LegendRow
            swatch={<span className="h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-red-200" />}
            label="High risk household"
          />
          <LegendRow
            swatch={
              <span className="flex h-4 w-6 items-center justify-center">
                <span className="h-3 w-3 bg-emerald-600 [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
              </span>
            }
            label="Evacuation center"
            note="green = open"
          />
          <LegendRow
            swatch={
              <span className="flex h-4 w-6 items-center justify-center">
                <span className="h-0 w-6 border-t-2 border-dashed border-teal-700" />
              </span>
            }
            label="Response route"
            note="indicative"
          />

          <div className="flex flex-wrap gap-1 border-t border-slate-100 pt-2">
            {INCIDENT_SEVERITY_LEGEND.map((item) => (
              <span key={item.label} className="flex items-center gap-1">
                <span className="h-2 w-2 rotate-45 rounded-[2px]" style={{ backgroundColor: item.color }} />
                <span className="text-[9px] font-semibold text-slate-500">{item.label}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
