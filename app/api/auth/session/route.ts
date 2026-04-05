import { NextRequest, NextResponse } from 'next/server';
import { inspectSessionUser } from '@/lib/server/auth-guards';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { user, reason } = await inspectSessionUser(request);
  return NextResponse.json(
    { user, reason },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
