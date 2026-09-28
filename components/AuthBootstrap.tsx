'use client';

import { ReactNode, useEffect, useState } from 'react';
import { hydrateSession } from '@/lib/auth';
import { db } from '@/lib/db/indexeddb';
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
      await db.init();
      const user = await hydrateSession().catch(() => null);

      if (!user) {
        await clearSupabaseBootstrapData({
          includeSyncQueue: true,
          notifyTables: false,
        }).catch(() => null);
      }

      const hasCached = db.hasAnyData();

      // If cached data is present, render immediately (0ms) and revalidate in background
      if (user && hasCached) {
        if (!cancelled) {
          setIsReady(true);
        }
        void bootstrapCurrentPathData().catch(() => null);
      } else if (user) {
        // First-time load with no cached data: wait for bootstrap so the UI doesn't flicker
        await bootstrapCurrentPathData().catch(() => null);
        if (!cancelled) {
          setIsReady(true);
        }
      } else {
        if (!cancelled) {
          setIsReady(true);
        }
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
