'use client';

import { LoadScript } from '@react-google-maps/api';

const LIBRARIES: ('places')[] = ['places'];

export default function DistributionLayout({ children }: { children: React.ReactNode }) {
    return (
        <LoadScript
            googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''}
            libraries={LIBRARIES}
            loadingElement={<>{children}</>}
        >
            {children}
        </LoadScript>
    );
}
