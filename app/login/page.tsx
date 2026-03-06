'use client';

import { FormEvent, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { login, restoreSession } from '@/lib/auth';
import { db, seedInitialData } from '@/lib/db/indexeddb';
import { Lock, Mail } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@mswdo.local');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Check for existing session on mount
  useEffect(() => {
    const existingUser = restoreSession();
    if (existingUser) {
      router.push('/dashboard');
    }
  }, [router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Initialize database and seed data on first login
      await db.init();
      await seedInitialData();

      // Attempt login
      await login(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      console.error('[v0] Login error:', err);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-2xl mb-4">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-2">MSWDO Census</h1>
          <p className="text-muted-foreground">Household Management System</p>
        </div>

        {/* Login Card */}
        <div className="bg-card border border-border rounded-2xl shadow-xl p-8" suppressHydrationWarning>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-foreground mb-2.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 border border-input rounded-lg bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="your@email.com"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-foreground mb-2.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 border border-input rounded-lg bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="••••••••"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-destructive/10 border border-destructive/50 text-destructive px-4 py-3 rounded-lg text-sm font-medium">
                {error}
              </div>
            )}

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-4 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all mt-6 shadow-lg hover:shadow-xl"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        {/* Demo Credentials */}
        <div className="mt-8 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Demo Credentials</p>
          <div className="grid gap-2">
            {[
              { role: 'Admin', email: 'admin@mswdo.local', pwd: 'admin123' },
              { role: 'Encoder', email: 'encoder@barangay.local', pwd: 'encoder123' },
              { role: 'Health Worker', email: 'health@barangay.local', pwd: 'health123' },
              { role: 'Responder', email: 'responder@drrmo.local', pwd: 'responder123' },
            ].map((cred) => (
              <div key={cred.email} className="bg-muted/50 rounded-lg p-3 border border-border/50">
                <p className="text-xs font-semibold text-foreground">{cred.role}</p>
                <p className="text-xs text-muted-foreground">{cred.email} / {cred.pwd}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-muted-foreground text-xs mt-8">
          Offline-first PWA for municipal household census management
        </p>
      </div>
    </div>
  );
}
