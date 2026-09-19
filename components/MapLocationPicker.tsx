'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import { MapPin, Crosshair, Loader2, Search, X, AlertCircle, CheckCircle } from 'lucide-react';
import { DEFAULT_BARANGAY_CENTER } from '@/lib/map-pins';
import { osmReverseGeocode, osmSearchLocation } from '@/lib/osm-geocoding';

interface Coords {
  lat: number;
  lng: number;
}

interface MapLocationPickerProps {
  onLocationChange: (address: string, coords: Coords) => void;
  defaultCenter?: Coords;
  defaultAddress?: string;
  municipality?: string;
  barangayName?: string;
}

export default function MapLocationPicker({
  onLocationChange,
  defaultCenter,
  defaultAddress = '',
  municipality,
  barangayName,
}: MapLocationPickerProps) {
  const initialCenter: Coords = defaultCenter || {
    lat: DEFAULT_BARANGAY_CENTER.lat,
    lng: DEFAULT_BARANGAY_CENTER.lng,
  };

  const [center, setCenter] = useState<Coords>(initialCenter);
  const [markerCoords, setMarkerCoords] = useState<Coords | null>(defaultCenter || null);
  const [address, setAddress] = useState(defaultAddress);
  const [searchQuery, setSearchQuery] = useState('');
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [addressQuality, setAddressQuality] = useState<'street' | 'neighborhood' | 'city' | null>(
    defaultAddress ? 'street' : null,
  );
  const [isMapReady, setIsMapReady] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let isMounted = true;

    async function initMap() {
      const L = (await import('leaflet')).default;
      if (!isMounted || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: [initialCenter.lat, initialCenter.lng],
        zoom: 14,
        zoomControl: true,
        attributionControl: true,
      });

      // Standard OpenStreetMap tiles (free, reliable, no API key required)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // Custom emerald circle pin
      const customIcon = L.divIcon({
        className: 'custom-picker-pin',
        html: `
          <div style="
            width: 22px;
            height: 22px;
            background-color: #10b981;
            border: 3px solid #ffffff;
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(0,0,0,0.35);
            cursor: pointer;
          "></div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      // Place initial marker if coords provided
      if (defaultCenter) {
        const marker = L.marker([defaultCenter.lat, defaultCenter.lng], { icon: customIcon }).addTo(map);
        markerRef.current = marker;
      }

      // Handle map clicks
      map.on('click', async (e) => {
        const clickedCoords: Coords = { lat: e.latlng.lat, lng: e.latlng.lng };
        setMarkerCoords(clickedCoords);

        if (markerRef.current) {
          markerRef.current.setLatLng([clickedCoords.lat, clickedCoords.lng]);
        } else {
          markerRef.current = L.marker([clickedCoords.lat, clickedCoords.lng], { icon: customIcon }).addTo(map);
        }

        setIsReverseGeocoding(true);
        const resolved = await osmReverseGeocode(clickedCoords.lat, clickedCoords.lng);
        setIsReverseGeocoding(false);

        if (resolved) {
          setAddress(resolved.formattedAddress);
          setAddressQuality(resolved.quality);
          onLocationChange(resolved.formattedAddress, clickedCoords);
        } else {
          const fallbackAddr = `${clickedCoords.lat.toFixed(5)}, ${clickedCoords.lng.toFixed(5)}`;
          setAddress(fallbackAddr);
          setAddressQuality(null);
          onLocationChange(fallbackAddr, clickedCoords);
        }
      });

      mapRef.current = map;
      setIsMapReady(true);

      // Invalidate size shortly after mounting to ensure perfect rendering
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
        }
      }, 200);
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

  // Update marker helper
  const placeOrUpdateMarker = useCallback(
    async (coords: Coords) => {
      if (!mapRef.current) return;
      const L = (await import('leaflet')).default;

      if (markerRef.current) {
        markerRef.current.setLatLng([coords.lat, coords.lng]);
      } else {
        const customIcon = L.divIcon({
          className: 'custom-picker-pin',
          html: `
            <div style="
              width: 22px;
              height: 22px;
              background-color: #10b981;
              border: 3px solid #ffffff;
              border-radius: 50%;
              box-shadow: 0 2px 8px rgba(0,0,0,0.35);
              cursor: pointer;
            "></div>
          `,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        markerRef.current = L.marker([coords.lat, coords.lng], { icon: customIcon }).addTo(mapRef.current);
      }

      mapRef.current.flyTo([coords.lat, coords.lng], 16, { duration: 0.8 });
    },
    [],
  );

  // Search address handler
  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setIsSearching(true);

    const resolved = await osmSearchLocation(searchQuery, {
      municipality,
      barangayName,
    });

    setIsSearching(false);

    if (resolved) {
      const coords: Coords = { lat: resolved.lat, lng: resolved.lng };
      setCenter(coords);
      setMarkerCoords(coords);
      setAddress(resolved.formattedAddress);
      setAddressQuality(resolved.quality);
      onLocationChange(resolved.formattedAddress, coords);
      await placeOrUpdateMarker(coords);
    }
  }

  // Use current GPS location
  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const coords: Coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCenter(coords);
      setMarkerCoords(coords);
      await placeOrUpdateMarker(coords);

      setIsReverseGeocoding(true);
      const resolved = await osmReverseGeocode(coords.lat, coords.lng);
      setIsReverseGeocoding(false);

      if (resolved) {
        setAddress(resolved.formattedAddress);
        setAddressQuality(resolved.quality);
        onLocationChange(resolved.formattedAddress, coords);
      } else {
        const fallbackAddr = `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
        setAddress(fallbackAddr);
        setAddressQuality(null);
        onLocationChange(fallbackAddr, coords);
      }
    });
  }

  return (
    <div className="space-y-2.5">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search address or place…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void handleSearch())}
            className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => void handleSearch()}
          disabled={isSearching || !searchQuery.trim()}
          className="px-4 py-2.5 text-sm font-semibold bg-slate-800 text-white rounded-xl hover:bg-slate-700 disabled:opacity-40 transition-all flex items-center gap-1.5"
        >
          {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          Search
        </button>
        <button
          type="button"
          onClick={useMyLocation}
          title="Use my current location"
          className="p-2.5 border border-slate-200 rounded-xl text-slate-500 hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50 transition-all"
        >
          <Crosshair className="w-4 h-4" />
        </button>
      </div>

      {/* StreetMaps Leaflet Container */}
      <div className="relative rounded-xl overflow-hidden border border-slate-200 shadow-sm" style={{ height: '280px' }}>
        <div ref={containerRef} className="h-full w-full" />
        {!isMapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100/90 backdrop-blur-sm z-[500]">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
              Loading StreetMaps...
            </div>
          </div>
        )}
      </div>

      {/* Address result */}
      <div
        className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all ${
          markerCoords ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <MapPin
          className={`w-4 h-4 flex-shrink-0 mt-0.5 ${markerCoords ? 'text-emerald-600' : 'text-slate-400'}`}
        />
        <div className="flex-1 min-w-0">
          {isReverseGeocoding ? (
            <span className="text-slate-400 flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Getting address…
            </span>
          ) : address ? (
            <div className="space-y-1">
              <div className="flex items-start gap-2">
                <span className="text-slate-700 font-medium flex-1">{address}</span>
                {addressQuality === 'street' && (
                  <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-md whitespace-nowrap">
                    <CheckCircle className="w-3 h-3" />
                    Street-level
                  </span>
                )}
                {addressQuality === 'neighborhood' && (
                  <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-md whitespace-nowrap">
                    Neighborhood-level
                  </span>
                )}
                {addressQuality === 'city' && (
                  <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-md whitespace-nowrap">
                    <AlertCircle className="w-3 h-3" />
                    City-level
                  </span>
                )}
              </div>
            </div>
          ) : (
            <span className="text-slate-400">Click on the map or search to pin a location</span>
          )}
        </div>
      </div>
    </div>
  );
}
