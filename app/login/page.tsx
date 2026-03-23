'use client';

import { FormEvent, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getDefaultRouteForUser, login, restoreSession } from '@/lib/auth';
import { Eye, EyeOff, ShieldCheck, Cpu, Lock } from 'lucide-react';

const DEMO_USERS = [
  { role: 'Admin', email: 'admin@mswdo.local', password: 'admin123', color: 'from-indigo-500 to-violet-600' },
  { role: 'Encoder', email: 'encoder@barangay.local', password: 'encoder123', color: 'from-blue-500 to-cyan-500' },
  { role: 'Health', email: 'health@barangay.local', password: 'health123', color: 'from-emerald-500 to-teal-500' },
  { role: 'Responder', email: 'responder@drrmo.local', password: 'responder123', color: 'from-orange-500 to-amber-500' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@mswdo.local');
  const [password, setPassword] = useState('admin123');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    const existingUser = restoreSession();
    if (existingUser) router.push(getDefaultRouteForUser(existingUser));
  }, [isMounted, router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const user = await login(email, password);
      router.push(getDefaultRouteForUser(user));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-slate-950">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col items-center justify-center p-12">
        {/* Mesh gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-violet-900 to-slate-900" />
        {/* Animated orbs */}
        <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-indigo-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-500/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-400/10 rounded-full blur-2xl" />
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)', backgroundSize: '48px 48px' }}
        />

        {/* Content */}
        <div className="relative z-10 text-center max-w-sm">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-400 to-violet-600 flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-indigo-500/40">
            <ShieldCheck className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
            MSWDO<br />Census PWA
          </h1>
          <p className="text-indigo-300 text-lg leading-relaxed mb-8">
            Municipal Household Census Management System
          </p>

          <div className="grid grid-cols-2 gap-3 text-left">
            {[
              { icon: Cpu, label: 'Realtime Sync', desc: 'Live Supabase updates' },
              { icon: ShieldCheck, label: 'Secure', desc: 'Role-based access control' },
              { icon: Lock, label: 'Cloud Data', desc: 'Stored in Supabase online' },
              { icon: ShieldCheck, label: 'Official', desc: 'MSWDO compliant reports' },
            ].map(f => (
              <div key={f.label} className="bg-white/5 border border-white/10 rounded-xl p-3 backdrop-blur-sm">
                <f.icon className="w-4 h-4 text-indigo-400 mb-1.5" />
                <p className="text-white text-xs font-semibold">{f.label}</p>
                <p className="text-indigo-300 text-xs">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 bg-white">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-indigo-500/30">
              <ShieldCheck className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">MSWDO Census</h1>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold text-slate-900 mb-1">Welcome back</h2>
            <p className="text-slate-500">Staff and residents can sign in here to continue</p>
          </div>

          {isMounted ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 focus:bg-white transition-all text-sm"
                  placeholder="your@email.com"
                  autoComplete="username"
                  required
                  disabled={isLoading}
                  suppressHydrationWarning
                />
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-12 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 focus:bg-white transition-all text-sm"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    disabled={isLoading}
                    suppressHydrationWarning
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-2">
                  <span className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5">⚠</span>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold rounded-xl hover:opacity-90 disabled:opacity-60 transition-all shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/30 hover:-translate-y-0.5 text-sm"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    Sign In
                  </>
                )}
              </button>

              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900">
                <p className="font-semibold">Resident access</p>
                <p className="mt-1 text-indigo-800">
                  Need your own login to submit and track a household registration?
                </p>
                <Link
                  href="/resident/register"
                  className="mt-3 inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-700"
                >
                  Create resident account
                </Link>
              </div>
            </form>
          ) : (
            <div className="space-y-5">
              <div>
                <div className="mb-1.5 h-5 w-28 rounded bg-slate-100" />
                <div className="h-[50px] animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
              </div>
              <div>
                <div className="mb-1.5 h-5 w-24 rounded bg-slate-100" />
                <div className="h-[50px] animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
              </div>
              <div className="h-[50px] animate-pulse rounded-xl bg-slate-200" />
            </div>
          )}

          {/* Demo credentials */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Quick Login — Demo Accounts
            </p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_USERS.map(u => (
                <button
                  key={u.role}
                  type="button"
                  onClick={() => { setEmail(u.email); setPassword(u.password); }}
                  className={`group relative overflow-hidden flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:border-transparent hover:shadow-md transition-all text-left`}
                >
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${u.color} flex-shrink-0 flex items-center justify-center`}>
                    <span className="text-white text-xs font-bold">{u.role[0]}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700">{u.role}</p>
                    <p className="text-xs text-slate-400 truncate">{u.password}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            Secure cookie session · Staff land on the dashboard, residents land on their portal
          </p>
        </div>
      </div>
    </div>
  );
}
