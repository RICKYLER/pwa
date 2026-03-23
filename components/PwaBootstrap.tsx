'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Cloud, CloudCheck } from 'lucide-react';
import { flushSyncQueueNow, getPendingSyncCount } from '@/lib/db/client-sync';
import { clearLegacyLocalDatabase } from '@/lib/db/indexeddb';
import { bootstrapCurrentPathData } from '@/lib/supabase/route-bootstrap';

declare global {
  interface WindowEventMap {
    'mswdo-sync-queue-changed': Event;
  }
}

const CACHE_PREFIXES = ['mswdo-pwa-'];

async function unregisterLegacyServiceWorkers() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
  await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
}

async function clearLegacyCaches() {
  if (typeof window === 'undefined' || typeof caches === 'undefined') {
    return;
  }

  const cacheKeys = await caches.keys().catch(() => []);
  await Promise.all(
    cacheKeys
      .filter((cacheName) => CACHE_PREFIXES.some((prefix) => cacheName.startsWith(prefix)))
      .map((cacheName) => caches.delete(cacheName).catch(() => false)),
  );
}

export default function PwaBootstrap() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const isSyncingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setIsOnline(typeof navigator === 'undefined' ? true : navigator.onLine);

    async function refreshPendingCount() {
      const count = await getPendingSyncCount();
      if (!cancelled) {
        setPendingSyncCount(count);
      }
      return count;
    }

    async function runSync() {
      if (isSyncingRef.current || typeof navigator === 'undefined' || navigator.onLine === false) {
        return;
      }

      isSyncingRef.current = true;
      if (!cancelled) {
        setIsSyncing(true);
        setSyncError('');
      }

      try {
        const beforeCount = await getPendingSyncCount();
        const afterCount = await flushSyncQueueNow();
        if (!cancelled) {
          setPendingSyncCount(afterCount);
        }

        if (beforeCount > 0 && afterCount < beforeCount) {
          await bootstrapCurrentPathData(true);
        }

        if (beforeCount > 0 && afterCount >= beforeCount && !cancelled) {
          setSyncError('Some realtime updates are still pending. Please stay online and try again.');
        }
      } catch (error) {
        if (!cancelled) {
          setSyncError(error instanceof Error ? error.message : 'Realtime sync failed.');
        }
      } finally {
        isSyncingRef.current = false;
        if (!cancelled) {
          setIsSyncing(false);
        }
      }
    }

    async function initializeOnlineBridge() {
      await Promise.all([
        unregisterLegacyServiceWorkers(),
        clearLegacyCaches(),
        clearLegacyLocalDatabase(),
      ]);

      await refreshPendingCount();
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        await runSync();
      }
    }

    async function handleQueueChange() {
      const count = await refreshPendingCount();
      if (count > 0 && typeof navigator !== 'undefined' && navigator.onLine) {
        await runSync();
      }
    }

    function handleOnline() {
      setIsOnline(true);
      setSyncError('');
      void runSync();
    }

    function handleOffline() {
      setIsOnline(false);
      setIsSyncing(false);
      setSyncError('Internet connection required for live Supabase data.');
    }

    void initializeOnlineBridge();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('mswdo-sync-queue-changed', handleQueueChange);

    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('mswdo-sync-queue-changed', handleQueueChange);
    };
  }, []);

  if (!isOnline) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-end p-4">
        <div className="pointer-events-auto max-w-sm rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-xl shadow-amber-900/10">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-amber-100 p-2 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-950">Internet Required</p>
              <p className="mt-1 text-sm text-amber-800">
                This app now runs as an online-only realtime Supabase workspace. Reconnect to continue.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isSyncing && pendingSyncCount === 0 && !syncError) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-end p-4">
      <div className="pointer-events-auto max-w-sm rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-xl shadow-slate-900/10 backdrop-blur">
        <div className="flex items-start gap-3">
          <div className={`rounded-xl p-2 ${syncError ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
            {syncError ? <AlertTriangle className="h-4 w-4" /> : isSyncing || pendingSyncCount > 0 ? <Cloud className="h-4 w-4" /> : <CloudCheck className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Realtime Sync Status</p>
            <p className="mt-1 text-sm text-slate-600">
              {syncError
                ? syncError
                : isSyncing
                  ? `Syncing ${pendingSyncCount} pending change${pendingSyncCount === 1 ? '' : 's'} to Supabase`
                  : `${pendingSyncCount} pending change${pendingSyncCount === 1 ? '' : 's'} waiting for realtime sync`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
