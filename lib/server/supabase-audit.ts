import 'server-only';

import type { User } from '@/lib/db/schema';
import { getSupabaseAdminClient, getSupabaseAdminConfig } from '@/lib/server/supabase-admin';
import { requireSupabaseUserId, resolveSupabaseUserId } from '@/lib/server/supabase-user-ids';

export async function writeServerAuditLog(params: {
  actor?: User | null;
  actorLocalUserId?: string;
  action: string;
  entity_type: 'household' | 'resident' | 'distribution' | 'incident' | 'inventory' | 'user' | 'location_master';
  entity_id: string;
  changes?: Record<string, unknown>;
}) {
  if (!getSupabaseAdminConfig().isConfigured) {
    return null;
  }

  const actorId =
    (params.actor ? await requireSupabaseUserId(params.actor).catch(() => null) : null)
    ?? (params.actorLocalUserId ? await resolveSupabaseUserId(params.actorLocalUserId) : null);

  if (!actorId) {
    return null;
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('audit_logs')
    .insert({
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      user_id: actorId,
      action: params.action,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      changes: params.changes ?? null,
      timestamp: new Date().toISOString(),
    });

  if (error) {
    throw new Error(`Failed to write Supabase audit log: ${error.message}`);
  }

  return actorId;
}
