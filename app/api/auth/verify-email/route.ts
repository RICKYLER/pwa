import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { completeEmailVerification } from '@/lib/server/auth-store';
import { writeServerAuditLog } from '@/lib/server/supabase-audit';

export const runtime = 'nodejs';

const verifyEmailSchema = z.object({
  token: z.string().trim().min(1, 'Missing verification token.'),
});

export async function POST(request: NextRequest) {
  let payload: z.infer<typeof verifyEmailSchema>;

  try {
    payload = verifyEmailSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid verification request.' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Invalid verification request.' }, { status: 400 });
  }

  try {
    const result = await completeEmailVerification(payload.token);
    try {
      await writeServerAuditLog({
        actor: result.user,
        action: 'VERIFY_EMAIL',
        entity_type: 'user',
        entity_id: result.user.id,
        changes: {
          alreadyVerified: result.alreadyVerified,
        },
      });
    } catch (error) {
      console.error('[Supabase Mirror] Failed to sync email verification:', error);
    }

    return NextResponse.json({
      user: result.user,
      alreadyVerified: result.alreadyVerified,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Could not verify this email address.',
      },
      { status: 400 },
    );
  }
}
