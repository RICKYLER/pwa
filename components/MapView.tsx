

'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import { Loader2 } from 'lucide-react';

interface MapViewProps {
  lat: number;
  lng: number;
  height?: number;
}

export default function MapView({ lat, lng, height = 220 }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let isMounted = true;

    async function initMap() {
      const L = (await import('leaflet')).default;
      if (!isMounted || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: [lat, lng],
        zoom: 16,
        zoomControl: true,
        attributionControl: true,
      });

      // OpenStreetMap tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // Custom marker pin
      const customIcon = L.divIcon({
        className: 'custom-single-pin',
        html: `
          <div style="
            width: 22px;
            height: 22px;
            background-color: #10b981;
            border: 3px solid #ffffff;
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          "></div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);

      mapRef.current = map;
      markerRef.current = marker;
      setIsReady(true);
    }

    void initMap();

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  // Update center and marker when coords change
  useEffect(() => {
    if (!isReady || !mapRef.current || !markerRef.current) return;
    mapRef.current.setView([lat, lng], 16);
    markerRef.current.setLatLng([lat, lng]);
  }, [lat, lng, isReady]);

  return (
    <div
      className="relative rounded-xl overflow-hidden border border-slate-200 shadow-sm"
      style={{ height: `${height}px` }}
    >
      <div ref={containerRef} className="h-full w-full" />
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      )}
    </div>
  );
}

