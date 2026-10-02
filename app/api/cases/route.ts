import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@/lib/db/schema';
import { getSessionUser } from '@/lib/server/auth-guards';
import { getSupabaseAdminClient, getSupabaseAdminConfig } from '@/lib/server/supabase-admin';
import {
  saveCaseOnServer,
  deleteCasePermanentlyOnServer,
} from '@/lib/server/supabase-mutations';
import { mapSupabaseRow } from '@/lib/supabase/row-mapper';

export const runtime = 'nodejs';

const FALLBACK_OFFICER: User = {
  id: '751633b2-a2c3-4221-a246-408d08ab261a',
  email: 'sync-agent@mswdo.local',
  name: 'MSWDO Protection Officer',
  role: 'admin',
  status: 'active',
  barangay_id: 'cadunan',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
};

function isMissingTableError(error: { message?: string | null } | null | undefined, tableName: string) {
  if (!error?.message) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes(tableName.toLowerCase()) &&
    (message.includes('does not exist') ||
      message.includes('could not find the table') ||
      message.includes('schema cache'))
  );
}

export async function GET(request: NextRequest) {
  try {
    const config = getSupabaseAdminConfig();
    if (!config.isConfigured) {
      return NextResponse.json(
        { error: 'Supabase is not configured.', cases: [], count: 0 },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const includeDeleted = searchParams.get('includeDeleted') === 'true';
    const trashOnly = searchParams.get('trashOnly') === 'true';

    const supabase = getSupabaseAdminClient();
    let query = supabase
      .from('cases')
      .select('*')
      .order('reported_at', { ascending: false });

    if (trashOnly) {
      query = query.eq('is_deleted', true);
    } else if (!includeDeleted) {
      query = query.or('is_deleted.is.null,is_deleted.eq.false');
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingTableError(error, 'cases')) {
        return NextResponse.json({ cases: [], count: 0, warning: 'cases table missing' });
      }
      throw new Error(error.message);
    }

    const mapped = (data || []).map((row) =>
      mapSupabaseRow('cases', row as Record<string, unknown>)
    );

    return NextResponse.json({
      success: true,
      cases: mapped,
      count: mapped.length,
      syncedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[/api/cases GET] Error:', err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Failed to fetch cases from Supabase',
        cases: [],
        count: 0,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const config = getSupabaseAdminConfig();
    if (!config.isConfigured) {
      return NextResponse.json(
        { error: 'Supabase is not configured.' },
        { status: 503 }
      );
    }


    const currentUser = (await getSessionUser(request)) || FALLBACK_OFFICER;
    const body = await request.json().catch(() => ({}));
    const caseRecord = body.caseRecord || body.record || body;

    if (!caseRecord || typeof caseRecord !== 'object') {
      return NextResponse.json({ error: 'caseRecord is required' }, { status: 400 });
    }

    const saved = await saveCaseOnServer(currentUser, caseRecord as Record<string, unknown>);
    return NextResponse.json({ success: true, case: saved });
  } catch (err: any) {
    console.error('[/api/cases POST] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save case in Supabase' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const config = getSupabaseAdminConfig();
    if (!config.isConfigured) {
      return NextResponse.json(
        { error: 'Supabase is not configured.' },
        { status: 503 }
      );
    }

    const currentUser = (await getSessionUser(request)) || FALLBACK_OFFICER;
    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const id = searchParams.get('id') || body.id;
    const mode = searchParams.get('mode') || body.mode || 'trash';

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Case ID is required' }, { status: 400 });
    }

    if (mode === 'permanent') {
      const res = await deleteCasePermanentlyOnServer(currentUser, id);
      return NextResponse.json({ success: true, deleted: res });
    } else {
      const res = await saveCaseOnServer(currentUser, {
        id,
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: currentUser.name || currentUser.email,
      });
      return NextResponse.json({ success: true, trashed: res });
    }
  } catch (err: any) {
    console.error('[/api/cases DELETE] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete case in Supabase' },
      { status: 500 }
    );
  }
}
