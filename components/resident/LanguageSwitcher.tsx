'use client';

import { Languages } from 'lucide-react';
import { useResidentLanguage, type ResidentLanguage } from '@/lib/i18n/resident-language';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
  className?: string;
  variant?: 'default' | 'compact';
}

export default function LanguageSwitcher({
  className,
  variant = 'default',
}: LanguageSwitcherProps) {
  const { lang, setLang } = useResidentLanguage();

  if (variant === 'compact') {
    return (
      <div
        role="group"
        aria-label="Language selector"
        className={cn(
          'inline-flex items-center gap-0.5 rounded-full border border-slate-200/90 bg-white/95 p-1 shadow-xs',
          className,
        )}
      >
        <div className="flex h-7 w-7 items-center justify-center text-cyan-800">
          <Languages className="h-3.5 w-3.5" />
        </div>
        <button
          type="button"
          onClick={() => setLang('ceb')}
          className={cn(
            'rounded-full px-2 py-1 text-[11px] font-black transition-colors',
            lang === 'ceb'
              ? 'bg-cyan-950 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900',
          )}
          title="Sinugbuanong Binisaya"
        >
          CEB
        </button>
        <button
          type="button"
          onClick={() => setLang('en')}
          className={cn(
            'rounded-full px-2 py-1 text-[11px] font-black transition-colors',
            lang === 'en'
              ? 'bg-cyan-950 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900',
          )}
          title="English"
        >
          EN
        </button>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Language selector"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-slate-200/90 bg-white/95 p-1 shadow-xs backdrop-blur',
        className,
      )}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-50 text-cyan-900">
        <Languages className="h-4 w-4" />
      </div>
      <button
        type="button"
        onClick={() => setLang('ceb')}
        className={cn(
          'rounded-full px-3 py-1.5 text-xs font-bold transition-all',
          lang === 'ceb'
            ? 'bg-cyan-950 text-white shadow-sm'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        )}
      >
        Bisaya
      </button>
      <button
        type="button"
        onClick={() => setLang('en')}
        className={cn(
          'rounded-full px-3 py-1.5 text-xs font-bold transition-all',
          lang === 'en'
            ? 'bg-cyan-950 text-white shadow-sm'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        )}
      >
        English
      </button>
    </div>
  );
}
