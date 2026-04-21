'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CivicAuthShell, { type CivicAuthFeature, type CivicAuthStat } from '@/components/auth/CivicAuthShell';
import { getDefaultRouteForUser, restoreSession } from '@/lib/auth';
import { BARANGAY_OPTIONS } from '@/lib/barangays';
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  Eye,
  EyeOff,
  FileCheck2,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from 'lucide-react';

const REGISTER_FEATURES: CivicAuthFeature[] = [
  {
    icon: User,
    label: 'Resident account',
    description: 'Create your own resident login for household registration and status tracking.',
  },
  {
    icon: Mail,
    label: 'Email verification',
    description: 'You must verify your email address before this resident account can sign in.',
  },
  {
    icon: FileCheck2,
    label: 'Registration status',
    description: 'After signing in, you can submit a household registration and check its review status online.',
  },
  {
    icon: ShieldCheck,
    label: 'Resident-only history',
    description: 'Your resident account is limited to your own registration records and updates.',
  },
];

const REGISTER_STATS: CivicAuthStat[] = [
  { value: '01', label: 'create account', description: 'Enter your full name, email address, and password.' },
  { value: '02', label: 'verify email', description: 'Open the verification email and confirm your address.' },
  { value: '03', label: 'sign in', description: 'Sign in and start your household registration.' },
];

export default function ResidentRegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    email: '',
    barangay_id: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const existingUser = restoreSession();
    if (existingUser) {
      router.push(getDefaultRouteForUser(existingUser));
    }
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!form.barangay_id) {
      setError('Select your barangay.');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          barangay_id: form.barangay_id,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Could not create the resident account.');
      }

      const searchParams = new URLSearchParams({
        email: form.email.trim(),
        sent: payload.verificationEmailSent ? '1' : '0',
      });
      router.push(`/resident/verify-email?${searchParams.toString()}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not create the resident account.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <CivicAuthShell
      heroEyebrow="Resident self-service"
      heroTitle="Create your resident account."
      heroDescription="Create your resident login, verify your email address, then sign in to submit a household registration and check its review status."
      heroBadge="Resident household registration"
      heroFootnote={`Choose your barangay from the official list of ${BARANGAY_OPTIONS.length} barangays.`}
      panelEyebrow="Resident registration"
      panelTitle="Create resident account"
      panelDescription="Create your resident login, select your barangay, then verify your email before signing in."
      panelAside={
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
          <BadgeCheck className="h-4 w-4" />
          Email verification required
        </div>
      }
      features={REGISTER_FEATURES}
      stats={REGISTER_STATS}
    >
      <div className="mb-5 rounded-md border border-blue-100 bg-blue-50 px-4 py-4 shadow-sm">
        <p className="text-sm font-semibold text-blue-900">Before you continue</p>
        <p className="mt-1 text-sm leading-5 text-slate-600">
          Use an email address you can access right now. We will send the verification link there, and this account cannot sign in until that step is complete.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Full name
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="name"
                type="text"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                required
                className="h-12 w-full rounded-md border border-slate-300 bg-white py-2 pl-11 pr-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20"
                placeholder="Enter your full name"
                autoComplete="name"
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Email address
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                required
                className="h-12 w-full rounded-md border border-slate-300 bg-white py-2 pl-11 pr-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <label htmlFor="barangay_id" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Barangay
            </label>
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                id="barangay_id"
                value={form.barangay_id}
                onChange={(event) => setForm((current) => ({ ...current, barangay_id: event.target.value }))}
                required
                className="h-12 w-full appearance-none rounded-md border border-slate-300 bg-white py-2 pl-11 pr-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20"
              >
                <option value="">Select barangay</option>
                {BARANGAY_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                required
                className="h-12 w-full rounded-md border border-slate-300 bg-white py-2 pl-11 pr-12 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20"
                placeholder="Minimum 8 characters"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Confirm password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                required
                className="h-12 w-full rounded-md border border-slate-300 bg-white py-2 pl-11 pr-12 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20"
                placeholder="Re-enter your password"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((current) => !current)}
                className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600 sm:text-sm">
          Passwords should be at least 8 characters long and easy for you to remember securely.
        </div>

        {error ? (
          <div className="flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-blue-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Creating account...' : 'Create account and send verification'}
        </button>
      </form>

      <div className="mt-4 text-center text-sm text-slate-600">
        Already have a resident account?
        {' '}
        <Link href="/login" className="font-semibold text-blue-700 transition hover:text-blue-900">
          Sign in here
        </Link>
      </div>
    </CivicAuthShell>
  );
}
