'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db/indexeddb';
import { getSupabaseBrowserClient, getSupabaseBrowserConfig } from '@/lib/supabase/client';
import { getRealtimeTopicsForUser } from '@/lib/supabase/realtime-topics';
import {
  mapSupabaseRow,
  SUPABASE_BOOTSTRAP_TABLES,
} from '@/lib/supabase/row-mapper';
import { bootstrapPathnameData } from '@/lib/supabase/route-bootstrap';

declare global {
  interface WindowEventMap {
    'mswdo-data-changed': CustomEvent<{
      source: 'supabase';
      table: string;
      mode: 'hydrate' | 'change';
    }>;
  }
}

function notifyDataChanged(table: string, mode: 'hydrate' | 'change') {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new CustomEvent('mswdo-data-changed', {
    detail: {
      source: 'supabase',
      table,
      mode,
    },
  }));
}

type BroadcastDbChangePayload = {
  id?: string;
  table?: string;
  schema?: string;
  operation?: 'INSERT' | 'UPDATE' | 'DELETE';
  record?: Record<string, unknown> | null;
  old_record?: Record<string, unknown> | null;
};

async function applyBroadcastPayload(payload: BroadcastDbChangePayload) {
  const tableName = typeof payload.table === 'string' ? payload.table : '';
  const tableConfig = SUPABASE_BOOTSTRAP_TABLES.find((entry) => entry.table === tableName);
  if (!tableConfig) {
    return null;
  }

  if (payload.operation === 'DELETE') {
    const deletedId =
      typeof payload.old_record?.id === 'string'
        ? payload.old_record.id
        : typeof payload.id === 'string'
          ? payload.id
          : null;

    if (deletedId) {
      await db.deleteSilently(tableConfig.storeName, deletedId);
    }

    return tableConfig.table;
  }

  if (payload.record && typeof payload.record === 'object') {
    await db.put(
      tableConfig.storeName,
      mapSupabaseRow(tableConfig.table, payload.record),
    );
    return tableConfig.table;
  }

  return null;
}

export default function SupabaseRealtimeBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const { isConfigured, url } = getSupabaseBrowserConfig();
    const supabase = getSupabaseBrowserClient();

    if (!isConfigured || !supabase || !url) {
      return;
    }

    const supabaseClient = supabase;
    let cancelled = false;
    let channels: RealtimeChannel[] = [];
    let activeRunId = 0;
    const failedTopics = new Set<string>();

    async function disconnectChannel() {
      if (channels.length === 0) {
        return;
      }

      const currentChannels = channels;
      channels = [];
      await Promise.all(currentChannels.map((channel) => supabaseClient.removeChannel(channel)));
    }

    async function start(sessionOverride?: Session | null) {
      const runId = ++activeRunId;
      failedTopics.clear();
      const session =
        sessionOverride === undefined
          ? (await supabaseClient.auth.getSession()).data.session
          : sessionOverride;

      if (cancelled || runId !== activeRunId) return;

      if (!session) {
        await disconnectChannel();
        await supabaseClient.realtime.setAuth();
        return;
      }

      await disconnectChannel();
      await supabaseClient.realtime.setAuth(session.access_token);
      await bootstrapPathnameData(pathname);

      if (cancelled || runId !== activeRunId) return;

      const currentUser = getCurrentUser();
      const realtimeTopics = getRealtimeTopicsForUser(currentUser);

      channels = realtimeTopics.map((topic) => {
        const handleBroadcastMessage = async (message: { payload?: BroadcastDbChangePayload | null }) => {
          if (cancelled) return;

          try {
            const changedTable = await applyBroadcastPayload(
              (message?.payload ?? null) as BroadcastDbChangePayload,
            );

            if (changedTable) {
              notifyDataChanged(changedTable, 'change');
            }
          } catch (error) {
            console.error(`[Supabase Realtime] Failed to apply broadcast from ${topic}:`, error);
          }
        };

        const channel = supabaseClient
          .channel(topic, {
            config: {
              private: true,
            },
          })
          .on('broadcast', { event: 'INSERT' }, handleBroadcastMessage)
          .on('broadcast', { event: 'UPDATE' }, handleBroadcastMessage)
          .on('broadcast', { event: 'DELETE' }, handleBroadcastMessage);

        channel.subscribe((status, error) => {
          if (status === 'SUBSCRIBED') {
            failedTopics.delete(topic);
            return;
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            if (failedTopics.has(topic)) {
              return;
            }

            failedTopics.add(topic);
            console.warn(
              `[Supabase Realtime] Channel ${topic} issue detected. Automatic bootstrap fallback is disabled; data will refresh on direct transactions or successful realtime events.`,
              error,
            );
          }
        });

        return channel;
      });
    }

    function handleWindowFocus() {
      if (cancelled) {
        return;
      }

      void bootstrapPathnameData(pathname);
    }

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (cancelled) {
        return;
      }

      void start(session);
    });

    void start();
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      cancelled = true;
      activeRunId += 1;
      subscription.unsubscribe();
      window.removeEventListener('focus', handleWindowFocus);
      void disconnectChannel();
    };
  }, [pathname]);

  return null;
}
