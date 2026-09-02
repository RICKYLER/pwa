'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Calendar, Filter, MapPin, Package, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { deleteDistributionEvent, getDistributionEvents } from '@/lib/db/distribution';
import { getZeroEligibilityDistributionEvents } from '@/lib/db/queries';
import type { DistributionEvent } from '@/lib/db/schema';
import { CivicBadge, CivicChipButton, CivicEmptyState, CivicPage } from '@/components/ui/civic-primitives';
import { MobileFilterSheet, MobileListCard, MobilePageHeader } from '@/components/mobile/mobile-primitives';

const STATUS = {
  planned: { label: 'Planned', tone: 'amber' as const },
  ongoing: { label: 'Ongoing', tone: 'navy' as const },
  completed: { label: 'Completed', tone: 'emerald' as const },
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
      <div className="relative z-10 rounded-t-[30px] bg-white" onClick={(eventClick) => eventClick.stopPropagation()}>
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-slate-200" />
        <div className="space-y-4 px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-950">Delete event</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">This removes the event and its distribution records permanently.</p>
            </div>
            <button type="button" onClick={onCancel} className="rounded-[18px] border border-slate-200 bg-white p-2 text-slate-500">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-bold text-slate-950">{event.event_name}</p>
            <p className="mt-1 text-xs text-slate-500">{event.location}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={onCancel} className="h-11 rounded-[18px] border-slate-200 text-sm font-semibold text-slate-700">
              Keep event
            </Button>
            <Button type="button" variant="destructive" onClick={() => { void onConfirm(); }} disabled={isDeleting} className="h-11 rounded-[18px] text-sm font-semibold">
              {isDeleting ? 'Deleting...' : 'Delete'}
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
  const [zeroMatchEventIds, setZeroMatchEventIds] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<DistributionStatus>('all');
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
      if (!user) {
        return;
      }
      setIsLoading(true);
      const [allEvents, zeroMatchEvents] = await Promise.all([
        getDistributionEvents(),
        getZeroEligibilityDistributionEvents(user.role === 'admin' ? undefined : user.barangay_id),
      ]);
      setEvents(allEvents);
      setZeroMatchEventIds(new Set(zeroMatchEvents.map((entry) => entry.event.id)));
      setIsLoading(false);
    }

    void load();
  }, [router, user]);

  if (!user) return null;

  const filteredEvents = (filterStatus === 'all' ? events : events.filter((event) => event.status === filterStatus))
    .filter((event) => !isZeroMatchMode || zeroMatchEventIds.has(event.id));
  const counts = {
    all: events.length,
    planned: events.filter((event) => event.status === 'planned').length,
    ongoing: events.filter((event) => event.status === 'ongoing').length,
    completed: events.filter((event) => event.status === 'completed').length,
  };
  const zeroMatchCount = events.filter((event) => zeroMatchEventIds.has(event.id)).length;

  async function handleConfirmDelete() {
    if (!pendingDelete) {
      return;
    }

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

      <CivicPage className="space-y-4 px-4 py-4">
        <MobilePageHeader
          title="Distribution"
          subtitle={isLoading ? 'Loading events...' : `${counts.ongoing} ongoing and ${counts.planned} planned operations.`}
          primaryAction={canManage ? (
            <Button asChild className="h-11 rounded-[18px] px-4 text-sm font-semibold">
              <Link href="/distribution/new">
                <Plus className="h-4 w-4" />
                Add
              </Link>
            </Button>
          ) : null}
        />

        <div className="flex flex-wrap items-center gap-2">
          {isZeroMatchMode ? <CivicBadge label="0 eligible" tone="amber" /> : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => setFilterSheetOpen(true)}
            className="h-8 rounded-full border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
          >
            <Filter className="h-3.5 w-3.5" />
            {filterStatus === 'all' ? 'Status' : STATUS[filterStatus]?.label}
          </Button>
        </div>

        <MobileFilterSheet
          open={filterSheetOpen}
          onOpenChange={setFilterSheetOpen}
          title="Filter distribution events"
          description="Narrow the list by event status — planned, ongoing, or completed."
          resultCount={<span>Showing <strong>{filteredEvents.length}</strong> of <strong>{events.length}</strong> events</span>}
          filters={(
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Status</p>
              <div className="flex flex-wrap gap-2">
                {(['all', 'planned', 'ongoing', 'completed'] as const).map((status) => (
                  <CivicChipButton key={status} active={filterStatus === status} onClick={() => setFilterStatus(status)}>
                    {status === 'all' ? 'All' : STATUS[status].label}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${filterStatus === status ? 'bg-white/12 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {counts[status]}
                    </span>
                  </CivicChipButton>
                ))}
              </div>
            </div>
          )}
        />

        {isZeroMatchMode ? (
          <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Showing events that currently have zero eligible matches.
          </div>
        ) : null}

        {!isZeroMatchMode && zeroMatchCount > 0 ? (
          <button
            type="button"
            onClick={() => router.push('/distribution?issue=zero_matches')}
            className="flex w-full items-center gap-2 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              {zeroMatchCount} event{zeroMatchCount !== 1 ? 's' : ''} currently have zero eligible matches — tap to view.
            </span>
          </button>
        ) : null}

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-[24px] bg-slate-100" />
            ))}
          </div>
        ) : filteredEvents.length > 0 ? (
          <div className="space-y-2">
            {filteredEvents.map((event) => {
              const schedDate = new Date(event.scheduled_date);
              const isPast = schedDate < new Date() && event.status !== 'completed';
              const tone = STATUS[event.status as keyof typeof STATUS] ?? STATUS.planned;

              return (
                <MobileListCard
                  key={event.id}
                  title={event.event_name}
                  leading={<Package className="h-5 w-5" />}
                  status={<CivicBadge label={tone.label} tone={tone.tone} className="text-[10px]" />}
                  meta={(
                    <div className="space-y-2.5 text-xs text-slate-500">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span>{schedDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          {isPast ? <span className="font-semibold text-amber-600">· overdue</span> : null}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Package className="h-3.5 w-3.5 text-slate-400" />
                          <span>
                            {event.package_items.length} pack item{event.package_items.length !== 1 ? 's' : ''}
                          </span>
                        </span>
                      </div>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{event.location}</span>
                      </div>
                    </div>
                  )}
                  actions={(
                    <>
                      <Button asChild variant="outline" className="h-10 flex-1 rounded-full border-slate-200 px-4 text-xs font-semibold text-slate-700">
                        <Link href={`/distribution/${event.id}`} prefetch={false}>Open event</Link>
                      </Button>
                      {canManage ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setPendingDelete(event)}
                          aria-label="Delete event"
                          className="h-10 w-10 shrink-0 rounded-full border-slate-200 px-0 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </>
                  )}
                />
              );
            })}
          </div>
        ) : (
          <CivicEmptyState
            icon={Package}
            title="No events found"
            description={filterStatus === 'all' ? 'Distribution events will appear here.' : `No ${filterStatus} events match the current filter.`}
          />
        )}
      </CivicPage>
    </>
  );
}
