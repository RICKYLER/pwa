'use client';

import { useState } from 'react';
import { DoorClosed, DoorOpen, MapPin, Navigation, Plus, TentTree, Trash2, Users, X } from 'lucide-react';
import { LocationPicker } from '@/components/LocationPicker';
import { CivicBadge, CivicPanel } from '@/components/ui/civic-primitives';
import { cn } from '@/lib/utils';
import { BARANGAY_OPTIONS, getBarangayLabel } from '@/lib/barangays';
import type {
  EvacuationCenter,
  EvacuationCenterStatus,
} from '@/lib/db/schema';
import {
  EVACUATION_CENTER_ACTIVATION_SOURCE_LABELS,
} from '@/lib/evacuation-centers';

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export interface EvacuationCenterDraft {
  barangay_id: string;
  name: string;
  gps_lat?: number;
  gps_lng?: number;
  capacity?: number;
  notes?: string;
}

const STATUS_STYLES: Record<EvacuationCenterStatus, string> = {
  open: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  closed: 'border-slate-200 bg-slate-50 text-slate-600',
};

const STATUS_DOTS: Record<EvacuationCenterStatus, string> = {
  open: 'bg-emerald-500',
  closed: 'bg-slate-400',
};

export default function EvacuationCenterPanel({
  centers,
  canManageRegistry = false,
  savingCenterId = null,
  onSetStatus,
  onSaveCenters,
  onDeleteCenter,
}: {
  centers: EvacuationCenter[];
  canManageRegistry?: boolean;
  savingCenterId?: string | null;
  onSetStatus?: (centerId: string, status: EvacuationCenterStatus) => void;
  onSaveCenters?: (drafts: EvacuationCenterDraft[]) => Promise<void>;
  onDeleteCenter?: (centerId: string) => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EvacuationCenterDraft>({
    barangay_id: '',
    name: '',
    capacity: undefined,
    notes: '',
  });

  const openCount = centers.filter((center) => center.status === 'open').length;

  async function handleAddCenter() {
    if (!draft.barangay_id || !draft.name.trim() || !onSaveCenters) {
      return;
    }

    await onSaveCenters([draft]);
    setDraft({ barangay_id: '', name: '', capacity: undefined, notes: '' });
    setShowAddForm(false);
  }

  return (
    <CivicPanel className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-teal-200 bg-teal-50">
            <TentTree className="h-5 w-5 text-teal-700" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Evacuation centers
            </p>
            <h3 className="text-base font-black tracking-tight text-slate-950">
              {openCount > 0 ? `${openCount} open` : 'All closed'}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Auto-opened by disaster alerts · manual override available
            </p>
          </div>
        </div>
        {canManageRegistry ? (
          <button
            type="button"
            onClick={() => setShowAddForm((current) => !current)}
            className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add center
          </button>
        ) : null}
      </div>

      {canManageRegistry && showAddForm ? (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-3">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Barangay</span>
              <select
                value={draft.barangay_id}
                onChange={(event) => setDraft((current) => ({ ...current, barangay_id: event.target.value }))}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-cyan-900"
              >
                <option value="">Select barangay</option>
                {BARANGAY_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Center name</span>
              <input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. Anitapan Covered Court"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-cyan-900"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Capacity (persons)</span>
              <input
                type="number"
                min={0}
                value={draft.capacity ?? ''}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  capacity: event.target.value.trim() ? Number(event.target.value) : undefined,
                }))}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-cyan-900"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Notes</span>
              <input
                value={draft.notes ?? ''}
                onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Contact person, facilities, access notes"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-cyan-900"
              />
            </label>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Center location</span>
            <p className="text-[11px] text-slate-500">
              Pin the exact center location so responders see it on the field map.
            </p>
            <LocationPicker
              lat={draft.gps_lat}
              lng={draft.gps_lng}
              height="260px"
              onChange={(lat, lng) => setDraft((current) => ({
                ...current,
                gps_lat: lat,
                gps_lng: lng,
              }))}
            />
          </div>
          <button
            type="button"
            onClick={() => void handleAddCenter()}
            disabled={!draft.barangay_id || !draft.name.trim()}
            className="rounded-full bg-cyan-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save center
          </button>
        </div>
      ) : null}

      {centers.length === 0 ? (
        <p className="text-xs leading-relaxed text-slate-500">
          No evacuation centers registered yet.
          {canManageRegistry
            ? ' Add one so disaster alerts can auto-open it.'
            : ' Ask an admin to register centers for this barangay.'}
        </p>
      ) : (
        <div className="space-y-2">
          {centers.map((center) => (
            <div
              key={center.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-slate-200/80 bg-white px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-bold tracking-tight text-slate-950">{center.name}</p>
                  <span className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]',
                    STATUS_STYLES[center.status],
                  )}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOTS[center.status])} />
                    {center.status}
                  </span>
                </div>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                  <MapPin className="h-3 w-3" />
                  {getBarangayLabel(center.barangay_id) ?? center.barangay_id}
                  {typeof center.capacity === 'number' ? (
                    <>
                      <Users className="ml-1 h-3 w-3" />
                      cap. {center.capacity.toLocaleString('en-PH')}
                    </>
                  ) : null}
                </p>
                {center.status === 'open' && center.activated_at ? (
                  <p className="mt-0.5 text-[11px] font-medium text-emerald-700">
                    {center.activation_source
                      ? EVACUATION_CENTER_ACTIVATION_SOURCE_LABELS[center.activation_source]
                      : 'Open'}{' '}
                    · {timeAgo(new Date(center.activated_at))}
                  </p>
                ) : null}
                {center.notes ? (
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{center.notes}</p>
                ) : null}
                {typeof center.gps_lat === 'number' && typeof center.gps_lng === 'number' ? (
                  <a
                    href={`https://maps.google.com/?q=${center.gps_lat},${center.gps_lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-900 underline-offset-2 hover:underline"
                  >
                    <Navigation className="h-3 w-3" />
                    {center.gps_lat.toFixed(5)}, {center.gps_lng.toFixed(5)} — Open in Google Maps
                  </a>
                ) : canManageRegistry ? (
                  <p className="mt-0.5 text-[11px] font-medium text-amber-600">
                    No location pin set — this center will not show on the field map.
                  </p>
                ) : null}
              </div>
              {onSetStatus ? (
                <button
                  type="button"
                  disabled={savingCenterId === center.id}
                  onClick={() => {
                    setPendingDeleteId(null);
                    onSetStatus(
                      center.id,
                      center.status === 'open' ? 'closed' : 'open',
                    );
                  }}
                  className={cn(
                    'flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition',
                    center.status === 'open'
                      ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
                    savingCenterId === center.id && 'cursor-wait opacity-60',
                  )}
                >
                  {center.status === 'open' ? (
                    <>
                      <DoorClosed className="h-3.5 w-3.5" />
                      Close
                    </>
                  ) : (
                    <>
                      <DoorOpen className="h-3.5 w-3.5" />
                      Open
                    </>
                  )}
                </button>
              ) : null}
              {canManageRegistry && onDeleteCenter ? (
                pendingDeleteId === center.id ? (
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      disabled={savingCenterId === center.id}
                      onClick={() => {
                        setPendingDeleteId(null);
                        onDeleteCenter(center.id);
                      }}
                      className={cn(
                        'flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100',
                        savingCenterId === center.id && 'cursor-wait opacity-60',
                      )}
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete center
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(null)}
                      className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      <X className="h-3 w-3" />
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={savingCenterId === center.id}
                    onClick={() => setPendingDeleteId(center.id)}
                    title="Delete this evacuation center"
                    className="flex flex-shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </button>
                )
              ) : null}
            </div>
          ))}
        </div>
      )}

      {centers.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          <CivicBadge label={`${centers.length} registered`} tone="teal" className="text-[10px]" />
          <CivicBadge label={`${openCount} open`} tone={openCount > 0 ? 'emerald' : 'slate'} className="text-[10px]" />
        </div>
      ) : null}
    </CivicPanel>
  );
}
