import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminConfig, getSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id')?.trim();

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID parameter is required' },
        { status: 400 }
      );
    }

    const { isConfigured } = getSupabaseAdminConfig();
    if (!isConfigured) {
      return NextResponse.json({
        success: true,
        found: false,
        source: 'unconfigured_server',
      });
    }

    const supabase = getSupabaseAdminClient();
    const normalized = id.toLowerCase();

    // 1. Try secure RPC verification function if migrated
    const { data: rpcData, error: rpcError } = await supabase.rpc('verify_solo_parent_id', {
      p_id_number: id,
    });

    if (!rpcError && rpcData && typeof rpcData === 'object' && 'found' in rpcData) {
      if (rpcData.found) {
        return NextResponse.json({
          success: true,
          found: true,
          data: rpcData,
        });
      }
      return NextResponse.json({
        success: true,
        found: false,
      });
    }

    // 2. Direct fallback query if RPC is not yet executed
    const { data, error } = await supabase
      .from('solo_parents')
      .select('id, id_number, full_name, barangay_id, purok_sitio, category, is_minimum_wage_or_below, dependents, requirements, issued_at, expires_at, status')
      .or(`id_number.ilike.${normalized},id.eq.${id}`)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Error querying solo_parents for verification:', error);
      return NextResponse.json({
        success: true,
        found: false,
        error: error.message,
      });
    }

    if (!data) {
      return NextResponse.json({
        success: true,
        found: false,
      });
    }

    const reqs = data.requirements && typeof data.requirements === 'object' ? data.requirements : {};
    const revocation = reqs._revocation && typeof reqs._revocation === 'object' ? reqs._revocation : {};

    return NextResponse.json({
      success: true,
      found: true,
      data: {
        id_number: data.id_number,
        full_name: data.full_name,
        barangay_id: data.barangay_id,
        purok_sitio: data.purok_sitio,
        category: data.category,
        is_minimum_wage_or_below: Boolean(data.is_minimum_wage_or_below),
        dependents: Array.isArray(data.dependents) ? data.dependents : [],
        issued_at: data.issued_at,
        expires_at: data.expires_at,
        status: data.status || 'active',
        revocation_reason: revocation.reason || undefined,
        revocation_date: revocation.date || undefined,
      },
    });
  } catch (err) {
    console.error('Unexpected error in solo-parent verification API:', err);
    return NextResponse.json(
      { success: false, error: 'Internal verification service error' },
      { status: 500 }
    );
  }
}
