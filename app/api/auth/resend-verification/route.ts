import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendResidentVerificationEmail } from '@/lib/server/auth-email';
import { createEmailVerificationToken, getStoredUserByEmail } from '@/lib/server/auth-store';

export const runtime = 'nodejs';

const resendVerificationSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
});

export async function POST(request: NextRequest) {
  let payload: z.infer<typeof resendVerificationSchema>;

  try {
    payload = resendVerificationSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid request.' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const user = await getStoredUserByEmail(payload.email);
  if (!user || user.role !== 'resident') {
    return NextResponse.json({ error: 'Resident account not found.' }, { status: 404 });
  }

  if (!user.email_verification_required && user.email_verified_at) {
    return NextResponse.json({
      success: true,
      alreadyVerified: true,
      message: 'This email address is already verified.',
    });
  }

  try {
    const token = await createEmailVerificationToken(user.id);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const verifyParams = new URLSearchParams({
      token,
      email: user.email,
    });
    const verifyLink = `${appUrl}/resident/verify-email?${verifyParams.toString()}`;

    await sendResidentVerificationEmail({
      to: user.email,
      name: user.name,
      verifyLink,
    });

    return NextResponse.json({
      success: true,
      alreadyVerified: false,
      message: 'A new verification email has been sent.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Could not resend the verification email.',
      },
      { status: 400 },
    );
  }
}
