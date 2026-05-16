'use client';

import { useEffect, useState } from 'react';

/**
 * Admin discoverability probe.
 *
 * Hits the covert `/api/_x/probe` endpoint silently. The endpoint is a
 * generic 404 for non-admins, so the only signal we accept as "yes,
 * admin" is a 200 OK with `{ ok: true }`. Anything else — 404, 401,
 * network error — is treated as "not admin", and the UI never reveals
 * that there's an admin path at all.
 *
 * Result is cached in module memory for the lifetime of the page so
 * navigating between Profile and other screens doesn't re-probe.
 */

let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

async function probe(): Promise<boolean> {
  if (cached !== null) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch('/api/_x/probe', {
        method: 'GET',
        credentials: 'include',
        // No-cache so a logout-then-login flips state immediately.
        cache: 'no-store',
      });
      if (!res.ok) {
        cached = false;
        return false;
      }
      const json = await res.json().catch(() => null);
      cached = json?.ok === true;
      return cached;
    } catch {
      cached = false;
      return false;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState<boolean>(cached ?? false);
  useEffect(() => {
    let cancelled = false;
    void probe().then((v) => {
      if (!cancelled) setIsAdmin(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return isAdmin;
}

export async function checkIsAdmin(): Promise<boolean> {
  return probe();
}
