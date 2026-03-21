'use client';

// ─── DesktopLoading ───────────────────────────────────────────────────────────
// A pixel-perfect skeleton of the DesktopShell: fixed sidebar on the left,
// content area on the right. Every bone pulses with a staggered flash/shimmer
// so the whole page feels alive — not frozen — while data loads.

export default function DesktopLoading() {
    return (
        <div className="flex min-h-screen bg-slate-50">
            {/* ── Fake sidebar ────────────────────────────────────────────── */}
            <aside className="fixed inset-y-0 left-0 z-30 w-64 flex flex-col bg-white border-r border-slate-200/70">
                {/* Branding */}
                <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100">
                    <div className="w-9 h-9 rounded-xl bg-slate-200 animate-pulse flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                        <div className="w-28 h-3.5 rounded-md bg-slate-200 animate-pulse" />
                        <div className="w-20 h-2.5 rounded-md bg-slate-100 animate-pulse" />
                    </div>
                </div>

                {/* Nav items */}
                <nav className="flex-1 px-3 py-4 space-y-1">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                        <div
                            key={i}
                            className="relative overflow-hidden flex items-center gap-3 px-3 py-2.5 rounded-xl"
                            style={{ animationDelay: `${i * 60}ms` }}
                        >
                            <Shimmer />
                            <div className="w-4 h-4 rounded-md bg-slate-200 animate-pulse flex-shrink-0" />
                            <div className="flex-1 space-y-1">
                                <div className="w-20 h-3 rounded-md bg-slate-200 animate-pulse" />
                                <div className="w-28 h-2 rounded-sm bg-slate-100 animate-pulse" />
                            </div>
                        </div>
                    ))}
                </nav>

                {/* User card */}
                <div className="px-3 py-4 border-t border-slate-100 space-y-2">
                    <div className="relative overflow-hidden flex items-center gap-3 px-3 py-3 rounded-xl bg-slate-50">
                        <Shimmer />
                        <div className="w-8 h-8 rounded-full bg-slate-200 animate-pulse flex-shrink-0" />
                        <div className="flex-1 space-y-1.5">
                            <div className="w-24 h-3 rounded-md bg-slate-200 animate-pulse" />
                            <div className="w-16 h-2.5 rounded-sm bg-slate-100 animate-pulse" />
                        </div>
                    </div>
                    <div className="w-full h-9 rounded-xl bg-slate-100 animate-pulse" />
                </div>
            </aside>

            {/* ── Fake content area ────────────────────────────────────────── */}
            <main className="flex-1 ml-64 pb-8">
                {/* Page header bar */}
                <div className="flex items-center justify-between px-8 py-6 border-b border-slate-200/60 bg-white">
                    <div className="space-y-1.5">
                        <div className="w-40 h-5 rounded-lg bg-slate-200 animate-pulse" />
                        <div className="w-64 h-3.5 rounded-md bg-slate-100 animate-pulse" />
                    </div>
                    <div className="w-32 h-9 rounded-xl bg-slate-200 animate-pulse" />
                </div>

                <div className="px-8 pt-6 space-y-6">
                    {/* KPI stat cards row */}
                    <div className="grid grid-cols-4 gap-4">
                        {[0, 1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className="relative overflow-hidden rounded-2xl bg-white border border-slate-100 p-5 space-y-3 shadow-sm"
                            >
                                <Shimmer delay={i * 80} />
                                <div className="flex items-center justify-between">
                                    <div className="w-10 h-10 rounded-xl bg-slate-100 animate-pulse" />
                                    <div className="w-12 h-5 rounded-full bg-slate-100 animate-pulse" />
                                </div>
                                <div className="space-y-1.5">
                                    <div className="w-16 h-7 rounded-lg bg-slate-200 animate-pulse" />
                                    <div className="w-28 h-3 rounded-md bg-slate-100 animate-pulse" />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Two-column section */}
                    <div className="grid grid-cols-3 gap-4">
                        {/* Wide chart card */}
                        <div className="relative overflow-hidden col-span-2 rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
                            <Shimmer delay={320} />
                            <div className="flex items-center justify-between mb-5">
                                <div className="w-32 h-4 rounded-lg bg-slate-200 animate-pulse" />
                                <div className="w-20 h-6 rounded-full bg-slate-100 animate-pulse" />
                            </div>
                            {/* Fake bar chart */}
                            <div className="flex items-end gap-3 h-36 mt-2">
                                {[60, 85, 45, 70, 55, 90, 40].map((h, i) => (
                                    <div
                                        key={i}
                                        className="flex-1 rounded-t-lg bg-slate-100 animate-pulse"
                                        style={{
                                            height: `${h}%`,
                                            animationDelay: `${i * 50}ms`,
                                        }}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Narrow summary card */}
                        <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-100 p-5 shadow-sm space-y-3">
                            <Shimmer delay={400} />
                            <div className="w-28 h-4 rounded-lg bg-slate-200 animate-pulse" />
                            {[0, 1, 2, 3, 4].map((i) => (
                                <div
                                    key={i}
                                    className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0"
                                >
                                    <div
                                        className="w-7 h-7 rounded-lg bg-slate-100 animate-pulse flex-shrink-0"
                                        style={{ animationDelay: `${i * 55}ms` }}
                                    />
                                    <div className="flex-1 space-y-1">
                                        <div
                                            className="h-2.5 rounded-md bg-slate-200 animate-pulse"
                                            style={{ width: `${60 + i * 8}%`, animationDelay: `${i * 55 + 25}ms` }}
                                        />
                                        <div
                                            className="w-12 h-2 rounded-sm bg-slate-100 animate-pulse"
                                            style={{ animationDelay: `${i * 55 + 40}ms` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Table skeleton */}
                    <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-sm">
                        <Shimmer delay={480} />
                        {/* Table header */}
                        <div className="flex items-center gap-4 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
                            {[40, 100, 80, 60, 48].map((w, i) => (
                                <div
                                    key={i}
                                    className="h-3 rounded-md bg-slate-200 animate-pulse"
                                    style={{ width: `${w}px`, animationDelay: `${i * 40}ms` }}
                                />
                            ))}
                        </div>
                        {/* Table rows */}
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                            <div
                                key={i}
                                className="relative overflow-hidden flex items-center gap-4 px-5 py-3.5 border-b border-slate-50 last:border-0"
                            >
                                <Shimmer delay={540 + i * 40} />
                                <div className="w-8 h-8 rounded-full bg-slate-100 animate-pulse flex-shrink-0" />
                                <div className="w-28 h-3 rounded-md bg-slate-200 animate-pulse" />
                                <div className="w-20 h-3 rounded-md bg-slate-100 animate-pulse" />
                                <div className="w-16 h-3 rounded-md bg-slate-200 animate-pulse" />
                                <div className="ml-auto w-16 h-6 rounded-full bg-slate-100 animate-pulse" />
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}

// ─── Shimmer sweep overlay ────────────────────────────────────────────────────
// Bright diagonal stripe that sweeps left→right giving the "flash" effect.
function Shimmer({ delay = 0 }: { delay?: number }) {
    return (
        <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite]"
            style={{
                background:
                    'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.72) 50%, transparent 100%)',
                animationDelay: `${delay}ms`,
            }}
        />
    );
}
