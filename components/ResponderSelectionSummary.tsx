'use client';

import type { DistributionEvent, Household, Incident } from '@/lib/db/schema';
import { AlertTriangle, Home, MapPin, Navigation, Package, Phone, Radio, X } from 'lucide-react';
import { CivicPanel, CivicSectionHeading, CivicBadge } from '@/components/ui/civic-primitives';

function formatIncidentStatus(status: string) {
  return status.replaceAll('_', ' ');
}

export default function ResponderSelectionSummary({
  household,
  incident,
  event,
  onClear,
  onNavigateHousehold,
  onNavigateIncident,
  onNavigateEvent,
  compact = false,
}: {
  household?: Household | null;
  incident?: Incident | null;
  event?: DistributionEvent | null;
  onClear?: () => void;
  onNavigateHousehold?: (household: Household) => void;
  onNavigateIncident?: (incident: Incident) => void;
  onNavigateEvent?: (event: DistributionEvent) => void;
  compact?: boolean;
}) {
  if (!household && !incident && !event) {
    return (
      <CivicPanel>
        <CivicSectionHeading
          icon={MapPin}
          title="Map selection"
          description="Select a household, incident, or event from the map to inspect details here."
        />
      </CivicPanel>
    );
  }

  if (incident) {
    return (
      <CivicPanel className={compact ? 'space-y-3' : 'space-y-4'}>
        <div className="flex items-start justify-between gap-3">
          <CivicSectionHeading
            icon={AlertTriangle}
            title={incident.location}
            description={incident.description}
          />
          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <CivicBadge label={incident.severity.toUpperCase()} tone={incident.severity === 'critical' ? 'rose' : incident.severity === 'high' ? 'amber' : 'slate'} />
          <CivicBadge label={formatIncidentStatus(incident.status)} tone="navy" />
          <CivicBadge label={incident.type.replaceAll('_', ' ')} tone="slate" />
        </div>
        <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-cyan-900" />
            <span>Reported {new Date(incident.reported_at).toLocaleString('en-PH')}</span>
          </div>
        </div>
        {onNavigateIncident ? (
          <button
            type="button"
            onClick={() => onNavigateIncident(incident)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-950 px-4 py-3 text-sm font-semibold text-white shadow-[0_20px_36px_-24px_rgba(8,47,73,0.8)] transition hover:bg-cyan-900"
          >
            <Navigation className="h-4 w-4" />
            Navigate to incident
          </button>
        ) : null}
      </CivicPanel>
    );
  }

  if (event) {
    return (
      <CivicPanel className={compact ? 'space-y-3' : 'space-y-4'}>
        <div className="flex items-start justify-between gap-3">
          <CivicSectionHeading
            icon={Package}
            title={event.event_name}
            description={event.location}
          />
          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <CivicBadge label={event.status.replaceAll('_', ' ')} tone="emerald" />
          <CivicBadge label={event.type.replaceAll('_', ' ')} tone="navy" />
          <CivicBadge label={event.target_group.replaceAll('_', ' ')} tone="slate" />
        </div>
        <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-cyan-900" />
            <span>{new Date(event.scheduled_date).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>
        {onNavigateEvent ? (
          <button
            type="button"
            onClick={() => onNavigateEvent(event)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-950 px-4 py-3 text-sm font-semibold text-white shadow-[0_20px_36px_-24px_rgba(8,47,73,0.8)] transition hover:bg-cyan-900"
          >
            <Navigation className="h-4 w-4" />
            Navigate to event
          </button>
        ) : null}
      </CivicPanel>
    );
  }

  return (
    <CivicPanel className={compact ? 'space-y-3' : 'space-y-4'}>
      <div className="flex items-start justify-between gap-3">
        <CivicSectionHeading
          icon={Home}
          title={household!.head_name}
          description={`${household!.street_address}, ${household!.purok_sitio}`}
        />
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <CivicBadge label={household!.status.replaceAll('_', ' ')} tone="emerald" />
        {household!.contact_number ? <CivicBadge label="Contact available" tone="teal" /> : null}
      </div>
      <div className="space-y-2 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-cyan-900" />
          <span>{household!.barangay_name}, {household!.municipality}</span>
        </div>
        {household!.contact_number ? (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-cyan-900" />
            <span>{household!.contact_number}</span>
          </div>
        ) : null}
      </div>
      {onNavigateHousehold ? (
        <button
          type="button"
          onClick={() => onNavigateHousehold(household!)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-950 px-4 py-3 text-sm font-semibold text-white shadow-[0_20px_36px_-24px_rgba(8,47,73,0.8)] transition hover:bg-cyan-900"
        >
          <Navigation className="h-4 w-4" />
          Navigate to household
        </button>
      ) : null}
    </CivicPanel>
  );
}
