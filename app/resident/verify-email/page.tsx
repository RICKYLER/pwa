'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Loader2, Mail, RefreshCw, ShieldCheck } from 'lucide-react';

type VerificationState = 'instructions' | 'verifying' | 'verified' | 'error';

export default function ResidentVerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token')?.trim() || '';
  const email = searchParams.get('email')?.trim() || '';
  const sent = searchParams.get('sent') === '1';

  const [state, setState] = useState<VerificationState>(token ? 'verifying' : 'instructions');
  const [message, setMessage] = useState(
    token
      ? 'We are verifying your email now.'
      : sent
        ? 'We sent a verification link to your email address.'
        : 'Your account was created, but the verification email still needs to be sent.',
  );
  const [error, setError] = useState('');
  const [isResending, setIsResending] = useState(false);

  const canResend = useMemo(() => Boolean(email) && state !== 'verifying' && state !== 'verified', [email, state]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    async function verifyEmail() {
      setState('verifying');
      setError('');

      try {
        const response = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Could not verify this email address.');
        }

        if (cancelled) {
          return;
        }

        setState('verified');
        setMessage(
          payload.alreadyVerified
            ? 'This email address was already verified. You can sign in now.'
            : 'Your email address has been verified. You can sign in now.',
        );
      } catch (verifyError) {
        if (cancelled) {
          return;
        }

        setState('error');
        setError(verifyError instanceof Error ? verifyError.message : 'Could not verify this email address.');
      }
    }

    void verifyEmail();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleResend() {
    if (!email) {
      setError('Missing email address for resend.');
      return;
    }

    try {
      setIsResending(true);
      setError('');

      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Could not resend the verification email.');
      }

      if (payload.alreadyVerified) {
        setState('verified');
      } else {
        setState('instructions');
      }

      setMessage(payload.message || 'A new verification email has been sent.');
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : 'Could not resend the verification email.');
    } finally {
      setIsResending(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col lg:flex-row">
        <section className="relative hidden overflow-hidden px-12 py-16 text-white lg:flex lg:w-1/2 lg:flex-col lg:justify-center">
          <div className="absolute inset-0 bg-gradient-to-br from-teal-900 via-cyan-900 to-slate-950" />
          <div className="absolute top-1/4 left-1/4 h-72 w-72 rounded-full bg-teal-500/20 blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-cyan-500/15 blur-3xl" />
          <div className="relative z-10 max-w-md">
            <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/10 shadow-2xl shadow-teal-500/25 backdrop-blur">
              <ShieldCheck className="h-10 w-10" />
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-200">Resident Email Verification</p>
            <h1 className="mt-4 text-4xl font-bold leading-tight">
              Verify your email before signing in.
            </h1>
            <p className="mt-5 text-base leading-7 text-teal-100">
              This helps make sure the resident account belongs to the real email owner before any registration data is submitted.
            </p>
          </div>
        </section>

        <section className="flex w-full items-center justify-center bg-white px-6 py-10 lg:w-1/2">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center lg:text-left">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-cyan-600 text-white shadow-lg shadow-teal-500/25 lg:mx-0">
                {state === 'verified' ? <CheckCircle2 className="h-7 w-7" /> : <Mail className="h-7 w-7" />}
              </div>
              <h1 className="text-3xl font-bold text-slate-900">
                {state === 'verified' ? 'Email verified' : 'Check your email'}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                {message}
              </p>
            </div>

            {email && (
              <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                Verification email for:
                {' '}
                <span className="font-semibold text-slate-900">{email}</span>
              </div>
            )}

            {state === 'verifying' && (
              <div className="flex items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-4 text-sm text-teal-800">
                <Loader2 className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin" />
                <span>Verifying your email address. Please wait a moment.</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {state !== 'verifying' && (
              <div className="mt-5 space-y-4">
                {state !== 'verified' && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
                    Open the verification email and click the link. After that, sign in using the password you created during registration.
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row">
                  {state === 'verified' ? (
                    <Link
                      href="/login"
                      className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition hover:opacity-95"
                    >
                      Continue to login
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { void handleResend(); }}
                      disabled={!canResend || isResending}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isResending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      {isResending ? 'Sending...' : 'Resend verification email'}
                    </button>
                  )}

                  <Link
                    href="/resident/register"
                    className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Back to registration
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
