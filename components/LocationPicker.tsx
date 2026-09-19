'use client';

/**
 * LocationPicker
 *
 * Interactive Street Map (powered by Leaflet & OpenStreetMap) that lets a user click or drag to drop a pin.
 *
 * Props:
 *  lat / lng   – current coordinates (controlled)
 *  onChange    – called whenever the pin moves or is cleared
 *  readonly    – when true, renders a non-interactive mini-map showing the pin
 *  height      – CSS height of the map container (default '220px')
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import { MapPin, Navigation, Loader2, X, LocateFixed, Search } from 'lucide-react';
import { DEFAULT_BARANGAY_CENTER } from '@/lib/map-pins';
import { osmReverseGeocode, osmSearchLocation } from '@/lib/osm-geocoding';
import { buildSearchQuery, type LocationSearchContext, type ResolvedLocation } from '@/lib/geocoding';

interface LocationPickerProps {
  lat?: number;
  lng?: number;
  onChange?: (
    lat: number | undefined,
    lng: number | undefined,
    details?: ResolvedLocation,
  ) => void;
  readonly?: boolean;
  height?: string;
  defaultAddress?: string;
  searchContext?: LocationSearchContext;
}

export function LocationPicker({
  lat,
  lng,
  onChange,
  readonly = false,
  height = '220px',
  defaultAddress = '',
  searchContext,
}: LocationPickerProps) {
  const [isMapReady, setIsMapReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [locError, setLocError] = useState('');
  const [searchQuery, setSearchQuery] = useState(defaultAddress);
  const [resolvedAddress, setResolvedAddress] = useState(defaultAddress);
  const [selectedLocation, setSelectedLocation] = useState<ResolvedLocation | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);

  const hasPin = typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng);

  useEffect(() => {
    setSearchQuery(defaultAddress);
    setResolvedAddress(defaultAddress);
  }, [defaultAddress]);

  // Create custom marker icon
  const getMarkerIcon = useCallback(async () => {
    const L = (await import('leaflet')).default;
    return L.divIcon({
      className: 'custom-location-picker-pin',
      html: `
        <div style="
          width: 22px;
          height: 22px;
          background-color: #0f766e;
          border: 3px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.35);
          cursor: ${readonly ? 'default' : 'grab'};
        "></div>
      `,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  }, [readonly]);

  // 1. Initialize Leaflet Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let isMounted = true;

    async function initMap() {
      const L = (await import('leaflet')).default;
      if (!isMounted || !containerRef.current) return;

      const initialLat = hasPin ? lat : DEFAULT_BARANGAY_CENTER.lat;
      const initialLng = hasPin ? lng : DEFAULT_BARANGAY_CENTER.lng;

      const map = L.map(containerRef.current, {
        center: [initialLat, initialLng],
        zoom: hasPin ? 16 : 14,
        zoomControl: !readonly,
        attributionControl: true,
        dragging: !readonly,
        touchZoom: !readonly,
        scrollWheelZoom: !readonly,
        doubleClickZoom: !readonly,
      });

      // Standard OpenStreetMap tiles (StreetMaps)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;

      // Add initial marker if coords present
      if (hasPin) {
        const icon = await getMarkerIcon();
        if (!isMounted || !mapRef.current) return;

        const marker = L.marker([lat, lng], {
          icon,
          draggable: !readonly,
        }).addTo(map);

        if (!readonly) {
          marker.on('dragend', async (e) => {
            const target = e.target as LeafletMarker;
            const newPos = target.getLatLng();
            await applyPinFromCoordinates(newPos.lat, newPos.lng);
          });
        }

        markerRef.current = marker;
      }

      // Handle map clicks
      if (!readonly) {
        map.on('click', async (e) => {
          await applyPinFromCoordinates(e.latlng.lat, e.latlng.lng);
        });
      }

      setIsMapReady(true);

      // Invalidate size to ensure full tile rendering
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

  // 2. React to external lat/lng prop changes
  useEffect(() => {
    if (!isMapReady || !mapRef.current) return;

    let isCancelled = false;

    async function updatePin() {
      if (hasPin) {
        const L = (await import('leaflet')).default;
        if (isCancelled || !mapRef.current) return;

        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          const icon = await getMarkerIcon();
          if (isCancelled || !mapRef.current) return;

          const marker = L.marker([lat, lng], {
            icon,
            draggable: !readonly,
          }).addTo(mapRef.current);

          if (!readonly) {
            marker.on('dragend', async (e) => {
              const target = e.target as LeafletMarker;
              const newPos = target.getLatLng();
              await applyPinFromCoordinates(newPos.lat, newPos.lng);
            });
          }

          markerRef.current = marker;
        }
      } else {
        if (markerRef.current) {
          markerRef.current.remove();
          markerRef.current = null;
        }
      }
    }

    void updatePin();

    return () => {
      isCancelled = true;
    };
  }, [lat, lng, hasPin, isMapReady, readonly, getMarkerIcon]);

  // Apply resolved location updates
  function applyResolvedLocation(details: ResolvedLocation) {
    setLocError('');
    setSelectedLocation(details);
    setResolvedAddress(details.formattedAddress);
    setSearchQuery(buildSearchQuery(details.formattedAddress, searchContext));
    onChange?.(details.lat, details.lng, details);

    if (mapRef.current) {
      mapRef.current.flyTo([details.lat, details.lng], 16, { duration: 0.8 });
    }
  }

  // Reverse geocode and update coordinates
  async function applyPinFromCoordinates(latValue: number, lngValue: number) {
    if (readonly || !onChange) return;

    setResolvingAddress(true);
    setLocError('');

    try {
      const resolved = await osmReverseGeocode(latValue, lngValue);

      if (resolved) {
        applyResolvedLocation(resolved);
      } else {
        const fallback: ResolvedLocation = {
          lat: latValue,
          lng: lngValue,
          formattedAddress: `${latValue.toFixed(5)}, ${lngValue.toFixed(5)}`,
          displayName: 'Pinned Location',
        };
        applyResolvedLocation(fallback);
      }
    } catch {
      onChange(latValue, lngValue);
    } finally {
      setResolvingAddress(false);
    }
  }

  // Search handler using OpenStreetMap Nominatim
  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setLocError('');
    setSearching(true);

    try {
      const geocoded = await osmSearchLocation(searchQuery, {
        municipality: searchContext?.municipality,
        barangayName: searchContext?.barangayName,
      });

      if (!geocoded) {
        setLocError('No matching street or address found. Try a more complete street or landmark.');
        return;
      }

      applyResolvedLocation(geocoded);
    } catch {
      setLocError('Search failed. Please check your network connection.');
    } finally {
      setSearching(false);
    }
  }

  // GPS Current Location handler
  function handleUseMyLocation() {
    if (!onChange) return;
    setLocError('');

    if (!navigator.geolocation) {
      setLocError('Geolocation is not supported by your browser.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocating(false);
        await applyPinFromCoordinates(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setLocError('Could not get location: ' + err.message);
        setLocating(false);
      },
    );
  }

  // Clear pin
  function handleClear() {
    setSelectedLocation(null);
    setResolvedAddress('');
    setSearchQuery('');
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    if (onChange) onChange(undefined, undefined);
  }

  // Readonly (view) mode
  if (readonly) {
    if (!hasPin) return null;
    return (
      <div
        className="w-full rounded-xl overflow-hidden border border-slate-200 shadow-sm relative"
        style={{ height }}
      >
        <div ref={containerRef} className="h-full w-full" />
        {!isMapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        )}
      </div>
    );
  }

  // Interactive (edit) mode
  return (
    <div className="space-y-2">
      {/* Instruction strip */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          {hasPin ? 'Search a street, drag, or click to refine the pin' : 'Search a street or click on the map to drop a pin'}
        </p>
        {hasPin && (
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 text-xs text-destructive hover:opacity-80 transition-opacity"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Search Input and Find Street Button */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void handleSearch())}
            className="w-full rounded-md border border-input bg-background py-2 pl-10 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Search street, purok, landmark, or full address"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            void handleSearch();
          }}
          disabled={searching || !searchQuery.trim()}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          {searching ? 'Searching...' : 'Find Street'}
        </button>
      </div>

      {/* StreetMaps Leaflet Container */}
      <div
        className="w-full rounded-xl overflow-hidden border border-input shadow-sm relative"
        style={{ height }}
      >
        <div ref={containerRef} className="h-full w-full" />
        {!isMapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100/90 backdrop-blur-sm z-[500]">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
              Loading StreetMaps...
            </div>
          </div>
        )}
      </div>

      {/* Bottom toolbar */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={locating}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-input rounded-md bg-background hover:bg-muted transition-colors disabled:opacity-50"
        >
          {locating ? <Loader2 className="w-3 h-3 animate-spin" /> : <LocateFixed className="w-3 h-3" />}
          {locating ? 'Locating…' : 'Use My Location'}
        </button>

        {hasPin && (
          <span className="text-[11px] text-muted-foreground font-mono">
            {lat!.toFixed(6)}, {lng!.toFixed(6)}
          </span>
        )}

        {hasPin && (
          <button
            type="button"
            onClick={() =>
              window.open(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`, '_blank')
            }
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
          >
            <Navigation className="w-3 h-3" />
            Open Maps
          </button>
        )}
      </div>

      {/* Result Card */}
      {hasPin ? (
        <div className="rounded-xl border border-border bg-card px-3 py-3 shadow-sm">
          {resolvingAddress ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Resolving real location details from StreetMaps...
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {selectedLocation?.displayName || selectedLocation?.streetAddress || 'Pinned Location'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {resolvedAddress || 'StreetMaps matched this pin to the nearest available address.'}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                  Auto-fill ready
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="font-mono">
                  {lat!.toFixed(6)}, {lng!.toFixed(6)}
                </span>
                <span>Clicking or dragging the pin updates the location in real time.</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>Search for a street or click the map to get the matched address.</span>
        </div>
      )}

      {/* Geolocation error */}
      {locError && <p className="text-xs text-destructive">{locError}</p>}
    </div>
  );
}
