'use client';

import { EventEmitter } from 'events';

/**
 * Crash Live Stream
 *
 * Self-contained WebSocket client for the live multiplayer crash game.
 * Owns:
 *   - WS connect / authenticate / room-join.
 *   - 1Hz round-trip latency probes.
 *   - Smooth multiplier interpolation between 100ms server ticks.
 *   - Reconciliation poll (REST snapshot every 2.5s as a safety net).
 *
 * State is split into two channels to keep mobile WebViews at 60fps:
 *
 *   - SLOW snapshot (`getSnapshot()` + `'state'` event) — phase, history,
 *     stats, players, hash, latency, connected. Updated only when one of
 *     these actually changes. React subscribes here; an unchanged event
 *     never re-renders the page.
 *
 *   - FAST snapshot (`getFast()` + `'tick'` event) — displayMultiplier
 *     and graphPoints. Updated up to 60×/s during an active round, but
 *     the canvas-drawing component reads it directly from `getFast()`
 *     inside its own rAF loop. No React re-renders are triggered here.
 *
 * The split is the single largest win on iPhone / Android Telegram —
 * before, every interpolation tick caused a full page re-render
 * (CrashStage, both bet panels, player feed, stats, history strip).
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

/** Slow-channel snapshot consumed by React. */
export interface CrashLiveSnapshot {
  phase: CrashPhase;
  /** Last server-confirmed multiplier (snapshot only — see `getFast()` for live). */
  serverMultiplier: number;
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
  /** Crash multiplier announced by the server (only in 'completed' phase). */
  lastCrashPoint: number | null;
}

/** Fast-channel snapshot — read directly from animation loops. */
export interface CrashLiveFastSnapshot {
  /** Multiplier we render on screen (interpolated). */
  displayMultiplier: number;
  /** Curve points (time ms, mult). */
  graphPoints: Array<{ time: number; multiplier: number }>;
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
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private animFrame: number | null = null;
  private lastFrameTime = 0;

  private pendingPings: Map<number, number> = new Map();
  private latencySamples: number[] = [];

  private snapshot: CrashLiveSnapshot = this.makeInitialSlow();
  private fast: CrashLiveFastSnapshot = { displayMultiplier: 1, graphPoints: [{ time: 0, multiplier: 1 }] };

  /** Anchor for client-side multiplier prediction during 'active'. */
  private activeStartedAt: number | null = null;
  private activeStartMultiplier = 1;

  constructor(url: string) {
    super();
    // Default Node EventEmitter cap is 10; raise to silence warnings when
    // multiple components subscribe simultaneously.
    this.setMaxListeners(64);
    this.url = url;
  }

  getSnapshot(): CrashLiveSnapshot {
    return this.snapshot;
  }

  /**
   * Read the current fast snapshot (multiplier + graph points). Designed
   * to be called from a `requestAnimationFrame` loop in the consumer —
   * never returns a fresh object reference, so polling is allocation-free.
   */
  getFast(): CrashLiveFastSnapshot {
    return this.fast;
  }

  connect(sessionId: string): void {
    this.sessionId = sessionId;
    this.openSocket();
    void this.fetchInitialState();
    this.startPoll();
  }

  destroy(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.pollTimer = null;
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
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.send({
        type: 'auth',
        payload: { sessionId: this.sessionId },
        timestamp: Date.now(),
      });
    };

    this.ws.onmessage = (ev) => this.handleMessage(ev);

    this.ws.onclose = () => {
      this.updateSlow({ connected: false });
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

  private startPoll(): void {
    this.stopPoll();
    this.pollTimer = setInterval(() => {
      void this.fetchInitialState();
    }, 2500);
  }

  private stopPoll(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async fetchInitialState(): Promise<void> {
    try {
      const res = await fetch('/api/games/crash/state', {
        method: 'GET',
        credentials: 'include',
      });
      if (!res.ok) return;
      const json = await res.json();
      const s = json?.state;
      if (!s) return;

      const phaseMap: Record<string, CrashPhase> = {
        idle: 'idle',
        waiting: 'waiting',
        starting: 'starting',
        active: 'active',
        resolving: 'resolving',
        completed: 'completed',
      };
      const phase: CrashPhase = phaseMap[s.phase] ?? this.snapshot.phase;

      const players: CrashLivePlayer[] = Array.isArray(s.activePlayers)
        ? s.activePlayers.map((p: any) => ({
            key: `${p.userId}:${p.slot ?? 0}`,
            userId: p.userId,
            slot: Number(p.slot ?? 0),
            betAmount: Number(p.betAmount ?? 0),
            user: p.user ?? null,
            status: 'active' as const,
          }))
        : [];

      if (Array.isArray(s.cashedOut)) {
        for (const c of s.cashedOut) {
          const key = `${c.userId}:${c.slot ?? 0}`;
          const i = players.findIndex((x) => x.key === key);
          const next: CrashLivePlayer = {
            key,
            userId: c.userId,
            slot: Number(c.slot ?? 0),
            betAmount: i !== -1 ? players[i].betAmount : 0,
            user: i !== -1 ? players[i].user : null,
            multiplier: Number(c.multiplier),
            payout: Number(c.payout),
            status: 'cashed',
          };
          if (i === -1) players.push(next);
          else players[i] = next;
        }
      }

      const history = Array.isArray(s.history)
        ? s.history.map((h: any) => ({
            crashPoint: Number(h.crashPoint),
            roundId: h.roundId,
          }))
        : this.snapshot.history;

      const stats = s.stats ?? this.snapshot.stats;
      const serverSeedHash = s.serverSeedHash || this.snapshot.serverSeedHash;
      const serverMult = Number(s.multiplier) || 1;

      if (phase === 'active') {
        const elapsed = Number(s.elapsedTime) || 0;
        this.activeStartedAt = Date.now() - elapsed;
        this.activeStartMultiplier = 1;
        this.startAnim();

        // Seed fast channel mid-flight.
        if (this.fast.graphPoints.length < 2) {
          this.fast = {
            displayMultiplier: serverMult,
            graphPoints: [
              { time: 0, multiplier: 1 },
              { time: elapsed || 1, multiplier: serverMult },
            ],
          };
          this.emitTick();
        }
      } else if (phase === 'waiting' || phase === 'starting' || phase === 'idle') {
        // Hard reset — clears any runaway prediction left over from a
        // sleeping tab. Without this, returning to the game after a
        // long pause would print whatever the prediction loop reached
        // until the next active tick comes in.
        this.activeStartedAt = null;
        this.stopAnim();
        this.fast = { displayMultiplier: 1, graphPoints: [{ time: 0, multiplier: 1 }] };
        this.emitTick();
      } else if (phase === 'completed' || phase === 'resolving') {
        // Snap to the announced crash point and stop predicting.
        this.activeStartedAt = null;
        this.stopAnim();
        const cp =
          typeof s.crashPointPreview === 'number'
            ? Number(s.crashPointPreview)
            : serverMult;
        this.fast = {
          displayMultiplier: cp,
          graphPoints: this.fast.graphPoints,
        };
        this.emitTick();
      }

      const phaseEndsAt = typeof s.phaseEndsAt === 'number' ? s.phaseEndsAt : null;
      let countdown: number | null = this.snapshot.countdown;
      let waitingEndsAt: number | null = this.snapshot.waitingEndsAt;
      if (phase === 'starting' && phaseEndsAt !== null) {
        countdown = Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000));
        waitingEndsAt = null;
      } else if (phase === 'waiting') {
        waitingEndsAt = phaseEndsAt;
        countdown = null;
      } else if (phase === 'active' || phase === 'completed') {
        countdown = null;
        waitingEndsAt = null;
      }

      this.updateSlow({
        phase,
        players,
        history,
        stats,
        serverSeedHash,
        serverMultiplier: serverMult,
        countdown,
        waitingEndsAt,
        lastCrashPoint:
          phase === 'completed' && typeof s.crashPointPreview === 'number'
            ? s.crashPointPreview
            : this.snapshot.lastCrashPoint,
      });
    } catch {
      // Best-effort.
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
        this.updateSlow({ connected: true });
        this.send({
          type: 'game:join',
          payload: { roomId: ROOM_ID },
          timestamp: Date.now(),
        });
        this.startPings();
        void this.fetchInitialState();
        return;

      case 'auth_error':
        this.updateSlow({ connected: false });
        return;

      case 'pong': {
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

      case 'crash:state': {
        // Server sends current room state on join - update players and game state
        const p = raw.payload || {};
        const phaseMap: Record<string, CrashPhase> = {
          idle: 'idle',
          waiting: 'waiting',
          starting: 'starting',
          active: 'active',
          resolving: 'resolving',
          completed: 'completed',
        };
        const phase: CrashPhase = phaseMap[p.phase] ?? this.snapshot.phase;

        // Build players list from activePlayers and cashedOut
        const players: CrashLivePlayer[] = Array.isArray(p.activePlayers)
          ? p.activePlayers.map((ap: any) => ({
              key: `${ap.userId}:${ap.slot ?? 0}`,
              userId: ap.userId,
              slot: Number(ap.slot ?? 0),
              betAmount: Number(ap.betAmount ?? 0),
              user: ap.user ?? null,
              status: 'active' as const,
            }))
          : [];

        // Merge cashed out players
        if (Array.isArray(p.cashedOut)) {
          for (const c of p.cashedOut) {
            const key = `${c.userId}:${c.slot ?? 0}`;
            const i = players.findIndex((x) => x.key === key);
            const cashed: CrashLivePlayer = {
              key,
              userId: c.userId,
              slot: Number(c.slot ?? 0),
              betAmount: i !== -1 ? players[i].betAmount : 0,
              user: i !== -1 ? players[i].user : null,
              multiplier: Number(c.multiplier),
              payout: Number(c.payout),
              status: 'cashed',
            };
            if (i === -1) players.push(cashed);
            else players[i] = cashed;
          }
        }

        this.updateSlow({
          phase,
          players,
          history: Array.isArray(p.history)
            ? p.history.map((h: any) => ({
                crashPoint: Number(h.crashPoint),
                roundId: h.roundId,
              }))
            : this.snapshot.history,
          stats: p.stats ?? this.snapshot.stats,
          serverSeedHash: p.serverSeedHash ?? this.snapshot.serverSeedHash,
          serverMultiplier: Number(p.multiplier) || this.snapshot.serverMultiplier,
          lastCrashPoint: p.crashPointPreview ?? this.snapshot.lastCrashPoint,
        });

        // If active phase, start animation
        if (phase === 'active' && p.elapsedTime) {
          this.activeStartedAt = Date.now() - Number(p.elapsedTime);
          this.activeStartMultiplier = 1;
          this.startAnim();
        }
        return;
      }

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
        this.fast = {
          displayMultiplier: 1,
          graphPoints: [{ time: 0, multiplier: 1 }],
        };
        this.emitTick();
        this.updateSlow({
          serverSeedHash: p.serverSeedHash ?? this.snapshot.serverSeedHash,
          history: Array.isArray(p.history)
            ? p.history.map((h: any) => ({
                crashPoint: Number(h.crashPoint),
                roundId: h.roundId,
              }))
            : this.snapshot.history,
          lastCrashPoint: null,
          players: [],
          serverMultiplier: 1,
        });
        return;
      }

      case 'phase:waiting': {
        const endsAt =
          typeof p.endsAt === 'number'
            ? p.endsAt
            : Date.now() + (p.duration ?? 0);
        this.fast = {
          displayMultiplier: 1,
          graphPoints: [{ time: 0, multiplier: 1 }],
        };
        this.emitTick();
        this.updateSlow({
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
          serverMultiplier: 1,
          lastCrashPoint: null,
        });
        return;
      }

      case 'phase:countdown': {
        // Countdown phase has been removed from the engine — the round
        // now flips waiting → active immediately. If a stale event ever
        // arrives (older backend in-flight), we collapse it into an
        // immediate active hint so the UI doesn't print 3-2-1 ghosts.
        this.activeStartedAt = Date.now();
        this.activeStartMultiplier = 1;
        this.fast = {
          displayMultiplier: 1,
          graphPoints: [{ time: 0, multiplier: 1 }],
        };
        this.emitTick();
        this.updateSlow({
          phase: 'active',
          countdown: null,
          waitingEndsAt: null,
          serverMultiplier: 1,
        });
        this.startAnim();
        return;
      }

      case 'phase:active': {
        this.activeStartedAt = Date.now();
        this.activeStartMultiplier = 1;
        this.fast = {
          displayMultiplier: 1,
          graphPoints: [{ time: 0, multiplier: 1 }],
        };
        this.emitTick();
        this.updateSlow({
          phase: 'active',
          countdown: null,
          waitingEndsAt: null,
          serverMultiplier: 1,
        });
        this.startAnim();
        return;
      }

      case 'multiplier:update': {
        const m = Number(p.multiplier) || 1;
        const t = Number(p.elapsedTime) || 0;
        // Mutate fast.graphPoints in place — no allocation per server tick.
        const pts = this.fast.graphPoints;
        pts.push({ time: t, multiplier: m });
        while (pts.length > 600) pts.shift();
        this.activeStartedAt = Date.now() - t;
        // Server multiplier on slow channel — at most ~10× per second so a
        // single React render here is fine.
        if (Math.abs(this.snapshot.serverMultiplier - m) > 0.01) {
          this.updateSlow({ serverMultiplier: m });
        }
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
        this.updateSlow({ players: list, stats: p.stats ?? this.snapshot.stats });
        return;
      }

      case 'bet:cancelled': {
        const key = `${p.userId}:${p.slot}`;
        this.updateSlow({
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
        this.updateSlow({ players: list });
        return;
      }

      case 'player:lost': {
        const key = `${p.userId}:${p.slot ?? 0}`;
        const list = this.snapshot.players.map((x) =>
          x.key === key ? { ...x, status: 'lost' as const, user: p.user ?? x.user } : x
        );
        this.updateSlow({ players: list });
        return;
      }

      case 'game:crashed': {
        this.activeStartedAt = null;
        this.stopAnim();
        const cp = Number(p.crashPoint);
        this.fast = {
          displayMultiplier: cp,
          graphPoints: this.fast.graphPoints,
        };
        this.emitTick();
        this.updateSlow({
          phase: 'completed',
          serverMultiplier: cp,
          lastCrashPoint: cp,
        });
        return;
      }

      case 'round:completed': {
        const cp = Number(p.crashPoint ?? this.snapshot.lastCrashPoint ?? 0);
        const next = [
          { crashPoint: cp, roundId: p.roundId },
          ...this.snapshot.history.filter((h) => h.roundId !== p.roundId),
        ].slice(0, 50);
        this.updateSlow({ history: next });
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

    // Predicted multiplier from elapsed wall-clock anchor. We deliberately
    // cap this so a long network silence (laptop slept, WS dead) can't
    // run the figure into the millions before the next server tick
    // arrives. The hard ceiling matches the server's per-round cap of
    // 184x; we add a safety buffer of 1.2x so an in-flight tick that
    // overshoots by a fraction still reads.
    const HARD_CEILING = 220;
    let predicted = this.snapshot.serverMultiplier;
    let elapsed = 0;
    if (this.activeStartedAt !== null) {
      elapsed = Date.now() - this.activeStartedAt;
      predicted = Math.exp(0.00006 * elapsed);
    }
    predicted = Math.min(HARD_CEILING, predicted);

    // If our prediction has run away from the last known server value
    // (5x or more), assume the WS is silent and freeze on the server's
    // last figure. Better to look stuck for a second than to print 22M.
    if (
      this.snapshot.serverMultiplier > 1.05 &&
      predicted > this.snapshot.serverMultiplier * 5
    ) {
      predicted = this.snapshot.serverMultiplier;
    }

    const target = Math.max(this.snapshot.serverMultiplier, predicted);
    const current = this.fast.displayMultiplier;
    const lerpStep = Math.min(1, deltaMs / 60);
    const display = Math.min(HARD_CEILING, current + (target - current) * lerpStep);

    // Push a curve point only when meaningfully different — keeps the
    // graphPoints buffer compact. In place mutation = zero allocation.
    const last = this.fast.graphPoints[this.fast.graphPoints.length - 1];
    if (
      last &&
      (elapsed - last.time > 50 ||
        Math.abs(target - last.multiplier) > last.multiplier * 0.005)
    ) {
      this.fast.graphPoints.push({ time: elapsed, multiplier: target });
      while (this.fast.graphPoints.length > 600) this.fast.graphPoints.shift();
    }

    // No allocation — just a numeric write. The fast snapshot object
    // identity stays the same; consumers must read its fields, not
    // rely on referential equality.
    this.fast.displayMultiplier = display;
    this.emitTick();
  }

  private emitTick(): void {
    this.emit('tick');
  }

  /* ----------------------------------------------------------- latency */

  private recordLatency(rtt: number): void {
    this.latencySamples.push(rtt);
    if (this.latencySamples.length > 5) this.latencySamples.shift();
    const avg =
      this.latencySamples.reduce((a, b) => a + b, 0) /
      this.latencySamples.length;
    const next = Math.round(avg);
    // Emit only when it changed by 5ms+ — avoids re-renders for jitter.
    if (Math.abs(next - this.snapshot.latencyMs) >= 5) {
      this.updateSlow({ latencyMs: next });
    }
  }

  /* ---------------------------------------------------------- snapshots */

  private makeInitialSlow(): CrashLiveSnapshot {
    return {
      phase: 'idle',
      serverMultiplier: 1,
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

  /**
   * Update the slow snapshot. Triggers a single React re-render via the
   * 'state' event. Does NOT touch the fast channel.
   */
  private updateSlow(patch: Partial<CrashLiveSnapshot>): void {
    let changed = false;
    for (const k of Object.keys(patch) as Array<keyof CrashLiveSnapshot>) {
      const next = patch[k];
      if (
        next !== undefined &&
        (this.snapshot[k] as unknown) !== (next as unknown)
      ) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.emit('state', this.snapshot);
  }
}
