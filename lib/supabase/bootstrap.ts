import { db, STORE_NAMES } from '@/lib/db/indexeddb';
import {
  mapSupabaseRow,
  SUPABASE_BOOTSTRAP_TABLES,
  type SupabaseBootstrapTable,
} from '@/lib/supabase/row-mapper';

type BootstrapPayload = Partial<Record<SupabaseBootstrapTable, unknown[]>>;

const bootstrapPromises = new Map<string, Promise<void>>();
const hydratedBootstrapKeys = new Set<string>();
const SUPABASE_BOOTSTRAP_TIMEOUT_MS = 15_000;
const FULL_BOOTSTRAP_TABLES = SUPABASE_BOOTSTRAP_TABLES.map((entry) => entry.table);
const FORCE_BOOTSTRAP_COOLDOWN_MS = 900;
const lastBootstrapStartedAt = new Map<string, number>();

function normalizeRequestedTables(tables: SupabaseBootstrapTable[]) {
  const validTables = new Set(FULL_BOOTSTRAP_TABLES);
  return [...new Set(tables.filter((table) => validTables.has(table)))];
}

function getRequestedTableConfigs(tables?: SupabaseBootstrapTable[]) {
  if (!tables?.length) {
    return SUPABASE_BOOTSTRAP_TABLES;
  }

  const requested = new Set(normalizeRequestedTables(tables));
  return SUPABASE_BOOTSTRAP_TABLES.filter((entry) => requested.has(entry.table));
}

function getBootstrapKey(tables?: SupabaseBootstrapTable[]) {
  return tables?.length ? normalizeRequestedTables(tables).join(',') : FULL_BOOTSTRAP_TABLES.join(',');
}

function clearHydratedBootstrapKeys(tables?: SupabaseBootstrapTable[]) {
  if (!tables?.length) {
    hydratedBootstrapKeys.clear();
    return;
  }

  const requestedTables = new Set(normalizeRequestedTables(tables));
  for (const bootstrapKey of [...hydratedBootstrapKeys]) {
    const keyTables = bootstrapKey.split(',').filter(Boolean);
    if (keyTables.some((table) => requestedTables.has(table as SupabaseBootstrapTable))) {
      hydratedBootstrapKeys.delete(bootstrapKey);
    }
  }
}

async function fetchBootstrapResponse(tables?: SupabaseBootstrapTable[]) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUPABASE_BOOTSTRAP_TIMEOUT_MS);
  const requestedTables = normalizeRequestedTables(tables ?? FULL_BOOTSTRAP_TABLES);
  const requestUrl = requestedTables.length === FULL_BOOTSTRAP_TABLES.length
    ? '/api/supabase/bootstrap'
    : `/api/supabase/bootstrap?tables=${encodeURIComponent(requestedTables.join(','))}`;

  try {
    return await fetch(requestUrl, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

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
  tables?: SupabaseBootstrapTable[];
}): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  await db.init();
  clearHydratedBootstrapKeys(options?.tables);

  for (const tableConfig of getRequestedTableConfigs(options?.tables)) {
    await db.clear(tableConfig.storeName);
    if (options?.notifyTables !== false) {
      notifyBootstrapTableChanged(tableConfig.table, 'hydrate');
    }
  }

  if (options?.includeSyncQueue) {
    await db.clear(STORE_NAMES.sync_queue);
  }
}

export async function bootstrapSupabaseTables(
  tables: SupabaseBootstrapTable[],
  options?: {
    force?: boolean;
  },
): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  const requestedTables = normalizeRequestedTables(tables);
  if (!requestedTables.length) {
    return;
  }

  const bootstrapKey = getBootstrapKey(requestedTables);
  const existingPromise = bootstrapPromises.get(bootstrapKey);
  if (existingPromise) {
    return existingPromise;
  }

  if (!options?.force && hydratedBootstrapKeys.has(bootstrapKey)) {
    return;
  }

  const now = Date.now();
  const lastStartedAt = lastBootstrapStartedAt.get(bootstrapKey) ?? 0;
  if (options?.force && now - lastStartedAt < FORCE_BOOTSTRAP_COOLDOWN_MS) {
    return;
  }

  const bootstrapPromise = (async () => {
    lastBootstrapStartedAt.set(bootstrapKey, Date.now());
    const response = await fetchBootstrapResponse(requestedTables).catch((error) => {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn(`Supabase bootstrap timed out after ${SUPABASE_BOOTSTRAP_TIMEOUT_MS}ms.`);
      }

      return null;
    });

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

    await clearSupabaseBootstrapData({
      notifyTables: false,
      tables: requestedTables,
    });

    for (const tableConfig of getRequestedTableConfigs(requestedTables)) {
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

    hydratedBootstrapKeys.add(bootstrapKey);
  })()
    .catch((error) => {
      console.warn('Supabase full bootstrap failed:', error);
    })
    .finally(() => {
      bootstrapPromises.delete(bootstrapKey);
    });

  bootstrapPromises.set(bootstrapKey, bootstrapPromise);
  return bootstrapPromise;
}

export async function bootstrapAllDataFromSupabase(force = false): Promise<void> {
  return bootstrapSupabaseTables(FULL_BOOTSTRAP_TABLES, { force });
}
