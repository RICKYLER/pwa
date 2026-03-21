export type OpenWeatherMapLayerId = 'TA2' | 'APM' | 'WS10' | 'PR0' | 'CL';
export type OpenWeatherTileLayerId = OpenWeatherMapLayerId | 'WND';
export type OpenWeatherSelectorLayerId = OpenWeatherMapLayerId;

export interface OpenWeatherMapLayerOption {
  id: OpenWeatherTileLayerId;
  tileOp1h?: string;
  tileOp3h?: string;
  fallbackTileV1?: string;
  label: string;
  description: string;
  unit: string;
  availability: string;
  gradient: string;
  ticks: string[];
  defaultOpacity: number;
  palette?: string;
  fillBound?: boolean;
  useNorm?: boolean;
  arrowStep?: number;
  hiddenInSelector?: boolean;
}

export interface OpenWeatherSelectorLayerOption extends OpenWeatherMapLayerOption {
  id: OpenWeatherSelectorLayerId;
  hiddenInSelector?: false;
}

export const OPENWEATHER_WIND_PARTICLE_LAYER_ID = 'WND' as const;

export const OPENWEATHER_MAP_LAYER_OPTIONS = [
  {
    id: 'TA2',
    tileOp1h: 'TA2',
    tileOp3h: 'TA2',
    fallbackTileV1: 'temp_new',
    label: 'Temperature',
    description: 'Air temperature at 2 meters, rendered as a live OpenWeather weather layer.',
    unit: 'deg C',
    availability: 'Forecast when Maps 2.0 is enabled · current fallback available',
    gradient:
      'linear-gradient(90deg, #821692 0%, #821692 8%, #821692 14%, #821692 20%, #0965db 34%, #1e90ff 48%, #00c5ff 60%, #00ff00 72%, #ffff00 84%, #ff0000 94%, #800000 100%)',
    ticks: ['-20', '-10', '0', '10', '20', '30', '40'],
    defaultOpacity: 72,
    palette:
      '0:821692;2:821692;4:821692;18:821692;32:0965db;50:1e90ff;65:00c5ff;77:00ff00;85:ffff00;92:ff0000;100:800000',
    fillBound: true,
    hiddenInSelector: false,
  },
  {
    id: 'APM',
    tileOp1h: 'APM',
    tileOp3h: 'APM',
    fallbackTileV1: 'pressure_new',
    label: 'Pressure',
    description: 'Mean sea-level atmospheric pressure for route and weather-shift awareness.',
    unit: 'hPa',
    availability: 'Forecast when Maps 2.0 is enabled · current fallback available',
    gradient:
      'linear-gradient(90deg, #0073ff 0%, #00aa4f 16%, #9cc700 30%, #ffee00 48%, #f0be00 68%, #f28c00 82%, #ff0000 100%)',
    ticks: ['940', '980', '1010', '1040', '1080'],
    defaultOpacity: 64,
    palette:
      '940:0073ff;960:00aa4f;980:9cc700;1000:ffee00;1010:f0be00;1040:f28c00;1080:ff0000',
    fillBound: true,
    hiddenInSelector: false,
  },
  {
    id: 'WS10',
    tileOp1h: 'WS10UV',
    tileOp3h: 'WS10',
    fallbackTileV1: 'wind_new',
    label: 'Wind Speed',
    description: 'Wind speed at 10 meters for movement, shelter, and small-boat safety.',
    unit: 'm/s',
    availability: 'Forecast when Maps 2.0 is enabled · current fallback available',
    gradient:
      'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(238,206,204,0.45) 12%, rgba(179,100,188,0.7) 35%, rgba(63,33,59,0.82) 58%, rgba(116,76,172,0.92) 78%, rgba(13,17,38,1) 100%)',
    ticks: ['0', '5', '10', '15', '20', '30'],
    defaultOpacity: 58,
    palette:
      '1:FFFFFF00;5:EECECC66;15:B364BCB3;25:3F213BCC;50:744CACE6;100:4600AFFF;200:0D1126FF',
    fillBound: true,
    hiddenInSelector: false,
  },
  {
    id: 'PR0',
    tileOp1h: 'PR0',
    tileOp3h: 'PR0',
    fallbackTileV1: 'precipitation_new',
    label: 'Precipitation',
    description: 'Precipitation intensity overlay for rainfall awareness across the response area.',
    unit: 'mm/h',
    availability: 'Forecast when Maps 2.0 is enabled · current fallback available',
    gradient:
      'linear-gradient(90deg, #ffffff 0%, #9ec8f8 16%, #3b82f6 30%, #2563eb 42%, #1d4ed8 58%, #7c3aed 72%, #a855f7 86%, #f97316 100%)',
    ticks: ['0', '0.5', '1', '2', '4', '8'],
    defaultOpacity: 54,
    palette:
      '0:white;0.1:blue;0.2:royalblue;0.4:cyan;0.6:lime;0.8:yellow;1:red',
    fillBound: true,
    hiddenInSelector: false,
  },
  {
    id: 'CL',
    tileOp1h: 'CL',
    tileOp3h: 'CL',
    fallbackTileV1: 'clouds_new',
    label: 'Clouds',
    description: 'Cloudiness coverage overlay to support visibility and exposure checks.',
    unit: '%',
    availability: 'Forecast when Maps 2.0 is enabled · current fallback available',
    gradient:
      'linear-gradient(90deg, #f9fafb 0%, #e5eef8 16%, #cbd5e1 36%, #b6b0cb 56%, #9fdcfb 74%, #eff3ff 100%)',
    ticks: ['0', '20', '40', '60', '80', '100'],
    defaultOpacity: 48,
    palette:
      '0:white;10:FDFDFF;20:FCFBFF;30:FAFAFF;40:F9F8FF;50:F7F7FF;60:F6F5FF;70:F4F4FF;80:F2F2FF;90:F1F0FF;100:FDFDFF',
    fillBound: true,
    hiddenInSelector: false,
  },
  {
    id: 'WND',
    tileOp1h: 'WNDUV',
    tileOp3h: 'WND',
    label: 'Wind Flow',
    description: 'Animated wind flow built from sampled OpenWeather vectors across the visible map.',
    unit: 'direction',
    availability: 'Animated wind uses sampled point vectors, with OpenWeather map tiles as fallback',
    gradient:
      'linear-gradient(90deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.92) 100%)',
    ticks: ['Flow'],
    defaultOpacity: 56,
    fillBound: true,
    useNorm: true,
    arrowStep: 16,
    hiddenInSelector: true,
  },
] as const satisfies readonly OpenWeatherMapLayerOption[];

function isOpenWeatherSelectorLayer(
  layer: OpenWeatherMapLayerOption,
): layer is OpenWeatherSelectorLayerOption {
  return !layer.hiddenInSelector && layer.id !== OPENWEATHER_WIND_PARTICLE_LAYER_ID;
}

export function getOpenWeatherSelectorLayers(): OpenWeatherSelectorLayerOption[] {
  return OPENWEATHER_MAP_LAYER_OPTIONS.filter(
    isOpenWeatherSelectorLayer,
  ) as OpenWeatherSelectorLayerOption[];
}

export function isOpenWeatherMapLayerId(value: string): value is OpenWeatherTileLayerId {
  return OPENWEATHER_MAP_LAYER_OPTIONS.some((layer) => layer.id === value);
}

export function getOpenWeatherMapLayer(
  id: string | null | undefined,
): OpenWeatherMapLayerOption | undefined {
  return OPENWEATHER_MAP_LAYER_OPTIONS.find((layer) => layer.id === id);
}
