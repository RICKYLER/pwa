'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { deleteDistributionEvent, getDistributionEvents, getDistributionRecords } from '@/lib/db/distribution';
import { getZeroEligibilityDistributionEvents } from '@/lib/db/queries';
import type { DistributionEvent } from '@/lib/db/schema';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  LayoutGrid,
  List,
  MapPin,
  Package,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { CivicBadge, CivicChipButton, CivicEmptyState, CivicPage } from '@/components/ui/civic-primitives';

const STATUS_CFG = {
  planned: {
    label: 'Planned',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  ongoing: {
    label: 'Ongoing Drive',
    dot: 'bg-blue-600 animate-pulse',
    badge: 'bg-blue-50 text-blue-900 border-blue-200',
  },
  completed: {
    label: 'Completed',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
};

const TARGET_SCOPE_LABELS: Record<string, string> = {
  all_households: 'Whole Barangay',
  purok: 'Purok Focus',
  vulnerable_only: 'Vulnerable Priority',
  incident_affected: 'Disaster Affected',
};

// ─── Delete Confirmation Dialog ─────────────────────────────────────────────
interface DeleteDialogProps {
  event: DistributionEvent;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  isDeleting: boolean;
}

function DeleteDialog({ event, onConfirm, onCancel, isDeleting }: DeleteDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1.5 w-full bg-rose-600" />

        <div className="p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-rose-50 border border-rose-200">
              <AlertTriangle className="h-5 w-5 text-rose-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="delete-dialog-title" className="text-base font-bold text-slate-900">
                Delete Distribution Event?
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                This will permanently remove this relief drive and all associated distribution records. This cannot be undone.
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-6 rounded-xl border border-slate-200/80 bg-slate-50 p-3.5">
            <p className="text-sm font-bold text-slate-900 truncate">{event.event_name}</p>
            <p className="mt-1 text-xs text-slate-500 flex items-center gap-1 truncate">
              <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              {event.location}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isDeleting}
              className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isDeleting}
              className="flex-1 rounded-xl bg-rose-600 py-2.5 px-4 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {isDeleting ? 'Deleting...' : 'Delete Event'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Desktop Component ──────────────────────────────────────────────────
export default function DistributionDesktop() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = getCurrentUser();

  const [events, setEvents] = useState<DistributionEvent[]>([]);
  const [recordCounts, setRecordCounts] = useState<Record<string, number>>({});
  const [zeroMatchEventIds, setZeroMatchEventIds] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<'all' | 'planned' | 'ongoing' | 'completed'>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [isLoading, setIsLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<DistributionEvent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const issueFilter = searchParams.get('issue');
  const isZeroMatchMode = issueFilter === 'zero_matches';

  useEffect(() => {
    if (!user || !hasPermission('view_reports')) {
      router.push('/dashboard');
      return;
    }

    async function load() {
      if (!user) return;
      setIsLoading(true);
      const [allEvents, zeroMatchEvents] = await Promise.all([
        getDistributionEvents(),
        getZeroEligibilityDistributionEvents(user.role === 'admin' ? undefined : user.barangay_id),
      ]);
      setEvents(allEvents);
      setZeroMatchEventIds(new Set(zeroMatchEvents.map((entry) => entry.event.id)));

      // Load records count for each event
      const countsMap: Record<string, number> = {};
      await Promise.all(
        allEvents.map(async (ev) => {
          try {
            const records = await getDistributionRecords(ev.id);
            countsMap[ev.id] = records.length;
          } catch {
            countsMap[ev.id] = 0;
          }
        }),
      );
      setRecordCounts(countsMap);
      setIsLoading(false);
    }

    void load();
  }, [router, user]);

  if (!user) return null;

  const counts = {
    all: events.length,
    planned: events.filter((e) => e.status === 'planned').length,
    ongoing: events.filter((e) => e.status === 'ongoing').length,
    completed: events.filter((e) => e.status === 'completed').length,
  };

  const totalPacksAllocated = events.reduce((acc, ev) => {
    const packs = ev.package_items.reduce((sum, item) => sum + (item.quantity || 1), 0);
    return acc + packs;
  }, 0);

  const totalBeneficiariesServed = Object.values(recordCounts).reduce((acc, val) => acc + val, 0);
  const zeroMatchCount = events.filter((event) => zeroMatchEventIds.has(event.id)).length;

  const filtered = useMemo(() => {
    return events
      .filter((e) => (filterStatus === 'all' ? true : e.status === filterStatus))
      .filter((event) => !isZeroMatchMode || zeroMatchEventIds.has(event.id))
      .filter((event) => {
        if (!search) return true;
        const query = search.toLowerCase().trim();
        return (
          event.event_name.toLowerCase().includes(query) ||
          event.location.toLowerCase().includes(query) ||
          (event.barangay_id && event.barangay_id.toLowerCase().includes(query))
        );
      });
  }, [events, filterStatus, isZeroMatchMode, search, zeroMatchEventIds]);

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteDistributionEvent(pendingDelete.id);
      setEvents((prev) => prev.filter((e) => e.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  }

  const canManage = hasPermission('manage_inventory');

  return (
    <>
      {/* ── Delete Confirmation Dialog ── */}
      {pendingDelete && (
        <DeleteDialog
          event={pendingDelete}
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
          isDeleting={isDeleting}
        />
      )}

      <CivicPage className="space-y-6">
        {/* ── Top Executive Command Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white px-6 py-5 shadow-sm">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-900 border border-cyan-200/60">
                <Truck className="h-3.5 w-3.5 text-cyan-700" />
                Mabini Relief Logistics • Dispatch Console
              </span>
              {counts.ongoing > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-900 border border-blue-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
                  {counts.ongoing} Active Drive in Progress
                </span>
              ) : null}
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              Distribution Events
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage relief pack allocation, beneficiary verification, and field distribution operations.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {canManage && (
              <Link
                href="/distribution/new"
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-900 active:scale-95"
              >
                <Plus className="h-4 w-4" />
                New Distribution Event
              </Link>
            )}
          </div>
        </div>

        {/* ── Executive Logistics Telemetry Strip ── */}
        <div className="grid grid-cols-2 divide-y sm:grid-cols-4 sm:divide-y-0 sm:divide-x divide-slate-200/80 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-sm">
          {/* Ongoing Drives */}
          <button
            type="button"
            onClick={() => setFilterStatus(filterStatus === 'ongoing' ? 'all' : 'ongoing')}
            className={`flex flex-col items-start p-3.5 text-left transition-all rounded-xl ${
              filterStatus === 'ongoing' ? 'bg-blue-50/70 ring-1 ring-blue-500' : 'hover:bg-slate-50/60'
            }`}
          >
            <div className="flex items-center gap-2 text-slate-500">
              <Truck className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Ongoing Drives</span>
            </div>
            <span className="mt-2 text-2xl font-black tracking-tight text-blue-950 font-mono">
              {isLoading ? '—' : counts.ongoing}
            </span>
            <span className="mt-0.5 text-[11px] text-blue-700 font-semibold">
              {counts.ongoing > 0 ? 'Live in the field' : 'Standby ready'}
            </span>
          </button>

          {/* Planned Operations */}
          <button
            type="button"
            onClick={() => setFilterStatus(filterStatus === 'planned' ? 'all' : 'planned')}
            className={`flex flex-col items-start p-3.5 text-left transition-all rounded-xl ${
              filterStatus === 'planned' ? 'bg-amber-50/70 ring-1 ring-amber-500' : 'hover:bg-slate-50/60'
            }`}
          >
            <div className="flex items-center gap-2 text-slate-500">
              <Clock className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Planned Drives</span>
            </div>
            <span className="mt-2 text-2xl font-black tracking-tight text-amber-950 font-mono">
              {isLoading ? '—' : counts.planned}
            </span>
            <span className="mt-0.5 text-[11px] text-slate-500">Scheduled operations</span>
          </button>

          {/* Beneficiaries Served */}
          <div className="flex flex-col items-start p-3.5 text-left rounded-xl">
            <div className="flex items-center gap-2 text-slate-500">
              <Users className="h-4 w-4 text-cyan-700" />
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Households Served</span>
            </div>
            <span className="mt-2 text-2xl font-black tracking-tight text-slate-950 font-mono">
              {isLoading ? '—' : totalBeneficiariesServed}
            </span>
            <span className="mt-0.5 text-[11px] text-slate-500">Claims recorded</span>
          </div>

          {/* Completed Drives */}
          <button
            type="button"
            onClick={() => setFilterStatus(filterStatus === 'completed' ? 'all' : 'completed')}
            className={`flex flex-col items-start p-3.5 text-left transition-all rounded-xl ${
              filterStatus === 'completed' ? 'bg-emerald-50/70 ring-1 ring-emerald-500' : 'hover:bg-slate-50/60'
            }`}
          >
            <div className="flex items-center gap-2 text-slate-500">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Completed Operations</span>
            </div>
            <span className="mt-2 text-2xl font-black tracking-tight text-emerald-950 font-mono">
              {isLoading ? '—' : counts.completed}
            </span>
            <span className="mt-0.5 text-[11px] text-slate-500">Fully dispatched</span>
          </button>
        </div>

        {/* ── Zero Match Warning Banner (Grammar Corrected) ── */}
        {isZeroMatchMode ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 px-5 py-3.5 text-sm text-amber-900 shadow-sm">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              <span>
                Showing <strong>{zeroMatchCount}</strong> planned/ongoing event(s) that currently have zero eligible matched households.
              </span>
            </div>
            <Link
              href="/distribution"
              className="rounded-lg bg-white px-3 py-1 text-xs font-bold text-amber-900 border border-amber-200 hover:bg-amber-100"
            >
              Show All Events
            </Link>
          </div>
        ) : zeroMatchCount > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                <strong>{zeroMatchCount}</strong> distribution event{zeroMatchCount === 1 ? ' currently has' : 's currently have'} zero eligible matches.
              </span>
            </div>
            <Link
              href="/distribution?issue=zero_matches"
              className="font-bold underline underline-offset-2 hover:text-amber-950"
            >
              Review Eligible Criteria →
            </Link>
          </div>
        ) : null}

        {/* ── Operations Control Bar: Search, Status Chips & View Switcher ── */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm space-y-3.5">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[280px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by event name, venue, or barangay..."
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-9 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-cyan-900 focus:bg-white focus:ring-1 focus:ring-cyan-900"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                title="Operations Cards View"
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  viewMode === 'cards'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                title="Master Dispatch Ledger View"
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  viewMode === 'table'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                <span>Ledger</span>
              </button>
            </div>
          </div>

          {/* Quick Status Chips */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { key: 'all' as const, label: 'All Operations', count: counts.all },
                { key: 'ongoing' as const, label: '🚚 Ongoing', count: counts.ongoing },
                { key: 'planned' as const, label: '⏳ Planned', count: counts.planned },
                { key: 'completed' as const, label: '✅ Completed', count: counts.completed },
              ].map((tab) => (
                <CivicChipButton
                  key={tab.key}
                  active={filterStatus === tab.key}
                  onClick={() => setFilterStatus(tab.key)}
                >
                  {tab.label}
                  <span
                    className={`ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-mono ${
                      filterStatus === tab.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {isLoading ? '—' : tab.count}
                  </span>
                </CivicChipButton>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-500">
                Showing <strong className="text-slate-900">{filtered.length}</strong> of {events.length}
              </span>
              {search || filterStatus !== 'all' ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setFilterStatus('all');
                  }}
                  className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700 underline underline-offset-2"
                >
                  <X className="h-3 w-3" />
                  Reset
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* ── Content View: Cards vs Ledger Table ── */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-48 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          viewMode === 'cards' ? (
            /* ── View Mode A: Modern Relief Operations Cards ── */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((event) => {
                const cfg = STATUS_CFG[event.status as keyof typeof STATUS_CFG] || STATUS_CFG.planned;
                const schedDate = new Date(event.scheduled_date);
                const isOverdue = schedDate < new Date() && event.status !== 'completed';
                const claimedCount = recordCounts[event.id] || 0;
                const scopeLabel = TARGET_SCOPE_LABELS[event.target_scope] || event.target_scope;

                return (
                  <div
                    key={event.id}
                    className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-800 hover:shadow-md"
                  >
                    <div>
                      {/* Top Header: Status, Date, Overdue Pill */}
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold border ${cfg.badge}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>

                        <span
                          className={`inline-flex items-center gap-1 text-xs font-medium ${
                            isOverdue ? 'text-amber-700 font-bold' : 'text-slate-400'
                          }`}
                        >
                          <Calendar className="h-3.5 w-3.5" />
                          {schedDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {isOverdue ? (
                            <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] text-amber-800 font-bold">
                              Overdue
                            </span>
                          ) : null}
                        </span>
                      </div>

                      {/* Event Title & Scope */}
                      <Link href={`/distribution/${event.id}`} className="block mt-3">
                        <h2 className="text-base font-bold text-slate-900 group-hover:text-cyan-950 transition-colors truncate">
                          {event.event_name}
                        </h2>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 truncate">
                          <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{event.location}</span>
                        </p>
                      </Link>

                      {/* Scope & Target Badge */}
                      <div className="mt-2.5 flex items-center gap-1.5">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                          Scope: {scopeLabel}
                        </span>
                        {event.barangay_id ? (
                          <span className="rounded-md bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-900 border border-cyan-200">
                            {event.barangay_id}
                          </span>
                        ) : null}
                      </div>

                      {/* Relief Cargo Chips */}
                      <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                        {event.package_items.map((pkg, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-800 border border-slate-200/80"
                          >
                            <Package className="h-3 w-3 text-cyan-700" />
                            {pkg.item_name || 'Relief Pack'} ×{pkg.quantity}
                          </span>
                        ))}
                      </div>

                      {/* Beneficiaries Served Stat */}
                      <div className="mt-3.5 flex items-center justify-between rounded-xl bg-slate-50/80 p-2.5 text-xs border border-slate-100">
                        <span className="text-slate-500 flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-slate-400" />
                          Households Claimed
                        </span>
                        <strong className="font-mono text-slate-900 font-bold">
                          {claimedCount} served
                        </strong>
                      </div>
                    </div>

                    {/* Footer Action Row */}
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                      <Link
                        href={`/distribution/${event.id}`}
                        className="inline-flex items-center gap-1 font-bold text-cyan-950 group-hover:translate-x-0.5 transition-transform"
                      >
                        Manage Beneficiaries & QR
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>

                      {canManage && (
                        <button
                          type="button"
                          onClick={() => setPendingDelete(event)}
                          title="Delete distribution event"
                          className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── View Mode B: Master Dispatch Ledger Table ── */
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-3.5 pl-6 pr-4">Event Name & Scope</th>
                      <th className="py-3.5 px-4">Schedule Date</th>
                      <th className="py-3.5 px-4">Location / Venue</th>
                      <th className="py-3.5 px-4">Package Cargo</th>
                      <th className="py-3.5 px-4">Claims Recorded</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 pr-6 pl-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filtered.map((event) => {
                      const cfg = STATUS_CFG[event.status as keyof typeof STATUS_CFG] || STATUS_CFG.planned;
                      const schedDate = new Date(event.scheduled_date);
                      const isOverdue = schedDate < new Date() && event.status !== 'completed';
                      const claimedCount = recordCounts[event.id] || 0;
                      const scopeLabel = TARGET_SCOPE_LABELS[event.target_scope] || event.target_scope;

                      return (
                        <tr key={event.id} className="transition-colors hover:bg-slate-50/80 group">
                          {/* Event Name */}
                          <td className="py-3.5 pl-6 pr-4">
                            <Link href={`/distribution/${event.id}`} className="block">
                              <span className="font-bold text-slate-900 group-hover:text-cyan-950 transition-colors">
                                {event.event_name}
                              </span>
                              <span className="block text-xs text-slate-400">
                                {scopeLabel}
                              </span>
                            </Link>
                          </td>

                          {/* Date */}
                          <td className="py-3.5 px-4">
                            <span className={`text-xs font-semibold ${isOverdue ? 'text-amber-800' : 'text-slate-800'}`}>
                              {schedDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            {isOverdue ? (
                              <span className="block text-[10px] font-bold text-amber-600">
                                Overdue
                              </span>
                            ) : null}
                          </td>

                          {/* Location */}
                          <td className="py-3.5 px-4">
                            <span className="text-xs text-slate-700 truncate max-w-[200px] block">
                              {event.location}
                            </span>
                          </td>

                          {/* Package Cargo */}
                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap gap-1">
                              {event.package_items.map((pkg, idx) => (
                                <span
                                  key={idx}
                                  className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-800"
                                >
                                  {pkg.item_name || 'Relief Pack'} ×{pkg.quantity}
                                </span>
                              ))}
                            </div>
                          </td>

                          {/* Claims */}
                          <td className="py-3.5 px-4">
                            <span className="font-mono font-bold text-slate-900">
                              {claimedCount}
                            </span>
                            <span className="text-xs text-slate-500 ml-1">served</span>
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold border ${cfg.badge}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                              {cfg.label}
                            </span>
                          </td>

                          {/* Action */}
                          <td className="py-3.5 pr-6 pl-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Link
                                href={`/distribution/${event.id}`}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700 transition hover:border-cyan-900 hover:text-cyan-950 shadow-sm"
                              >
                                Manage
                                <ChevronRight className="h-3.5 w-3.5" />
                              </Link>
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() => setPendingDelete(event)}
                                  className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                                  title="Delete event"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : (
          <CivicEmptyState
            icon={Package}
            title="No distribution events found"
            description={
              search || filterStatus !== 'all'
                ? 'No events match your current filter criteria.'
                : 'Create your first relief distribution event to start logging beneficiary deliveries.'
            }
          />
        )}
      </CivicPage>
    </>
  );
}
