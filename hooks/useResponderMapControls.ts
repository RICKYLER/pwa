'use client';

import { useEffect, useMemo, useState } from 'react';
import type { OpenWeatherTileLayerId } from '@/lib/openweather-map-layers';
import {
  ALL_LAYER_IDS,
  BASE_LAYER_STORAGE_KEY,
  DEFAULT_BASE_LAYER_ID,
  canUseBaseMapLayer,
  getBaseMapLayer,
  getLayerDisplayLabel,
  isResponderBaseMapLayerId,
  summarizeActiveLayers,
  type ResponderBaseMapLayerId,
} from '@/lib/responder-map-config';
import { getOpenWeatherMapLayer } from '@/lib/openweather-map-layers';
import { isWindyAvailable, type WindyLayerId } from '@/lib/windy-map';

export function useResponderMapControls() {
  const [activeBaseLayerId, setActiveBaseLayerId] = useState<ResponderBaseMapLayerId>(DEFAULT_BASE_LAYER_ID);
  const [activeLayerIds, setActiveLayerIds] = useState<OpenWeatherTileLayerId[]>(['PR0']);
  const [showWeather, setShowWeather] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState(getOpenWeatherMapLayer('PR0')?.defaultOpacity ?? 54);
  const [showAdvancedLayers, setShowAdvancedLayers] = useState(false);
  const [mapRefreshVersion, setMapRefreshVersion] = useState(0);
  const [windyLayer, setWindyLayer] = useState<WindyLayerId>('none');
  const [windyFrameMounted, setWindyFrameMounted] = useState(false);
  const [windyAllowedOverlays, setWindyAllowedOverlays] = useState<string[] | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedLayerId = window.localStorage.getItem(BASE_LAYER_STORAGE_KEY);
    if (!savedLayerId || !isResponderBaseMapLayerId(savedLayerId)) return;
    const savedLayer = getBaseMapLayer(savedLayerId);
    if (!savedLayer || !canUseBaseMapLayer(savedLayer)) {
      window.localStorage.removeItem(BASE_LAYER_STORAGE_KEY);
      return;
    }
    setActiveBaseLayerId(savedLayerId);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(BASE_LAYER_STORAGE_KEY, activeBaseLayerId);
  }, [activeBaseLayerId]);

  const weatherOverlayVisible = showWeather && activeLayerIds.length > 0;
  const activeLayerSummary = useMemo(() => summarizeActiveLayers(activeLayerIds), [activeLayerIds]);
  const allLayersSelected = activeLayerIds.length === ALL_LAYER_IDS.length;
  const windLayerSelected = activeLayerIds.includes('WND');
  const activeBaseLayer = getBaseMapLayer(activeBaseLayerId) ?? getBaseMapLayer(DEFAULT_BASE_LAYER_ID)!;

  function requestMapRefresh() {
    setMapRefreshVersion((current) => current + 1);
  }

  function handleActiveBaseLayerChange(layerId: ResponderBaseMapLayerId) {
    setActiveBaseLayerId(layerId);
  }

  function handleOverlayOpacityChange(value: number) {
    setOverlayOpacity(value);
  }

  function handleShowAdvancedLayersChange(value: boolean) {
    setShowAdvancedLayers(value);
  }

  function handleLayerToggle(layerId: OpenWeatherTileLayerId) {
    setActiveLayerIds((current) => (
      current.includes(layerId)
        ? current.filter((currentLayerId) => currentLayerId !== layerId)
        : [...current, layerId]
    ));
    setShowWeather(true);
  }

  function handleWeatherVisibilityToggle() {
    if (weatherOverlayVisible) {
      setShowWeather(false);
      return;
    }

    if (activeLayerIds.length === 0) {
      setActiveLayerIds(['PR0']);
    }
    setShowWeather(true);
  }

  function handleOpenAllLayers() {
    setActiveLayerIds(ALL_LAYER_IDS);
    setShowWeather(true);
  }

  function handleClearAllLayers() {
    setActiveLayerIds([]);
    setShowWeather(false);
  }

  function handleWindyLayerChange(layerId: WindyLayerId) {
    setWindyLayer(layerId);
    // The Windy iframe mounts on the first selection and then stays alive, so
    // returning to "None" (or switching layers) never re-initializes Windy.
    if (layerId !== 'none') {
      setWindyFrameMounted(true);
    }
  }

  function handleWindyAllowedOverlaysChange(allowedOverlays: string[]) {
    setWindyAllowedOverlays((current) =>
      JSON.stringify(current) === JSON.stringify(allowedOverlays) ? current : allowedOverlays,
    );
  }

  return {
    activeBaseLayer,
    activeBaseLayerId,
    activeLayerIds,
    activeLayerSummary,
    allLayersSelected,
    mapRefreshVersion,
    overlayOpacity,
    showAdvancedLayers,
    showWeather,
    weatherOverlayVisible,
    windLayerSelected,
    windyAvailable: isWindyAvailable(),
    windyLayer,
    windyFrameMounted,
    windyAllowedOverlays,
    handleActiveBaseLayerChange,
    handleOverlayOpacityChange,
    handleShowAdvancedLayersChange,
    handleLayerToggle,
    handleWeatherVisibilityToggle,
    handleOpenAllLayers,
    handleClearAllLayers,
    handleWindyLayerChange,
    handleWindyAllowedOverlaysChange,
    requestMapRefresh,
    getLayerDisplayLabel,
  };
}
