import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/server/auth-guards';
import { deleteUserAccount, updateUserAccount } from '@/lib/server/auth-store';

export const runtime = 'nodejs';

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['admin', 'encoder', 'health_worker', 'responder']).optional(),
  barangay_id: z.string().min(1).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminUser(request);
  if ('response' in guard) {
    return guard.response;
  }

  const { id } = await context.params;

  let payload: z.infer<typeof updateUserSchema>;

  try {
    payload = updateUserSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid request.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  try {
    const user = await updateUserAccount(id, payload);
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update user.' },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminUser(request);
  if ('response' in guard) {
    return guard.response;
  }

  const { id } = await context.params;
  if (guard.user.id === id) {
    return NextResponse.json(
      { error: 'You cannot delete your own account.' },
      { status: 400 },
    );
  }

  try {
    await deleteUserAccount(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not delete user.' },
      { status: 400 },
    );
  }
}
