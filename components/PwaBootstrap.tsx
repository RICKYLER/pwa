'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Cloud, CloudCheck, Download, WifiOff } from 'lucide-react';
import { flushSyncQueueNow, getPendingSyncCount } from '@/lib/db/client-sync';

const SYNC_TAG = 'mswdo-sync-queue';
const DISMISS_INSTALL_KEY = 'mswdo.pwa.install-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    'mswdo-sync-queue-changed': Event;
  }

  interface Navigator {
    standalone?: boolean;
  }

  interface ServiceWorkerRegistration {
    sync?: {
      register: (tag: string) => Promise<void>;
    };
  }
}

function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

async function triggerBackgroundSync(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }

  const registration = await navigator.serviceWorker.ready;
  if (registration.sync) {
    try {
      await registration.sync.register(SYNC_TAG);
    } catch (error) {
      console.error('Background sync registration failed:', error);
    }
  }

  registration.active?.postMessage({ type: 'FLUSH_SYNC_QUEUE' });
  return true;
}

export default function PwaBootstrap() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(true);
  const [isStandalone, setIsStandalone] = useState(false);
  const isSyncingRef = useRef(false);

  const showSyncBanner = !isOnline || pendingSyncCount > 0 || isSyncing;
  const showInstallCard = Boolean(installPromptEvent) && !installDismissed && !isStandalone;

  const syncLabel = useMemo(() => {
    if (!isOnline) {
      return pendingSyncCount > 0
        ? `${pendingSyncCount} change${pendingSyncCount === 1 ? '' : 's'} waiting for reconnection`
        : 'Offline mode with cached pages available';
    }

    if (isSyncing) {
      return pendingSyncCount > 0
        ? `Backing up ${pendingSyncCount} pending change${pendingSyncCount === 1 ? '' : 's'}`
        : 'Checking queued field changes';
    }

    return `${pendingSyncCount} pending change${pendingSyncCount === 1 ? '' : 's'} ready to back up`;
  }, [isOnline, isSyncing, pendingSyncCount]);

  useEffect(() => {
    const dismissed = typeof window !== 'undefined' && window.localStorage.getItem(DISMISS_INSTALL_KEY) === '1';
    setInstallDismissed(dismissed);
    setIsOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    setIsStandalone(isStandaloneMode());

    let cancelled = false;

    async function refreshPendingCount() {
      const count = await getPendingSyncCount();
      if (!cancelled) {
        setPendingSyncCount(count);
      }
    }

    async function runSync(options?: { preferDirect?: boolean }) {
      if (isSyncingRef.current) {
        return;
      }

      isSyncingRef.current = true;
      if (!cancelled) {
        setIsSyncing(true);
      }

      try {
        if (navigator.onLine && options?.preferDirect !== false) {
          const pendingCount = await flushSyncQueueNow();
          if (!cancelled) {
            setPendingSyncCount(pendingCount);
          }

          if (pendingCount > 0) {
            await triggerBackgroundSync();
          }
          return;
        }

        const started = await triggerBackgroundSync();
        if (!started) {
          await refreshPendingCount();
        }
      } finally {
        isSyncingRef.current = false;
        if (!cancelled) {
          setIsSyncing(false);
        }
      }
    }

    async function registerServiceWorker() {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
        return;
      }

      if (!window.isSecureContext && window.location.hostname !== 'localhost') {
        return;
      }

      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      } catch (error) {
        console.error('Service worker registration failed:', error);
      }
    }

    function handleSyncMessage(event: MessageEvent) {
      if (event.data?.type === 'MSWDO_SYNC_STATUS') {
        setPendingSyncCount(typeof event.data.pendingCount === 'number' ? event.data.pendingCount : 0);
        setIsSyncing(false);
      }
    }

    function handleInstallPrompt(event: BeforeInstallPromptEvent) {
      event.preventDefault();
      setInstallPromptEvent(event);
      setInstallDismissed(false);
    }

    function handleAppInstalled() {
      setInstallPromptEvent(null);
      setInstallDismissed(true);
      setIsStandalone(true);
      window.localStorage.setItem(DISMISS_INSTALL_KEY, '1');
    }

    async function handleQueueChange() {
      await refreshPendingCount();
      if (navigator.onLine) {
        await runSync();
      }
    }

    function handleOnline() {
      setIsOnline(true);
      void runSync();
    }

    function handleOffline() {
      setIsOnline(false);
      setIsSyncing(false);
    }

    void registerServiceWorker();
    void refreshPendingCount();
    if (navigator.onLine) {
      void runSync();
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('mswdo-sync-queue-changed', handleQueueChange);
    navigator.serviceWorker?.addEventListener('message', handleSyncMessage);

    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('mswdo-sync-queue-changed', handleQueueChange);
      navigator.serviceWorker?.removeEventListener('message', handleSyncMessage);
    };
  }, []);

  async function handleInstall() {
    if (!installPromptEvent) {
      return;
    }

    await installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;
    if (choice.outcome === 'dismissed') {
      window.localStorage.setItem(DISMISS_INSTALL_KEY, '1');
      setInstallDismissed(true);
    }

    setInstallPromptEvent(null);
  }

  function handleDismissInstall() {
    window.localStorage.setItem(DISMISS_INSTALL_KEY, '1');
    setInstallDismissed(true);
    setInstallPromptEvent(null);
  }

  async function handleSyncNow() {
    if (isSyncingRef.current) {
      return;
    }

    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      const pendingCount = await flushSyncQueueNow();
      setPendingSyncCount(pendingCount);

      if (pendingCount > 0) {
        await triggerBackgroundSync();
      }
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-end p-4">
      <div className="flex max-w-sm flex-col gap-3">
        {showSyncBanner ? (
          <div className="pointer-events-auto rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-xl shadow-slate-900/10 backdrop-blur">
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 rounded-xl p-2 ${isOnline ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                {isOnline ? (
                  pendingSyncCount > 0 || isSyncing ? <Cloud className="h-4 w-4" /> : <CloudCheck className="h-4 w-4" />
                ) : (
                  <WifiOff className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  {isOnline ? 'Field Sync Status' : 'Offline Mode Active'}
                </p>
                <p className="mt-1 text-sm text-slate-600">{syncLabel}</p>
                {!isOnline ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Local changes stay on the device and the background worker will back them up once service returns.
                  </p>
                ) : null}
                {isOnline && pendingSyncCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => void handleSyncNow()}
                    className="mt-3 inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                  >
                    {isSyncing ? 'Syncing...' : 'Sync Now'}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {showInstallCard ? (
          <div className="pointer-events-auto rounded-2xl border border-indigo-200 bg-gradient-to-br from-white to-indigo-50 p-4 shadow-xl shadow-indigo-900/10">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-indigo-600 p-2 text-white">
                <Download className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">Install the field app</p>
                <p className="mt-1 text-sm text-slate-600">
                  Save MSWDO Census to the home screen for faster launch, offline shell caching, and background sync.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleInstall()}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
                  >
                    Install
                  </button>
                  <button
                    type="button"
                    onClick={handleDismissInstall}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Later
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
