'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/auth-store';
import {
  CrashLiveStream,
  type CrashLiveSnapshot,
} from '@/lib/games/crash/crash-live-stream';

/**
 * Subscribe to the live crash WebSocket stream and re-render on snapshot
 * changes. Returns the current snapshot plus an imperative `userId` so the
 * page can highlight the current player's bets.
 *
 * The stream auto-reconnects internally; this hook just owns its lifecycle
 * for the page.
 */
export function useCrashLive(): {
  snapshot: CrashLiveSnapshot;
  userId: string | null;
} {
  const sessionId = useAuthStore((s) => s.sessionId);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const streamRef = useRef<CrashLiveStream | null>(null);
  const [snapshot, setSnapshot] = useState<CrashLiveSnapshot>(() => {
    const tmp = new CrashLiveStream('');
    const snap = tmp.getSnapshot();
    tmp.destroy();
    return snap;
  });

  useEffect(() => {
    if (!sessionId) return;

    // The frontend env var (NEXT_PUBLIC_WS_URL) may already include the
    // trailing `/ws` path (as it does on production behind nginx). Append
    // `/ws` only when it isn't there yet.
    const baseRaw = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';
    const base = baseRaw.replace(/\/$/, '');
    const fullUrl = /\/ws$/.test(base) ? base : `${base}/ws`;

    const stream = new CrashLiveStream(fullUrl);
    streamRef.current = stream;

    stream.on('state', (s: CrashLiveSnapshot) => setSnapshot(s));
    stream.connect(sessionId);

    return () => {
      stream.destroy();
      streamRef.current = null;
    };
  }, [sessionId]);

  return { snapshot, userId };
}
