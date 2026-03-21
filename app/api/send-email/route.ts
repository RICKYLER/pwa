import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/server/auth-guards';
import { sendAccountSetupEmail } from '@/lib/server/auth-email';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const guard = await requireAdminUser(req);
  if ('response' in guard) {
    return guard.response;
  }

  try {
    const { to, name, role, setupLink } = await req.json();

    // Validate required fields
    if (!to || !name || !role || !setupLink) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const roleLabels: Record<string, string> = {
      admin: 'Administrator',
      encoder: 'Encoder',
      health_worker: 'Health Worker',
      responder: 'Responder',
    };
    await sendAccountSetupEmail({
      to,
      name,
      roleLabel: roleLabels[role] || role,
      setupLink,
    });

    return NextResponse.json({ success: true, message: `Account setup email sent to ${to}` });
  } catch (err) {
    console.error('[send-email] Error:', err);
    const message = err instanceof Error ? err.message : 'Failed to send email';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
