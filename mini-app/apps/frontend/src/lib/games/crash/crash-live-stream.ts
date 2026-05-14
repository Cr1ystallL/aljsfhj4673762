'use client';

import { EventEmitter } from 'events';

/**
 * Crash Live Stream
 *
 * A self-contained WebSocket client for the live multiplayer crash game.
 * It handles:
 *   - Connecting & authenticating against the Fastify WS endpoint.
 *   - Joining the global crash room.
 *   - Measuring round-trip latency (pings every 1s — the "213 ms" pill).
 *   - Smooth 60fps multiplier interpolation between 100ms server ticks.
 *   - Aggregating round state (phase, multiplier, players, history, hash, …).
 *
 * Consumers subscribe via .on('state', cb) and receive an immutable snapshot.
 */

export type CrashPhase =
  | 'idle'
  | 'waiting'
  | 'starting'
  | 'active'
  | 'resolving'
  | 'completed';

export interface CrashUserMini {
  userId: string;
  username?: string | null;
  firstName?: string | null;
  photoUrl?: string | null;
}

export interface CrashLivePlayer {
  key: string; // userId:slot
  userId: string;
  slot: number;
  betAmount: number;
  user: CrashUserMini | null;
  multiplier?: number;
  payout?: number;
  status: 'active' | 'cashed' | 'lost';
}

export interface CrashLiveSnapshot {
  phase: CrashPhase;
  /** Multiplier we render on screen (interpolated). */
  displayMultiplier: number;
  /** Last server-confirmed multiplier. */
  serverMultiplier: number;
  /** Curve points (time ms, mult). */
  graphPoints: Array<{ time: number; multiplier: number }>;
  /** Countdown in seconds (during 'starting' phase). */
  countdown: number | null;
  /** End-of-betting timestamp during 'waiting' phase (ms epoch). */
  waitingEndsAt: number | null;
  /** Provably-fair hash for the upcoming/current round. */
  serverSeedHash: string;
  /** Roundtrip latency in ms (running average of last 5 pings). */
  latencyMs: number;
  /** Connection status. */
  connected: boolean;
  /** Recent crash points, newest first. */
  history: Array<{ crashPoint: number; roundId?: string }>;
  /** Live players for the current round. */
  players: CrashLivePlayer[];
  /** Per-room totals: distinct players + total wagered. */
  stats: { playerCount: number; totalWagered: number; betsCount: number };
  /** Crash multiplier announced by the server (only set in 'completed' phase). */
  lastCrashPoint: number | null;
}

const ROOM_ID = 'crash_main';
const PING_INTERVAL_MS = 1000;
const RECONNECT_DELAY_MS = 1500;

export class CrashLiveStream extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private sessionId: string | null = null;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private animFrame: number | null = null;
  private lastFrameTime = 0;

  private pendingPings: Map<number, number> = new Map();
  private latencySamples: number[] = [];

  private snapshot: CrashLiveSnapshot = this.makeInitial();

  /** Anchor for client-side multiplier prediction during 'active'. */
  private activeStartedAt: number | null = null;
  private activeStartMultiplier = 1;

  constructor(url: string) {
    super();
    this.url = url;
  }

  getSnapshot(): CrashLiveSnapshot {
    return this.snapshot;
  }

  connect(sessionId: string): void {
    this.sessionId = sessionId;
    this.openSocket();
  }

  destroy(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.animFrame = null;
    this.removeAllListeners();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }

  /* -------------------------------------------------------------- socket */

  private openSocket(): void {
    if (!this.sessionId) return;
    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      // 1. Authenticate
      this.send({
        type: 'auth',
        payload: { sessionId: this.sessionId },
        timestamp: Date.now(),
      });
    };

    this.ws.onmessage = (ev) => this.handleMessage(ev);

    this.ws.onclose = () => {
      this.update({ connected: false });
      this.stopPings();
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire next.
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, RECONNECT_DELAY_MS);
  }

  private send(message: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private startPings(): void {
    this.stopPings();
    this.pingTimer = setInterval(() => {
      const ts = Date.now();
      this.pendingPings.set(ts, ts);
      this.send({ type: 'ping', payload: {}, timestamp: ts });
      // Garbage-collect stale pings to keep memory bounded.
      if (this.pendingPings.size > 10) {
        const cutoff = Date.now() - 30000;
        for (const t of Array.from(this.pendingPings.keys())) {
          if (t < cutoff) this.pendingPings.delete(t);
        }
      }
    }, PING_INTERVAL_MS);
  }

  private stopPings(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /* ------------------------------------------------------------ messages */

  private handleMessage(ev: MessageEvent): void {
    let raw: any;
    try {
      raw = JSON.parse(ev.data as string);
    } catch {
      return;
    }
    if (!raw || typeof raw.type !== 'string') return;

    switch (raw.type) {
      case 'auth_success':
        this.update({ connected: true });
        // Join the global crash room and start ping loop.
        this.send({
          type: 'game:join',
          payload: { roomId: ROOM_ID },
          timestamp: Date.now(),
        });
        this.startPings();
        return;

      case 'auth_error':
        // Bad session — let the React provider handle re-auth, just close.
        this.update({ connected: false });
        return;

      case 'pong': {
        // Resolve the most recent pending ping.
        let oldestKey: number | null = null;
        for (const k of this.pendingPings.keys()) {
          if (oldestKey === null || k < oldestKey) oldestKey = k;
        }
        if (oldestKey !== null) {
          const rtt = Date.now() - oldestKey;
          this.pendingPings.delete(oldestKey);
          this.recordLatency(rtt);
        }
        return;
      }

      case 'game:joined':
        return;

      case 'game:event':
        this.handleGameEvent(raw.payload);
        return;
    }
  }

  private handleGameEvent(event: any): void {
    if (!event || typeof event.type !== 'string') return;
    const p = event.payload || {};

    switch (event.type) {
      case 'round:created': {
        this.update({
          serverSeedHash: p.serverSeedHash ?? this.snapshot.serverSeedHash,
          history: Array.isArray(p.history)
            ? p.history.map((h: any) => ({
                crashPoint: Number(h.crashPoint),
                roundId: h.roundId,
              }))
            : this.snapshot.history,
          lastCrashPoint: null,
          players: [],
          graphPoints: [{ time: 0, multiplier: 1 }],
          serverMultiplier: 1,
          displayMultiplier: 1,
        });
        return;
      }

      case 'phase:waiting': {
        const endsAt =
          typeof p.endsAt === 'number'
            ? p.endsAt
            : Date.now() + (p.duration ?? 0);
        this.update({
          phase: 'waiting',
          waitingEndsAt: endsAt,
          countdown: null,
          serverSeedHash: p.serverSeedHash ?? this.snapshot.serverSeedHash,
          history: Array.isArray(p.history)
            ? p.history.map((h: any) => ({
                crashPoint: Number(h.crashPoint),
                roundId: h.roundId,
              }))
            : this.snapshot.history,
          stats: p.stats ?? this.snapshot.stats,
          players: [],
          graphPoints: [{ time: 0, multiplier: 1 }],
          serverMultiplier: 1,
          displayMultiplier: 1,
          lastCrashPoint: null,
        });
        return;
      }

      case 'phase:countdown': {
        const duration = p.duration ?? 3000;
        this.update({
          phase: 'starting',
          countdown: Math.max(1, Math.ceil(duration / 1000)),
          waitingEndsAt: null,
        });
        // Tick down 1×/s
        const start = Date.now();
        const tick = () => {
          const remaining = Math.max(0, duration - (Date.now() - start));
          const sec = Math.max(0, Math.ceil(remaining / 1000));
          this.update({ countdown: sec });
          if (this.snapshot.phase !== 'starting') return;
          if (remaining > 0) setTimeout(tick, 200);
        };
        setTimeout(tick, 200);
        return;
      }

      case 'phase:active': {
        this.activeStartedAt = Date.now();
        this.activeStartMultiplier = 1;
        this.update({
          phase: 'active',
          countdown: null,
          waitingEndsAt: null,
          graphPoints: [{ time: 0, multiplier: 1 }],
          serverMultiplier: 1,
          displayMultiplier: 1,
        });
        this.startAnim();
        return;
      }

      case 'multiplier:update': {
        const m = Number(p.multiplier) || 1;
        const t = Number(p.elapsedTime) || 0;
        const next = [...this.snapshot.graphPoints, { time: t, multiplier: m }];
        // Keep curve responsive but bounded.
        while (next.length > 240) next.shift();
        this.update({ serverMultiplier: m, graphPoints: next });
        return;
      }

      case 'bet:placed': {
        const list = this.snapshot.players.slice();
        const newPlayer: CrashLivePlayer = {
          key: `${p.userId}:${p.slot}`,
          userId: p.userId,
          slot: Number(p.slot ?? 0),
          betAmount: Number(p.amount ?? p.bet?.amount ?? 0),
          user: p.user ?? null,
          status: 'active',
        };
        const i = list.findIndex((x) => x.key === newPlayer.key);
        if (i === -1) list.push(newPlayer);
        else list[i] = newPlayer;
        this.update({ players: list, stats: p.stats ?? this.snapshot.stats });
        return;
      }

      case 'bet:cancelled': {
        const key = `${p.userId}:${p.slot}`;
        this.update({
          players: this.snapshot.players.filter((x) => x.key !== key),
          stats: p.stats ?? this.snapshot.stats,
        });
        return;
      }

      case 'player:cashout': {
        const key = `${p.userId}:${p.slot ?? 0}`;
        const list = this.snapshot.players.map((x) =>
          x.key === key
            ? {
                ...x,
                status: 'cashed' as const,
                multiplier: Number(p.multiplier),
                payout: Number(p.payout),
                user: p.user ?? x.user,
              }
            : x
        );
        this.update({ players: list });
        return;
      }

      case 'player:lost': {
        const key = `${p.userId}:${p.slot ?? 0}`;
        const list = this.snapshot.players.map((x) =>
          x.key === key ? { ...x, status: 'lost' as const, user: p.user ?? x.user } : x
        );
        this.update({ players: list });
        return;
      }

      case 'game:crashed': {
        this.activeStartedAt = null;
        this.stopAnim();
        this.update({
          phase: 'completed',
          serverMultiplier: Number(p.crashPoint),
          displayMultiplier: Number(p.crashPoint),
          lastCrashPoint: Number(p.crashPoint),
        });
        return;
      }

      case 'round:completed': {
        const cp = Number(p.crashPoint ?? this.snapshot.lastCrashPoint ?? 0);
        const next = [
          { crashPoint: cp, roundId: p.roundId },
          ...this.snapshot.history.filter((h) => h.roundId !== p.roundId),
        ].slice(0, 50);
        this.update({ history: next });
        return;
      }
    }
  }

  /* --------------------------------------------------------- interpolation */

  private startAnim(): void {
    if (this.animFrame !== null) return;
    this.lastFrameTime = performance.now();
    const loop = (t: number) => {
      const dt = t - this.lastFrameTime;
      this.lastFrameTime = t;
      this.tickAnim(dt);
      this.animFrame = requestAnimationFrame(loop);
    };
    this.animFrame = requestAnimationFrame(loop);
  }

  private stopAnim(): void {
    if (this.animFrame !== null) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
  }

  private tickAnim(deltaMs: number): void {
    if (this.snapshot.phase !== 'active') return;

    const target = this.snapshot.serverMultiplier;
    const current = this.snapshot.displayMultiplier;
    // Light interpolation toward the latest server tick.
    const lerpStep = Math.min(1, deltaMs / 80);
    let next = current + (target - current) * lerpStep;

    // Forward prediction so the curve never visually stalls between ticks.
    if (this.activeStartedAt !== null) {
      const elapsed = Date.now() - this.activeStartedAt;
      const predicted = Math.exp(0.00006 * elapsed);
      if (predicted > next) next = predicted;
    }

    this.update({ displayMultiplier: next });
  }

  /* ----------------------------------------------------------- latency */

  private recordLatency(rtt: number): void {
    this.latencySamples.push(rtt);
    if (this.latencySamples.length > 5) this.latencySamples.shift();
    const avg =
      this.latencySamples.reduce((a, b) => a + b, 0) /
      this.latencySamples.length;
    this.update({ latencyMs: Math.round(avg) });
  }

  /* ---------------------------------------------------------- snapshots */

  private makeInitial(): CrashLiveSnapshot {
    return {
      phase: 'idle',
      displayMultiplier: 1,
      serverMultiplier: 1,
      graphPoints: [{ time: 0, multiplier: 1 }],
      countdown: null,
      waitingEndsAt: null,
      serverSeedHash: '',
      latencyMs: 0,
      connected: false,
      history: [],
      players: [],
      stats: { playerCount: 0, totalWagered: 0, betsCount: 0 },
      lastCrashPoint: null,
    };
  }

  private update(patch: Partial<CrashLiveSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.emit('state', this.snapshot);
  }
}
