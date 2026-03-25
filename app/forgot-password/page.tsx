'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Loader2, Mail, ShieldCheck } from 'lucide-react';

export default function ForgotPasswordPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const initialEmail = searchParams.get('email') ?? '';
    if (initialEmail) {
      setEmail(initialEmail);
    }
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      setIsSubmitting(true);
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Could not send the password reset email.');
      }

      setMessage(payload.message || 'If an account exists for that email address, a password reset link has been sent.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not send the password reset email.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col lg:flex-row">
        <section className="relative hidden overflow-hidden px-12 py-16 text-white lg:flex lg:w-1/2 lg:flex-col lg:justify-center">
          <div className="absolute inset-0 bg-gradient-to-br from-sky-900 via-blue-900 to-slate-950" />
          <div className="relative z-10 max-w-md">
            <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/10 shadow-2xl shadow-blue-500/25 backdrop-blur">
              <ShieldCheck className="h-10 w-10" />
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-200">Account Recovery</p>
            <h1 className="mt-4 text-4xl font-bold leading-tight">
              Send a secure password reset link to the registered email.
            </h1>
            <p className="mt-5 text-base leading-7 text-sky-100/90">
              This works for resident and household self-service accounts too. If the account uses Gmail,
              the reset link will be delivered there through your configured mail server.
            </p>
          </div>
        </section>

        <section className="flex w-full items-center justify-center bg-white px-6 py-10 lg:w-1/2">
          <div className="w-full max-w-md">
            <Link
              href="/login"
              className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to login
            </Link>

            <div className="mb-8">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30">
                <Mail className="h-7 w-7" />
              </div>
              <h1 className="text-3xl font-bold text-slate-900">Forgot password?</h1>
              <p className="mt-2 text-sm text-slate-500">
                Enter the account email and we&apos;ll send a secure link to reset the password.
              </p>
            </div>

            {message ? (
              <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
                <div className="flex items-start gap-3 text-emerald-700">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">Check your email</p>
                    <p className="mt-1 text-sm leading-6">
                      {message}
                    </p>
                    {email.trim() && (
                      <p className="mt-2 text-sm leading-6 text-emerald-800">
                        Sent to: <span className="font-semibold">{email.trim()}</span>
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMessage('')}
                  className="inline-flex items-center rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                >
                  Send another link
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                    disabled={isSubmitting}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 transition focus:border-sky-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    placeholder="your@email.com"
                  />
                </div>

                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  {isSubmitting ? 'Sending reset link...' : 'Send reset link'}
                </button>
              </form>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
