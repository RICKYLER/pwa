'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ensureSupabaseBrowserSession, getDefaultRouteForUser, setAuthenticatedUser } from '@/lib/auth';

interface SetupState {
  name: string;
  email: string;
  role: string;
}

export default function SetupPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const isResetMode = searchParams.get('mode') === 'reset';

  const [details, setDetails] = useState<SetupState | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const copy = isResetMode
    ? {
        invalidLink: 'This password reset link is missing or invalid.',
        validateError: 'Unable to validate reset link.',
        finishError: 'Unable to finish password reset.',
        heroBadge: 'Password Recovery',
        heroTitle: 'Choose a new password without exposing credentials in chat or email.',
        heroDescription: 'The reset link is time-limited and lets residents or staff recover access safely from their inbox.',
        pageTitle: 'Reset password',
        pageDescription: 'Enter a new password to regain access to your MSWDO Census account.',
        validatingText: 'Validating secure reset link...',
        unavailableTitle: 'Reset link unavailable',
        submitIdle: 'Save new password and continue',
        submitBusy: 'Saving new password...',
      }
    : {
        invalidLink: 'This password setup link is missing or invalid.',
        validateError: 'Unable to validate setup link.',
        finishError: 'Unable to finish password setup.',
        heroBadge: 'Secure Account Setup',
        heroTitle: 'Create your password without sharing credentials by email.',
        heroDescription: 'This setup link is one-time use and lets your team onboard staff without exposing a temporary password in inboxes or browser storage.',
        pageTitle: 'Set up password',
        pageDescription: 'Finish account setup to access the MSWDO Census dashboard.',
        validatingText: 'Validating secure setup link...',
        unavailableTitle: 'Setup link unavailable',
        submitIdle: 'Save password and continue',
        submitBusy: 'Saving password...',
      };

  useEffect(() => {
    if (!token) {
      setError(copy.invalidLink);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadTokenDetails() {
      try {
        setIsLoading(true);
        const query = new URLSearchParams({
          token,
          mode: isResetMode ? 'reset' : 'setup',
        });
        const response = await fetch(`/api/auth/setup-password?${query.toString()}`, {
          cache: 'no-store',
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || copy.validateError);
        }

        if (!cancelled) {
          setDetails(payload.user);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : copy.validateError);
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
  }, [copy.invalidLink, copy.validateError, isResetMode, token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    let sessionStarted = false;

    if (!token) {
      setError(copy.invalidLink);
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
          mode: isResetMode ? 'reset' : 'setup',
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || copy.finishError);
      }

      sessionStarted = true;
      await ensureSupabaseBrowserSession(payload.user.email, password);
      setAuthenticatedUser(payload.user);
      router.push(getDefaultRouteForUser(payload.user));
    } catch (err) {
      if (sessionStarted) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }).catch(() => null);
      }

      setError(err instanceof Error ? err.message : copy.finishError);
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
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-indigo-200">{copy.heroBadge}</p>
            <h1 className="mt-4 text-4xl font-bold leading-tight">
              {copy.heroTitle}
            </h1>
            <p className="mt-5 text-base leading-7 text-indigo-200">
              {copy.heroDescription}
            </p>
          </div>
        </section>

        <section className="flex w-full items-center justify-center bg-white px-6 py-10 lg:w-1/2">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center lg:text-left">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30 lg:mx-0">
                <Lock className="h-7 w-7" />
              </div>
              <h1 className="text-3xl font-bold text-slate-900">{copy.pageTitle}</h1>
              <p className="mt-2 text-sm text-slate-500">
                {copy.pageDescription}
              </p>
            </div>

            {isLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
                  {copy.validatingText}
                </div>
              </div>
            ) : error && !details ? (
              <div className="space-y-4 rounded-2xl border border-red-200 bg-red-50 p-6">
                <div className="flex items-start gap-3 text-red-700">
                  <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">{copy.unavailableTitle}</p>
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
                  {isSubmitting ? copy.submitBusy : copy.submitIdle}
                </button>
              </form>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
