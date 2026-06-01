'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
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
  FileText,
  Lock,
  Mail,
  ShieldCheck,
  X,
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
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [dataPrivacyAccepted, setDataPrivacyAccepted] = useState(false);
  const [activeModal, setActiveModal] = useState<'terms' | 'privacy' | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const existingUser = restoreSession();
    if (existingUser) {
      router.push(getDefaultRouteForUser(existingUser));
    }
  }, [router]);

  useEffect(() => {
    if (!activeModal) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveModal(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeModal]);

  useEffect(() => {
    if (!activeModal) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      modalRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeModal]);

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

    if (!dataPrivacyAccepted) {
      setError('Please agree to the Data Privacy Notice before creating an account.');
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
          consentToDataPrivacy: dataPrivacyAccepted,
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

  function openModal(type: 'terms' | 'privacy') {
    setActiveModal(type);
  }

  function acceptActiveModal() {
    if (activeModal === 'terms') {
      setTermsAccepted(true);
    }

    if (activeModal === 'privacy') {
      setDataPrivacyAccepted(true);
    }

    setActiveModal(null);
  }

  function renderModalContent() {
    if (!activeModal) {
      return null;
    }

    const isTerms = activeModal === 'terms';

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-modal-title"
        aria-describedby="consent-modal-description"
        ref={modalRef}
        tabIndex={-1}
        className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 outline-none"
      >
        <button
          type="button"
          aria-label="Close modal overlay"
          className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-sm"
          onClick={() => setActiveModal(null)}
        />

        <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-[24px] border border-white/80 bg-white shadow-[0_30px_80px_-36px_rgba(15,23,42,0.55)]">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <FileText className="h-4 w-4 text-blue-700" />
                {isTerms ? 'Terms & Conditions' : 'Privacy Policy'}
              </div>
              <h2 id="consent-modal-title" className="mt-3 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                {isTerms ? 'Terms & Conditions' : 'Privacy Policy'}
              </h2>
              <p id="consent-modal-description" className="mt-1 text-sm leading-6 text-slate-600">
                {isTerms
                  ? 'Please review the responsibilities, security expectations, and proper use rules before accepting.'
                  : 'Please review how your information is collected, processed, stored, and protected before accepting.'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveModal(null)}
              aria-label="Close modal"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto px-5 py-5 sm:px-6">
            {isTerms ? (
              <div className="space-y-4 text-sm leading-6 text-slate-700">
                <section>
                  <h3 className="font-semibold text-slate-950">User Responsibilities</h3>
                  <p className="mt-1">
                    You agree to provide accurate information, keep your account details updated, and use the system
                    responsibly for legitimate resident services only.
                  </p>
                </section>
                <section>
                  <h3 className="font-semibold text-slate-950">Account Security</h3>
                  <p className="mt-1">
                    You are responsible for safeguarding your password, avoiding credential sharing, and notifying
                    authorized personnel if you suspect unauthorized access.
                  </p>
                </section>
                <section>
                  <h3 className="font-semibold text-slate-950">Proper System Usage</h3>
                  <p className="mt-1">
                    The system must not be used for unlawful activity, fraudulent submissions, abusive behavior, or any
                    action that could disrupt service or compromise records.
                  </p>
                </section>
                <section>
                  <h3 className="font-semibold text-slate-950">Data Handling</h3>
                  <p className="mt-1">
                    By using the system, you acknowledge that submitted data may be processed for account registration,
                    resident profiling, household records, notifications, and related government services.
                  </p>
                </section>
                <section>
                  <h3 className="font-semibold text-slate-950">Liability Disclaimer</h3>
                  <p className="mt-1">
                    The system is provided for administrative and public service use. We are not liable for losses
                    arising from incorrect user input, unauthorized access caused by shared credentials, or misuse of the
                    platform.
                  </p>
                </section>
              </div>
            ) : (
              <div className="space-y-4 text-sm leading-6 text-slate-700">
                <section>
                  <h3 className="font-semibold text-slate-950">Data Collection</h3>
                  <p className="mt-1">
                    We may collect your full name, email address, contact number, address or household information,
                    profile information, account credentials, and other details you provide while using the system.
                  </p>
                </section>
                <section>
                  <h3 className="font-semibold text-slate-950">Data Processing</h3>
                  <p className="mt-1">
                    Your information is processed for account registration and authentication, household profiling and
                    record management, relief distribution and monitoring, system notifications and reporting, and
                    service improvement.
                  </p>
                </section>
                <section>
                  <h3 className="font-semibold text-slate-950">Data Storage</h3>
                  <p className="mt-1">
                    Your information is stored securely using protected systems and is accessible only to authorized
                    personnel for official processing and record keeping.
                  </p>
                </section>
                <section>
                  <h3 className="font-semibold text-slate-950">User Rights</h3>
                  <p className="mt-1">
                    You have the right to access your data, correct inaccurate information, request deletion when
                    applicable, withdraw consent, and raise privacy concerns.
                  </p>
                </section>
                <section>
                  <h3 className="font-semibold text-slate-950">RA 10173 Compliance</h3>
                  <p className="mt-1">
                    In compliance with Republic Act No. 10173, also known as the Data Privacy Act of 2012, we are
                    committed to protecting your personal information and handling it with lawful, fair, and transparent
                    processing.
                  </p>
                </section>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <button
              type="button"
              onClick={() => setActiveModal(null)}
              className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={acceptActiveModal}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
            >
              <BadgeCheck className="h-4 w-4" />
              Accept
            </button>
          </div>
        </div>
      </div>
    );
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

        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
            <input
              id="terms-accepted"
              type="checkbox"
              checked={termsAccepted}
              onChange={(event) => {
                if (event.target.checked) {
                  if (!termsAccepted) {
                    openModal('terms');
                  }
                  return;
                }

                setTermsAccepted(false);
              }}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-900 focus:ring-2 focus:ring-blue-700/20"
            />
            <div className="leading-6">
              <label htmlFor="terms-accepted" className="cursor-pointer">
                I agree to the
              </label>{' '}
              <button
                type="button"
                onClick={() => openModal('terms')}
                className="font-semibold text-blue-700 underline decoration-blue-200 underline-offset-2 transition hover:text-blue-900"
              >
                Terms &amp; Conditions
              </button>{' '}
              <span className="text-xs uppercase tracking-[0.16em] text-slate-500">(Optional)</span>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
            <input
              id="privacy-accepted"
              type="checkbox"
              checked={dataPrivacyAccepted}
              onChange={(event) => {
                if (event.target.checked) {
                  if (!dataPrivacyAccepted) {
                    openModal('privacy');
                  }
                  return;
                }

                setDataPrivacyAccepted(false);
              }}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-900 focus:ring-2 focus:ring-blue-700/20"
            />
            <div className="leading-6">
              <label htmlFor="privacy-accepted" className="cursor-pointer">
                I have read and agree to the{' '}
              </label>
              <button
                type="button"
                onClick={() => openModal('privacy')}
                className="font-semibold text-blue-700 underline decoration-blue-200 underline-offset-2 transition hover:text-blue-900"
              >
                Privacy Policy
              </button>
              .
            </div>
          </div>

          <p className="px-1 text-xs text-slate-500">
            Click the blue text links to review each policy before you continue.
          </p>
        </div>

        {error ? (
          <div className="flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting || !dataPrivacyAccepted}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-blue-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Creating account...' : 'Create account and send verification'}
        </button>
      </form>

      {renderModalContent()}

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
