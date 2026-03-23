import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AUTH_SESSION_COOKIE,
  createSessionToken,
  getSessionMaxAgeSeconds,
} from '@/lib/server/auth-session';
import {
  completePasswordSetup,
  validatePasswordSetupToken,
} from '@/lib/server/auth-store';
import { writeServerAuditLog } from '@/lib/server/supabase-audit';

export const runtime = 'nodejs';

const setupPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters long.'),
});

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  if (!token) {
    return NextResponse.json({ error: 'Missing setup token.' }, { status: 400 });
  }

  const user = await validatePasswordSetupToken(token);
  if (!user) {
    return NextResponse.json(
      { error: 'This password setup link is invalid or has expired.' },
      { status: 400 },
    );
  }

  return NextResponse.json({
    user: {
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
}

export async function POST(request: NextRequest) {
  let payload: z.infer<typeof setupPasswordSchema>;

  try {
    payload = setupPasswordSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid request.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  try {
    const user = await completePasswordSetup(payload.token, payload.password);
    try {
      await writeServerAuditLog({
        actor: user,
        action: 'SET_PASSWORD',
        entity_type: 'user',
        entity_id: user.id,
        changes: {
          source: 'setup_password',
        },
      });
    } catch (error) {
      console.error('[Supabase Mirror] Failed to sync password setup:', error);
    }

    const sessionToken = createSessionToken({
      userId: user.id,
      role: user.role,
    });

    const response = NextResponse.json({ user });
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
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : 'Unable to complete password setup.',
      },
      { status: 400 },
    );
  }
}
