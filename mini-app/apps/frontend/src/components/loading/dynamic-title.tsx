'use client';

import { useEffect } from 'react';
import { TITLE_TAGLINES, pickRandom } from './splash-screen';

/**
 * Dynamic Title
 *
 * Sets a random TITLE_TAGLINES line as the document title once on
 * mount. The next refresh of the WebApp / browser tab picks a fresh
 * line. We deliberately don't rotate during a single session — that
 * would be distracting and would jitter the WebApp's titlebar.
 */
export function DynamicTitle() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const line = pickRandom(TITLE_TAGLINES);
    document.title = line;
  }, []);
  return null;
}
