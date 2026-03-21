import { NextRequest, NextResponse } from 'next/server';
import type { SyncQueueItem } from '@/lib/db/schema';
import { requireAuthenticatedUser } from '@/lib/server/auth-guards';
import { applySyncedQueueItems } from '@/lib/server/sync-backup-store';

export const runtime = 'nodejs';

function normalizeSyncQueueItem(raw: unknown): SyncQueueItem | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const item = raw as Partial<SyncQueueItem>;
  if (
    typeof item.id !== 'string' ||
    typeof item.entity_type !== 'string' ||
    typeof item.entity_id !== 'string' ||
    (item.operation !== 'create' && item.operation !== 'update' && item.operation !== 'delete')
  ) {
    return null;
  }

  const parsedTimestamp = item.timestamp ? new Date(item.timestamp) : new Date();
  if (Number.isNaN(parsedTimestamp.getTime())) {
    return null;
  }

  return {
    id: item.id,
    operation: item.operation,
    entity_type: item.entity_type,
    entity_id: item.entity_id,
    data: item.data ?? null,
    timestamp: parsedTimestamp,
    attempts: typeof item.attempts === 'number' ? item.attempts : 0,
    last_error: typeof item.last_error === 'string' ? item.last_error : undefined,
  };
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthenticatedUser(request);
  if ('response' in authResult) {
    return authResult.response;
  }

  const payload = await request.json().catch(() => null);
  const candidateItems = Array.isArray(payload?.items) ? (payload.items as unknown[]) : null;
  const items = candidateItems
    ? candidateItems
        .map((item: unknown) => normalizeSyncQueueItem(item))
        .filter((item: SyncQueueItem | null): item is SyncQueueItem => Boolean(item))
    : [];

  if (!items.length) {
    return NextResponse.json(
      {
        appliedCount: 0,
        syncedItems: [],
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const result = await applySyncedQueueItems(items, authResult.user);
  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
