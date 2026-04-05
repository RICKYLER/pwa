'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Calendar, Filter, MapPin, Package, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { deleteDistributionEvent, getDistributionEvents } from '@/lib/db/distribution';
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
  const user = getCurrentUser();
  const [events, setEvents] = useState<DistributionEvent[]>([]);
  const [filterStatus, setFilterStatus] = useState<DistributionStatus>('all');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<DistributionEvent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!user || !hasPermission('view_reports')) {
      router.push('/dashboard');
      return;
    }

    async function load() {
      setIsLoading(true);
      setEvents(await getDistributionEvents());
      setIsLoading(false);
    }

    void load();
  }, [router, user]);

  if (!user) return null;

  const filteredEvents = filterStatus === 'all' ? events : events.filter((event) => event.status === filterStatus);
  const counts = {
    all: events.length,
    planned: events.filter((event) => event.status === 'planned').length,
    ongoing: events.filter((event) => event.status === 'ongoing').length,
    completed: events.filter((event) => event.status === 'completed').length,
  };

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

        <div className="flex flex-wrap gap-2">
          <CivicBadge label={`${filteredEvents.length} showing`} tone="slate" />
          {filterStatus !== 'all' ? <CivicBadge label={STATUS[filterStatus]?.label || 'Filtered'} tone="navy" /> : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => setFilterSheetOpen(true)}
            className="h-8 rounded-full border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
          >
            <Filter className="h-3.5 w-3.5" />
            Status
          </Button>
        </div>

        <MobileFilterSheet
          open={filterSheetOpen}
          onOpenChange={setFilterSheetOpen}
          title="Filter distribution events"
          description="Keep the list tight on mobile and move the status tabs into a sheet."
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
                  subtitle={`${event.location}`}
                  leading={<Package className="h-5 w-5" />}
                  status={(
                    <>
                      <CivicBadge label={tone.label} tone={tone.tone} className="text-[10px]" />
                      {isPast ? <CivicBadge label="Overdue" tone="amber" className="text-[10px]" /> : null}
                    </>
                  )}
                  meta={(
                    <div className="space-y-2 text-xs text-slate-500">
                      <div className="inline-flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{schedDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                      <div className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        <span>{event.location}</span>
                      </div>
                    </div>
                  )}
                  actions={(
                    <>
                      <Button asChild variant="outline" className="h-10 rounded-full border-slate-200 px-4 text-xs font-semibold text-slate-700">
                        <Link href={`/distribution/${event.id}`}>Open event</Link>
                      </Button>
                      {canManage ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setPendingDelete(event)}
                          className="h-10 rounded-full border-rose-200 px-4 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
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
