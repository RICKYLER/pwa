import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/server/auth-guards';
import {
  DISASTER_ALERT_EVALUATION_SECRET_HEADER,
  getDisasterAlertEvaluationSecret,
  runAutomaticDisasterAlertEvaluation,
} from '@/lib/server/disaster-alerts';

export const runtime = 'nodejs';

function unauthorized(message: string, status = 401) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const configuredSecret = getDisasterAlertEvaluationSecret();
    const requestSecret = request.headers.get(DISASTER_ALERT_EVALUATION_SECRET_HEADER)?.trim();
    const hasMatchingSecret = Boolean(configuredSecret && requestSecret && requestSecret === configuredSecret);

    if (!hasMatchingSecret) {
      const authResult = await requireAuthenticatedUser(request);
      if ('response' in authResult) {
        return authResult.response;
      }

      if (authResult.user.role !== 'admin') {
        return unauthorized('Admin access is required to run disaster alert evaluation.', 403);
      }

      const payload = await runAutomaticDisasterAlertEvaluation({
        initiatedBy: authResult.user,
      });

      return NextResponse.json(payload, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const payload = await runAutomaticDisasterAlertEvaluation();
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Disaster alert evaluation failed:', error);
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : 'Failed to run automatic disaster alert evaluation.',
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
