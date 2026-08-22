'use client';

import { useEffect } from 'react';
import { useLocaleStore } from '@/store/locale-store';
import { DEFAULT_LOCALE, LOCALE_TAGS } from '@/i18n/types';

/**
 * Rehydrate the persisted locale and keep <html lang> in sync.
 * Default is Russian; a saved EN/PL choice wins after hydration.
 */
export function LocaleSync() {
  const locale = useLocaleStore((s) => s.locale);

  useEffect(() => {
    void useLocaleStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    const tag = LOCALE_TAGS[locale] ?? LOCALE_TAGS[DEFAULT_LOCALE];
    document.documentElement.lang = locale;
    document.documentElement.setAttribute('data-locale', locale);
    document.documentElement.style.setProperty('--locale-tag', tag);
  }, [locale]);

  return null;
}
