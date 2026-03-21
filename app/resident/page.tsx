'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock3, FileText, MapPin, ShieldAlert } from 'lucide-react';
import ResidentShell from '@/components/resident/ResidentShell';
import { getDefaultRouteForUser, getCurrentUser, isResidentUser } from '@/lib/auth';
import { getHouseholds } from '@/lib/db/households';
import type { Household } from '@/lib/db/schema';
import { buildRegistrationTimeline, formatRegistrationStatusLabel, getHouseholdRegistrationStatus } from '@/lib/household-registration';

function formatDate(value?: Date): string {
  if (!value) {
    return 'Waiting for review';
  }

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function ResidentPortalPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const [records, setRecords] = useState<Household[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (!isResidentUser(user)) {
      router.push(getDefaultRouteForUser(user));
      return;
    }

    const residentUser = user;
    let cancelled = false;

    async function loadRecords() {
      try {
        setIsLoading(true);
        const households = await getHouseholds({ applicant_user_id: residentUser.id });
        if (!cancelled) {
          setRecords(households);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadRecords();

    return () => {
      cancelled = true;
    };
  }, [router, user]);

  const pendingCount = useMemo(() => (
    records.filter((record) => getHouseholdRegistrationStatus(record) === 'pending').length
  ), [records]);

  if (!user || !isResidentUser(user)) {
    return null;
  }

  return (
    <ResidentShell
      title="Resident Portal"
      subtitle="Create a household registration and track its approval progress."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'My Registrations', value: records.length, icon: FileText, tone: 'bg-indigo-50 text-indigo-700' },
          { label: 'Pending Review', value: pendingCount, icon: Clock3, tone: 'bg-amber-50 text-amber-700' },
          { label: 'Approved', value: records.filter((record) => getHouseholdRegistrationStatus(record) === 'approved').length, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700' },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${card.tone}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-3xl font-bold text-slate-900">{card.value}</p>
              <p className="mt-1 text-sm text-slate-500">{card.label}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">My Registration Records</h2>
            <p className="mt-1 text-sm text-slate-500">
              Every record you submit will appear here with its current review status.
            </p>
          </div>
          <Link
            href="/households/register"
            className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <FileText className="h-4 w-4" />
            New Registration
          </Link>
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
            Loading your registrations...
          </div>
        ) : records.length > 0 ? (
          <div className="mt-6 space-y-4">
            {records.map((record) => {
              const timeline = buildRegistrationTimeline(record);
              return (
                <div key={record.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">{record.head_name}</h3>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                          {formatRegistrationStatusLabel(getHouseholdRegistrationStatus(record))}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">
                        {record.street_address}, {record.purok_sitio}, {record.barangay_name}, {record.municipality}
                      </p>
                      <p className="mt-2 text-xs text-slate-400">Submitted {formatDate(record.registration_submitted_at || record.createdAt)}</p>
                    </div>
                    <Link
                      href={`/households/register/status?id=${record.id}`}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      View Status
                    </Link>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-4">
                    {timeline.map((step) => (
                      <div
                        key={step.key}
                        className={`rounded-2xl border px-3 py-3 text-sm ${
                          step.state === 'done'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : step.state === 'current'
                              ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
                              : 'border-slate-200 bg-white text-slate-500'
                        }`}
                      >
                        {step.label}
                      </div>
                    ))}
                  </div>

                  {record.registration_review_notes?.trim() && (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      <div className="flex items-start gap-2">
                        <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <span>{record.registration_review_notes.trim()}</span>
                      </div>
                    </div>
                  )}

                  {typeof record.gps_lat === 'number' && typeof record.gps_long === 'number' && (
                    <div className="mt-4 inline-flex items-center gap-2 text-xs text-slate-500">
                      <MapPin className="h-3.5 w-3.5" />
                      {record.gps_lat.toFixed(5)}, {record.gps_long.toFixed(5)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center">
            <FileText className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-4 text-base font-semibold text-slate-900">No registration submitted yet</p>
            <p className="mt-2 text-sm text-slate-500">
              Start a new household registration, use your location or pin the map, then wait for admin approval.
            </p>
            <Link
              href="/households/register"
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <FileText className="h-4 w-4" />
              Start Registration
            </Link>
          </div>
        )}
      </div>
    </ResidentShell>
  );
}
