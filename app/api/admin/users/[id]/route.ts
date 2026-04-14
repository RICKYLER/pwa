import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isBarangayId } from '@/lib/barangays';
import { requireAdminUser } from '@/lib/server/auth-guards';
import { deleteUserAccount, getStoredUserById, updateUserAccount } from '@/lib/server/auth-store';
import { writeServerAuditLog } from '@/lib/server/supabase-audit';

export const runtime = 'nodejs';

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['admin', 'encoder', 'health_worker', 'responder', 'resident']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  barangay_id: z.string()
    .trim()
    .min(1, 'Select a barangay.')
    .optional()
    .refine((value) => value === undefined || isBarangayId(value), { message: 'Select a valid barangay.' }),
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
  const existingUser = await getStoredUserById(id);

  if (!existingUser) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  let payload: z.infer<typeof updateUserSchema>;

  try {
    payload = updateUserSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid request.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const nextRole = payload.role ?? existingUser.role;

  if (existingUser.role === 'resident' && payload.role && payload.role !== 'resident') {
    return NextResponse.json(
      { error: 'Resident accounts cannot be reassigned here.' },
      { status: 400 },
    );
  }

  if (existingUser.role !== 'resident' && payload.role === 'resident') {
    return NextResponse.json(
      { error: 'Resident accounts are created through the household registration flow.' },
      { status: 400 },
    );
  }

  if (payload.status && nextRole === 'resident') {
    return NextResponse.json(
      { error: 'Resident accounts use hard delete and cannot be deactivated.' },
      { status: 400 },
    );
  }

  if (payload.status === 'inactive' && guard.user.id === id) {
    return NextResponse.json(
      { error: 'You cannot deactivate your own account.' },
      { status: 400 },
    );
  }

  try {
    const user = await updateUserAccount(id, payload);
    try {
      const auditAction = payload.status && payload.status !== existingUser.status
        ? (payload.status === 'inactive' ? 'DEACTIVATE' : 'REACTIVATE')
        : 'UPDATE';

      await writeServerAuditLog({
        actor: guard.user,
        action: auditAction,
        entity_type: 'user',
        entity_id: user.id,
        changes: {
          previous_role: existingUser.role,
          previous_status: existingUser.status,
          ...payload,
          source: 'admin_update_user',
        },
      });
    } catch (error) {
      console.error('[Supabase Mirror] Failed to sync updated user:', error);
    }

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
    const existingUser = await getStoredUserById(id);
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    await deleteUserAccount(id);

    if (existingUser.email) {
      try {
        await writeServerAuditLog({
          actor: guard.user,
          action: 'DELETE',
          entity_type: 'user',
          entity_id: id,
          changes: {
            deleted_user_name: existingUser.name,
            deleted_user_email: existingUser.email,
            deleted_user_role: existingUser.role,
            source: 'admin_delete_user',
          },
        });
      } catch (error) {
        console.error('[Supabase Mirror] Failed to sync deleted user:', error);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not delete user.' },
      { status: 400 },
    );
  }
}
