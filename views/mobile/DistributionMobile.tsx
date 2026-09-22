'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Filter,
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
import { Button } from '@/components/ui/button';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { deleteDistributionEvent, getDistributionEvents, getDistributionRecords } from '@/lib/db/distribution';
import { getZeroEligibilityDistributionEvents } from '@/lib/db/queries';
import type { DistributionEvent } from '@/lib/db/schema';
import { CivicChipButton, CivicEmptyState, CivicPage } from '@/components/ui/civic-primitives';
import { MobileFilterSheet } from '@/components/mobile/mobile-primitives';

const STATUS_CFG = {
  planned: {
    label: 'Planned',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  ongoing: {
    label: 'Ongoing',
    dot: 'bg-blue-600 animate-pulse',
    badge: 'bg-blue-50 text-blue-900 border-blue-200',
  },
  completed: {
    label: 'Completed',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
};

type DistributionStatus = 'all' | 'planned' | 'ongoing' | 'completed';

interface DeleteSheetProps {
  event: DistributionEvent;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  isDeleting: boolean;
}

function DeleteSheet({ event, onConfirm, onCancel, isDeleting }: DeleteSheetProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onCancel}>
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
      <div className="relative z-10 rounded-t-[30px] bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-slate-200" />
        <div className="space-y-4 px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-950">Delete Event?</h2>
              <p className="mt-1 text-xs text-slate-500">
                This removes the event and all recorded distributions permanently.
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <p className="text-sm font-bold text-slate-950">{event.event_name}</p>
            <p className="mt-1 text-xs text-slate-500">{event.location}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="h-10 rounded-xl border-slate-200 text-xs font-semibold text-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => { void onConfirm(); }}
              disabled={isDeleting}
              className="h-10 rounded-xl text-xs font-semibold"
            >
              {isDeleting ? 'Deleting...' : 'Delete Event'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DistributionMobile() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = getCurrentUser();

  const [events, setEvents] = useState<DistributionEvent[]>([]);
  const [recordCounts, setRecordCounts] = useState<Record<string, number>>({});
  const [zeroMatchEventIds, setZeroMatchEventIds] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<DistributionStatus>('all');
  const [search, setSearch] = useState('');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
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

  const totalBeneficiariesServed = Object.values(recordCounts).reduce((acc, val) => acc + val, 0);
  const zeroMatchCount = events.filter((event) => zeroMatchEventIds.has(event.id)).length;

  const filteredEvents = useMemo(() => {
    return events
      .filter((e) => (filterStatus === 'all' ? true : e.status === filterStatus))
      .filter((event) => !isZeroMatchMode || zeroMatchEventIds.has(event.id))
      .filter((event) => {
        if (!search) return true;
        const query = search.toLowerCase().trim();
        return (
          event.event_name.toLowerCase().includes(query) ||
          event.location.toLowerCase().includes(query)
        );
      });
  }, [events, filterStatus, isZeroMatchMode, search, zeroMatchEventIds]);

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteDistributionEvent(pendingDelete.id);
      setEvents((current) => current.filter((event) => event.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (error) {
      console.error(error);
    } finally {
      setIsDeleting(false);
    }
  }

  const canManage = hasPermission('manage_inventory');
  const hasFilters = Boolean(search) || filterStatus !== 'all' || isZeroMatchMode;

  return (
    <>
      {pendingDelete ? (
        <DeleteSheet
          event={pendingDelete}
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
          isDeleting={isDeleting}
        />
      ) : null}

      <CivicPage className="space-y-4 px-3 py-4">
        {/* ── Mobile Header ── */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-cyan-800">
                <Truck className="h-3 w-3 text-cyan-600" />
                Relief Dispatch
              </span>
              {counts.ongoing > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-800 border border-blue-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
                  {counts.ongoing} Active
                </span>
              ) : null}
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-950">Distribution</h1>
          </div>

          {canManage && (
            <Button asChild size="sm" className="h-9 rounded-xl bg-cyan-950 px-3 text-xs font-semibold text-white">
              <Link href="/distribution/new">
                <Plus className="h-3.5 w-3.5 mr-1" />
                New Drive
              </Link>
            </Button>
          )}
        </div>

        {/* ── Mobile Logistics Vitals Strip (Scrollable) ── */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs">
          <div className="shrink-0 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-xs">
            <Truck className="h-3.5 w-3.5 text-blue-600" />
            <span className="text-slate-500">Ongoing:</span>
            <strong className="font-mono text-blue-900">{isLoading ? '—' : counts.ongoing}</strong>
          </div>
          <div className="shrink-0 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-xs">
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-slate-500">Planned:</span>
            <strong className="font-mono text-amber-900">{isLoading ? '—' : counts.planned}</strong>
          </div>
          <div className="shrink-0 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-xs">
            <Users className="h-3.5 w-3.5 text-cyan-700" />
            <span className="text-slate-500">Served:</span>
            <strong className="font-mono text-slate-900">{isLoading ? '—' : totalBeneficiariesServed}</strong>
          </div>
          <div className="shrink-0 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-slate-500">Done:</span>
            <strong className="font-mono text-emerald-900">{isLoading ? '—' : counts.completed}</strong>
          </div>
        </div>

        {/* ── Search Bar & Filter Sheet Trigger ── */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search event or location..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-xs text-slate-800 outline-none focus:border-cyan-900"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFilterSheetOpen(true)}
            className={`h-10 shrink-0 rounded-xl border px-3 text-xs font-semibold ${
              hasFilters
                ? 'border-cyan-400 bg-cyan-50 text-cyan-950 font-bold'
                : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            <Filter className="h-3.5 w-3.5 mr-1" />
            Filter
            {hasFilters ? <span className="ml-1 h-1.5 w-1.5 rounded-full bg-cyan-600" /> : null}
          </Button>
        </div>

        {/* ── Zero Match Warning ── */}
        {zeroMatchCount > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-bold">Eligibility Notice</p>
            <p className="mt-0.5 text-[11px]">
              {zeroMatchCount} event{zeroMatchCount === 1 ? ' currently has' : 's currently have'} zero eligible household matches.
            </p>
          </div>
        ) : null}

        {/* ── Mobile Filter Sheet ── */}
        <MobileFilterSheet
          open={filterSheetOpen}
          onOpenChange={setFilterSheetOpen}
          title="Filter Distribution Drives"
          description="Filter operations by drive status."
          resultCount={<span>Showing <strong>{filteredEvents.length}</strong> events</span>}
          filters={(
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Drive Status</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: 'all' as const, label: 'All Operations', count: counts.all },
                  { key: 'ongoing' as const, label: 'Ongoing', count: counts.ongoing },
                  { key: 'planned' as const, label: 'Planned', count: counts.planned },
                  { key: 'completed' as const, label: 'Completed', count: counts.completed },
                ].map((s) => (
                  <CivicChipButton
                    key={s.key}
                    active={filterStatus === s.key}
                    onClick={() => setFilterStatus(s.key)}
                  >
                    {s.label} ({s.count})
                  </CivicChipButton>
                ))}
              </div>
            </div>
          )}
        />

        {/* ── Event Cards Feed ── */}
        {isLoading ? (
          <div className="space-y-2.5">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : filteredEvents.length > 0 ? (
          <div className="space-y-3">
            {filteredEvents.map((event) => {
              const cfg = STATUS_CFG[event.status as keyof typeof STATUS_CFG] || STATUS_CFG.planned;
              const schedDate = new Date(event.scheduled_date);
              const isOverdue = schedDate < new Date() && event.status !== 'completed';
              const claimedCount = recordCounts[event.id] || 0;

              return (
                <div
                  key={event.id}
                  className="block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs"
                >
                  <Link href={`/distribution/${event.id}`} className="block">
                    {/* Header: Status + Date */}
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${cfg.badge}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                      <span className={`text-[11px] font-medium ${isOverdue ? 'text-amber-700 font-bold' : 'text-slate-400'}`}>
                        {schedDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {isOverdue ? ' · Overdue' : ''}
                      </span>
                    </div>

                    {/* Title & Location */}
                    <h2 className="mt-2 text-sm font-bold text-slate-900 truncate">{event.event_name}</h2>
                    <p className="text-[11px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                      {event.location}
                    </p>

                    {/* Cargo items */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {event.package_items.map((pkg, idx) => (
                        <span
                          key={idx}
                          className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-800"
                        >
                          📦 {pkg.item_name || 'Relief Pack'} ×{pkg.quantity}
                        </span>
                      ))}
                    </div>
                  </Link>

                  {/* Footer: Served count & Actions */}
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
                    <span className="text-slate-600 font-medium text-[11px]">
                      Served: <strong className="font-mono text-slate-900">{claimedCount}</strong> households
                    </span>

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/distribution/${event.id}`}
                        className="inline-flex items-center gap-0.5 font-bold text-cyan-950 text-xs"
                      >
                        Manage
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => setPendingDelete(event)}
                          className="p-1 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <CivicEmptyState
            icon={Package}
            title="No events match"
            description="No relief operations match the current filter."
          />
        )}
      </CivicPage>
    </>
  );
}
