import Link from 'next/link';
import { CloudOff, Home, ShieldCheck } from 'lucide-react';

export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-gray-50 px-6 py-16">
      <div className="mx-auto flex max-w-4xl flex-col gap-10 lg:flex-row lg:items-center">
        <section className="flex-1 rounded-lg bg-blue-900 p-8 text-white shadow-md">
          <div className="inline-flex rounded-md bg-white/10 p-3 border border-white/10">
            <CloudOff className="h-8 w-8" />
          </div>
          <p className="mt-8 text-xs font-bold uppercase tracking-wider text-blue-200">
            Connection Required
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight">
            This workspace now needs a live internet connection.
          </h1>
          <p className="mt-4 max-w-xl text-base text-slate-300">
            The app has been switched to online-only Supabase realtime mode. Reconnect to continue working with live data.
          </p>
        </section>

        <section className="flex-1 rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <div className="inline-flex rounded-md bg-blue-50 p-3 text-blue-800 border border-blue-100">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h2 className="mt-6 text-2xl font-bold text-slate-900">What you can do now</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            <li>Reconnect your device to the internet.</li>
            <li>Return to the dashboard once the live Supabase connection is restored.</li>
            <li>Refresh the page if this screen stays open after your connection comes back.</li>
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-md bg-blue-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
            >
              <Home className="h-4 w-4" />
              Open Dashboard
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Go To Login
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

