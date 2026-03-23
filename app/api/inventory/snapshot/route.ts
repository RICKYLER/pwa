import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseAdminConfig } from '@/lib/server/supabase-admin';
import { requireAuthenticatedUser } from '@/lib/server/auth-guards';

export const runtime = 'nodejs';

const INVENTORY_ROLES = new Set(['admin', 'encoder']);

export async function GET(request: NextRequest) {
  const authResult = await requireAuthenticatedUser(request);
  if ('response' in authResult) {
    return authResult.response;
  }

  if (!INVENTORY_ROLES.has(authResult.user.role)) {
    return NextResponse.json(
      { error: 'Inventory access is restricted.' },
      { status: 403 },
    );
  }

  if (!getSupabaseAdminConfig().isConfigured) {
    return NextResponse.json(
      { error: 'Supabase is not configured.' },
      { status: 503 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const [
    inventoryItemsResult,
    inventoryMovementsResult,
    packageTemplatesResult,
  ] = await Promise.all([
    supabase
      .from('inventory_items')
      .select('*')
      .order('item_name', { ascending: true }),
    supabase
      .from('inventory_movements')
      .select('*')
      .order('timestamp', { ascending: false }),
    supabase
      .from('package_templates')
      .select('*')
      .order('name', { ascending: true }),
  ]);

  const firstError =
    inventoryItemsResult.error
    || inventoryMovementsResult.error
    || packageTemplatesResult.error;

  if (firstError) {
    return NextResponse.json(
      { error: firstError.message },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      inventory_items: inventoryItemsResult.data ?? [],
      inventory_movements: inventoryMovementsResult.data ?? [],
      package_templates: packageTemplatesResult.data ?? [],
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
