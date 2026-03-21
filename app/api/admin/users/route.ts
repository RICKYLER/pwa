import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/server/auth-guards';
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
  role: z.enum(['admin', 'encoder', 'health_worker', 'responder']),
  barangay_id: z.string().min(1),
});

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  encoder: 'Encoder',
  health_worker: 'Health Worker',
  responder: 'Responder',
};

export async function GET(request: NextRequest) {
  const guard = await requireAdminUser(request);
  if ('response' in guard) {
    return guard.response;
  }

  const users = await listUsers();
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminUser(request);
  if ('response' in guard) {
    return guard.response;
  }

  let payload: z.infer<typeof createUserSchema>;

  try {
    payload = createUserSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid request.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  try {
    const user = await createUserAccount(payload);
    const token = await createPasswordSetupToken(user.id);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
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
