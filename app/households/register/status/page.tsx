'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Clock3, MapPin, ShieldCheck } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { LocationPicker } from '@/components/LocationPicker';
import ResidentShell from '@/components/resident/ResidentShell';
import { getCurrentUser, getDefaultRouteForUser, hasPermission, isResidentUser } from '@/lib/auth';
import { getHousehold } from '@/lib/db/households';
import { buildRegistrationTimeline, formatRegistrationStatusLabel, getHouseholdRegistrationStatus } from '@/lib/household-registration';
import type { Household } from '@/lib/db/schema';

function formatDate(value?: Date): string {
  if (!value) {
    return 'Waiting for admin review';
  }

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function RegistrationStatusPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = getCurrentUser();
  const [record, setRecord] = useState<Household | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const recordId = searchParams.get('id');

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (!recordId) {
      router.push(isResidentUser(user) ? '/resident' : '/households');
      return;
    }

    let cancelled = false;
    const currentRecordId = recordId ?? '';

    async function loadRecord() {
      setIsLoading(true);
      try {
        const household = await getHousehold(currentRecordId);
        if (!cancelled) {
          if (isResidentUser(user) && household && household.applicant_user_id !== user.id) {
            router.push('/resident');
            return;
          }

          if (!isResidentUser(user) && !hasPermission('create_household')) {
            router.push(getDefaultRouteForUser(user));
            return;
          }

          setRecord(household ?? null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadRecord();

    return () => {
      cancelled = true;
    };
  }, [recordId, router, user]);

  const timeline = useMemo(() => {
    return record ? buildRegistrationTimeline(record) : [];
  }, [record]);

  if (!user) {
    return null;
  }

  const content = (
      <div className="mx-auto max-w-[1000px] space-y-6 p-4 sm:p-6 lg:p-8">
        <div>
          <Link
            href={isResidentUser(user) ? '/resident' : '/households'}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            {isResidentUser(user) ? 'Back to Portal' : 'Back to Households'}
          </Link>
        </div>

        {isLoading ? (
          <div className="rounded-[32px] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
            <Clock3 className="mx-auto h-8 w-8 animate-pulse text-slate-300" />
            <p className="mt-4 text-sm text-slate-500">Loading registration status...</p>
          </div>
        ) : record ? (
          <>
            <div className="rounded-[36px] border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                    <Clock3 className="h-3.5 w-3.5" />
                    Pending Review
                  </div>
                  <h1 className="mt-4 text-3xl font-bold text-slate-900">Your registration is under admin review.</h1>
                  <p className="mt-2 max-w-2xl text-sm text-slate-600">
                    The record was submitted successfully and is now waiting for location review and admin approval.
                  </p>
                </div>
                <div className="rounded-3xl border border-amber-100 bg-white px-5 py-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current status</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {formatRegistrationStatusLabel(getHouseholdRegistrationStatus(record))}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Submitted {formatDate(record.registration_submitted_at)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-indigo-600" />
                <h2 className="text-lg font-semibold text-slate-900">Progress Timeline</h2>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                {timeline.map((step) => (
                  <div
                    key={step.key}
                    className={`rounded-3xl border px-4 py-4 ${
                      step.state === 'done'
                        ? 'border-emerald-200 bg-emerald-50'
                        : step.state === 'current'
                          ? 'border-indigo-200 bg-indigo-50'
                          : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{step.key.replace('_', ' ')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{step.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Submitted Summary</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Personal info</p>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      <p><span className="font-semibold text-slate-900">Name:</span> {record.head_name}</p>
                      <p><span className="font-semibold text-slate-900">Contact:</span> {record.contact_number || 'Not provided'}</p>
                      <p><span className="font-semibold text-slate-900">Email:</span> {record.applicant_email || 'Not provided'}</p>
                    </div>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Address</p>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      <p>{record.street_address}</p>
                      <p>{record.purok_sitio}, {record.barangay_name}</p>
                      <p>{record.municipality}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-indigo-600" />
                  <h2 className="text-lg font-semibold text-slate-900">Location Preview</h2>
                </div>
                <div className="mt-4">
                  <LocationPicker
                    readonly
                    height="240px"
                    lat={record.gps_lat}
                    lng={record.gps_long}
                  />
                </div>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
                  <p><span className="font-semibold text-slate-900">Latitude:</span> {typeof record.gps_lat === 'number' ? record.gps_lat.toFixed(6) : 'Waiting for location review'}</p>
                  <p className="mt-2"><span className="font-semibold text-slate-900">Longitude:</span> {typeof record.gps_long === 'number' ? record.gps_long.toFixed(6) : 'Waiting for location review'}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[32px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <p className="font-semibold">What happens next</p>
                  <p className="mt-1">
                    Admin will review the location, check the map pin quality, and either approve, reject, or request a correction.
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-[32px] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
            <p className="text-sm font-medium text-slate-700">Registration record not found.</p>
            <p className="mt-1 text-sm text-slate-500">The record may have been removed or the status link is incomplete.</p>
          </div>
        )}
      </div>
  );

  if (isResidentUser(user)) {
    return (
      <ResidentShell
        title="Registration Status"
        subtitle="Track your submission while it moves through admin review."
      >
        {content}
      </ResidentShell>
    );
  }

  return (
    <AppShell title="Registration Status">
      {content}
    </AppShell>
  );
}
