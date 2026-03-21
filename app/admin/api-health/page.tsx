'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { restoreSession } from '@/lib/auth';
import type { User } from '@/lib/db/schema';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CloudSun,
  Globe,
  KeyRound,
  Loader2,
  Mail,
  Map,
  MapPin,
  RefreshCw,
  Server,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

type CheckStatus = 'healthy' | 'warning' | 'error';

interface HealthCheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  configured: boolean;
  summary: string;
  details?: string;
}

interface HealthResponse {
  ok: boolean;
  checkedAt: string;
  location: { lat: number; lng: number };
  summary: {
    total: number;
    healthy: number;
    warning: number;
    error: number;
  };
  checks: HealthCheckResult[];
}

const CHECK_ICONS: Record<string, LucideIcon> = {
  app_url: Globe,
  smtp: Mail,
  google_maps_js: Map,
  google_timezone: Clock3,
  openweather_weather: CloudSun,
  firebase: ShieldCheck,
  recaptcha: KeyRound,
};

const STATUS_META: Record<
  CheckStatus,
  {
    label: string;
    chip: string;
    frame: string;
    iconWrap: string;
    detailBox: string;
    bar: string;
    icon: LucideIcon;
  }
> = {
  healthy: {
    label: 'Healthy',
    chip: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    frame: 'border-emerald-200/70 bg-white',
    iconWrap: 'bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-200',
    detailBox: 'border-emerald-100 bg-emerald-50/60',
    bar: 'bg-emerald-500',
    icon: CheckCircle2,
  },
  warning: {
    label: 'Warning',
    chip: 'border-amber-200 bg-amber-50 text-amber-700',
    frame: 'border-amber-200/70 bg-white',
    iconWrap: 'bg-amber-500/10 text-amber-700 ring-1 ring-amber-200',
    detailBox: 'border-amber-100 bg-amber-50/60',
    bar: 'bg-amber-500',
    icon: AlertTriangle,
  },
  error: {
    label: 'Error',
    chip: 'border-rose-200 bg-rose-50 text-rose-700',
    frame: 'border-rose-200/70 bg-white',
    iconWrap: 'bg-rose-500/10 text-rose-700 ring-1 ring-rose-200',
    detailBox: 'border-rose-100 bg-rose-50/60',
    bar: 'bg-rose-500',
    icon: AlertTriangle,
  },
};

const STATUS_PRIORITY: Record<CheckStatus, number> = {
  error: 0,
  warning: 1,
  healthy: 2,
};

function formatCheckedAt(checkedAt?: string) {
  if (!checkedAt) return 'No checks have been run yet';

  return new Date(checkedAt).toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function ApiHealthPage() {
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const user = restoreSession();
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'admin') {
      router.push('/dashboard');
      return;
    }
    setMe(user);
    runHealthCheck(true);
  }, [router]);

  async function runHealthCheck(initial = false) {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError('');

    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const payload = await response.json();

      if (!response.ok && !payload?.checks) {
        throw new Error(payload?.error || 'Failed to run API health check');
      }

      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run API health check');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  if (!me) return null;

  const healthScore = data
    ? Math.round((data.summary.healthy / Math.max(data.summary.total, 1)) * 100)
    : 0;
  const attentionCount = data ? data.summary.warning + data.summary.error : 0;
  const sortedChecks = data
    ? [...data.checks].sort(
        (left, right) =>
          STATUS_PRIORITY[left.status] - STATUS_PRIORITY[right.status] ||
          left.label.localeCompare(right.label),
      )
    : [];

  const overallBadge = loading
    ? {
        className: 'border-amber-200 bg-amber-50 text-amber-700',
        label: 'Running diagnostics',
        icon: Loader2,
      }
    : error && !data
      ? {
          className: 'border-rose-200 bg-rose-50 text-rose-700',
          label: 'Health check unavailable',
          icon: AlertTriangle,
        }
      : data?.ok
        ? {
            className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
            label: 'Critical services operational',
            icon: CheckCircle2,
          }
        : {
            className: 'border-amber-200 bg-amber-50 text-amber-700',
            label: 'Attention required',
            icon: AlertTriangle,
          };

  const OverallBadgeIcon = overallBadge.icon;

  return (
    <AppShell title="API Health">
      <div className="mx-auto max-w-[1240px] space-y-6 p-4 sm:p-6 lg:p-8">
        <section className="relative overflow-hidden rounded-[30px] border border-slate-200/80 bg-white shadow-[0_24px_80px_-40px_rgba(15,23,42,0.35)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(79,70,229,0.16),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(13,148,136,0.14),transparent_36%)]" />

          <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.25fr_0.75fr] lg:p-8">
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-3">
                  <span
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${overallBadge.className}`}
                  >
                    <OverallBadgeIcon
                      className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                    />
                    {overallBadge.label}
                  </span>

                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                      API Health Console
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                      Monitor configured integrations, verify environment readiness,
                      and review service diagnostics without exposing secret keys.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => runHealthCheck(false)}
                  disabled={loading || refreshing}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 hover:shadow-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {refreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {refreshing ? 'Refreshing...' : 'Run Check'}
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 backdrop-blur-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Last check
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {formatCheckedAt(data?.checkedAt)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Latest successful diagnostic timestamp.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 backdrop-blur-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Service region
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {data
                      ? `${data.location.lat.toFixed(4)}, ${data.location.lng.toFixed(4)}`
                      : 'Awaiting first completed check'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Reference coordinates used by location-based services.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 backdrop-blur-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Coverage
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {data ? `${data.summary.total} active integration checks` : 'Preparing diagnostics'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Email, maps, weather, Firebase, and app runtime connectivity.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-800/90 bg-slate-950 p-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                    System health score
                  </p>
                  <div className="mt-4 flex items-end gap-3">
                    <p className="text-5xl font-semibold tracking-tight">
                      {data ? `${healthScore}%` : '--'}
                    </p>
                    <p className="pb-1 text-sm text-slate-400">
                      {data
                        ? `${data.summary.healthy}/${data.summary.total} healthy`
                        : 'Waiting for results'}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <Server className="h-5 w-5 text-sky-300" />
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Operational coverage</span>
                  <span>{data ? `${healthScore}%` : 'Pending'}</span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-400 transition-all duration-700"
                    style={{ width: `${healthScore}%` }}
                  />
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-emerald-400/10 p-2.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    </div>
                    <div>
                      <p className="text-xl font-semibold text-white">
                        {data ? data.summary.healthy : '--'}
                      </p>
                      <p className="text-xs text-slate-400">Healthy services</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-amber-400/10 p-2.5">
                      <AlertTriangle className="h-4 w-4 text-amber-300" />
                    </div>
                    <div>
                      <p className="text-xl font-semibold text-white">
                        {data ? attentionCount : '--'}
                      </p>
                      <p className="text-xs text-slate-400">Need attention</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:col-span-2 lg:col-span-1 xl:col-span-2">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-sky-400/10 p-2.5">
                      <MapPin className="h-4 w-4 text-sky-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Diagnostics scope</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        Checks validate configuration readiness and live access to critical
                        platform dependencies from the current deployment context.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Total checks',
              value: data?.summary.total ?? '--',
              note: 'Configured endpoints and platform integrations under review.',
              icon: Activity,
              box: 'border-slate-200 bg-white',
              iconWrap: 'bg-slate-100 text-slate-700',
            },
            {
              label: 'Healthy',
              value: data?.summary.healthy ?? '--',
              note: 'Services currently responding as expected.',
              icon: CheckCircle2,
              box: 'border-emerald-200/80 bg-emerald-50/70',
              iconWrap: 'bg-emerald-100 text-emerald-700',
            },
            {
              label: 'Warnings',
              value: data?.summary.warning ?? '--',
              note: 'Items that may still work but need configuration review.',
              icon: AlertTriangle,
              box: 'border-amber-200/80 bg-amber-50/70',
              iconWrap: 'bg-amber-100 text-amber-700',
            },
            {
              label: 'Errors',
              value: data?.summary.error ?? '--',
              note: 'Blocking failures that need immediate admin attention.',
              icon: AlertTriangle,
              box: 'border-rose-200/80 bg-rose-50/70',
              iconWrap: 'bg-rose-100 text-rose-700',
            },
          ].map((card) => {
            const Icon = card.icon;

            return (
              <div
                key={card.label}
                className={`rounded-[26px] border p-5 shadow-[0_16px_50px_-36px_rgba(15,23,42,0.45)] ${card.box}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-500">{card.label}</p>
                    <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
                      {card.value}
                    </p>
                  </div>
                  <div className={`rounded-2xl p-3 ${card.iconWrap}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{card.note}</p>
              </div>
            );
          })}
        </section>

        {error && !data && (
          <section className="rounded-[26px] border border-rose-200 bg-rose-50/80 p-5 text-rose-800 shadow-[0_18px_50px_-34px_rgba(244,63,94,0.35)]">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-white/70 p-2.5">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Health diagnostics could not be completed.</p>
                <p className="mt-1 text-sm leading-6 text-rose-700">{error}</p>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-[30px] border border-slate-200/80 bg-white p-5 shadow-[0_24px_80px_-42px_rgba(15,23,42,0.35)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                Service matrix
              </p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">Integration check results</h2>
              <p className="mt-1 text-sm text-slate-500">
                Review each dependency in its own professional status box.
              </p>
            </div>

            {data && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{sortedChecks.length}</span>{' '}
                service boxes rendered
              </div>
            )}
          </div>

          <div className="mt-6">
            {loading && !data ? (
              <div className="rounded-[26px] border border-slate-200 bg-slate-50 p-6">
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
                  Running service checks and collecting diagnostics...
                </div>
              </div>
            ) : data ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {sortedChecks.map((check) => {
                  const Icon = CHECK_ICONS[check.id] ?? Activity;
                  const meta = STATUS_META[check.status];
                  const StatusIcon = meta.icon;

                  return (
                    <article
                      key={check.id}
                      className={`overflow-hidden rounded-[28px] border shadow-[0_18px_60px_-42px_rgba(15,23,42,0.45)] ${meta.frame}`}
                    >
                      <div className={`h-1.5 w-full ${meta.bar}`} />

                      <div className="p-5 sm:p-6">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="flex min-w-0 items-start gap-4">
                            <div
                              className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${meta.iconWrap}`}
                            >
                              <Icon className="h-5 w-5" />
                            </div>

                            <div className="min-w-0">
                              <p className="text-lg font-semibold text-slate-950">{check.label}</p>
                              <p className="mt-1 text-sm leading-6 text-slate-600">
                                {check.summary}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${meta.chip}`}
                            >
                              <StatusIcon className="h-3.5 w-3.5" />
                              {meta.label}
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${
                                check.configured
                                  ? 'border-sky-200 bg-sky-50 text-sky-700'
                                  : 'border-slate-200 bg-slate-100 text-slate-600'
                              }`}
                            >
                              {check.configured ? 'Configured' : 'Missing config'}
                            </span>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-3">
                          <div className={`rounded-2xl border p-4 ${meta.detailBox}`}>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                              Service summary
                            </p>
                            <p className="mt-2 text-sm leading-6 text-slate-700">{check.summary}</p>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                              Diagnostic details
                            </p>
                            <p className="mt-2 text-sm leading-6 text-slate-700">
                              {check.details || 'No additional diagnostics were returned for this service.'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[26px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <p className="text-sm font-semibold text-slate-700">
                  No diagnostic data available yet.
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Run the health check to populate the service boxes.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
