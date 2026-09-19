'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker as LeafletMarker, LayerGroup as LeafletLayerGroup } from 'leaflet';
import { Loader2 } from 'lucide-react';
import type { Household, PinQaStatus } from '@/lib/db/schema';
import { DEFAULT_BARANGAY_CENTER, hasHouseholdPin } from '@/lib/map-pins';
import { formatRegistrationStatusLabel, getHouseholdRegistrationStatus } from '@/lib/household-registration';

interface AdminReviewLeafletMapProps {
  households: Household[];
  selectedId: string | null;
  onSelectHousehold: (id: string | null) => void;
  getPinQaStatus: (household: Household) => PinQaStatus;
  className?: string;
}

const PIN_COLORS: Record<PinQaStatus, string> = {
  valid: '#10b981', // Emerald / Green
  needs_verification: '#f59e0b', // Amber
  duplicate: '#ef4444', // Red
};

export default function AdminReviewLeafletMap({
  households,
  selectedId,
  onSelectHousehold,
  getPinQaStatus,
  className = 'h-full w-full',
}: AdminReviewLeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersGroupRef = useRef<LeafletLayerGroup | null>(null);
  const markersMapRef = useRef<Map<string, LeafletMarker>>(new Map());
  const [isReady, setIsReady] = useState(false);

  // 1. Initialize Leaflet Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let isMounted = true;

    async function initMap() {
      const L = (await import('leaflet')).default;
      if (!isMounted || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: [DEFAULT_BARANGAY_CENTER.lat, DEFAULT_BARANGAY_CENTER.lng],
        zoom: 14,
        zoomControl: true,
        attributionControl: true,
      });

      // Standard OpenStreetMap (StreetMaps) Tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      const markersGroup = L.layerGroup().addTo(map);

      mapRef.current = map;
      markersGroupRef.current = markersGroup;
      setIsReady(true);
    }

    void initMap();

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersGroupRef.current = null;
        markersMapRef.current.clear();
      }
    };
  }, []);

  // 2. Render Markers when households or selectedId changes
  useEffect(() => {
    if (!isReady || !mapRef.current || !markersGroupRef.current) return;

    let isCancelled = false;

    async function updateMarkers() {
      const L = (await import('leaflet')).default;
      if (isCancelled || !mapRef.current || !markersGroupRef.current) return;

      const group = markersGroupRef.current;
      group.clearLayers();
      markersMapRef.current.clear();

      const pinnedHouseholds = households.filter(hasHouseholdPin);
      const latLngs: [number, number][] = [];

      pinnedHouseholds.forEach((household) => {
        const isSelected = household.id === selectedId;
        const status = getPinQaStatus(household);
        const color = PIN_COLORS[status] || '#f59e0b';
        const size = isSelected ? 24 : 18;

        const customIcon = L.divIcon({
          className: 'custom-leaflet-pin',
          html: `
            <div style="
              width: ${size}px;
              height: ${size}px;
              background-color: ${color};
              border: ${isSelected ? '3px solid #1e1b4b' : '2px solid #ffffff'};
              border-radius: 50%;
              box-shadow: ${isSelected ? '0 0 0 4px rgba(99, 102, 241, 0.4), 0 4px 12px rgba(0,0,0,0.35)' : '0 2px 6px rgba(0,0,0,0.25)'};
              cursor: pointer;
              transition: transform 0.2s;
            "></div>
          `,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          popupAnchor: [0, -size / 2],
        });

        const marker = L.marker([household.gps_lat, household.gps_long], {
          icon: customIcon,
          title: household.head_name,
        });

        const regStatus = formatRegistrationStatusLabel(getHouseholdRegistrationStatus(household));

        marker.bindPopup(`
          <div style="font-family: inherit; font-size: 13px; line-height: 1.4; min-width: 200px;">
            <strong style="font-size: 14px; color: #0f172a;">${household.head_name}</strong>
            <p style="margin: 4px 0 2px 0; color: #64748b; font-size: 12px;">${household.street_address || 'No street address'}</p>
            <p style="margin: 0; color: #64748b; font-size: 12px;">${household.purok_sitio}</p>
            <div style="margin-top: 6px; padding: 2px 8px; border-radius: 9999px; display: inline-block; background: #f1f5f9; color: #334155; font-size: 11px; font-weight: 600;">
              ${regStatus}
            </div>
          </div>
        `);

        marker.on('click', () => {
          onSelectHousehold(household.id);
        });

        group.addLayer(marker);
        markersMapRef.current.set(household.id, marker);
        latLngs.push([household.gps_lat, household.gps_long]);
      });

      // Center/pan appropriately
      if (selectedId) {
        const selectedMarker = markersMapRef.current.get(selectedId);
        const selectedHousehold = pinnedHouseholds.find((h) => h.id === selectedId);
        if (selectedHousehold && selectedMarker) {
          mapRef.current.flyTo([selectedHousehold.gps_lat, selectedHousehold.gps_long], 17, {
            duration: 0.8,
          });
          selectedMarker.openPopup();
          return;
        }
      }

      // If no item is selected, fit bounds to show all pins
      if (latLngs.length > 0) {
        const bounds = L.latLngBounds(latLngs);
        mapRef.current.fitBounds(bounds, { padding: [35, 35], maxZoom: 16 });
      } else {
        mapRef.current.setView(
          [DEFAULT_BARANGAY_CENTER.lat, DEFAULT_BARANGAY_CENTER.lng],
          14,
        );
      }
    }

    void updateMarkers();

    return () => {
      isCancelled = true;
    };
  }, [households, isReady, selectedId, getPinQaStatus, onSelectHousehold]);

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="h-full w-full rounded-b-3xl" />
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
            Loading OpenStreetMap...
          </div>
        </div>
      )}
    </div>
  );
}
