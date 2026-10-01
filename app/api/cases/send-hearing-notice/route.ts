import { NextRequest, NextResponse } from 'next/server';
import { sendHearingNoticeEmail } from '@/lib/server/case-notice-email';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      to,
      clientName,
      caseNumber,
      title,
      date,
      timeStart,
      timeEnd,
      venue,
      assignedWorker,
      notes,
    } = body;

    if (!to || typeof to !== 'string' || !to.includes('@')) {
      return NextResponse.json(
        { error: 'A valid recipient email address is required.' },
        { status: 400 }
      );
    }

    if (!clientName || !caseNumber || !date || !timeStart || !venue) {
      return NextResponse.json(
        { error: 'Missing required hearing notice details.' },
        { status: 400 }
      );
    }

    const result = await sendHearingNoticeEmail({
      to: to.trim(),
      clientName: String(clientName),
      caseNumber: String(caseNumber),
      title: String(title || 'Hearing & Conciliation Session'),
      date: String(date),
      timeStart: String(timeStart),
      timeEnd: String(timeEnd || ''),
      venue: String(venue),
      assignedWorker: String(assignedWorker || 'MSWDO Social Worker'),
      notes: notes ? String(notes) : undefined,
    });

    return NextResponse.json({
      success: true,
      message: `Hearing notice successfully sent to ${to.trim()} via Gmail SMTP.`,
      result,
    });
  } catch (err: any) {
    console.error('[send-hearing-notice] Error:', err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to send hearing notice via SMTP.',
      },
      { status: 500 }
    );
  }
}
