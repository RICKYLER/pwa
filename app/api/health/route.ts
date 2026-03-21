import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { fetchOpenWeatherFieldResponseWeather } from '@/lib/weather';
import { requireAdminUser } from '@/lib/server/auth-guards';

export const runtime = 'nodejs';

type CheckStatus = 'healthy' | 'warning' | 'error';

interface HealthCheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  configured: boolean;
  summary: string;
  details?: string;
}

interface HealthPayload {
  ok: boolean;
  checkedAt: string;
  location: { lat: number; lng: number };
  summary: {
    total: number;
    healthy: number;
    warning: number;
    error: number;
  };
  checks: HealthCheckResult[];
}

const DEFAULT_LAT = 7.2186;
const DEFAULT_LNG = 125.6208;

function result(
  id: string,
  label: string,
  status: CheckStatus,
  configured: boolean,
  summary: string,
  details?: string,
): HealthCheckResult {
  return { id, label, status, configured, summary, details };
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

async function readResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function parseLatLng(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get('lat') ?? DEFAULT_LAT);
  const lng = Number(searchParams.get('lng') ?? DEFAULT_LNG);

  return {
    lat: Number.isFinite(lat) ? lat : DEFAULT_LAT,
    lng: Number.isFinite(lng) ? lng : DEFAULT_LNG,
  };
}

function resolveFormat(request: NextRequest): 'json' | 'table' {
  const { searchParams } = new URL(request.url);
  const format = (searchParams.get('format') ?? '').toLowerCase();
  const accept = request.headers.get('accept') ?? '';

  if (format === 'table' || format === 'text') return 'table';
  if (accept.includes('text/plain')) return 'table';

  return 'json';
}

function pad(value: string, width: number, align: 'left' | 'right' = 'left') {
  if (value.length >= width) return value;
  return align === 'right'
    ? `${' '.repeat(width - value.length)}${value}`
    : `${value}${' '.repeat(width - value.length)}`;
}

function truncate(value: string, width: number) {
  if (value.length <= width) return value;
  if (width <= 3) return value.slice(0, width);
  return `${value.slice(0, width - 3)}...`;
}

function formatCell(value: string, width: number, align: 'left' | 'right' = 'left') {
  return pad(truncate(value, width), width, align);
}

function buildDivider(widths: number[]) {
  return `+${widths.map((width) => '-'.repeat(width + 2)).join('+')}+`;
}

function buildRow(values: string[], widths: number[], alignments?: Array<'left' | 'right'>) {
  return `| ${values
    .map((value, index) => formatCell(value, widths[index], alignments?.[index] ?? 'left'))
    .join(' | ')} |`;
}

function renderTable(payload: HealthPayload) {
  const headerLine = `API HEALTH REPORT :: ${payload.ok ? 'OPERATIONAL' : 'ATTENTION NEEDED'}`;
  const summaryLine = `Checked: ${payload.checkedAt} | Location: ${payload.location.lat.toFixed(4)}, ${payload.location.lng.toFixed(4)}`;
  const countsLine = `Summary: ${payload.summary.healthy} healthy / ${payload.summary.warning} warning / ${payload.summary.error} error / ${payload.summary.total} total`;

  const widths = [24, 9, 10, 30, 38];
  const divider = buildDivider(widths);
  const rows = payload.checks.map((check) =>
    buildRow(
      [
        check.label,
        check.status.toUpperCase(),
        check.configured ? 'YES' : 'NO',
        check.summary,
        check.details ?? '-',
      ],
      widths,
    ),
  );

  return [
    headerLine,
    summaryLine,
    countsLine,
    divider,
    buildRow(['Service', 'Status', 'Config', 'Summary', 'Details'], widths),
    divider,
    ...rows,
    divider,
  ].join('\n');
}

async function checkAppUrl(): Promise<HealthCheckResult> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  if (!appUrl) {
    return result(
      'app_url',
      'App URL',
      'warning',
      false,
      'NEXT_PUBLIC_APP_URL is missing',
      'Welcome emails will fall back to localhost login links.',
    );
  }

  try {
    const parsed = new URL(appUrl);
    return result(
      'app_url',
      'App URL',
      'healthy',
      true,
      'App URL is configured',
      parsed.origin,
    );
  } catch {
    return result(
      'app_url',
      'App URL',
      'error',
      true,
      'NEXT_PUBLIC_APP_URL is invalid',
      'Please use a full URL such as http://localhost:3000.',
    );
  }
}

async function checkSmtp(): Promise<HealthCheckResult> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? '465');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return result(
      'smtp',
      'Gmail SMTP',
      'error',
      false,
      'SMTP is not fully configured',
      'Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.',
    );
  }

  if (!Number.isFinite(port)) {
    return result(
      'smtp',
      'Gmail SMTP',
      'error',
      true,
      'SMTP port is invalid',
      'SMTP_PORT must be a valid number.',
    );
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });

    await transporter.verify();

    return result(
      'smtp',
      'Gmail SMTP',
      'healthy',
      true,
      'SMTP connection succeeded',
      `${host}:${port}`,
    );
  } catch (error) {
    return result(
      'smtp',
      'Gmail SMTP',
      'error',
      true,
      'SMTP connection failed',
      safeErrorMessage(error),
    );
  }
}

async function checkWeather(lat: number, lng: number): Promise<HealthCheckResult> {
  const apiKey = process.env.OPENWEATHER_API_KEY ?? '';

  if (!apiKey) {
    return result(
      'openweather_weather',
      'OpenWeather One Call',
      'error',
      false,
      'Weather API key is missing',
      'Set OPENWEATHER_API_KEY.',
    );
  }

  try {
    const data = await fetchOpenWeatherFieldResponseWeather(lat, lng, apiKey, {
      cache: 'no-store',
    });

    return result(
      'openweather_weather',
      'OpenWeather One Call',
      'healthy',
      true,
      'Weather API request succeeded',
      data.summary || 'Forecast data received.',
    );
  } catch (error) {
    return result(
      'openweather_weather',
      'OpenWeather One Call',
      'error',
      true,
      'Weather API request failed',
      safeErrorMessage(error),
    );
  }
}

async function checkTimezone(lat: number, lng: number): Promise<HealthCheckResult> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? '';

  if (!apiKey) {
    return result(
      'google_timezone',
      'Google Time Zone API',
      'error',
      false,
      'Google Maps key is missing',
      'Set NEXT_PUBLIC_GOOGLE_MAPS_KEY.',
    );
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/timezone/json');
    url.searchParams.set('location', `${lat},${lng}`);
    url.searchParams.set('timestamp', String(Math.floor(Date.now() / 1000)));
    url.searchParams.set('key', apiKey);

    const response = await fetch(url.toString(), { cache: 'no-store' });

    if (!response.ok) {
      const text = await readResponseText(response);
      return result(
        'google_timezone',
        'Google Time Zone API',
        'error',
        true,
        `Time Zone API returned ${response.status}`,
        text.slice(0, 180) || 'Request failed.',
      );
    }

    const data = await response.json();

    if (data.status !== 'OK') {
      return result(
        'google_timezone',
        'Google Time Zone API',
        'error',
        true,
        `Time Zone API status: ${data.status}`,
        data.errorMessage || 'The API key may be restricted or the API may be disabled.',
      );
    }

    return result(
      'google_timezone',
      'Google Time Zone API',
      'healthy',
      true,
      'Time Zone API request succeeded',
      data.timeZoneId || 'Time zone received.',
    );
  } catch (error) {
    return result(
      'google_timezone',
      'Google Time Zone API',
      'error',
      true,
      'Time Zone API request failed',
      safeErrorMessage(error),
    );
  }
}

async function checkMapsKeyPresence(): Promise<HealthCheckResult> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? '';

  if (!apiKey) {
    return result(
      'google_maps_js',
      'Google Maps JavaScript',
      'error',
      false,
      'Google Maps key is missing',
      'Set NEXT_PUBLIC_GOOGLE_MAPS_KEY.',
    );
  }

  return result(
    'google_maps_js',
    'Google Maps JavaScript',
    'healthy',
    true,
    'Google Maps key is present',
    'The actual browser-side Maps SDK will use this key.',
  );
}

function inferFirebaseProjectId(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) return null;

  const match = normalized.match(
    /^([a-z0-9-]+)\.(?:firebaseapp\.com|firebasestorage\.app|appspot\.com|web\.app)$/i,
  );

  return match?.[1] ?? null;
}

async function checkFirebaseConfig(): Promise<HealthCheckResult> {
  const required = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID',
  ] as const;

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    return result(
      'firebase',
      'Firebase Public Config',
      'error',
      false,
      'Firebase config is incomplete',
      `Missing ${missing.length} required environment value(s).`,
    );
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '';
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '';
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '';
  const inferredProjectId =
    inferFirebaseProjectId(authDomain) ?? inferFirebaseProjectId(storageBucket);

  if (inferredProjectId && projectId !== inferredProjectId) {
    return result(
      'firebase',
      'Firebase Public Config',
      'error',
      true,
      'Firebase project ID does not match its domain',
      `NEXT_PUBLIC_FIREBASE_PROJECT_ID is "${projectId}" but the auth/storage domain points to "${inferredProjectId}".`,
    );
  }

  return result(
    'firebase',
    'Firebase Public Config',
    'healthy',
    true,
    'Firebase public config is complete',
    'Firebase app initialization should work in the browser.',
  );
}

async function checkRecaptcha(): Promise<HealthCheckResult> {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? '';

  if (!siteKey) {
    return result(
      'recaptcha',
      'reCAPTCHA Enterprise',
      'error',
      false,
      'reCAPTCHA site key is missing',
      'Firebase App Check for Maps will not be able to run.',
    );
  }

  return result(
    'recaptcha',
    'reCAPTCHA Enterprise',
    'healthy',
    true,
    'reCAPTCHA site key is present',
    'App Check can request browser attestation tokens.',
  );
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminUser(request);
  if ('response' in guard) {
    return guard.response;
  }

  const { lat, lng } = parseLatLng(request);
  const format = resolveFormat(request);

  const checks = await Promise.all([
    checkAppUrl(),
    checkSmtp(),
    checkMapsKeyPresence(),
    checkTimezone(lat, lng),
    checkWeather(lat, lng),
    checkFirebaseConfig(),
    checkRecaptcha(),
  ]);

  const summary = {
    total: checks.length,
    healthy: checks.filter((check) => check.status === 'healthy').length,
    warning: checks.filter((check) => check.status === 'warning').length,
    error: checks.filter((check) => check.status === 'error').length,
  };

  const ok = summary.error === 0;

  const payload: HealthPayload = {
    ok,
    checkedAt: new Date().toISOString(),
    location: { lat, lng },
    summary,
    checks,
  };

  if (format === 'table') {
    return new NextResponse(renderTable(payload), {
      status: ok ? 200 : 503,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }

  return NextResponse.json(
    payload,
    { status: ok ? 200 : 503 },
  );
}
