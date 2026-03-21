import Link from 'next/link';
import { CloudOff, Home, ShieldCheck } from 'lucide-react';

export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(46,99,211,0.28),_transparent_42%),linear-gradient(180deg,_#f8fbff_0%,_#eef4ff_100%)] px-6 py-16">
      <div className="mx-auto flex max-w-4xl flex-col gap-10 lg:flex-row lg:items-center">
        <section className="flex-1 rounded-[2rem] bg-slate-950 p-8 text-white shadow-2xl shadow-slate-900/20">
          <div className="inline-flex rounded-2xl bg-white/10 p-3">
            <CloudOff className="h-8 w-8" />
          </div>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.32em] text-blue-200">
            Offline-Ready Workspace
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight">
            The device is offline, but your cached MSWDO workspace is still available.
          </h1>
          <p className="mt-4 max-w-xl text-base text-slate-300">
            Previously visited pages and local census data remain on the device. New field changes stay queued locally and
            will back up automatically when connectivity returns.
          </p>
        </section>

        <section className="flex-1 rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-blue-900/5">
          <div className="inline-flex rounded-2xl bg-blue-50 p-3 text-blue-700">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h2 className="mt-6 text-2xl font-bold text-slate-900">What you can do now</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            <li>Open cached routes such as the dashboard, households, reports, and vulnerability views.</li>
            <li>Continue encoding local changes that use IndexedDB on the device.</li>
            <li>Return online later to let the background worker back up pending field updates.</li>
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Home className="h-4 w-4" />
              Open Dashboard
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Go To Login
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
