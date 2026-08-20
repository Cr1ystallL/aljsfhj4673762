'use client';

import { cn } from '@/lib/utils';
import { LOCALES, LOCALE_LABELS } from '@/i18n/types';
import { useT } from '@/i18n/use-t';

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useT();

  return (
    <div
      role="radiogroup"
      aria-label={t('profile.language')}
      className={cn(
        'inline-flex items-center rounded-full border border-white/15 bg-black/50 backdrop-blur-md p-0.5 shadow-lg',
        className
      )}
    >
      {LOCALES.map((code) => {
        const active = locale === code;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setLocale(code)}
            className={cn(
              'min-w-[34px] h-7 px-2 rounded-full font-roobert text-[10px] font-bold tracking-[0.14em] uppercase transition-all',
              active
                ? 'bg-frost-white text-midnight-canvas'
                : 'text-whisper-gray hover:text-frost-white'
            )}
          >
            {LOCALE_LABELS[code]}
          </button>
        );
      })}
    </div>
  );
}
