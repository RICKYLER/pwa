'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react';
import { getDefaultRouteForUser, setAuthenticatedUser } from '@/lib/auth';
import { db, seedInitialData } from '@/lib/db/indexeddb';

interface SetupState {
  name: string;
  email: string;
  role: string;
}

export default function SetupPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [details, setDetails] = useState<SetupState | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('This password setup link is missing or invalid.');
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadTokenDetails() {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/auth/setup-password?token=${encodeURIComponent(token)}`, {
          cache: 'no-store',
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || 'Unable to validate setup link.');
        }

        if (!cancelled) {
          setDetails(payload.user);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to validate setup link.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadTokenDetails();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!token) {
      setError('This password setup link is missing or invalid.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch('/api/auth/setup-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to finish password setup.');
      }

      setAuthenticatedUser(payload.user);
      await db.init();
      await seedInitialData();
      router.push(getDefaultRouteForUser(payload.user));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to finish password setup.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col lg:flex-row">
        <section className="relative hidden overflow-hidden px-12 py-16 text-white lg:flex lg:w-1/2 lg:flex-col lg:justify-center">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-violet-900 to-slate-950" />
          <div className="relative z-10 max-w-md">
            <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/10 shadow-2xl shadow-indigo-500/25 backdrop-blur">
              <ShieldCheck className="h-10 w-10" />
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-indigo-200">Secure Account Setup</p>
            <h1 className="mt-4 text-4xl font-bold leading-tight">
              Create your password without sharing credentials by email.
            </h1>
            <p className="mt-5 text-base leading-7 text-indigo-200">
              This setup link is one-time use and lets your team onboard staff
              without exposing a temporary password in inboxes or browser storage.
            </p>
          </div>
        </section>

        <section className="flex w-full items-center justify-center bg-white px-6 py-10 lg:w-1/2">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center lg:text-left">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30 lg:mx-0">
                <Lock className="h-7 w-7" />
              </div>
              <h1 className="text-3xl font-bold text-slate-900">Set up password</h1>
              <p className="mt-2 text-sm text-slate-500">
                Finish account setup to access the MSWDO Census dashboard.
              </p>
            </div>

            {isLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
                  Validating secure setup link...
                </div>
              </div>
            ) : error && !details ? (
              <div className="space-y-4 rounded-2xl border border-red-200 bg-red-50 p-6">
                <div className="flex items-start gap-3 text-red-700">
                  <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">Setup link unavailable</p>
                    <p className="mt-1 text-sm leading-6">{error}</p>
                  </div>
                </div>
                <Link
                  href="/login"
                  className="inline-flex items-center rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                >
                  Back to login
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
                    <div className="text-sm text-emerald-800">
                      <p className="font-semibold">{details?.name}</p>
                      <p className="mt-1">{details?.email}</p>
                      <p className="mt-1 capitalize">{details?.role?.replace('_', ' ')}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-slate-700">
                    New password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="Minimum 8 characters"
                  />
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Confirm password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="Re-enter password"
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                  {isSubmitting ? 'Saving password...' : 'Save password and continue'}
                </button>
              </form>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
