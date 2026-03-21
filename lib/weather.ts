const DEFAULT_LAT = 7.2186;
const DEFAULT_LNG = 125.6208;
const COORDINATE_PRECISION = 3;

type OpenWeatherFetchOptions = RequestInit & {
  next?: {
    revalidate?: number;
  };
};

interface OpenWeatherCondition {
  id?: number;
  main?: string;
  description?: string;
  icon?: string;
}

interface OpenWeatherRainBlock {
  '1h'?: number;
  '3h'?: number;
}

interface OpenWeatherMainBlock {
  temp?: number;
  feels_like?: number;
  pressure?: number;
  humidity?: number;
  temp_min?: number;
  temp_max?: number;
}

interface OpenWeatherCloudBlock {
  all?: number;
}

interface OpenWeatherWindBlock {
  speed?: number;
  deg?: number;
  gust?: number;
}

interface OpenWeatherSysBlock {
  sunrise?: number;
  sunset?: number;
}

interface OpenWeatherCurrentEntry {
  dt?: number;
  sunrise?: number;
  sunset?: number;
  temp?: number;
  feels_like?: number;
  pressure?: number;
  humidity?: number;
  dew_point?: number;
  uvi?: number;
  clouds?: number;
  visibility?: number;
  wind_speed?: number;
  wind_deg?: number;
  wind_gust?: number;
  weather?: OpenWeatherCondition[];
  rain?: OpenWeatherRainBlock;
  snow?: OpenWeatherRainBlock;
}

interface OpenWeatherMinutelyEntry {
  dt?: number;
  precipitation?: number;
}

interface OpenWeatherHourlyEntry extends OpenWeatherCurrentEntry {
  pop?: number;
}

interface OpenWeatherDailyTemp {
  day?: number;
  min?: number;
  max?: number;
}

interface OpenWeatherDailyEntry {
  dt?: number;
  sunrise?: number;
  sunset?: number;
  summary?: string;
  temp?: OpenWeatherDailyTemp;
  pressure?: number;
  humidity?: number;
  dew_point?: number;
  wind_speed?: number;
  wind_gust?: number;
  clouds?: number;
  uvi?: number;
  weather?: OpenWeatherCondition[];
  pop?: number;
}

interface OpenWeatherAlert {
  sender_name?: string;
  event?: string;
  start?: number;
  end?: number;
  description?: string;
  tags?: string[];
}

interface OpenWeatherForecastResponse {
  lat?: number;
  lon?: number;
  timezone?: string;
  timezone_offset?: number;
  current?: OpenWeatherCurrentEntry;
  minutely?: OpenWeatherMinutelyEntry[];
  hourly?: OpenWeatherHourlyEntry[];
  daily?: OpenWeatherDailyEntry[];
  alerts?: OpenWeatherAlert[];
}

interface OpenWeatherCurrentWeatherResponse {
  coord?: {
    lat?: number;
    lon?: number;
  };
  weather?: OpenWeatherCondition[];
  main?: OpenWeatherMainBlock;
  visibility?: number;
  wind?: OpenWeatherWindBlock;
  clouds?: OpenWeatherCloudBlock;
  dt?: number;
  sys?: OpenWeatherSysBlock;
  timezone?: number;
  name?: string;
  rain?: OpenWeatherRainBlock;
  snow?: OpenWeatherRainBlock;
}

interface OpenWeatherForecastListEntry {
  dt?: number;
  main?: OpenWeatherMainBlock;
  weather?: OpenWeatherCondition[];
  clouds?: OpenWeatherCloudBlock;
  wind?: OpenWeatherWindBlock;
  visibility?: number;
  pop?: number;
  rain?: OpenWeatherRainBlock;
  snow?: OpenWeatherRainBlock;
}

interface OpenWeatherForecastCity {
  coord?: {
    lat?: number;
    lon?: number;
  };
  sunrise?: number;
  sunset?: number;
  timezone?: number;
  name?: string;
}

interface OpenWeatherForecastListResponse {
  list?: OpenWeatherForecastListEntry[];
  city?: OpenWeatherForecastCity;
}

export interface FieldResponseWeatherAlert {
  title: string;
  detail: string;
  severity: 'info' | 'watch' | 'warning';
  source: 'official' | 'derived';
}

export interface FieldResponseWeatherHour {
  time: string;
  temperature: number | null;
  feelsLike: number | null;
  rainChance: number | null;
  rainIntensity: number | null;
  weatherCode: number | null;
  weatherLabel: string;
  windSpeed: number | null;
  windDirection: number | null;
  windDirectionCardinal: string | null;
  windGust: number | null;
  visibility: number | null;
  humidity: number | null;
  cloudCover: number | null;
  pressureSeaLevel: number | null;
}

export interface FieldResponseWeatherDaily {
  time: string;
  label: string;
  summary: string;
  high: number | null;
  low: number | null;
  dayTemperature: number | null;
  rainChance: number | null;
  windSpeed: number | null;
  humidity: number | null;
}

export interface FieldResponseWeatherPayload {
  source: 'openweather';
  provider: {
    mode: 'onecall' | 'fallback';
    label: string;
    cadenceMinutes: number | null;
  };
  generatedAt: string;
  location: {
    lat: number;
    lng: number;
    name: string | null;
    rounded: boolean;
  };
  current: {
    time: string | null;
    temperature: number | null;
    feelsLike: number | null;
    dewPoint: number | null;
    humidity: number | null;
    windSpeed: number | null;
    windDirection: number | null;
    windDirectionCardinal: string | null;
    windGust: number | null;
    pressureSurfaceLevel: number | null;
    pressureSeaLevel: number | null;
    rainChance: number | null;
    rainIntensity: number | null;
    nextHourPrecipitationPeak: number | null;
    precipitationType: number | null;
    precipitationLabel: string;
    visibility: number | null;
    cloudCover: number | null;
    cloudBase: number | null;
    cloudCeiling: number | null;
    uvIndex: number | null;
    weatherCode: number | null;
    weatherLabel: string;
    thunderstormProbability: number | null;
    heatStressIndex: number | null;
  };
  today: {
    high: number | null;
    low: number | null;
    sunrise: string | null;
    sunset: string | null;
  };
  hourly: FieldResponseWeatherHour[];
  next24Hours: FieldResponseWeatherHour[];
  dailyOutlook: FieldResponseWeatherDaily[];
  alerts: FieldResponseWeatherAlert[];
  summary: string;
}

function parseNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function roundTo(value: number | null, digits: number): number | null {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundCoordinate(value: number): number {
  const factor = 10 ** COORDINATE_PRECISION;
  return Math.round(value * factor) / factor;
}

function metersPerSecondToKph(value: number | null): number | null {
  if (value === null) return null;
  return value * 3.6;
}

function metersToKilometers(value: number | null): number | null {
  if (value === null) return null;
  return value / 1000;
}

function toCardinal(degrees: number | null): string | null {
  if (degrees === null) return null;
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const normalized = ((degrees % 360) + 360) % 360;
  return directions[Math.round(normalized / 45) % directions.length] ?? null;
}

function unixToIso(value: number | null): string | null {
  if (value === null) return null;
  return new Date(value * 1000).toISOString();
}

function sentenceCase(value: string | undefined): string {
  if (!value) return 'Weather update';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Weather update';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeConditionLabel(condition: OpenWeatherCondition | undefined): string {
  if (!condition) return 'Weather update';
  return sentenceCase(condition.description ?? condition.main);
}

function resolvePrecipitationType(conditionId: number | null): number | null {
  if (conditionId === null) return null;
  if (conditionId === 511) return 3;
  if ([611, 612, 613, 615, 616].includes(conditionId)) return 4;
  if (conditionId >= 200 && conditionId < 600) return 1;
  if (conditionId >= 600 && conditionId < 700) return 2;
  return 0;
}

function precipitationLabel(type: number | null): string {
  switch (type) {
    case 1:
      return 'Rain';
    case 2:
      return 'Snow';
    case 3:
      return 'Freezing Rain';
    case 4:
      return 'Sleet';
    case 0:
      return 'No precipitation';
    default:
      return 'Mixed precipitation';
  }
}

function resolveRainIntensity(entry: { rain?: OpenWeatherRainBlock; snow?: OpenWeatherRainBlock }): number | null {
  const rain = parseNumber(entry.rain?.['1h']);
  if (rain !== null) return rain;
  const snow = parseNumber(entry.snow?.['1h']);
  if (snow !== null) return snow;

  const rainThreeHour = parseNumber(entry.rain?.['3h']);
  if (rainThreeHour !== null) return rainThreeHour / 3;

  const snowThreeHour = parseNumber(entry.snow?.['3h']);
  if (snowThreeHour !== null) return snowThreeHour / 3;

  return null;
}

function clipText(value: string | undefined, maxLength: number): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function inferAlertSeverity(alert: OpenWeatherAlert): FieldResponseWeatherAlert['severity'] {
  const haystack = [alert.event, ...(alert.tags ?? [])].join(' ').toLowerCase();

  if (
    haystack.includes('warning')
    || haystack.includes('storm')
    || haystack.includes('flood')
    || haystack.includes('typhoon')
    || haystack.includes('thunder')
  ) {
    return 'warning';
  }

  if (
    haystack.includes('watch')
    || haystack.includes('advisory')
    || haystack.includes('wind')
    || haystack.includes('heat')
  ) {
    return 'watch';
  }

  return 'warning';
}

function buildProviderAlerts(alerts: OpenWeatherAlert[] | undefined): FieldResponseWeatherAlert[] {
  if (!Array.isArray(alerts) || alerts.length === 0) return [];

  return alerts.slice(0, 3).map((alert) => {
    const title = clipText(alert.event || 'Government weather alert', 72);
    const sender = clipText(alert.sender_name, 42);
    const start = unixToIso(parseNumber(alert.start));
    const end = unixToIso(parseNumber(alert.end));
    const timeframe = start && end
      ? `Valid ${new Date(start).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })} to ${new Date(end).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}.`
      : '';
    const detailParts = [sender ? `${sender}.` : '', clipText(alert.description, 140), timeframe]
      .filter(Boolean)
      .join(' ');

    return {
      title,
      detail: detailParts || 'Government weather alert issued for this area.',
      severity: inferAlertSeverity(alert),
      source: 'official',
    };
  });
}

function buildSummary(weather: FieldResponseWeatherPayload['current']): string {
  const parts = [weather.weatherLabel];

  if (weather.temperature !== null) {
    parts.push(`${Math.round(weather.temperature)}°C`);
  }

  if (weather.rainChance !== null && weather.rainChance >= 40) {
    parts.push(`${Math.round(weather.rainChance)}% rain chance`);
  }

  if (weather.windGust !== null && weather.windGust >= 25) {
    parts.push(`gusts ${Math.round(weather.windGust)} km/h`);
  }

  if (weather.visibility !== null && weather.visibility <= 5) {
    parts.push(`${roundTo(weather.visibility, 1)} km visibility`);
  }

  return parts.join(' · ');
}

function formatDayLabel(isoTime: string, index: number) {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';

  return new Intl.DateTimeFormat('en-PH', {
    weekday: 'short',
  }).format(new Date(isoTime));
}

function peakMinutelyPrecipitation(entries: OpenWeatherMinutelyEntry[] | undefined): number | null {
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const values = entries
    .map((entry) => parseNumber(entry.precipitation))
    .filter((value): value is number => value !== null);

  if (values.length === 0) return null;
  return roundTo(Math.max(...values), 2);
}

function buildDailyOutlookFromOneCall(dailyEntries: OpenWeatherDailyEntry[]): FieldResponseWeatherDaily[] {
  return dailyEntries.slice(0, 3).map((entry, index) => {
    const time = unixToIso(parseNumber(entry.dt)) ?? new Date().toISOString();
    const condition = entry.weather?.[0];
    const summary = sentenceCase(entry.summary ?? condition?.description ?? condition?.main);

    return {
      time,
      label: formatDayLabel(time, index),
      summary,
      high: roundTo(parseNumber(entry.temp?.max), 1),
      low: roundTo(parseNumber(entry.temp?.min), 1),
      dayTemperature: roundTo(parseNumber(entry.temp?.day), 1),
      rainChance: roundTo((parseNumber(entry.pop) ?? 0) * 100, 0),
      windSpeed: roundTo(metersPerSecondToKph(parseNumber(entry.wind_speed)), 1),
      humidity: roundTo(parseNumber(entry.humidity), 0),
    };
  });
}

function buildDailyOutlookFromForecastList(
  entries: OpenWeatherForecastListEntry[],
  timezoneOffsetSeconds: number | null,
): FieldResponseWeatherDaily[] {
  const grouped = new Map<string, OpenWeatherForecastListEntry[]>();

  entries.forEach((entry) => {
    const dayKey = localDayKey(parseNumber(entry.dt), timezoneOffsetSeconds);
    if (!dayKey) return;

    const existing = grouped.get(dayKey) ?? [];
    existing.push(entry);
    grouped.set(dayKey, existing);
  });

  return Array.from(grouped.entries())
    .slice(0, 3)
    .map(([_, dayEntries], index) => {
      const first = dayEntries[0];
      const time = unixToIso(parseNumber(first?.dt)) ?? new Date().toISOString();
      const temperatures = dayEntries
        .map((entry) => parseNumber(entry.main?.temp))
        .filter((value): value is number => value !== null);
      const highs = dayEntries
        .map((entry) => parseNumber(entry.main?.temp_max))
        .filter((value): value is number => value !== null);
      const lows = dayEntries
        .map((entry) => parseNumber(entry.main?.temp_min))
        .filter((value): value is number => value !== null);
      const rainChance = dayEntries
        .map((entry) => parseNumber(entry.pop))
        .filter((value): value is number => value !== null);
      const windSpeed = dayEntries
        .map((entry) => metersPerSecondToKph(parseNumber(entry.wind?.speed)))
        .filter((value): value is number => value !== null);
      const humidity = dayEntries
        .map((entry) => parseNumber(entry.main?.humidity))
        .filter((value): value is number => value !== null);
      const middayEntry =
        dayEntries.find((entry) => {
          const timestamp = parseNumber(entry.dt);
          if (timestamp === null) return false;
          const shifted = (timestamp + (timezoneOffsetSeconds ?? 0)) * 1000;
          return new Date(shifted).getUTCHours() >= 11 && new Date(shifted).getUTCHours() <= 14;
        })
        ?? first;
      const condition = middayEntry?.weather?.[0] ?? first?.weather?.[0];

      return {
        time,
        label: formatDayLabel(time, index),
        summary: sentenceCase(condition?.description ?? condition?.main),
        high: roundTo(highs.length > 0 ? Math.max(...highs) : null, 1),
        low: roundTo(lows.length > 0 ? Math.min(...lows) : null, 1),
        dayTemperature: roundTo(
          temperatures.length > 0
            ? temperatures[Math.floor(temperatures.length / 2)] ?? temperatures[0] ?? null
            : null,
          1,
        ),
        rainChance: roundTo(rainChance.length > 0 ? Math.max(...rainChance) * 100 : null, 0),
        windSpeed: roundTo(windSpeed.length > 0 ? Math.max(...windSpeed) : null, 1),
        humidity: roundTo(
          humidity.length > 0
            ? humidity.reduce((sum, value) => sum + value, 0) / humidity.length
            : null,
          0,
        ),
      };
    });
}

function buildDerivedAlerts(weather: FieldResponseWeatherPayload['current']): FieldResponseWeatherAlert[] {
  const alerts: FieldResponseWeatherAlert[] = [];
  const isThunderstorm = weather.weatherCode !== null && weather.weatherCode >= 200 && weather.weatherCode < 300;

  if (
    isThunderstorm
    || (weather.rainChance !== null && weather.rainChance >= 70)
    || (weather.rainIntensity !== null && weather.rainIntensity >= 4)
  ) {
    alerts.push({
      title: 'Wet response conditions likely',
      detail: 'Expect notable rain or thunderstorm risk in the response area.',
      severity: 'warning',
      source: 'derived',
    });
  } else if (weather.rainChance !== null && weather.rainChance >= 45) {
    alerts.push({
      title: 'Keep rain gear ready',
      detail: 'Rain is possible during field movement.',
      severity: 'watch',
      source: 'derived',
    });
  }

  if (weather.windGust !== null && weather.windGust >= 35) {
    alerts.push({
      title: 'Strong gusts may affect field teams',
      detail: 'Watch loose materials, tents, motorcycles, and small boats.',
      severity: 'warning',
      source: 'derived',
    });
  } else if (weather.windGust !== null && weather.windGust >= 25) {
    alerts.push({
      title: 'Breezy conditions',
      detail: 'Travel and temporary shelters may feel stronger gusts.',
      severity: 'watch',
      source: 'derived',
    });
  }

  if (weather.visibility !== null && weather.visibility <= 2) {
    alerts.push({
      title: 'Low visibility',
      detail: 'Travel slowly and double-check house markers before dispatching.',
      severity: 'warning',
      source: 'derived',
    });
  } else if (weather.visibility !== null && weather.visibility <= 5) {
    alerts.push({
      title: 'Reduced visibility',
      detail: 'Landmarks may be harder to confirm from the road.',
      severity: 'watch',
      source: 'derived',
    });
  }

  if (weather.feelsLike !== null && weather.feelsLike >= 39) {
    alerts.push({
      title: 'High heat load',
      detail: 'Schedule hydration breaks and avoid long direct-sun exposure.',
      severity: 'warning',
      source: 'derived',
    });
  } else if (weather.feelsLike !== null && weather.feelsLike >= 35) {
    alerts.push({
      title: 'Warm field conditions',
      detail: 'Field teams should hydrate and pace outdoor activity.',
      severity: 'watch',
      source: 'derived',
    });
  }

  if (weather.uvIndex !== null && weather.uvIndex >= 8) {
    alerts.push({
      title: 'Very high UV index',
      detail: 'Sun protection is recommended for midday operations.',
      severity: 'watch',
      source: 'derived',
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      title: 'Conditions stable for dispatch',
      detail: 'No significant weather pressure is showing in the current forecast.',
      severity: 'info',
      source: 'derived',
    });
  }

  return alerts;
}

function normalizeHourlyEntry(entry: OpenWeatherHourlyEntry): FieldResponseWeatherHour {
  const condition = entry.weather?.[0];
  const weatherCode = parseNumber(condition?.id);
  const windSpeed = metersPerSecondToKph(parseNumber(entry.wind_speed));
  const windGust = metersPerSecondToKph(parseNumber(entry.wind_gust));
  const windDirection = roundTo(parseNumber(entry.wind_deg), 0);

  return {
    time: unixToIso(parseNumber(entry.dt)) ?? new Date().toISOString(),
    temperature: roundTo(parseNumber(entry.temp), 1),
    feelsLike: roundTo(parseNumber(entry.feels_like), 1),
    rainChance: roundTo((parseNumber(entry.pop) ?? 0) * 100, 0),
    rainIntensity: roundTo(resolveRainIntensity(entry), 2),
    weatherCode,
    weatherLabel: normalizeConditionLabel(condition),
    windSpeed: roundTo(windSpeed, 1),
    windDirection,
    windDirectionCardinal: toCardinal(windDirection),
    windGust: roundTo(windGust, 1),
    visibility: roundTo(metersToKilometers(parseNumber(entry.visibility)), 1),
    humidity: roundTo(parseNumber(entry.humidity), 0),
    cloudCover: roundTo(parseNumber(entry.clouds), 0),
    pressureSeaLevel: roundTo(parseNumber(entry.pressure), 0),
  };
}

function normalizeForecastListEntry(entry: OpenWeatherForecastListEntry): FieldResponseWeatherHour {
  const condition = entry.weather?.[0];
  const weatherCode = parseNumber(condition?.id);
  const windSpeed = metersPerSecondToKph(parseNumber(entry.wind?.speed));
  const windGust = metersPerSecondToKph(parseNumber(entry.wind?.gust));
  const windDirection = roundTo(parseNumber(entry.wind?.deg), 0);

  return {
    time: unixToIso(parseNumber(entry.dt)) ?? new Date().toISOString(),
    temperature: roundTo(parseNumber(entry.main?.temp), 1),
    feelsLike: roundTo(parseNumber(entry.main?.feels_like), 1),
    rainChance: roundTo((parseNumber(entry.pop) ?? 0) * 100, 0),
    rainIntensity: roundTo(resolveRainIntensity(entry), 2),
    weatherCode,
    weatherLabel: normalizeConditionLabel(condition),
    windSpeed: roundTo(windSpeed, 1),
    windDirection,
    windDirectionCardinal: toCardinal(windDirection),
    windGust: roundTo(windGust, 1),
    visibility: roundTo(metersToKilometers(parseNumber(entry.visibility)), 1),
    humidity: roundTo(parseNumber(entry.main?.humidity), 0),
    cloudCover: roundTo(parseNumber(entry.clouds?.all), 0),
    pressureSeaLevel: roundTo(parseNumber(entry.main?.pressure), 0),
  };
}

function localDayKey(timestampSeconds: number | null, timezoneOffsetSeconds: number | null) {
  if (timestampSeconds === null) return '';
  const shifted = (timestampSeconds + (timezoneOffsetSeconds ?? 0)) * 1000;
  return new Date(shifted).toISOString().slice(0, 10);
}

function readableTimezone(value: string | undefined): string | null {
  if (!value) return null;
  return value.replace(/_/g, ' ');
}

export function parseWeatherCoordinates(searchParams: URLSearchParams) {
  const lat = Number(searchParams.get('lat') ?? DEFAULT_LAT);
  const lng = Number(searchParams.get('lng') ?? DEFAULT_LNG);

  return {
    lat: Number.isFinite(lat) ? lat : DEFAULT_LAT,
    lng: Number.isFinite(lng) ? lng : DEFAULT_LNG,
  };
}

export function buildOpenWeatherForecastUrl(lat: number, lng: number, apiKey: string) {
  const roundedLat = roundCoordinate(lat);
  const roundedLng = roundCoordinate(lng);
  const url = new URL('https://api.openweathermap.org/data/3.0/onecall');

  url.searchParams.set('lat', String(roundedLat));
  url.searchParams.set('lon', String(roundedLng));
  url.searchParams.set('appid', apiKey);
  url.searchParams.set('units', 'metric');

  return {
    roundedLat,
    roundedLng,
    url,
  };
}

function buildOpenWeatherFreeForecastUrls(lat: number, lng: number, apiKey: string) {
  const roundedLat = roundCoordinate(lat);
  const roundedLng = roundCoordinate(lng);
  const currentUrl = new URL('https://api.openweathermap.org/data/2.5/weather');
  const forecastUrl = new URL('https://api.openweathermap.org/data/2.5/forecast');

  [currentUrl, forecastUrl].forEach((url) => {
    url.searchParams.set('lat', String(roundedLat));
    url.searchParams.set('lon', String(roundedLng));
    url.searchParams.set('appid', apiKey);
    url.searchParams.set('units', 'metric');
  });

  return {
    roundedLat,
    roundedLng,
    currentUrl,
    forecastUrl,
  };
}

function isOneCallSubscriptionError(status: number, errorText: string) {
  return (
    status === 401
    && /one call 3\.0 requires a separate subscription/i.test(errorText)
  );
}

async function fetchOpenWeatherFreeFieldResponseWeather(
  lat: number,
  lng: number,
  apiKey: string,
  options: OpenWeatherFetchOptions = {},
): Promise<FieldResponseWeatherPayload> {
  const { roundedLat, roundedLng, currentUrl, forecastUrl } = buildOpenWeatherFreeForecastUrls(
    lat,
    lng,
    apiKey,
  );

  const [currentResponse, forecastResponse] = await Promise.all([
    fetch(currentUrl.toString(), options),
    fetch(forecastUrl.toString(), options),
  ]);

  if (!currentResponse.ok) {
    const errorText = await currentResponse.text().catch(() => '');
    throw new Error(
      errorText || `OpenWeather current weather request failed with status ${currentResponse.status}.`,
    );
  }

  if (!forecastResponse.ok) {
    const errorText = await forecastResponse.text().catch(() => '');
    throw new Error(
      errorText || `OpenWeather forecast request failed with status ${forecastResponse.status}.`,
    );
  }

  const currentData = (await currentResponse.json()) as OpenWeatherCurrentWeatherResponse;
  const forecastData = (await forecastResponse.json()) as OpenWeatherForecastListResponse;
  const forecastEntries = Array.isArray(forecastData.list) ? forecastData.list : [];
  const firstForecast = forecastEntries[0];
  const currentCondition = currentData.weather?.[0];
  const currentWeatherCode = parseNumber(currentCondition?.id);
  const precipitationType = resolvePrecipitationType(currentWeatherCode);
  const windSpeed = metersPerSecondToKph(parseNumber(currentData.wind?.speed));
  const windGust = metersPerSecondToKph(parseNumber(currentData.wind?.gust));
  const pressure = roundTo(parseNumber(currentData.main?.pressure), 0);
  const timezoneOffset = parseNumber(currentData.timezone) ?? parseNumber(forecastData.city?.timezone) ?? 0;

  const current = {
    time: unixToIso(parseNumber(currentData.dt)),
    temperature: roundTo(parseNumber(currentData.main?.temp), 1),
    feelsLike: roundTo(parseNumber(currentData.main?.feels_like), 1),
    dewPoint: null,
    humidity: roundTo(parseNumber(currentData.main?.humidity), 0),
    windSpeed: roundTo(windSpeed, 1),
    windDirection: roundTo(parseNumber(currentData.wind?.deg), 0),
    windDirectionCardinal: toCardinal(parseNumber(currentData.wind?.deg)),
    windGust: roundTo(windGust, 1),
    pressureSurfaceLevel: null,
    pressureSeaLevel: pressure,
    rainChance: roundTo((parseNumber(firstForecast?.pop) ?? 0) * 100, 0),
    rainIntensity: roundTo(resolveRainIntensity(currentData) ?? resolveRainIntensity(firstForecast ?? {}), 2),
    nextHourPrecipitationPeak: roundTo(resolveRainIntensity(firstForecast ?? {}), 2),
    precipitationType,
    precipitationLabel: precipitationLabel(precipitationType),
    visibility: roundTo(metersToKilometers(parseNumber(currentData.visibility)), 1),
    cloudCover: roundTo(parseNumber(currentData.clouds?.all), 0),
    cloudBase: null,
    cloudCeiling: null,
    uvIndex: null,
    weatherCode: currentWeatherCode,
    weatherLabel: normalizeConditionLabel(currentCondition),
    thunderstormProbability: null,
    heatStressIndex: null,
  };

  const currentDayKey = localDayKey(parseNumber(currentData.dt), timezoneOffset);
  const sameDayEntries = forecastEntries.filter(
    (entry) => localDayKey(parseNumber(entry.dt), timezoneOffset) === currentDayKey,
  );
  const sameDayHighs = sameDayEntries
    .map((entry) => parseNumber(entry.main?.temp_max) ?? parseNumber(entry.main?.temp))
    .filter((value): value is number => value !== null);
  const sameDayLows = sameDayEntries
    .map((entry) => parseNumber(entry.main?.temp_min) ?? parseNumber(entry.main?.temp))
    .filter((value): value is number => value !== null);

  const today = {
    high: roundTo(
      sameDayHighs.length > 0
        ? Math.max(...sameDayHighs)
        : parseNumber(currentData.main?.temp_max),
      1,
    ),
    low: roundTo(
      sameDayLows.length > 0
        ? Math.min(...sameDayLows)
        : parseNumber(currentData.main?.temp_min),
      1,
    ),
    sunrise: unixToIso(parseNumber(currentData.sys?.sunrise) ?? parseNumber(forecastData.city?.sunrise)),
    sunset: unixToIso(parseNumber(currentData.sys?.sunset) ?? parseNumber(forecastData.city?.sunset)),
  };

  const alerts = buildDerivedAlerts(current);

  return {
    source: 'openweather',
    provider: {
      mode: 'fallback',
      label: 'OpenWeather current + 5 day forecast',
      cadenceMinutes: 180,
    },
    generatedAt: unixToIso(parseNumber(currentData.dt)) ?? new Date().toISOString(),
    location: {
      lat: parseNumber(currentData.coord?.lat) ?? parseNumber(forecastData.city?.coord?.lat) ?? roundedLat,
      lng: parseNumber(currentData.coord?.lon) ?? parseNumber(forecastData.city?.coord?.lon) ?? roundedLng,
      name: currentData.name || forecastData.city?.name || null,
      rounded: roundedLat !== lat || roundedLng !== lng,
    },
    current,
    today,
    hourly: forecastEntries.slice(0, 8).map(normalizeForecastListEntry),
    next24Hours: forecastEntries.slice(0, 8).map(normalizeForecastListEntry),
    dailyOutlook: buildDailyOutlookFromForecastList(forecastEntries, timezoneOffset),
    alerts,
    summary: buildSummary(current),
  };
}

export async function fetchOpenWeatherFieldResponseWeather(
  lat: number,
  lng: number,
  apiKey: string,
  options: OpenWeatherFetchOptions = {},
): Promise<FieldResponseWeatherPayload> {
  const { roundedLat, roundedLng, url } = buildOpenWeatherForecastUrl(lat, lng, apiKey);
  const response = await fetch(url.toString(), options);

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    if (isOneCallSubscriptionError(response.status, errorText)) {
      return fetchOpenWeatherFreeFieldResponseWeather(lat, lng, apiKey, options);
    }
    throw new Error(
      errorText || `OpenWeather request failed with status ${response.status}.`,
    );
  }

  const data = (await response.json()) as OpenWeatherForecastResponse;
  const currentEntry = data.current ?? {};
  const hourlyEntries = Array.isArray(data.hourly) ? data.hourly : [];
  const dailyEntries = Array.isArray(data.daily) ? data.daily : [];
  const firstHourly = hourlyEntries[0];
  const currentCondition = currentEntry.weather?.[0];
  const currentWeatherCode = parseNumber(currentCondition?.id);
  const precipitationType = resolvePrecipitationType(currentWeatherCode);
  const windSpeed = metersPerSecondToKph(parseNumber(currentEntry.wind_speed));
  const windGust = metersPerSecondToKph(parseNumber(currentEntry.wind_gust));
  const pressure = roundTo(parseNumber(currentEntry.pressure), 0);
  const minutelyPeak = peakMinutelyPrecipitation(data.minutely);
  const current = {
    time: unixToIso(parseNumber(currentEntry.dt)),
    temperature: roundTo(parseNumber(currentEntry.temp), 1),
    feelsLike: roundTo(parseNumber(currentEntry.feels_like), 1),
    dewPoint: roundTo(parseNumber(currentEntry.dew_point), 1),
    humidity: roundTo(parseNumber(currentEntry.humidity), 0),
    windSpeed: roundTo(windSpeed, 1),
    windDirection: roundTo(parseNumber(currentEntry.wind_deg), 0),
    windDirectionCardinal: toCardinal(parseNumber(currentEntry.wind_deg)),
    windGust: roundTo(windGust, 1),
    pressureSurfaceLevel: null,
    pressureSeaLevel: pressure,
    rainChance: roundTo((parseNumber(firstHourly?.pop) ?? 0) * 100, 0),
    rainIntensity: roundTo(resolveRainIntensity(currentEntry) ?? resolveRainIntensity(firstHourly ?? {}), 2),
    nextHourPrecipitationPeak: minutelyPeak,
    precipitationType,
    precipitationLabel: precipitationLabel(precipitationType),
    visibility: roundTo(metersToKilometers(parseNumber(currentEntry.visibility)), 1),
    cloudCover: roundTo(parseNumber(currentEntry.clouds), 0),
    cloudBase: null,
    cloudCeiling: null,
    uvIndex: roundTo(parseNumber(currentEntry.uvi), 0),
    weatherCode: currentWeatherCode,
    weatherLabel: normalizeConditionLabel(currentCondition),
    thunderstormProbability: null,
    heatStressIndex: null,
  };

  const todayEntry = dailyEntries[0];
  const today = {
    high: roundTo(parseNumber(todayEntry?.temp?.max), 1),
    low: roundTo(parseNumber(todayEntry?.temp?.min), 1),
    sunrise: unixToIso(parseNumber(todayEntry?.sunrise) ?? parseNumber(currentEntry.sunrise)),
    sunset: unixToIso(parseNumber(todayEntry?.sunset) ?? parseNumber(currentEntry.sunset)),
  };

  const providerAlerts = buildProviderAlerts(data.alerts);
  const derivedAlerts = buildDerivedAlerts(current);
  const alerts = providerAlerts.length > 0
    ? [...providerAlerts, ...derivedAlerts.filter((alert) => alert.severity !== 'info')].slice(0, 4)
    : derivedAlerts;

  return {
    source: 'openweather',
    provider: {
      mode: 'onecall',
      label: 'OpenWeather One Call 3.0 point forecast + minute rain + alerts',
      cadenceMinutes: 10,
    },
    generatedAt: unixToIso(parseNumber(currentEntry.dt)) ?? new Date().toISOString(),
    location: {
      lat: parseNumber(data.lat) ?? roundedLat,
      lng: parseNumber(data.lon) ?? roundedLng,
      name: readableTimezone(data.timezone),
      rounded: roundedLat !== lat || roundedLng !== lng,
    },
    current,
    today,
    hourly: hourlyEntries.slice(0, 8).map(normalizeHourlyEntry),
    next24Hours: hourlyEntries.slice(0, 24).map(normalizeHourlyEntry),
    dailyOutlook: buildDailyOutlookFromOneCall(dailyEntries),
    alerts: alerts.length > 0 ? alerts : derivedAlerts,
    summary: buildSummary(current),
  };
}
