'use client';

interface BrandLoaderProps {
  title?: string;
  subtitle?: string;
}

const GRID_NODE_DELAYS = ['0ms', '120ms', '240ms', '360ms', '480ms', '600ms'];

export default function BrandLoader({
  title = 'Loading secure session...',
  subtitle = 'Preparing your MSWDO workspace',
}: BrandLoaderProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.12),transparent_34%),radial-gradient(circle_at_bottom,rgba(14,165,233,0.1),transparent_28%)]" />

      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="brand-loader-halo absolute h-44 w-44 rounded-full bg-blue-200/40 blur-3xl" />

        <div className="relative flex flex-col items-center">
          <div className="brand-loader-top flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-700 to-indigo-600 shadow-[0_20px_45px_-20px_rgba(37,99,235,0.9)]">
            <div className="h-5 w-5 rounded-full bg-white/90" />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            {GRID_NODE_DELAYS.map((delay, index) => (
              <span
                key={delay}
                className="brand-loader-node h-7 w-7 rounded-[10px] bg-gradient-to-br from-blue-700 to-indigo-700 shadow-[0_14px_32px_-22px_rgba(30,64,175,0.95)]"
                style={{ animationDelay: delay }}
                aria-hidden="true"
                data-node={index + 1}
              />
            ))}
          </div>
        </div>

        <div className="mt-10 space-y-2">
          <p className="text-base font-semibold text-slate-900">{title}</p>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>

        <div className="mt-6 h-1.5 w-40 overflow-hidden rounded-full bg-slate-200">
          <div className="brand-loader-bar h-full w-1/2 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-indigo-600" />
        </div>
      </div>
    </div>
  );
}
