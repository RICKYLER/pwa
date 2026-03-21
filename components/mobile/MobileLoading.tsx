'use client';

// ─── MobileLoading ────────────────────────────────────────────────────────────
// A full-page shimmer skeleton that matches the MobileShell layout exactly.
// Each "bone" pulses with a staggered flash animation so the screen feels alive
// while real data loads in the background.

export default function MobileLoading() {
    return (
        <div className="flex flex-col min-h-screen bg-slate-50 overflow-hidden">
            {/* ── Fake header ─────────────────────────────────────────────── */}
            <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3.5 bg-white/90 backdrop-blur-xl border-b border-slate-200/60">
                {/* Menu button bone */}
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-200 animate-pulse" />
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-slate-200 animate-pulse" />
                        <div className="w-28 h-4 rounded-lg bg-slate-200 animate-pulse" />
                    </div>
                </div>
                {/* Avatar bone */}
                <div className="w-8 h-8 rounded-full bg-slate-200 animate-pulse" />
            </header>

            {/* ── Page body ────────────────────────────────────────────────── */}
            <main className="flex-1 pb-24 px-4 pt-5 space-y-4">
                {/* Hero stat row — 2 tiles */}
                <div className="grid grid-cols-2 gap-3">
                    {[0, 1].map((i) => (
                        <div
                            key={i}
                            className="relative overflow-hidden rounded-2xl bg-white border border-slate-100 p-4 space-y-2 shadow-sm"
                            style={{ animationDelay: `${i * 80}ms` }}
                        >
                            <Shimmer />
                            <div className="w-8 h-8 rounded-xl bg-slate-100 animate-pulse" />
                            <div className="w-16 h-6 rounded-lg bg-slate-200 animate-pulse" />
                            <div className="w-24 h-3 rounded-md bg-slate-100 animate-pulse" />
                        </div>
                    ))}
                </div>

                {/* Second stat row — 2 tiles */}
                <div className="grid grid-cols-2 gap-3">
                    {[0, 1].map((i) => (
                        <div
                            key={i}
                            className="relative overflow-hidden rounded-2xl bg-white border border-slate-100 p-4 space-y-2 shadow-sm"
                            style={{ animationDelay: `${(i + 2) * 80}ms` }}
                        >
                            <Shimmer />
                            <div className="w-8 h-8 rounded-xl bg-slate-100 animate-pulse" />
                            <div className="w-14 h-6 rounded-lg bg-slate-200 animate-pulse" />
                            <div className="w-20 h-3 rounded-md bg-slate-100 animate-pulse" />
                        </div>
                    ))}
                </div>

                {/* Section title */}
                <div className="w-36 h-4 rounded-lg bg-slate-200 animate-pulse mt-2" />

                {/* List cards */}
                {[0, 1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className="relative overflow-hidden rounded-2xl bg-white border border-slate-100 p-4 flex items-center gap-3 shadow-sm"
                        style={{ animationDelay: `${(i + 4) * 60}ms` }}
                    >
                        <Shimmer />
                        <div className="w-10 h-10 rounded-xl bg-slate-100 animate-pulse flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                            <div className="w-3/4 h-3.5 rounded-md bg-slate-200 animate-pulse" />
                            <div className="w-1/2 h-3 rounded-md bg-slate-100 animate-pulse" />
                        </div>
                        <div className="w-6 h-6 rounded-lg bg-slate-100 animate-pulse flex-shrink-0" />
                    </div>
                ))}
            </main>

            {/* ── Fake bottom nav ──────────────────────────────────────────── */}
            <nav className="fixed bottom-0 inset-x-0 z-30">
                <div className="absolute inset-0 bg-white/90 backdrop-blur-xl border-t border-slate-200/60" />
                <div className="relative flex items-center justify-around px-2 py-3 pb-[env(safe-area-inset-bottom)]">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex flex-col items-center gap-1.5">
                            <div
                                className="w-6 h-6 rounded-lg bg-slate-200 animate-pulse"
                                style={{ animationDelay: `${i * 70}ms` }}
                            />
                            <div
                                className="w-8 h-2.5 rounded-md bg-slate-100 animate-pulse"
                                style={{ animationDelay: `${i * 70 + 35}ms` }}
                            />
                        </div>
                    ))}
                </div>
            </nav>
        </div>
    );
}

// ─── Shimmer sweep overlay ────────────────────────────────────────────────────
// A bright diagonal sweep that slides across the card face — the "flash".
function Shimmer() {
    return (
        <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite]"
            style={{
                background:
                    'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.7) 50%, transparent 100%)',
            }}
        />
    );
}
