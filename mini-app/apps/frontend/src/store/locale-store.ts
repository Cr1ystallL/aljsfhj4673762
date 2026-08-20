import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_LOCALE, type Locale, LOCALES } from '@/i18n/types';

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,
      setLocale: (locale) => {
        if (!isLocale(locale)) return;
        set({ locale });
      },
    }),
    {
      name: 'macvbet-locale',
      skipHydration: true,
      partialize: (state) => ({ locale: state.locale }),
    }
  )
);
