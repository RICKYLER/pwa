

'use client';

import { useCallback } from 'react';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { Loader2 } from 'lucide-react';
import { useGoogleMaps } from '@/components/GoogleMapsProvider';

interface MapViewProps {
    lat: number;
    lng: number;
    height?: number;
}

const MAP_STYLES = [
    { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9d8e8' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e5f0e0' }] },
];

export default function MapView({ lat, lng, height = 220 }: MapViewProps) {
    const center = { lat, lng };
    // Wait for the Maps SDK to finish loading (GoogleMapsProvider / useJsApiLoader)
    const { isLoaded } = useGoogleMaps();

    const onLoad = useCallback((map: google.maps.Map) => {
        map.setCenter(center);
    }, [lat, lng]);

    if (!isLoaded) {
        return (
            <div className="flex items-center justify-center bg-slate-100 rounded-xl" style={{ height }}>
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
        );
    }

    return (
        <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
            <GoogleMap
                mapContainerStyle={{ width: '100%', height: `${height}px` }}
                center={center}
                zoom={16}
                onLoad={onLoad}
                options={{
                    styles: MAP_STYLES,
                    disableDefaultUI: true,
                    zoomControl: true,
                    fullscreenControl: true,
                    gestureHandling: 'cooperative',
                    clickableIcons: false,
                }}
            >
                <Marker
                    position={center}
                    animation={google.maps.Animation.DROP}
                    icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 11,
                        fillColor: '#10b981',
                        fillOpacity: 1,
                        strokeWeight: 3,
                        strokeColor: '#ffffff',
                    }}
                />
            </GoogleMap>
        </div>
    );
}
