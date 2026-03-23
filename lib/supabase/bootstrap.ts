import { db, STORE_NAMES } from '@/lib/db/indexeddb';
import {
  mapSupabaseRow,
  SUPABASE_BOOTSTRAP_TABLES,
  type SupabaseBootstrapTable,
} from '@/lib/supabase/row-mapper';

type BootstrapPayload = Partial<Record<SupabaseBootstrapTable, unknown[]>>;

let bootstrapPromise: Promise<void> | null = null;

function notifyBootstrapTableChanged(table: SupabaseBootstrapTable, mode: 'hydrate' | 'change' = 'hydrate') {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent('mswdo-data-changed', {
    detail: {
      source: 'supabase',
      table,
      mode,
    },
  }));
}

export async function clearSupabaseBootstrapData(options?: {
  includeSyncQueue?: boolean;
  notifyTables?: boolean;
}): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  await db.init();

  for (const tableConfig of SUPABASE_BOOTSTRAP_TABLES) {
    await db.clear(tableConfig.storeName);
    if (options?.notifyTables !== false) {
      notifyBootstrapTableChanged(tableConfig.table, 'hydrate');
    }
  }

  if (options?.includeSyncQueue) {
    await db.clear(STORE_NAMES.sync_queue);
  }
}

export async function bootstrapAllDataFromSupabase(force = false): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  if (!force && bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    const response = await fetch('/api/supabase/bootstrap', {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
      },
    }).catch(() => null);

    if (!response) {
      return;
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status === 503) {
        return;
      }

      const payload = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(payload?.error || `Supabase bootstrap failed with status ${response.status}`);
    }

    const payload = await response.json().catch(() => null) as BootstrapPayload | null;
    if (!payload) {
      return;
    }

    await clearSupabaseBootstrapData({ notifyTables: false });

    for (const tableConfig of SUPABASE_BOOTSTRAP_TABLES) {
      const rows = payload[tableConfig.table];
      if (Array.isArray(rows)) {
        await Promise.all(
          rows
            .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
            .map((row) => db.put(
              tableConfig.storeName,
              mapSupabaseRow(tableConfig.table, row),
            )),
        );
      }

      notifyBootstrapTableChanged(tableConfig.table, 'hydrate');
    }
  })()
    .catch((error) => {
      console.warn('Supabase full bootstrap failed:', error);
    })
    .finally(() => {
      bootstrapPromise = null;
    });

  return bootstrapPromise;
}
