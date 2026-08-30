'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth-store';

export function useSportsAccess() {
  const isAuthenticated = !!useAuthStore((s) => s.token);
  const [state, setState] = useState({ ready: false, allowed: false, isAdmin: false });

  useEffect(() => {
    if (!isAuthenticated) {
      setState({ ready: true, allowed: false, isAdmin: false });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/games/availability', {
          credentials: 'include',
          cache: 'no-store',
        });
        const json = res.ok ? await res.json() : null;
        if (cancelled) return;
        setState({
          ready: true,
          allowed: !!json?.sportsAccess,
          isAdmin: !!json?.isAdmin,
        });
      } catch {
        if (!cancelled) setState({ ready: true, allowed: false, isAdmin: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  return state;
}
