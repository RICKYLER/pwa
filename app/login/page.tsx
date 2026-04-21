'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AuthRequestError,
  getDefaultRouteForUser,
  login,
  restoreSession,
} from '@/lib/auth';
import CivicAuthShell, { type CivicAuthFeature, type CivicAuthStat } from '@/components/auth/CivicAuthShell';
import {
  BadgeCheck,
  Eye,
  EyeOff,
  FileCheck2,
  Landmark,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

const LOGIN_FEATURES: CivicAuthFeature[] = [
  {
    icon: ShieldCheck,
    label: 'Trusted civic access',
    description: 'One secure sign-in experience for staff operations and verified resident self-service.',
  },
  {
    icon: FileCheck2,
    label: 'Registration visibility',
    description: 'Residents can create an account, submit household records, and follow approval progress online.',
  },
  {
    icon: Landmark,
    label: 'Barangay operations',
    description: 'Staff accounts open the operational dashboard, field response, distribution, and reports.',
  },
  {
    icon: BadgeCheck,
    label: 'Verified resident identity',
    description: 'Resident accounts stay blocked until the email owner confirms the verification link.',
  },
];

const LOGIN_STATS: CivicAuthStat[] = [
  { value: '1', label: 'entry point', description: 'Shared sign-in for staff and residents.' },
  { value: '24/7', label: 'resident access', description: 'Registrations and status tracking stay available online.' },
  { value: 'Role-based', label: 'session routing', description: 'Each account lands in the correct workspace after sign-in.' },
];

function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 h-4 w-28 rounded-full bg-slate-100" />
        <div className="h-12 animate-pulse rounded-md border border-slate-200 bg-slate-50" />
      </div>
      <div>
        <div className="mb-2 h-4 w-24 rounded-full bg-slate-100" />
        <div className="h-12 animate-pulse rounded-md border border-slate-200 bg-slate-50" />
      </div>
      <div className="h-12 animate-pulse rounded-md bg-slate-200" />
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [inactiveAccountMessage, setInactiveAccountMessage] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationHelpVisible, setVerificationHelpVisible] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const sessionReason = searchParams.get('reason');

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    const existingUser = restoreSession();
    if (existingUser) {
      router.push(getDefaultRouteForUser(existingUser));
    }
  }, [isMounted, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setInactiveAccountMessage('');
    setVerificationMessage('');
    setVerificationHelpVisible(false);
    setIsLoading(true);

    try {
      const user = await login(email, password);
      router.push(getDefaultRouteForUser(user));
    } catch (err) {
      if (err instanceof AuthRequestError && err.code === 'EMAIL_NOT_VERIFIED') {
        setVerificationEmail(err.email || email.trim());
        setVerificationHelpVisible(true);
      }

      if (err instanceof AuthRequestError && err.code === 'ACCOUNT_INACTIVE') {
        setInactiveAccountMessage(err.message);
        setError('');
      } else {
        setError(err instanceof Error ? err.message : 'Login failed');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResendVerification() {
    const targetEmail = verificationEmail || email.trim();
    if (!targetEmail) {
      setError('Enter the resident email address first.');
      return;
    }

    try {
      setIsResendingVerification(true);
      setError('');
      setVerificationMessage('');

      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      });

      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Could not resend the verification email.');
      }

      setVerificationEmail(targetEmail);
      setVerificationHelpVisible(true);
      setVerificationMessage(payload.message || 'A new verification email has been sent.');
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : 'Could not resend the verification email.');
    } finally {
      setIsResendingVerification(false);
    }
  }

  const verifyPageHref = verificationEmail
    ? `/resident/verify-email?email=${encodeURIComponent(verificationEmail)}`
    : '/resident/verify-email';
  const forgotPasswordHref = email.trim()
    ? `/forgot-password?email=${encodeURIComponent(email.trim())}`
    : '/forgot-password';

  return (
    <CivicAuthShell
      heroEyebrow="Civic access"
      heroTitle="MABINI DISASTER RISK HOUSEHOLD PROFILING SYSTEM"
      heroDescription="Use your assigned account to access the Mabini Disaster Risk Household Profiling System. Staff accounts open operational tools, while verified residents continue to self-service registration and status tracking."
      heroBadge="Municipality of Mabini"
      heroFootnote="Residents should use their own account. Staff credentials stay reserved for operations and review."
      panelEyebrow="Account sign in"
      panelTitle="Welcome back"
      panelDescription="Sign in with your assigned account to continue in the Mabini Disaster Risk Household Profiling System. Staff users land on the operations workspace, and verified residents land on the self-service portal."
      panelAside={
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
          <ShieldCheck className="h-4 w-4" />
          Secure session
        </div>
      }
      features={LOGIN_FEATURES}
      stats={LOGIN_STATS}
      footer={
        <p className="text-center text-xs text-slate-500">
          Secure cookie session. Staff land on the civic console, and residents land on their own portal.
        </p>
      }
    >
      {isMounted ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          {sessionReason === 'account-removed' || sessionReason === 'account-deactivated' || sessionReason === 'access-updated' ? (
            <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm">
              <p className="font-semibold">
                {sessionReason === 'account-removed'
                  ? 'Resident account removed'
                  : sessionReason === 'account-deactivated'
                    ? 'Account deactivated'
                    : 'Account access changed'}
              </p>
              <p className="mt-1 leading-5 text-amber-900">
                {sessionReason === 'account-removed'
                  ? 'An administrator removed this resident account. Contact the E-Mabini administrator if you need clarification.'
                  : sessionReason === 'account-deactivated'
                    ? 'An administrator deactivated this account. Contact the E-Mabini administrator if you need access restored.'
                    : 'An administrator updated this account. Sign in again or contact the E-Mabini administrator if you need help.'}
              </p>
            </div>
          ) : null}

          {inactiveAccountMessage ? (
            <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm">
              <p className="font-semibold">Account deactivated</p>
              <p className="mt-1 leading-5 text-amber-900">{inactiveAccountMessage}</p>
            </div>
          ) : null}

          <div className="rounded-md border border-blue-100 bg-blue-50/50 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-blue-900">One sign-in page</p>
            <p className="mt-1 leading-5">
              Staff use assigned credentials. Residents use a verified resident account.
            </p>
          </div>

          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setInactiveAccountMessage('');
                setVerificationEmail(event.target.value.trim());
                setVerificationHelpVisible(false);
                setVerificationMessage('');
              }}
              className="h-12 w-full rounded-md border border-slate-300 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20"
              placeholder="name@email.com"
              autoComplete="username"
              required
              disabled={isLoading}
              suppressHydrationWarning
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
                Password
              </label>
              <Link
                href={forgotPasswordHref}
                className="text-xs font-semibold text-blue-700 transition hover:text-blue-900"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setInactiveAccountMessage('');
                  setVerificationHelpVisible(false);
                  setVerificationMessage('');
                }}
                className="h-12 w-full rounded-md border border-slate-300 bg-white px-4 pr-12 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20"
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                disabled={isLoading}
                suppressHydrationWarning
              />
              <button
                type="button"
                onClick={() => setShowPass((current) => !current)}
                className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error ? (
            <div className="flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-sm">
              <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-700">
                !
              </div>
              <span>{error}</span>
            </div>
          ) : null}

          {verificationHelpVisible ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm">
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
                <div className="space-y-3">
                  <p className="font-semibold">Resident email still needs verification.</p>
                  <p className="leading-5 text-amber-900">
                    For security, the resident account stays blocked until the email owner confirms the verification link.
                    You can resend the email or return to the verification page.
                  </p>
                  {verificationMessage ? (
                    <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
                      {verificationMessage}
                    </p>
                  ) : null}
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => {
                        void handleResendVerification();
                      }}
                      disabled={isResendingVerification || isLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-amber-300 bg-white px-4 py-2 font-semibold text-amber-900 shadow-sm transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isResendingVerification ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      {isResendingVerification ? 'Sending...' : 'Resend verification email'}
                    </button>
                    <Link
                      href={verifyPageHref}
                      className="inline-flex items-center justify-center rounded-md bg-amber-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-amber-700"
                    >
                      Open verification page
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-blue-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" />
                Sign in
              </>
            )}
          </button>

          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Resident self-service</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">Need a resident account?</p>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  Create one first, verify your email, then sign in here.
                </p>
              </div>
              <Link
                href="/resident/register"
                className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Create account
              </Link>
            </div>
          </div>
        </form>
      ) : (
        <LoadingSkeleton />
      )}
    </CivicAuthShell>
  );
}
