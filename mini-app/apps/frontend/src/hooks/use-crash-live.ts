'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useAuthStore } from '@/store/auth-store';
import {
  CrashLiveStream,
  type CrashLiveSnapshot,
  type CrashLiveFastSnapshot,
} from '@/lib/games/crash/crash-live-stream';

/**
 * useCrashLive — page-level subscription to the crash live stream.
 *
 * Returns the slow snapshot (phase, players, history, …) plus the live
 * stream instance so high-frequency consumers (the curve canvas, the
 * giant multiplier number) can subscribe directly via `useFastMultiplier`
 * without forcing a page-wide re-render.
 *
 * The slow channel updates only when something the React tree actually
 * cares about changes — so the page re-renders maybe a dozen times per
 * round instead of 60×/s.
 */
export function useCrashLive(): {
  snapshot: CrashLiveSnapshot;
  stream: CrashLiveStream | null;
  userId: string | null;
} {
  const sessionId = useAuthStore((s) => s.sessionId);
  const userId = useAuthStore((s) => s.user?.id ?? null);

  // The stream URL is stable across the page lifetime, so we resolve it
  // once and memo the stream instance keyed by sessionId.
  const wsUrl = useMemo(() => {
    const baseRaw = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';
    let base = baseRaw.replace(/\/$/, '');
    if (!base.endsWith('/api')) {
      // If deployed with wss://macvbet.nl, append /api
      base = base.replace(/\/ws$/, '');
    }
    return base.endsWith('/api/ws') ? base : `${base.replace(/\/api$/, '')}/api/ws`;
  }, []);

  const streamRef = useRef<CrashLiveStream | null>(null);
  const [snapshot, setSnapshot] = useState<CrashLiveSnapshot>(() => {
    const tmp = new CrashLiveStream('');
    const s = tmp.getSnapshot();
    tmp.destroy();
    return s;
  });

  useEffect(() => {
    if (!sessionId) return;

    const stream = new CrashLiveStream(wsUrl);
    streamRef.current = stream;

    const onState = (s: CrashLiveSnapshot) => setSnapshot(s);
    stream.on('state', onState);

    stream.connect(sessionId);

    return () => {
      stream.off('state', onState);
      stream.destroy();
      streamRef.current = null;
    };
  }, [sessionId, wsUrl]);

  return { snapshot, stream: streamRef.current, userId };
}

/**
 * useFastMultiplier — subscribe to the live multiplier without forcing
 * a parent re-render. Designed for the giant "1.32x" text in the stage.
 *
 * Implementation note: we don't use `useSyncExternalStore` directly
 * because the stream's fast snapshot keeps its own object identity for
 * the lifetime of the round (we mutate it in place to avoid GC pressure
 * during the 60fps animation loop). Instead we drive a local rAF loop
 * that re-renders this hook's caller at most once per frame, and we
 * stop the loop the moment the round leaves the active phase.
 */
export function useFastMultiplier(
  stream: CrashLiveStream | null,
  phase: CrashLiveSnapshot['phase']
): number {
  const [m, setM] = useState(() =>
    stream ? stream.getFast().displayMultiplier : 1
  );

  useEffect(() => {
    if (!stream) return;
    // Active / completed → animate. Other phases → freeze on the last value.
    const wantsAnim = phase === 'active' || phase === 'resolving';
    if (!wantsAnim) {
      // One-shot sync to whatever the fast channel says (used for the
      // 'completed' final figure).
      setM(stream.getFast().displayMultiplier);
      return;
    }

    let raf = 0;
    let mounted = true;
    let prev = -1;
    const loop = () => {
      if (!mounted) return;
      const cur = stream.getFast().displayMultiplier;
      // Only call setState when the displayed two-decimal value actually
      // changed. That alone cuts re-renders ~5× during fast climbs.
      const rounded = Math.floor(cur * 100);
      if (rounded !== prev) {
        prev = rounded;
        setM(cur);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
    };
  }, [stream, phase]);

  return m;
}

/**
 * useFastGraph — return a stable reference to the live graph buffer, plus
 * a tick counter that increments whenever the buffer mutates so that
 * dependent effects can pick up changes. The buffer itself is never
 * cloned — consumers should treat it as read-only.
 *
 * We avoid React state for the buffer to skip the GC churn of slicing it
 * 60×/s; consumers (e.g. the canvas drawer) read the buffer inside their
 * own rAF loops anyway.
 */
export function useFastGraph(stream: CrashLiveStream | null): {
  graph: CrashLiveFastSnapshot['graphPoints'] | null;
  subscribe: (cb: () => void) => () => void;
} {
  if (!stream) {
    return {
      graph: null,
      subscribe: () => () => {},
    };
  }
  return {
    graph: stream.getFast().graphPoints,
    subscribe: (cb) => {
      stream.on('tick', cb);
      return () => stream.off('tick', cb);
    },
  };
}

// Imported for potential future consumers that need useSyncExternalStore.
void useSyncExternalStore;
