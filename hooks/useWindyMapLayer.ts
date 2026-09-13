'use client';

/**
 * Drives the Windy Map Forecast underlay iframe (public/windy-map.html).
 *
 * The iframe is created lazily on first layer selection and kept alive for the
 * component's lifetime, so windyInit runs at most once per mount and switching
 * layers only sends overlay updates — no map re-creation, no page reloads. The
 * host Leaflet map stays the only interactive surface; its move/zoom events are
 * forwarded to the Windy map underneath.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getWindyApiKey,
  getWindyLayerOption,
  WINDY_MAP_PAGE_URL,
  type WindyFrameMessage,
  type WindyHostMessage,
  type WindyLayerId,
} from '@/lib/windy-map';

/** Minimal Leaflet map surface this hook needs (satisfied by ResponderLeafletMap's map). */
export interface WindyLeafletMapView {
  getCenter(): { lat: number; lng: number };
  getZoom(): number;
  on(event: string, handler: () => void): unknown;
  off(event: string, handler: () => void): unknown;
}

interface UseWindyMapLayerParams {
  map: WindyLeafletMapView | null;
  layerId: WindyLayerId;
  /**
   * Whether the underlay iframe is mounted (sticky once the first Windy layer
   * was selected, so the Windy instance survives switching back to "None").
   */
  frameMounted: boolean;
}

interface UseWindyMapLayerResult {
  /** Attach to the underlay iframe element. */
  frameRef: React.RefObject<HTMLIFrameElement | null>;
  /** Whether the Windy visualization is currently shown under the map. */
  windyActive: boolean;
  windyReady: boolean;
  windyError: string | null;
  /** Overlays store.getAllowed('overlay') reported, once Windy is ready. */
  allowedOverlays: string[] | null;
}

function postToFrame(
  frame: HTMLIFrameElement | null,
  message: WindyHostMessage,
) {
  const target = frame?.contentWindow;
  if (!target) return;
  try {
    target.postMessage(message, window.location.origin);
  } catch {
    /* The frame can be mid-teardown; nothing to do. */
  }
}

export function useWindyMapLayer({
  map,
  layerId,
  frameMounted,
}: UseWindyMapLayerParams): UseWindyMapLayerResult {
  const apiKey = getWindyApiKey();
  const wantsLayer = layerId !== 'none' && apiKey !== '';
  const [windyReady, setWindyReady] = useState(false);
  const [windyError, setWindyError] = useState<string | null>(null);
  const [allowedOverlays, setAllowedOverlays] = useState<string[] | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const initSentRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const syncView = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      if (!map) return;
      const center = map.getCenter();
      postToFrame(frameRef.current, {
        type: 'windy:view',
        view: {
          lat: center.lat,
          lon: center.lng,
          zoom: map.getZoom(),
        },
      });
    });
  }, [map]);

  // Handshake with the iframe: announce ourselves, run windyInit once, and
  // track readiness / allowed overlays / failures reported back.
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;

      const data = event.data as WindyFrameMessage | undefined;
      if (!data || typeof data.type !== 'string') return;

      if (data.type === 'windy:loaded') {
        if (initSentRef.current || apiKey === '') return;
        initSentRef.current = true;
        const center = map?.getCenter();
        const overlay = getWindyLayerOption(layerId).windyOverlay ?? 'wind';
        postToFrame(frameRef.current, {
          type: 'windy:init',
          apikey: apiKey,
          lat: center?.lat ?? 7.45,
          lon: center?.lng ?? 126.2,
          zoom: map?.getZoom() ?? 12,
          overlay,
        });
        return;
      }

      if (data.type === 'windy:ready') {
        setWindyReady(true);
        setWindyError(null);
        setAllowedOverlays(data.allowedOverlays ?? []);
        syncView();
        return;
      }

      if (data.type === 'windy:error') {
        setWindyReady(false);
        setWindyError(data.message);
      }
    }

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [apiKey, layerId, map, syncView]);

  // The iframe may load before this listener attaches (or vice versa); the
  // hello ping lets it re-announce until initialization starts.
  useEffect(() => {
    if (!frameMounted) return;
    postToFrame(frameRef.current, { type: 'windy:hello' });
  }, [frameMounted]);

  // Keep the Windy map glued to the host map's viewport.
  useEffect(() => {
    if (!frameMounted || !map) return;

    map.on('move', syncView);
    map.on('zoom', syncView);
    return () => {
      map.off('move', syncView);
      map.off('zoom', syncView);
    };
  }, [frameMounted, map, syncView]);

  // Switch the Windy overlay when the selected layer changes (and once more on
  // readiness, in case the selection changed while Windy was still loading).
  useEffect(() => {
    if (!windyReady) return;
    const overlay = getWindyLayerOption(layerId).windyOverlay;
    if (!overlay) return;
    postToFrame(frameRef.current, { type: 'windy:overlay', overlay });
  }, [layerId, windyReady]);

  // Re-align the underlay the moment it becomes visible again, so Windy never
  // shows a stale viewport after being hidden behind the base map.
  const windyActive = wantsLayer && windyReady && !windyError;
  useEffect(() => {
    if (windyActive) {
      syncView();
    }
  }, [syncView, windyActive]);

  // Full cleanup on unmount (the iframe itself is removed by React).
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return {
    frameRef,
    windyActive,
    windyReady,
    windyError,
    allowedOverlays,
  };
}
