'use client';

import { ReactNode, useEffect, useState } from 'react';
import { hydrateSession } from '@/lib/auth';

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
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    hydrateSession()
      .catch(() => null)
      .finally(() => {
        if (!cancelled) {
          setIsReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleRealtimeDataChanged() {
      setDataVersion((value) => value + 1);
    }

    window.addEventListener('mswdo-data-changed', handleRealtimeDataChanged);

    return () => {
      window.removeEventListener('mswdo-data-changed', handleRealtimeDataChanged);
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

  return <div key={dataVersion}>{children}</div>;
}
