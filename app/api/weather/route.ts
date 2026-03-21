import { NextResponse } from 'next/server';
import { fetchOpenWeatherFieldResponseWeather, parseWeatherCoordinates } from '@/lib/weather';

export const runtime = 'nodejs';

const API_KEY = process.env.OPENWEATHER_API_KEY?.trim() ?? '';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { lat, lng } = parseWeatherCoordinates(searchParams);

  if (!API_KEY) {
    return NextResponse.json(
      { error: 'OpenWeather API key is not configured.' },
      { status: 500 },
    );
  }

  try {
    const payload = await fetchOpenWeatherFieldResponseWeather(lat, lng, API_KEY, {
      next: { revalidate: 600 },
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Failed to fetch OpenWeather forecast:', error);
    return NextResponse.json(
      { error: 'Failed to fetch weather forecast.' },
      { status: 500 },
    );
  }
}
