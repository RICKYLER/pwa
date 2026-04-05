'use client';

import type { OpenWeatherTileLayerId } from '@/lib/openweather-map-layers';
import type { ResponderBaseMapLayerId } from '@/lib/responder-map-config';
import {
  ADVANCED_LAYER_IDS,
  BASE_LAYER_ICON_MAP,
  canUseBaseMapLayer,
  getBaseLayerAvailabilityLabel,
  LAYER_ICON_MAP,
  QUICK_LAYER_IDS,
  RESPONDER_BASE_MAP_LAYERS,
} from '@/lib/responder-map-config';
import { CivicChipButton, CivicPanel, CivicSectionHeading } from '@/components/ui/civic-primitives';
import { ChevronDown, ChevronUp, Layers3, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResponderMapControlPanelProps {
  activeBaseLayerId: ResponderBaseMapLayerId;
  activeLayerIds: OpenWeatherTileLayerId[];
  activeLayerSummary: string;
  allLayersSelected: boolean;
  overlayOpacity: number;
  showAdvancedLayers: boolean;
  showWeather: boolean;
  weatherOverlayVisible: boolean;
  windLayerSelected: boolean;
  onActiveBaseLayerChange: (layerId: ResponderBaseMapLayerId) => void;
  onOverlayOpacityChange: (value: number) => void;
  onShowAdvancedLayersChange: (value: boolean) => void;
  onToggleLayer: (layerId: OpenWeatherTileLayerId) => void;
  onToggleWeatherVisibility: () => void;
  onOpenAllLayers: () => void;
  onClearAllLayers: () => void;
  className?: string;
  compact?: boolean;
}

export default function ResponderMapControlPanel({
  activeBaseLayerId,
  activeLayerIds,
  activeLayerSummary,
  allLayersSelected,
  overlayOpacity,
  showAdvancedLayers,
  showWeather,
  weatherOverlayVisible,
  windLayerSelected,
  onActiveBaseLayerChange,
  onOverlayOpacityChange,
  onShowAdvancedLayersChange,
  onToggleLayer,
  onToggleWeatherVisibility,
  onOpenAllLayers,
  onClearAllLayers,
  className,
  compact = false,
}: ResponderMapControlPanelProps) {
  return (
    <CivicPanel className={cn('space-y-4', className)}>
      <CivicSectionHeading
        icon={Layers3}
        title="Map controls"
        description="Choose the base map and weather overlays without covering the canvas."
      />

      <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/80 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Weather overlay</p>
            <p className="mt-1 text-sm font-bold text-slate-900">{weatherOverlayVisible ? activeLayerSummary : 'Weather hidden'}</p>
          </div>
          <button
            type="button"
            onClick={onToggleWeatherVisibility}
            className={cn(
              'rounded-full px-3 py-1.5 text-[11px] font-bold transition',
              weatherOverlayVisible ? 'bg-cyan-950 text-white' : 'border border-slate-200 bg-white text-slate-600',
            )}
          >
            {weatherOverlayVisible ? 'Visible' : 'Hidden'}
          </button>
        </div>
        {windLayerSelected && showWeather ? (
          <p className="mt-3 text-[11px] text-slate-500">
            Wind flow uses sampled vectors across the visible map area. Weather tiles auto-dim so the base map stays readable.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <CivicChipButton active={allLayersSelected} onClick={onOpenAllLayers}>
            Open all layers
          </CivicChipButton>
          <CivicChipButton active={activeLayerIds.length === 0} onClick={onClearAllLayers}>
            Clear all
          </CivicChipButton>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {QUICK_LAYER_IDS.map((layerId) => {
            const Icon = LAYER_ICON_MAP[layerId];
            const active = activeLayerIds.includes(layerId);
            return (
              <button
                key={layerId}
                type="button"
                onClick={() => onToggleLayer(layerId)}
                className={cn(
                  'flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left text-sm font-semibold transition',
                  active
                    ? 'border-cyan-900 bg-cyan-950 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span>{layerId === 'WND' ? 'Wind flow' : layerId === 'PR0' ? 'Precipitation' : layerId}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => onShowAdvancedLayersChange(!showAdvancedLayers)}
          className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <span>Advanced layers</span>
          {showAdvancedLayers ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showAdvancedLayers ? (
          <div className="grid grid-cols-2 gap-2">
            {ADVANCED_LAYER_IDS.map((layerId) => {
              const Icon = LAYER_ICON_MAP[layerId];
              const active = activeLayerIds.includes(layerId);
              return (
                <button
                  key={layerId}
                  type="button"
                  onClick={() => onToggleLayer(layerId)}
                  className={cn(
                    'flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left text-sm font-semibold transition',
                    active
                      ? 'border-cyan-900 bg-cyan-950 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">
                    {layerId === 'WS10'
                      ? 'Wind speed'
                      : layerId === 'TA2'
                        ? 'Temperature'
                        : layerId === 'APM'
                          ? 'Pressure'
                          : 'Clouds'}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="rounded-[22px] border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Overlay opacity</p>
              <p className="text-xs text-slate-500">{weatherOverlayVisible ? `${overlayOpacity}% visible` : 'Overlay hidden'}</p>
            </div>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            {overlayOpacity}%
          </span>
        </div>
        <input
          type="range"
          min={20}
          max={100}
          step={2}
          value={overlayOpacity}
          onChange={(event) => onOverlayOpacityChange(Number(event.target.value))}
          className="mt-3 h-2 w-full cursor-pointer accent-cyan-900"
        />
        {windLayerSelected && weatherOverlayVisible ? (
          <p className="mt-2 text-[11px] text-slate-500">
            Wind mode keeps precipitation and other weather fills lighter on the map canvas.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Base map</p>
        <div className={cn('grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-2')}>
          {RESPONDER_BASE_MAP_LAYERS.map((layer) => {
            const Icon = BASE_LAYER_ICON_MAP[layer.id];
            const active = activeBaseLayerId === layer.id;
            const available = canUseBaseMapLayer(layer);

            return (
              <button
                key={layer.id}
                type="button"
                onClick={() => onActiveBaseLayerChange(layer.id)}
                disabled={!available}
                className={cn(
                  'rounded-[22px] border px-3 py-3 text-left transition',
                  active
                    ? 'border-cyan-900 bg-cyan-950 text-white'
                    : available
                      ? 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      : 'cursor-not-allowed border-slate-200 bg-slate-100/80 text-slate-400',
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn('flex h-9 w-9 items-center justify-center rounded-2xl border', active ? 'border-white/10 bg-white/12 text-white' : 'border-slate-200 bg-slate-50 text-slate-600')}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{layer.label}</p>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', active ? 'bg-white/12 text-white' : 'bg-slate-100 text-slate-500')}>
                        {active ? 'Active' : getBaseLayerAvailabilityLabel(layer)}
                      </span>
                    </div>
                    <p className={cn('mt-1 text-[11px] leading-relaxed', active ? 'text-cyan-100/80' : 'text-slate-500')}>
                      {layer.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </CivicPanel>
  );
}
