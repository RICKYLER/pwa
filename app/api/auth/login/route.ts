import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSessionToken, AUTH_SESSION_COOKIE, getSessionMaxAgeSeconds } from '@/lib/server/auth-session';
import { authenticateUser } from '@/lib/server/auth-store';

export const runtime = 'nodejs';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  let payload: z.infer<typeof loginSchema>;

  try {
    payload = loginSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid login request.' }, { status: 400 });
  }

  const result = await authenticateUser(payload.email, payload.password);
  if (result.status === 'invalid_credentials') {
    return NextResponse.json(
      { error: 'Invalid email or password.' },
      { status: 401 },
    );
  }

  if (result.status === 'email_not_verified') {
    return NextResponse.json(
      {
        error: 'Please verify your email address before signing in.',
        code: 'EMAIL_NOT_VERIFIED',
      },
      { status: 403 },
    );
  }

  const { user } = result;

  const sessionToken = createSessionToken({
    userId: user.id,
    role: user.role,
  });

  const response = NextResponse.json({
    user,
  });

  response.cookies.set({
    name: AUTH_SESSION_COOKIE,
    value: sessionToken,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: getSessionMaxAgeSeconds(),
  });

  return response;
}
