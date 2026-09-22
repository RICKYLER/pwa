import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/server/auth-guards';
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

interface UploadRequestBody {
  id?: string;
  file_name: string;
  file_size_bytes: number;
  compressed_size_bytes: number;
  file_type: 'xlsx' | 'xls' | 'csv';
  records_count: number;
  accuracy_rate: number;
  mape_percent: number;
  mae_error: number;
  uploaded_by?: string;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
  dataset_events: unknown[];
  compressed_payload?: string;
  raw_headers?: string[];
  raw_rows?: unknown[];
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuthenticatedUser(request);
  if ('response' in authResult) {
    return authResult.response;
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({
      success: true,
      uploads: [],
      warning: 'Supabase is not configured. Falling back to local offline storage.',
    });
  }

  try {
    const { data, error } = await supabase
      .from('forecasting_dataset_uploads')
      .select('*')
      .order('uploaded_at', { ascending: false });

    if (error) {
      // Table might not exist yet if migration hasn't run
      return NextResponse.json({
        success: true,
        uploads: [],
        warning: `Database notice: ${error.message}`,
      });
    }

    const mapped = (data || []).map((row: any) => ({
      ...row,
      raw_headers: row.raw_headers || row.metadata?.raw_headers,
      raw_rows: row.raw_rows || row.metadata?.raw_rows,
      compressed_payload: row.compressed_payload || row.metadata?.compressed_payload,
    }));

    return NextResponse.json({
      success: true,
      uploads: mapped,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: true,
      uploads: [],
      warning: err?.message || 'Failed to fetch uploads from Supabase.',
    });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthenticatedUser(request);
  if ('response' in authResult) {
    return authResult.response;
  }

  const body = (await request.json().catch(() => null)) as UploadRequestBody | null;
  if (!body || !body.file_name || !Array.isArray(body.dataset_events)) {
    return NextResponse.json(
      { success: false, error: 'Invalid payload. Missing file_name or dataset_events.' },
      { status: 400 }
    );
  }

  const uploaderName = body.uploaded_by || authResult.user.name || authResult.user.email || 'MSWDO Staff';
  const uploadId = body.id || `fdu-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();

  const uploadRecord = {
    id: uploadId,
    file_name: body.file_name,
    file_size_bytes: body.file_size_bytes || 0,
    compressed_size_bytes: body.compressed_size_bytes || 0,
    file_type: body.file_type || 'xlsx',
    records_count: body.records_count || body.dataset_events.length,
    accuracy_rate: body.accuracy_rate || 0,
    mape_percent: body.mape_percent || 0,
    mae_error: body.mae_error || 0,
    uploaded_by: uploaderName,
    uploaded_at: now,
    is_active: body.is_active ?? true,
    metadata: {
      ...(body.metadata || {}),
      compressed_payload: body.compressed_payload,
      raw_headers: body.raw_headers,
      raw_rows: body.raw_rows,
      saved_percentage:
        body.file_size_bytes && body.compressed_size_bytes && body.file_size_bytes > 0
          ? Math.max(0, Math.round((1 - body.compressed_size_bytes / body.file_size_bytes) * 100))
          : 0,
    },
    dataset_events: body.dataset_events,
    created_at: now,
    updated_at: now,
  };

  const supabase = getSupabaseAdminClient();
  if (supabase) {
    try {
      // If this dataset is marked as active, mark other datasets as inactive
      if (uploadRecord.is_active) {
        await supabase
          .from('forecasting_dataset_uploads')
          .update({ is_active: false })
          .neq('id', uploadId);
      }

      // Upsert record
      const { data, error } = await supabase
        .from('forecasting_dataset_uploads')
        .upsert(uploadRecord)
        .select()
        .single();

      if (error) {
        return NextResponse.json({
          success: true,
          upload: uploadRecord,
          warning: `Saved locally. Supabase write notice: ${error.message}`,
        });
      }

      return NextResponse.json({
        success: true,
        upload: data || uploadRecord,
      });
    } catch (err: any) {
      return NextResponse.json({
        success: true,
        upload: uploadRecord,
        warning: `Saved locally. Supabase error: ${err?.message}`,
      });
    }
  }

  return NextResponse.json({
    success: true,
    upload: uploadRecord,
    warning: 'Supabase client not available. Saved to client store.',
  });
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireAuthenticatedUser(request);
  if ('response' in authResult) {
    return authResult.response;
  }

  const { id, is_active } = await request.json().catch(() => ({}));
  if (!id) {
    return NextResponse.json({ success: false, error: 'Missing upload id' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (supabase) {
    try {
      if (is_active) {
        await supabase
          .from('forecasting_dataset_uploads')
          .update({ is_active: false })
          .neq('id', id);
      }

      const { data, error } = await supabase
        .from('forecasting_dataset_uploads')
        .update({ is_active: Boolean(is_active), updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, upload: data });
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, id, is_active });
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuthenticatedUser(request);
  if ('response' in authResult) {
    return authResult.response;
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ success: false, error: 'Missing upload id' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (supabase) {
    try {
      const { error } = await supabase
        .from('forecasting_dataset_uploads')
        .delete()
        .eq('id', id);

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, id });
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, id });
}
