'use client';

// ─── PageLoading ──────────────────────────────────────────────────────────────
// Single component that picks the right loading skeleton based on viewport:
//   • Mobile  (<1024px) → MobileLoading
//   • Desktop (≥1024px) → DesktopLoading
//
// Usage — drop it anywhere you'd conditionally render a spinner:
//
//   import PageLoading from '@/components/PageLoading';
//   if (loading) return <PageLoading />;
//
// Next.js Suspense / route-level usage:
//   Create a `loading.tsx` right next to your `page.tsx` that re-exports this.

import MobileLoading from '@/components/mobile/MobileLoading';
import DesktopLoading from '@/components/desktop/DesktopLoading';

export default function PageLoading() {
    return (
        <>
            {/* Mobile shell — hidden on desktop */}
            <div className="lg:hidden">
                <MobileLoading />
            </div>
            {/* Desktop shell — hidden on mobile */}
            <div className="hidden lg:block">
                <DesktopLoading />
            </div>
        </>
    );
}
