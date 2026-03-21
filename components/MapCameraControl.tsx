'use client';

import { useEffect, useState } from 'react';
import { Box, Camera, Compass, Layers3, RotateCcw, RotateCw, X } from 'lucide-react';

interface MapCameraControlProps {
  map: google.maps.Map | null;
  compact?: boolean;
}

const MAP_TYPE_ROADMAP = 'roadmap' as google.maps.MapTypeId;
const MAP_TYPE_HYBRID = 'hybrid' as google.maps.MapTypeId;
const DEFAULT_3D_TILT = 60;
const DEFAULT_3D_HEADING = 28;
const MIN_3D_ZOOM = 16;
const MAP_ID_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim());

function roundCameraValue(value: number | undefined) {
  return Math.round((value ?? 0) * 10) / 10;
}

function moveCamera(map: google.maps.Map, camera: google.maps.CameraOptions) {
  if (typeof map.moveCamera === 'function') {
    map.moveCamera(camera);
    return;
  }

  if (typeof camera.zoom === 'number') {
    map.setZoom(camera.zoom);
  }
  if (typeof camera.heading === 'number') {
    map.setHeading(camera.heading);
  }
  if (typeof camera.tilt === 'number') {
    map.setTilt(camera.tilt);
  }
  if (camera.center) {
    map.panTo(camera.center);
  }
}

export default function MapCameraControl({
  map,
  compact = false,
}: MapCameraControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [heading, setHeading] = useState(0);
  const [tilt, setTilt] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [mapTypeId, setMapTypeId] = useState<string>('roadmap');

  useEffect(() => {
    if (!map) return;

    const syncCamera = () => {
      setHeading(roundCameraValue(map.getHeading() ?? 0));
      setTilt(roundCameraValue(map.getTilt() ?? 0));
      setZoom(roundCameraValue(map.getZoom() ?? 0));
      setMapTypeId(map.getMapTypeId() ?? MAP_TYPE_ROADMAP);
    };

    syncCamera();

    const listeners = [
      map.addListener('heading_changed', syncCamera),
      map.addListener('tilt_changed', syncCamera),
      map.addListener('zoom_changed', syncCamera),
      map.addListener('maptypeid_changed', syncCamera),
    ];

    return () => {
      listeners.forEach((listener) => listener.remove());
    };
  }, [map]);

  function setRoadmap() {
    if (!map) return;
    map.setMapTypeId(MAP_TYPE_ROADMAP);
  }

  function setHybrid() {
    if (!map) return;
    map.setMapTypeId(MAP_TYPE_HYBRID);
  }

  function enable3D() {
    if (!map) return;

    map.setOptions({
      headingInteractionEnabled: true,
      tiltInteractionEnabled: true,
    });
    map.setMapTypeId(MAP_TYPE_HYBRID);

    moveCamera(map, {
      heading: map.getHeading() ?? DEFAULT_3D_HEADING,
      tilt: DEFAULT_3D_TILT,
      zoom: Math.max(map.getZoom() ?? MIN_3D_ZOOM, MIN_3D_ZOOM),
      center: map.getCenter() ?? undefined,
    });
  }

  function enable2D() {
    if (!map) return;

    moveCamera(map, {
      heading: 0,
      tilt: 0,
      center: map.getCenter() ?? undefined,
    });
  }

  function rotateBy(delta: number) {
    if (!map) return;

    const nextHeading = ((map.getHeading() ?? 0) + delta + 360) % 360;
    moveCamera(map, {
      heading: nextHeading,
      tilt: map.getTilt() ?? 0,
      center: map.getCenter() ?? undefined,
    });
  }

  const is3D = tilt > 0;
  const panelWidth = compact ? 'w-[245px]' : 'w-[280px]';

  if (!isOpen) {
    return (
      <div className="absolute right-3 top-16 z-[15]">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/92 px-3 text-sm font-semibold text-slate-800 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.42)] backdrop-blur transition hover:bg-white"
          title="Open map camera controls"
        >
          <Camera className="h-4 w-4 text-indigo-600" />
          Camera
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-700">
            {is3D ? '3D' : '2D'}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={`absolute right-3 top-16 z-[15] max-w-[calc(100vw-24px)] ${panelWidth}`}>
      <div className="max-h-[calc(100vh-96px)] overflow-y-auto rounded-[24px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_24px_65px_-35px_rgba(15,23,42,0.42)] backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Map Camera
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div className="rounded-2xl bg-slate-100 p-2 text-slate-700">
                <Layers3 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {is3D ? '3D Perspective' : '2D Overview'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {mapTypeId === MAP_TYPE_HYBRID ? 'Hybrid imagery' : 'Road map'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-700">
              {is3D ? '3D' : '2D'}
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full bg-slate-100 p-1.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
              title="Hide map camera controls"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={setRoadmap}
            className={`rounded-2xl border px-3 py-2.5 text-sm font-semibold transition ${
              mapTypeId === MAP_TYPE_ROADMAP
                ? 'border-slate-300 bg-slate-900 text-white'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
            }`}
          >
            Road
          </button>
          <button
            type="button"
            onClick={setHybrid}
            className={`rounded-2xl border px-3 py-2.5 text-sm font-semibold transition ${
              mapTypeId === MAP_TYPE_HYBRID
                ? 'border-slate-300 bg-slate-900 text-white'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
            }`}
          >
            Hybrid
          </button>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={enable2D}
            className={`rounded-2xl border px-3 py-2.5 text-sm font-semibold transition ${
              !is3D
                ? 'border-indigo-300 bg-indigo-600 text-white'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
            }`}
          >
            2D
          </button>
          <button
            type="button"
            onClick={enable3D}
            className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-semibold transition ${
              is3D
                ? 'border-amber-300 bg-amber-500 text-white'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
            }`}
          >
            <Box className="h-4 w-4" />
            3D
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => rotateBy(-25)}
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Left
          </button>
          <button
            type="button"
            onClick={enable2D}
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-white"
          >
            <Compass className="h-3.5 w-3.5" />
            North
          </button>
          <button
            type="button"
            onClick={() => rotateBy(25)}
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-white"
          >
            <RotateCw className="h-3.5 w-3.5" />
            Right
          </button>
        </div>

        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-xs text-slate-600">
          {MAP_ID_CONFIGURED
            ? 'Vector map ID detected. Zoom in on households or roads to see stronger 3D perspective.'
            : '3D is enabled with vector rendering. Add NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID for the best Google vector map quality.'}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl border border-slate-200 bg-white px-2 py-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Tilt</p>
            <p className="mt-1 text-sm font-bold text-slate-900">{roundCameraValue(tilt)}°</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-2 py-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Heading</p>
            <p className="mt-1 text-sm font-bold text-slate-900">{roundCameraValue(heading)}°</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-2 py-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Zoom</p>
            <p className="mt-1 text-sm font-bold text-slate-900">{roundCameraValue(zoom)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
