'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth-store';

let cachedStreak: number | null = null;
const listeners = new Set<(streak: number) => void>();

function setGlobalStreak(streak: number) {
  cachedStreak = streak;
  listeners.forEach((fn) => fn(streak));
}

export function useWinStreak(): { streak: number; refreshStreak: () => Promise<void> } {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [streak, setStreak] = useState<number>(cachedStreak ?? 0);

  const fetchStreak = async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch('/api/balance/catch-up', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.ok && typeof json.winStreak === 'number') {
        const val = Math.max(0, Math.floor(json.winStreak));
        setGlobalStreak(val);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    listeners.add(setStreak);
    if (cachedStreak === null) {
      void fetchStreak();
    }
    return () => {
      listeners.delete(setStreak);
    };
  }, [isAuthenticated]);

  return { streak, refreshStreak: fetchStreak };
}
