'use client';

import { ReactNode, useEffect, useState } from 'react';
import { hydrateSession } from '@/lib/auth';
import SupabaseRealtimeBridge from '@/components/SupabaseRealtimeBridge';
import { clearSupabaseBootstrapData } from '@/lib/supabase/bootstrap';
import { bootstrapCurrentPathData } from '@/lib/supabase/route-bootstrap';

declare global {
  interface WindowEventMap {
    'mswdo-data-changed': CustomEvent<{
      source: 'supabase';
      table: string;
      mode: 'hydrate' | 'change';
    }>;
  }
}

export default function AuthBootstrap({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function initializeAuthState() {
      const user = await hydrateSession().catch(() => null);

      if (!user) {
        await clearSupabaseBootstrapData({
          includeSyncQueue: true,
          notifyTables: false,
        }).catch(() => null);
      }

      if (!cancelled) {
        setIsReady(true);
      }

      if (user) {
        void bootstrapCurrentPathData();
      }
    }

    void initializeAuthState();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
          <p className="text-sm font-medium text-slate-600">Loading secure session...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <SupabaseRealtimeBridge />
      {children}
    </>
  );
}
