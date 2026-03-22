'use client';

import { useEffect } from 'react';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { db, STORE_NAMES } from '@/lib/db/indexeddb';
import { getSupabaseBrowserClient, getSupabaseBrowserConfig } from '@/lib/supabase/client';

type StoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES];

type TableConfig = {
  table: string;
  storeName: StoreName;
};

const TABLE_CONFIGS: TableConfig[] = [
  { table: 'households', storeName: STORE_NAMES.households },
  { table: 'residents', storeName: STORE_NAMES.residents },
  { table: 'vulnerability_flags', storeName: STORE_NAMES.vulnerability_flags },
  { table: 'inventory_items', storeName: STORE_NAMES.inventory_items },
  { table: 'inventory_movements', storeName: STORE_NAMES.inventory_movements },
  { table: 'package_templates', storeName: STORE_NAMES.package_templates },
  { table: 'distribution_events', storeName: STORE_NAMES.distribution_events },
  { table: 'distribution_records', storeName: STORE_NAMES.distribution_records },
  { table: 'incidents', storeName: STORE_NAMES.incidents },
  { table: 'location_master_lists', storeName: STORE_NAMES.location_master_lists },
  { table: 'programs', storeName: STORE_NAMES.programs },
  { table: 'beneficiaries', storeName: STORE_NAMES.beneficiaries },
];

declare global {
  interface WindowEventMap {
    'mswdo-data-changed': CustomEvent<{
      source: 'supabase';
      table: string;
      mode: 'hydrate' | 'change';
    }>;
  }
}

function mapSupabaseRow(table: string, row: Record<string, unknown>) {
  const {
    created_at,
    updated_at,
    updated_by,
    sync_status: _syncStatus,
    ...base
  } = row;

  switch (table) {
    case 'households':
      return {
        ...base,
        createdAt: created_at,
        updatedAt: updated_at,
        syncStatus: 'synced' as const,
      };
    case 'residents':
      return {
        ...base,
        createdAt: created_at,
        updatedAt: updated_at,
        syncStatus: 'synced' as const,
      };
    case 'vulnerability_flags':
      return {
        ...base,
        updatedAt: updated_at,
        syncStatus: 'synced' as const,
      };
    case 'programs':
      return {
        ...base,
        createdAt: created_at,
      };
    case 'beneficiaries':
      return {
        ...base,
        enrollment_date:
          typeof base.enrollment_date === 'string'
            ? new Date(`${base.enrollment_date}T00:00:00.000Z`)
            : base.enrollment_date,
        syncStatus: 'synced' as const,
      };
    case 'package_templates':
      return {
        ...base,
        createdAt: created_at,
        updatedAt: updated_at,
        syncStatus: 'synced' as const,
      };
    case 'location_master_lists':
      return {
        ...base,
        updatedAt: updated_at,
        updatedBy: typeof updated_by === 'string' ? updated_by : undefined,
      };
    default:
      return {
        ...base,
        syncStatus: 'synced' as const,
      };
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

async function hydrateTable(tableName: string, tableConfig: TableConfig) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(tableConfig.table)
    .select('*');

  if (error) {
    console.warn(`[Supabase Realtime] Could not hydrate ${tableConfig.table}:`, error.message);
    return null;
  }

  if (!Array.isArray(data) || data.length === 0) {
    return 0;
  }

  await Promise.all(
    data.map((row) => db.put(
      tableConfig.storeName,
      mapSupabaseRow(tableConfig.table, row as Record<string, unknown>),
    )),
  );

  notifyDataChanged(tableName, 'hydrate');
  return data.length;
}

async function applyRealtimePayload(payload: RealtimePostgresChangesPayload<Record<string, unknown>>, tableConfig: TableConfig) {
  if (payload.eventType === 'DELETE') {
    const deletedId = typeof payload.old?.id === 'string' ? payload.old.id : null;
    if (deletedId) {
      await db.deleteSilently(tableConfig.storeName, deletedId);
    }
    return;
  }

  if (payload.new && typeof payload.new === 'object') {
    await db.put(
      tableConfig.storeName,
      mapSupabaseRow(tableConfig.table, payload.new),
    );
  }
}

export default function SupabaseRealtimeBridge() {
  useEffect(() => {
    const { isConfigured, url } = getSupabaseBrowserConfig();
    const supabase = getSupabaseBrowserClient();

    if (!isConfigured || !supabase || !url) {
      return;
    }

    const supabaseClient = supabase;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    async function start() {
      await db.init();
      let visibleRows = 0;

      for (const tableConfig of TABLE_CONFIGS) {
        if (cancelled) return;
        const hydratedRowCount = await hydrateTable(tableConfig.table, tableConfig);
        if (typeof hydratedRowCount === 'number') {
          visibleRows += hydratedRowCount;
        }
      }

      if (!cancelled && visibleRows === 0) {
        console.warn(
          '[Supabase Realtime] Connected, but no readable rows were returned. If you expected data here, check your table RLS policies or sign in with Supabase auth.',
        );
      }

      if (cancelled) return;

      channel = supabaseClient.channel('mswdo-db-realtime');

      TABLE_CONFIGS.forEach((tableConfig) => {
        channel = channel?.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: tableConfig.table },
          async (payload) => {
            if (cancelled) return;

            try {
              await applyRealtimePayload(payload, tableConfig);
              notifyDataChanged(tableConfig.table, 'change');
            } catch (error) {
              console.error(`[Supabase Realtime] Failed to apply ${tableConfig.table} change:`, error);
            }
          },
        ) ?? null;
      });

      channel?.subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[Supabase Realtime] Channel error. Check env vars and table RLS/select policies.');
        }
      });
    }

    void start();

    return () => {
      cancelled = true;
      if (channel) {
        void supabaseClient.removeChannel(channel);
      }
    };
  }, []);

  return null;
}
