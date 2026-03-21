'use client';

// The Google Maps SDK is loaded once globally by GoogleMapsProvider in app/layout.tsx.
// This layout just passes children through so the distribution pages still get
// their own layout segment without any duplicate SDK loading.

export default function DistributionLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
