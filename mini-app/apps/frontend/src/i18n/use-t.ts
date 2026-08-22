'use client';

import { useCallback } from 'react';
import { dictionaries, type Messages } from './messages';
import { DEFAULT_LOCALE, LOCALE_TAGS, type Locale } from './types';
import { useLocaleStore } from '@/store/locale-store';

type MessagePath<T, Acc extends string = never> = T extends string
  ? Acc
  : {
      [K in keyof T & string]: MessagePath<
        T[K],
        [Acc] extends [never] ? K : `${Acc}.${K}`
      >;
    }[keyof T & string];

export type TxKey = MessagePath<Messages>;

function lookup(source: unknown, path: string): string | undefined {
  let current: unknown = source;
  for (const part of path.split('.')) {
    if (typeof current !== 'object' || current === null || !(part in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] === undefined ? `{${name}}` : String(vars[name])
  );
}

export function translate(
  locale: Locale,
  key: TxKey,
  vars?: Record<string, string | number>
): string {
  const fromLocale = lookup(dictionaries[locale], key);
  const fromDefault = lookup(dictionaries[DEFAULT_LOCALE], key);
  return interpolate(fromLocale ?? fromDefault ?? key, vars);
}

export function tNow(
  key: TxKey,
  vars?: Record<string, string | number>
): string {
  return translate(useLocaleStore.getState().locale, key, vars);
}

export function useT() {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const t = useCallback(
    (key: TxKey, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale]
  );
  return {
    t,
    locale,
    setLocale,
    localeTag: LOCALE_TAGS[locale],
  };
}
