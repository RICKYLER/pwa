'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { MapPin, Crosshair, Loader2, Search, X } from 'lucide-react';

interface Coords { lat: number; lng: number; }

interface MapLocationPickerProps {
    onLocationChange: (address: string, coords: Coords) => void;
    defaultCenter?: Coords;
    defaultAddress?: string;
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
}: MapLocationPickerProps) {
    const [center, setCenter] = useState<Coords>(defaultCenter);
    const [marker, setMarker] = useState<Coords | null>(null);
    const [address, setAddress] = useState(defaultAddress);
    const [searchQuery, setSearchQuery] = useState('');
    const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [ready, setReady] = useState(false);
    const mapRef = useRef<google.maps.Map | null>(null);

    // Wait for window.google (injected by parent LoadScript)
    useEffect(() => {
        if (typeof window !== 'undefined' && window.google) {
            setReady(true);
        }
    }, []);

    const onMapLoad = useCallback((map: google.maps.Map) => {
        mapRef.current = map;
    }, []);

    async function reverseGeocode(coords: Coords): Promise<string> {
        return new Promise(resolve => {
            const geocoder = new window.google.maps.Geocoder();
            geocoder.geocode({ location: coords }, (results, status) => {
                if (status === 'OK' && results && results[0]) {
                    resolve(results[0].formatted_address);
                } else {
                    resolve(`${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
                }
            });
        });
    }

    const handleMapClick = useCallback(async (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        const coords: Coords = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        setMarker(coords);
        setIsReverseGeocoding(true);
        const addr = await reverseGeocode(coords);
        setAddress(addr);
        setIsReverseGeocoding(false);
        onLocationChange(addr, coords);
    }, [onLocationChange]);

    async function handleSearch() {
        if (!searchQuery.trim() || !window.google) return;
        setIsSearching(true);
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address: searchQuery }, (results, status) => {
            setIsSearching(false);
            if (status === 'OK' && results && results[0]) {
                const loc = results[0].geometry.location;
                const coords: Coords = { lat: loc.lat(), lng: loc.lng() };
                setCenter(coords);
                setMarker(coords);
                const addr = results[0].formatted_address;
                setAddress(addr);
                onLocationChange(addr, coords);
                mapRef.current?.panTo(coords);
                mapRef.current?.setZoom(17);
            }
        });
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
            const addr = await reverseGeocode(coords);
            setAddress(addr);
            setIsReverseGeocoding(false);
            onLocationChange(addr, coords);
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
                {isReverseGeocoding ? (
                    <span className="text-slate-400 flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Getting address…
                    </span>
                ) : address ? (
                    <span className="text-slate-700 font-medium">{address}</span>
                ) : (
                    <span className="text-slate-400">Click on the map or search to pin a location</span>
                )}
            </div>
        </div>
    );
}
