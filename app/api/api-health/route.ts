import { NextRequest } from 'next/server';
import { GET as getHealthReport } from '../health/route';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return getHealthReport(request);
}
