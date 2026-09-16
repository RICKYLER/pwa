import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireAuthenticatedUser } from '@/lib/server/auth-guards';
import { AI_BRIEF_MAX_INCIDENTS, AI_BRIEF_MAX_PUROKS, AI_BRIEF_SYSTEM_PROMPT, type AIBriefPayload } from '@/lib/ai-brief';

export const runtime = 'nodejs';
// The hosted model can take a while on longer briefs — raise above the Hobby
// default 10 s (same reasoning as the disaster-alert evaluation route).
export const maxDuration = 60;

const AI_API_KEY = process.env.AI_API_KEY?.trim() ?? '';
const AI_BASE_URL = process.env.AI_BASE_URL?.trim() || 'https://ollama.com/v1';
const AI_MODEL = process.env.AI_MODEL?.trim() || 'gpt-oss:120b';

function badRequest(message: string) {
  return NextResponse.json(
    { error: message },
    { status: 400, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: NextRequest) {
  if (!AI_API_KEY) {
    return NextResponse.json(
      { error: 'AI briefing is not configured — set AI_API_KEY on the server.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const authResult = await requireAuthenticatedUser(request);
  if ('response' in authResult) {
    return authResult.response;
  }
  if (authResult.user.role !== 'responder' && authResult.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Responder or admin access is required for AI briefings.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let payload: AIBriefPayload;
  try {
    payload = await request.json();
  } catch {
    return badRequest('Request body must be JSON.');
  }

  if (!payload || !Array.isArray(payload.priorityPuroks) || payload.priorityPuroks.length === 0) {
    return badRequest('priorityPuroks must be a non-empty array.');
  }
  if (payload.mode !== 'situation' && payload.mode !== 'purok' && payload.mode !== 'trigger') {
    payload.mode = 'situation';
  }
  // The client already truncates, but enforce caps server-side too so a
  // tampered client cannot push an oversized prompt through this route.
  payload.priorityPuroks = payload.priorityPuroks.slice(0, AI_BRIEF_MAX_PUROKS);
  payload.activeFloodIncidents = (payload.activeFloodIncidents ?? []).slice(0, AI_BRIEF_MAX_INCIDENTS);
  payload.floodAlertSummaries = (payload.floodAlertSummaries ?? []).slice(0, AI_BRIEF_MAX_INCIDENTS);

  const client = new OpenAI({
    apiKey: AI_API_KEY,
    baseURL: AI_BASE_URL,
    timeout: 55_000,
    maxRetries: 1,
  });

  try {
    const completion = await client.chat.completions.create({
      model: AI_MODEL,
      max_tokens: 2048,
      messages: [
        { role: 'system', content: AI_BRIEF_SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            'Generate the situational briefing from this priority-engine data. '
            + 'Respond with the briefing only, no preamble.\n\n'
            + JSON.stringify(payload),
        },
      ],
    });

    const brief = completion.choices[0]?.message?.content?.trim() ?? '';

    if (!brief) {
      return NextResponse.json(
        { error: 'The AI model returned an empty briefing. Try again.' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(
      { brief, model: AI_MODEL },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('AI briefing generation failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `AI briefing generation failed — ${message}` },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
