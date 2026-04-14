import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isBarangayId } from '@/lib/barangays';
import { requireAdminUser } from '@/lib/server/auth-guards';
import { resolveAppUrl } from '@/lib/server/app-url';
import { writeServerAuditLog } from '@/lib/server/supabase-audit';
import {
  createPasswordSetupToken,
  createUserAccount,
  listUsers,
} from '@/lib/server/auth-store';
import { sendAccountSetupEmail } from '@/lib/server/auth-email';

export const runtime = 'nodejs';

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['admin', 'encoder', 'health_worker', 'responder', 'resident']),
  barangay_id: z.string()
    .trim()
    .min(1, 'Select a barangay.')
    .refine((value) => isBarangayId(value), { message: 'Select a valid barangay.' }),
});

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  encoder: 'Encoder',
  health_worker: 'Health Worker',
  responder: 'Responder',
  resident: 'Resident',
};
const INTERNAL_USER_EMAILS = new Set([
  'sync-agent@mswdo.local',
]);

export async function GET(request: NextRequest) {
  const guard = await requireAdminUser(request);
  if ('response' in guard) {
    return guard.response;
  }

  const users = (await listUsers()).filter((user) => !INTERNAL_USER_EMAILS.has(user.email.toLowerCase()));
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminUser(request);
  if ('response' in guard) {
    return guard.response;
  }

  let payload: z.infer<typeof createUserSchema>;
  let rawPayload: unknown;

  try {
    rawPayload = await request.json();
    payload = createUserSchema.parse(rawPayload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid request.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if ((rawPayload as { role?: string } | null)?.role === 'resident') {
    return NextResponse.json(
      { error: 'Resident accounts are created through the household registration flow.' },
      { status: 400 },
    );
  }

  try {
    const user = await createUserAccount(payload);
    try {
      await writeServerAuditLog({
        actor: guard.user,
        action: 'CREATE',
        entity_type: 'user',
        entity_id: user.id,
        changes: {
          created_user_email: user.email,
          created_user_role: user.role,
          source: 'admin_create_user',
        },
      });
    } catch (error) {
      console.error('[Supabase Mirror] Failed to sync admin-created user:', error);
    }

    const token = await createPasswordSetupToken(user.id);
    const appUrl = resolveAppUrl(request.url);
    const setupLink = `${appUrl}/setup-password?token=${encodeURIComponent(token)}`;

    let inviteEmailSent = false;
    let inviteEmailError: string | null = null;

    try {
      await sendAccountSetupEmail({
        to: user.email,
        name: user.name,
        roleLabel: ROLE_LABELS[user.role] || user.role,
        setupLink,
      });
      inviteEmailSent = true;
    } catch (error) {
      inviteEmailError = error instanceof Error ? error.message : 'Failed to send setup email.';
    }

    return NextResponse.json(
      {
        user,
        remoteUserId: user.id,
        inviteEmailSent,
        inviteEmailError,
        setupLink: inviteEmailSent ? null : setupLink,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not create user.' },
      { status: 400 },
    );
  }
}
