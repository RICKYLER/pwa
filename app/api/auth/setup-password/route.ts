import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AUTH_SESSION_COOKIE,
  createSessionToken,
  getSessionMaxAgeSeconds,
} from '@/lib/server/auth-session';
import {
  completePasswordSetup,
  completePasswordReset,
  validatePasswordSetupToken,
  validatePasswordResetToken,
} from '@/lib/server/auth-store';
import { writeServerAuditLog } from '@/lib/server/supabase-audit';

export const runtime = 'nodejs';

const passwordFlowSchema = z.enum(['setup', 'reset']);
const setupPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters long.'),
  mode: passwordFlowSchema.default('setup'),
});

type PasswordFlow = z.infer<typeof passwordFlowSchema>;

function resolvePasswordFlowMode(value: string | null | undefined): PasswordFlow {
  return value === 'reset' ? 'reset' : 'setup';
}

async function validatePasswordToken(token: string, mode: PasswordFlow) {
  return mode === 'reset'
    ? validatePasswordResetToken(token)
    : validatePasswordSetupToken(token);
}

async function completePasswordFlow(token: string, password: string, mode: PasswordFlow) {
  return mode === 'reset'
    ? completePasswordReset(token, password)
    : completePasswordSetup(token, password);
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const mode = resolvePasswordFlowMode(request.nextUrl.searchParams.get('mode'));
  if (!token) {
    return NextResponse.json(
      {
        error: mode === 'reset' ? 'Missing reset token.' : 'Missing setup token.',
      },
      { status: 400 },
    );
  }

  const user = await validatePasswordToken(token, mode);
  if (!user) {
    return NextResponse.json(
      {
        error: mode === 'reset'
          ? 'This password reset link is invalid or has expired.'
          : 'This password setup link is invalid or has expired.',
      },
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
    const user = await completePasswordFlow(payload.token, payload.password, payload.mode);
    try {
      await writeServerAuditLog({
        actor: user,
        action: 'SET_PASSWORD',
        entity_type: 'user',
        entity_id: user.id,
        changes: {
          source: payload.mode === 'reset' ? 'forgot_password' : 'setup_password',
        },
      });
    } catch (error) {
      console.error('[Supabase Mirror] Failed to sync password flow:', error);
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
          : payload.mode === 'reset'
            ? 'Unable to complete password reset.'
            : 'Unable to complete password setup.',
      },
      { status: 400 },
    );
  }
}
