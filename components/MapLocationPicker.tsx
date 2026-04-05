'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { MapPin, Crosshair, Loader2, Search, X, AlertCircle, CheckCircle } from 'lucide-react';
import { resolveLocationFromCoordinates, searchLocation } from '@/lib/geocoding';
import type { ResolvedLocation } from '@/lib/geocoding';

interface Coords { lat: number; lng: number; }

interface MapLocationPickerProps {
    onLocationChange: (address: string, coords: Coords) => void;
    defaultCenter?: Coords;
    defaultAddress?: string;
    municipality?: string;
    barangayName?: string;
}

// Default: Davao City, Philippines
const DEFAULT_CENTER: Coords = { lat: 7.0736, lng: 125.6128 };

const MAP_STYLES = [
    { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9d8e8' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e5f0e0' }] },
];

export default function MapLocationPicker({
    onLocationChange,
    defaultCenter = DEFAULT_CENTER,
    defaultAddress = '',
    municipality,
    barangayName,
}: MapLocationPickerProps) {
    const [center, setCenter] = useState<Coords>(defaultCenter);
    const [marker, setMarker] = useState<Coords | null>(null);
    const [address, setAddress] = useState(defaultAddress);
    const [searchQuery, setSearchQuery] = useState('');
    const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [ready, setReady] = useState(false);
    const [locationType, setLocationType] = useState<string | null>(null);
    const [addressQuality, setAddressQuality] = useState<'street' | 'neighborhood' | 'city' | null>(null);
    const mapRef = useRef<google.maps.Map | null>(null);

    // Helper to determine address quality
    function getAddressQuality(resolved: ResolvedLocation | null): 'street' | 'neighborhood' | 'city' | null {
        if (!resolved) return null;
        
        if (resolved.streetAddress && resolved.streetAddress !== resolved.barangayName && 
            resolved.streetAddress !== resolved.municipality) {
            return 'street';
        }
        
        if (resolved.purokSitio || resolved.barangayName) {
            return 'neighborhood';
        }
        
        return 'city';
    }

    // Wait for window.google (injected by parent LoadScript)
    useEffect(() => {
        if (typeof window !== 'undefined' && window.google) {
            setReady(true);
        }
    }, []);

    const onMapLoad = useCallback((map: google.maps.Map) => {
        mapRef.current = map;
    }, []);

    const handleMapClick = useCallback(async (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        const coords: Coords = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        setMarker(coords);
        setIsReverseGeocoding(true);
        
        const resolved = await resolveLocationFromCoordinates(coords.lat, coords.lng);
        
        if (resolved) {
            setAddress(resolved.formattedAddress);
            setAddressQuality(getAddressQuality(resolved));
            setLocationType(null);
            onLocationChange(resolved.formattedAddress, coords);
        } else {
            const fallbackAddr = `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
            setAddress(fallbackAddr);
            setAddressQuality(null);
            setLocationType(null);
            onLocationChange(fallbackAddr, coords);
        }
        
        setIsReverseGeocoding(false);
    }, [onLocationChange]);

    async function handleSearch() {
        if (!searchQuery.trim() || !window.google) return;
        setIsSearching(true);
        
        const resolved = await searchLocation(searchQuery, {
            context: {
                municipality,
                barangayName,
            },
            locationBias: center,
        });
        
        setIsSearching(false);
        
        if (resolved) {
            const coords: Coords = { lat: resolved.lat, lng: resolved.lng };
            setCenter(coords);
            setMarker(coords);
            setAddress(resolved.formattedAddress);
            setAddressQuality(getAddressQuality(resolved));
            setLocationType(null);
            onLocationChange(resolved.formattedAddress, coords);
            mapRef.current?.panTo(coords);
            mapRef.current?.setZoom(17);
        }
    }

    function useMyLocation() {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(async pos => {
            const coords: Coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setCenter(coords);
            setMarker(coords);
            mapRef.current?.panTo(coords);
            mapRef.current?.setZoom(17);
            setIsReverseGeocoding(true);
            
            const resolved = await resolveLocationFromCoordinates(coords.lat, coords.lng);
            
            if (resolved) {
                setAddress(resolved.formattedAddress);
                setAddressQuality(getAddressQuality(resolved));
                setLocationType(null);
                onLocationChange(resolved.formattedAddress, coords);
            } else {
                const fallbackAddr = `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
                setAddress(fallbackAddr);
                setAddressQuality(null);
                setLocationType(null);
                onLocationChange(fallbackAddr, coords);
            }
            
            setIsReverseGeocoding(false);
        });
    }

    if (!ready) {
        return (
            <div className="h-48 flex items-center justify-center bg-slate-100 rounded-xl">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
        );
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
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
                        className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
                    />
                    {searchQuery && (
                        <button type="button" onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
                <button
                    type="button"
                    onClick={handleSearch}
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

            {/* Map */}
            <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                <GoogleMap
                    mapContainerStyle={{ width: '100%', height: '280px' }}
                    center={center}
                    zoom={14}
                    onLoad={onMapLoad}
                    onClick={handleMapClick}
                    options={{
                        styles: MAP_STYLES,
                        disableDefaultUI: false,
                        zoomControl: true,
                        streetViewControl: false,
                        mapTypeControl: false,
                        fullscreenControl: true,
                        clickableIcons: false,
                        gestureHandling: 'cooperative',
                    }}
                >
                    {marker && (
                        <Marker
                            position={marker}
                            animation={google.maps.Animation.DROP}
                            icon={{
                                path: google.maps.SymbolPath.CIRCLE,
                                scale: 10,
                                fillColor: '#10b981',
                                fillOpacity: 1,
                                strokeWeight: 3,
                                strokeColor: '#ffffff',
                            }}
                        />
                    )}
                </GoogleMap>
            </div>

            {/* Address result */}
            <div className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all ${marker ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                <MapPin className={`w-4 h-4 flex-shrink-0 mt-0.5 ${marker ? 'text-emerald-600' : 'text-slate-400'}`} />
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
