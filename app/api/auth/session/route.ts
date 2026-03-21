import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server/auth-guards';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  return NextResponse.json(
    { user },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
