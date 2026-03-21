'use client';

/**
 * LocationPicker
 *
 * Interactive Google Map that lets a user click to drop a pin.
 *
 * Props:
 *  lat / lng   – current coordinates (controlled)
 *  onChange    – called whenever the pin moves or is cleared
 *  readonly    – when true, renders a non-interactive mini-map showing the pin
 *  height      – CSS height of the map container (default '220px')
 */

import { useEffect, useRef, useState } from 'react';
import { Autocomplete, GoogleMap, Marker } from '@react-google-maps/api';
import { useGoogleMaps } from '@/components/GoogleMapsProvider';
import { MapPin, Navigation, Loader2, X, LocateFixed, Search } from 'lucide-react';
import {
    DEFAULT_BARANGAY_CENTER,
    createHouseholdMarkerIcon,
} from '@/lib/map-pins';
import {
    buildDefaultSearchBounds,
    buildSearchQuery,
    getPlacePinDetails,
    resolveLocationFromCoordinates,
    searchLocation,
    type LocationSearchContext,
    type ResolvedLocation,
} from '@/lib/geocoding';

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

const MAP_STYLES = [
    { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9d8e8' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
];

export function LocationPicker({
    lat,
    lng,
    onChange,
    readonly = false,
    height = '220px',
    defaultAddress = '',
    searchContext,
}: LocationPickerProps) {
    const { isLoaded } = useGoogleMaps();
    const [locating, setLocating] = useState(false);
    const [searching, setSearching] = useState(false);
    const [resolvingAddress, setResolvingAddress] = useState(false);
    const [locError, setLocError] = useState('');
    const [searchQuery, setSearchQuery] = useState(defaultAddress);
    const [resolvedAddress, setResolvedAddress] = useState(defaultAddress);
    const [selectedLocation, setSelectedLocation] = useState<ResolvedLocation | null>(null);
    const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
    const mapRef = useRef<google.maps.Map | null>(null);

    const hasPin = lat !== undefined && lng !== undefined;
    const center = hasPin ? { lat, lng } : DEFAULT_BARANGAY_CENTER;

    useEffect(() => {
        setSearchQuery(defaultAddress);
        setResolvedAddress(defaultAddress);
    }, [defaultAddress]);

    // ── Handlers ──────────────────────────────────────────────────────────────

    function applyResolvedLocation(details: ResolvedLocation) {
        setLocError('');
        setSelectedLocation(details);
        setResolvedAddress(details.formattedAddress);
        setSearchQuery(buildSearchQuery(details.formattedAddress, searchContext));
        onChange?.(details.lat, details.lng, details);
        mapRef.current?.panTo({ lat: details.lat, lng: details.lng });
        mapRef.current?.setZoom(17);
    }

    async function reverseGeocode(latValue: number, lngValue: number): Promise<ResolvedLocation | null> {
        const resolved = await resolveLocationFromCoordinates(latValue, lngValue);
        if (resolved) {
            return resolved;
        }

        return {
            lat: latValue,
            lng: lngValue,
            formattedAddress: `${latValue.toFixed(5)}, ${lngValue.toFixed(5)}`,
            displayName: 'Pinned Location',
        };
    }

    async function applyPinFromCoordinates(latValue: number, lngValue: number) {
        setResolvingAddress(true);
        try {
            const details = await reverseGeocode(latValue, lngValue);
            if (details) {
                applyResolvedLocation(details);
                return;
            }

            onChange?.(latValue, lngValue);
        } finally {
            setResolvingAddress(false);
        }
    }

    async function handleMapClick(e: google.maps.MapMouseEvent) {
        if (readonly || !onChange) return;
        const clickLat = e.latLng?.lat();
        const clickLng = e.latLng?.lng();
        if (clickLat !== undefined && clickLng !== undefined) {
            await applyPinFromCoordinates(clickLat, clickLng);
        }
    }

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
            }
        );
    }

    function handleClear() {
        setSelectedLocation(null);
        setResolvedAddress('');
        setSearchQuery('');
        if (onChange) onChange(undefined, undefined);
    }

    async function handleSearch() {
        if (!searchQuery.trim()) return;
        setLocError('');
        setSearching(true);
        try {
            const geocoded = await searchLocation(searchQuery, {
                context: searchContext,
                bounds: buildDefaultSearchBounds(),
                locationBias: mapRef.current?.getCenter()?.toJSON() ?? DEFAULT_BARANGAY_CENTER,
                radiusMeters: 20000,
                region: 'ph',
            });

            if (!geocoded) {
                setLocError('No matching street or address found. Try a more complete street or landmark.');
                return;
            }

            applyResolvedLocation(geocoded);
        } finally {
            setSearching(false);
        }
    }

    function handleAutocompletePlaceChanged() {
        const place = autocompleteRef.current?.getPlace();
        const details = place ? getPlacePinDetails(place) : null;

        if (details) {
            applyResolvedLocation(details);
        }
    }

    // ── Loading state ──────────────────────────────────────────────────────────

    if (!isLoaded) {
        return (
            <div
                className="w-full rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center"
                style={{ height }}
            >
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
        );
    }

    // ── Readonly (view) mode ───────────────────────────────────────────────────

    if (readonly) {
        if (!hasPin) return null;
        return (
            <div className="w-full rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                <GoogleMap
                    mapContainerStyle={{ width: '100%', height }}
                    center={center}
                    zoom={17}
                    options={{
                        disableDefaultUI: true,
                        zoomControl: false,
                        gestureHandling: 'none',
                        clickableIcons: false,
                        styles: MAP_STYLES,
                    }}
                >
                    <Marker position={center} icon={createHouseholdMarkerIcon({ scale: 9 })} />
                </GoogleMap>
            </div>
        );
    }

    // ── Interactive (edit) mode ────────────────────────────────────────────────

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

            <div className="flex flex-col gap-2 sm:flex-row">
                <Autocomplete
                    onLoad={(autocomplete) => {
                        autocompleteRef.current = autocomplete;
                    }}
                    onPlaceChanged={handleAutocompletePlaceChanged}
                    options={{
                        bounds: buildDefaultSearchBounds(),
                        componentRestrictions: { country: 'ph' },
                        fields: ['formatted_address', 'geometry', 'name', 'address_components', 'place_id'],
                    }}
                >
                    <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void handleSearch();
                                }
                            }}
                            className="w-full rounded-md border border-input bg-background py-2 pl-10 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Search street, purok, landmark, or full address"
                        />
                    </div>
                </Autocomplete>
                <button
                    type="button"
                    onClick={() => { void handleSearch(); }}
                    disabled={searching || !searchQuery.trim()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                    {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    {searching ? 'Searching...' : 'Find Street'}
                </button>
            </div>

            {/* Map */}
            <div
                className="w-full rounded-xl overflow-hidden border border-input shadow-sm"
                style={{ height }}
            >
                <GoogleMap
                    mapContainerStyle={{ width: '100%', height: '100%' }}
                    center={center}
                    zoom={hasPin ? 17 : 14}
                    onLoad={(map) => {
                        mapRef.current = map;
                    }}
                    onClick={handleMapClick}
                    options={{
                        disableDefaultUI: false,
                        zoomControl: true,
                        mapTypeControl: true,
                        streetViewControl: true,
                        fullscreenControl: true,
                        gestureHandling: 'greedy',
                        styles: MAP_STYLES,
                        draggableCursor: 'crosshair',
                    }}
                >
                    {hasPin && (
                        <Marker
                            position={center}
                            icon={createHouseholdMarkerIcon()}
                            draggable
                            onDragEnd={(e) => {
                                const newLat = e.latLng?.lat();
                                const newLng = e.latLng?.lng();
                                if (newLat !== undefined && newLng !== undefined && onChange) {
                                    void applyPinFromCoordinates(newLat, newLng);
                                }
                            }}
                        />
                    )}
                </GoogleMap>
            </div>

            {/* Bottom toolbar */}
            <div className="flex items-center justify-between gap-2">
                {/* Use My Location */}
                <button
                    type="button"
                    onClick={handleUseMyLocation}
                    disabled={locating}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-input rounded-md bg-background hover:bg-muted transition-colors disabled:opacity-50"
                >
                    {locating ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                        <LocateFixed className="w-3 h-3" />
                    )}
                    {locating ? 'Locating…' : 'Use My Location'}
                </button>

                {/* Coordinates display */}
                {hasPin && (
                    <span className="text-[11px] text-muted-foreground font-mono">
                        {lat!.toFixed(6)}, {lng!.toFixed(6)}
                    </span>
                )}

                {/* Navigate (open in Google Maps) */}
                {hasPin && (
                    <button
                        type="button"
                        onClick={() =>
                            window.open(`https://maps.google.com/?q=${lat},${lng}`, '_blank')
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
                    >
                        <Navigation className="w-3 h-3" />
                        Open Maps
                    </button>
                )}
            </div>

            {hasPin ? (
                <div className="rounded-xl border border-border bg-card px-3 py-3 shadow-sm">
                    {resolvingAddress ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Resolving real location details from Google...
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-foreground">
                                        {selectedLocation?.displayName || selectedLocation?.streetAddress || 'Pinned Location'}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {resolvedAddress || 'Google matched this pin to the nearest available address.'}
                                    </p>
                                </div>
                                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                                    Auto-fill ready
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                <span className="font-mono">{lat!.toFixed(6)}, {lng!.toFixed(6)}</span>
                                <span>Clicking or dragging the pin updates the form fields when Google returns street details.</span>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    <span>Search for a street or click the map to get the matched address from Google.</span>
                </div>
            )}

            {/* Geolocation error */}
            {locError && (
                <p className="text-xs text-destructive">{locError}</p>
            )}
        </div>
    );
}
