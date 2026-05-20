'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth-store';

/**
 * Blocked Guard
 *
 * Wraps `window.fetch` so any API response carrying `code: 'BLOCKED'`
 * (HTTP 401 from the auth middleware after the user has been blocked
 * by an admin) flips the global `auth.blocked` flag and silently closes
 * the WebApp. The UI never surfaces a textual reason — players whose
 * accounts are flagged simply see a brief blank screen and the WebApp
 * closes itself within ~600 ms.
 *
 * The wrapper is installed once (module-scope ref) so subsequent
 * mounts don't double-wrap. Cloning the response is cheap and avoids
 * eating the body for downstream consumers.
 */

let installed = false;

export function BlockedGuard({ children }: { children: React.ReactNode }) {
  const blocked = useAuthStore((s) => s.blocked);
  const markBlocked = useAuthStore((s) => s.markBlocked);

  useEffect(() => {
    if (installed || typeof window === 'undefined') return;
    installed = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      // Only inspect API responses — third-party assets stay untouched.
      try {
        const url =
          typeof args[0] === 'string'
            ? args[0]
            : args[0] instanceof URL
              ? args[0].toString()
              : args[0] instanceof Request
                ? args[0].url
                : '';
        if (
          res.status === 401 &&
          url.includes('/api/') &&
          (res.headers.get('content-type') || '').includes('application/json')
        ) {
          const clone = res.clone();
          const body = await clone.json().catch(() => null);
          if (body && body.code === 'BLOCKED') {
            useAuthStore.getState().markBlocked();
          }
        }
      } catch {
        // never let the wrapper break a real response
      }
      return res;
    };
  }, []);

  // Once blocked, schedule a WebApp close. We give the bridge a moment
  // because some Telegram clients ignore `close()` if it fires before
  // the app has finished its handshake. After 1.5s we fall back to a
  // location replace to a blank page so any leaked text is hidden.
  useEffect(() => {
    if (!blocked) return;
    const t = setTimeout(() => {
      try {
        (window as unknown as {
          Telegram?: { WebApp?: { close?: () => void } };
        }).Telegram?.WebApp?.close?.();
      } catch {
        // ignored
      }
      // Hard fallback after another 800ms in case `close()` is a no-op.
      setTimeout(() => {
        try {
          window.location.replace('about:blank');
        } catch {
          // ignored
        }
      }, 800);
    }, 600);
    return () => clearTimeout(t);
  }, [blocked]);

  if (blocked) {
    // Silent blank surface — same midnight canvas as the rest of the
    // app, no copy, no avatar, no logo. Players who tap around won't
    // see anything that hints at why.
    return (
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          background: '#000',
          zIndex: 999_999,
        }}
      />
    );
  }

  void markBlocked; // satisfy linter — used via getState above
  return <>{children}</>;
}
