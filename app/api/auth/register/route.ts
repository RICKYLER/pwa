import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendResidentVerificationEmail } from '@/lib/server/auth-email';
import { resolveAppUrl } from '@/lib/server/app-url';
import { writeServerAuditLog } from '@/lib/server/supabase-audit';
import {
  createEmailVerificationToken,
  createResidentSelfServiceAccount,
} from '@/lib/server/auth-store';

export const runtime = 'nodejs';

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Full name is required.'),
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters long.'),
  barangay_id: z.string().trim().min(1).default('barangay-1'),
});

export async function POST(request: NextRequest) {
  let payload: z.infer<typeof registerSchema>;

  try {
    payload = registerSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid registration request.' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Invalid registration request.' }, { status: 400 });
  }

  try {
    const user = await createResidentSelfServiceAccount(payload);
    try {
      await writeServerAuditLog({
        actor: user,
        action: 'CREATE',
        entity_type: 'user',
        entity_id: user.id,
        changes: {
          role: user.role,
          source: 'resident_register',
        },
      });
    } catch (error) {
      console.error('[Supabase Mirror] Failed to sync resident registration:', error);
    }

    const token = await createEmailVerificationToken(user.id);
    const appUrl = resolveAppUrl(request.url);
    const verifyParams = new URLSearchParams({
      token,
      email: user.email,
    });
    const verifyLink = `${appUrl}/resident/verify-email?${verifyParams.toString()}`;

    let verificationEmailSent = false;
    let verificationEmailError: string | null = null;

    try {
      await sendResidentVerificationEmail({
        to: user.email,
        name: user.name,
        verifyLink,
      });
      verificationEmailSent = true;
    } catch (error) {
      verificationEmailError = error instanceof Error ? error.message : 'Failed to send verification email.';
    }

    return NextResponse.json(
      {
        user,
        remoteUserId: user.id,
        verificationRequired: true,
        verificationEmailSent,
        verificationEmailError,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Could not create the resident account.',
      },
      { status: 400 },
    );
  }
}
