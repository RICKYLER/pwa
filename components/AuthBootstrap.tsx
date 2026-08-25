'use client';

import { ReactNode, useEffect, useState } from 'react';
import { hydrateSession } from '@/lib/auth';
import SupabaseRealtimeBridge from '@/components/SupabaseRealtimeBridge';
import { clearSupabaseBootstrapData } from '@/lib/supabase/bootstrap';
import { bootstrapCurrentPathData } from '@/lib/supabase/route-bootstrap';
import BrandLoader from '@/components/BrandLoader';

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

      // Bootstrap first so IndexedDB is populated before child pages render.
      // This prevents pages from briefly seeing empty records and showing
      // prompts (e.g. "Household Registration Needed") for already-registered residents.
      if (user) {
        await bootstrapCurrentPathData().catch(() => null);
      }

      if (!cancelled) {
        setIsReady(true);
      }
    }

    void initializeAuthState();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!isReady) {
    return <BrandLoader />;
  }

  return (
    <>
      <SupabaseRealtimeBridge />
      {children}
    </>
  );
}
