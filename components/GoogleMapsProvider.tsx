'use client';

// GoogleMapsProvider — loads the Maps JavaScript SDK exactly once for the
// entire app AND wires Firebase App Check into it.
//
// Per https://developers.google.com/maps/documentation/javascript/maps-app-check
// the key step after loading the Maps SDK is:
//   Settings.getInstance().fetchAppCheckToken = () => getToken(appCheck)
// This makes every Maps API request carry a valid reCAPTCHA Enterprise token.

import { useJsApiLoader } from '@react-google-maps/api';
import { createContext, useContext, useEffect, ReactNode } from 'react';
import { getAppCheckToken } from '@/lib/firebase';

// Keep the array reference stable — @react-google-maps/api compares by reference.
const LIBRARIES: ('places')[] = ['places'];

// Other map components read `isLoaded` from this context instead of
// calling useJsApiLoader themselves (avoids "called with different options" crash).
export const GoogleMapsContext = createContext<{ isLoaded: boolean }>({ isLoaded: false });

export function useGoogleMaps() {
    return useContext(GoogleMapsContext);
}

function ActiveGoogleMapsLoader({ children, apiKey }: { children: ReactNode; apiKey: string }) {
    const { isLoaded } = useJsApiLoader({
        googleMapsApiKey: apiKey,
        libraries: LIBRARIES,
    });

    // Once the Maps SDK is ready, attach App Check so every API request
    // is automatically accompanied by a Firebase attestation token.
    useEffect(() => {
        if (!isLoaded || typeof window === 'undefined' || !window.google?.maps) return;
        try {
            // `google.maps.Settings` is only available after the SDK loads.
            // Cast to `any` because `fetchAppCheckToken` is a newer property
            // not yet in the @types/google.maps type definitions.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const settings = (google.maps as any).Settings?.getInstance?.();
            if (settings) {
                settings.fetchAppCheckToken = () =>
                    getAppCheckToken().then(result => result ?? { token: '' });
            }
        } catch (err) {
            // Non-fatal — maps will still work, just without App Check enforcement
            console.warn('Could not attach App Check to Maps:', err);
        }
    }, [isLoaded]);

    return (
        <GoogleMapsContext.Provider value={{ isLoaded }}>
            {children}
        </GoogleMapsContext.Provider>
    );
}

export default function GoogleMapsProvider({ children }: { children: ReactNode }) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY?.trim();

    // If no Google Maps key is set or active, do NOT load the script tag at all.
    // This completely prevents Google's "This page can't load Google Maps correctly" popup.
    if (!apiKey || apiKey === 'dummy' || apiKey === 'undefined') {
        return (
            <GoogleMapsContext.Provider value={{ isLoaded: false }}>
                {children}
            </GoogleMapsContext.Provider>
        );
    }

    return <ActiveGoogleMapsLoader apiKey={apiKey}>{children}</ActiveGoogleMapsLoader>;
}
