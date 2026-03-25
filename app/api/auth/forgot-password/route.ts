import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendPasswordResetEmail } from '@/lib/server/auth-email';
import { resolveAppUrl } from '@/lib/server/app-url';
import { createPasswordResetToken, getStoredUserByEmail } from '@/lib/server/auth-store';

export const runtime = 'nodejs';

const forgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
});

export async function POST(request: NextRequest) {
  let payload: z.infer<typeof forgotPasswordSchema>;

  try {
    payload = forgotPasswordSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid request.' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  try {
    const user = await getStoredUserByEmail(payload.email);

    if (user) {
      const token = await createPasswordResetToken(user.id);
      const appUrl = resolveAppUrl(request.url);
      const resetParams = new URLSearchParams({
        token,
        mode: 'reset',
      });
      const resetLink = `${appUrl}/setup-password?${resetParams.toString()}`;

      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetLink,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'If an account exists for that email address, a password reset link has been sent.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Could not send the password reset email.',
      },
      { status: 500 },
    );
  }
}
