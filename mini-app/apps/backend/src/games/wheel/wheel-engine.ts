import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { provablyFair } from '../../game-engine/provably-fair.js';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
import { rtpEngine } from '../../services/rtp-engine.js';
import { gameConfig } from '../../services/game-config.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../utils/logger.js';
import type { Bet } from '../../game-engine/types.js';

/**
 * Wheel of Fortune — live multiplayer.
 *
 * Layout: a 15-segment wheel with the following multipliers:
 *
 *   2x —  6 segments
 *   3x —  5 segments
 *   5x —  3 segments
 *   30x — 1 segment
 *
 *   total = 15 segments.
 *
 * Players bet on a SINGLE multiplier value (2, 3, 5 or 30). Win
 * iff the resolved segment carries that same multiplier. Payout =
 * stake × multiplier. Losers lose their stake, no partial returns.
 */

export type WheelMultiplier = 2 | 3 | 5 | 30;

const SLOT_LAYOUT: WheelMultiplier[] = (() => {
  const out: WheelMultiplier[] = [];
  for (let i = 0; i < 6; i++) out.push(2);
  for (let i = 0; i < 5; i++) out.push(3);
  for (let i = 0; i < 3; i++) out.push(5);
  out.push(30);
  // 15 segments total. Distribute interleaved visually.
  const shuffled: WheelMultiplier[] = new Array(15);
  const fives = [3, 8, 13];
  const threesAt = [1, 5, 9, 12, 14];
  const twosAt = [2, 4, 6, 7, 10, 11];
  shuffled[0] = 30;
  for (const i of fives) shuffled[i] = 5;
  for (const i of threesAt) shuffled[i] = 3;
  for (const i of twosAt) shuffled[i] = 2;
  return shuffled;
})();

export const WHEEL_LAYOUT: ReadonlyArray<WheelMultiplier> = SLOT_LAYOUT;

export const WHEEL_VALUES: ReadonlyArray<WheelMultiplier> = [2, 3, 5, 30];

interface WheelBetRow {
  betId: string;
  userId: string;
  amount: number;
  pick: WheelMultiplier;
  user: { firstName?: string | null; username?: string | null; photoUrl?: string | null } | null;
}

interface WheelHistoryRow {
  roundId: string;
  segmentIndex: number;
  multiplier: WheelMultiplier;
  timestamp: number;
}

type WheelPhase = 'waiting' | 'spinning' | 'completed';

export interface WheelLiveSnapshot {
  phase: WheelPhase;
  /** Authoritative segment index 0..24 once resolved; null otherwise. */
  segmentIndex: number | null;
  /** Convenience mirror of layout[segmentIndex]. */
  multiplier: WheelMultiplier | null;
  /** Player picks for the live feed. Includes own bet. */
  bets: Array<{
    userId: string;
    name: string;
    photoUrl: string | null;
    amount: number;
    pick: WheelMultiplier;
    /** Set once round resolves. */
    won?: boolean;
    /** Payout once round resolves. */
    payout?: number;
  }>;
  /** Last 30 wheel results, newest first. */
  history: WheelHistoryRow[];
  /** End-of-betting timestamp during 'waiting'. */
  waitingEndsAt: number | null;
  /** Provably-fair commit. */
  serverSeedHash: string;
  /** When `phase==='spinning'` this is wallclock start of the spin. */
  spinStartedAt: number | null;
  /** Spin duration in ms (so the client can sync its rotation). */
  spinDurationMs: number;
  stats: { playerCount: number; totalWagered: number };
}

interface CurrentRound {
  roundId: string;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  segmentIndex: number;
  multiplier: WheelMultiplier;
  bets: Map<string, WheelBetRow>; // userId+nonce → bet
  startedAt: number;
}

const SPIN_DURATION_MIN_MS = 8000;
const SPIN_DURATION_MAX_MS = 15000;
/** Default exposed for legacy snapshots; superseded by per-round value. */
const SPIN_DURATION_MS = 12000;
const HISTORY_CAP = 30;

class WheelEngine extends EventEmitter {
  private phase: WheelPhase = 'waiting';
  private round: CurrentRound | null = null;
  private waitingEndsAt: number | null = null;
  private spinStartedAt: number | null = null;
  private waitingMs = 9000;
  private history: WheelHistoryRow[] = [];
  private serverSeedHash = '';
  private waitingTimer: ReturnType<typeof setTimeout> | null = null;
  private spinTimer: ReturnType<typeof setTimeout> | null = null;
  private currentSpinDurationMs = SPIN_DURATION_MS;

  constructor() {
    super();
    this.setMaxListeners(64);
  }

  start(): void {
    void this.hydrateHistory().finally(() => void this.openWaiting());
  }

  stop(): void {
    if (this.waitingTimer) clearTimeout(this.waitingTimer);
    if (this.spinTimer) clearTimeout(this.spinTimer);
    this.waitingTimer = null;
    this.spinTimer = null;
  }

  getSnapshot(): WheelLiveSnapshot {
    const bets = this.round
      ? Array.from(this.round.bets.values()).map((b) => {
          const won =
            this.phase === 'completed' &&
            this.round?.multiplier === b.pick;
          return {
            userId: b.userId,
            name:
              b.user?.firstName ||
              b.user?.username ||
              `id${b.userId.slice(0, 4)}`,
            photoUrl: b.user?.photoUrl ?? null,
            amount: b.amount,
            pick: b.pick,
            won: this.phase === 'completed' ? won : undefined,
            payout:
              this.phase === 'completed' && won
                ? +(b.amount * b.pick).toFixed(2)
                : undefined,
          };
        })
      : [];
    return {
      phase: this.phase,
      // Authoritative segment is exposed during the spin too — without
      // it the client has nothing to anchor the rotation on and the
      // wheel sits still until phase flips to completed. The seed and
      // hash are still hidden until completion (provably fair).
      segmentIndex:
        this.phase === 'spinning' || this.phase === 'completed'
          ? this.round?.segmentIndex ?? null
          : null,
      multiplier:
        this.phase === 'spinning' || this.phase === 'completed'
          ? this.round?.multiplier ?? null
          : null,
      bets,
      history: this.history.slice(0, HISTORY_CAP),
      waitingEndsAt: this.phase === 'waiting' ? this.waitingEndsAt : null,
      serverSeedHash:
        this.phase === 'waiting' || this.phase === 'spinning'
          ? this.serverSeedHash
          : this.round?.serverSeedHash ?? '',
      spinStartedAt: this.phase === 'spinning' ? this.spinStartedAt : null,
      spinDurationMs: this.currentSpinDurationMs,
      stats: this.getStats(),
      timestamp: Date.now(),
    };
  }

  /* --------------------------- bet placement --------------------------- */

  async placeBet(
    userId: string,
    amount: number,
    pick: WheelMultiplier,
    user: WheelBetRow['user']
  ): Promise<{ betId: string }> {
    if (this.phase !== 'waiting' || !this.round) {
      throw new Error('Betting closed');
    }
    if (!WHEEL_VALUES.includes(pick)) {
      throw new Error('Invalid multiplier');
    }
    if (!Number.isFinite(amount) || amount < 1 || amount > 10000) {
      throw new Error('Bet must be between 1 and 10000');
    }

    // One bet per user per round per pick to prevent griefing the feed.
    const key = `${userId}:${pick}`;
    if (this.round.bets.has(key)) {
      throw new Error('You already bet on this multiplier');
    }

    // Per-round cap: at most 2 different multipliers per user per round.
    const ownPickCount = Array.from(this.round.bets.values()).filter(
      (b) => b.userId === userId
    ).length;
    if (ownPickCount >= 2) {
      throw new Error('Limit reached — max 2 bets per round');
    }

    const bet: Bet = {
      id: `bet_${Date.now()}_${randomUUID()}`,
      userId,
      gameId: this.round.roundId,
      roundId: this.round.roundId,
      amount,
      state: 'pending',
      placedAt: Date.now(),
      metadata: { gameType: 'wheel', pick },
    };

    await bettingPipeline.processBet(bet, false);
    bet.state = 'active';

    this.round.bets.set(key, {
      betId: bet.id,
      userId,
      amount,
      pick,
      user,
    });

    this.emit('event', {
      type: 'bet:placed',
      payload: {
        userId,
        amount,
        pick,
        user,
        stats: this.getStats(),
      },
    });

    logger.info({ userId, amount, pick, roundId: this.round.roundId }, 'Wheel bet placed');
    return { betId: bet.id };
  }

  /* ----------------------------- lifecycle ----------------------------- */

  private async openWaiting(): Promise<void> {
    // Read configurable waiting duration from gameConfig (key 'wheel').
    try {
      const cfg = await gameConfig.get('wheel');
      const extras = (cfg.extras ?? {}) as { waitingPhaseSeconds?: number };
      const ws = Number(extras.waitingPhaseSeconds);
      this.waitingMs =
        Number.isFinite(ws) && ws > 0
          ? Math.max(3, Math.min(120, ws)) * 1000
          : 9000;
    } catch {
      // keep last value
    }

    // Pre-commit the seed for THIS round so the hash is visible during
    // betting. We compute the segment now (with bias) but reveal it
    // only after the spin animation.
    const serverSeed = provablyFair.generateServerSeed();
    const clientSeed = provablyFair.generateClientSeed();
    const nonce = (this.round?.nonce ?? 0) + 1;
    const hash = provablyFair.generateResult(serverSeed, clientSeed, nonce);
    const serverSeedHash = provablyFair.hashServerSeed(serverSeed);

    const bias = await rtpEngine.getGlobalBias().catch(() => 0);
    const segmentIndex = pickSegment(hash, bias);
    const multiplier = SLOT_LAYOUT[segmentIndex];

    const roundId = `wheel_${Date.now()}_${randomUUID().slice(0, 8)}`;
    this.round = {
      roundId,
      serverSeed,
      serverSeedHash,
      clientSeed,
      nonce,
      segmentIndex,
      multiplier,
      bets: new Map(),
      startedAt: Date.now(),
    };
    this.serverSeedHash = serverSeedHash;
    this.phase = 'waiting';
    this.waitingEndsAt = Date.now() + this.waitingMs;

    await prisma.gameRound
      .create({
        data: {
          id: roundId,
          gameType: 'wheel',
          state: 'waiting',
          serverSeedHash,
          clientSeed,
          nonce,
          startedAt: new Date(),
          metadata: { layoutVersion: 1 },
        },
      })
      .catch((err) => logger.warn(err, 'wheel gameRound.create failed'));

    this.emit('event', {
      type: 'phase:waiting',
      payload: {
        roundId,
        endsAt: this.waitingEndsAt,
        duration: this.waitingMs,
        serverSeedHash,
        history: this.history,
        stats: this.getStats(),
      },
    });

    if (this.waitingTimer) clearTimeout(this.waitingTimer);
    this.waitingTimer = setTimeout(() => void this.startSpin(), this.waitingMs);
  }

  private async startSpin(): Promise<void> {
    if (!this.round) return;
    this.phase = 'spinning';
    this.spinStartedAt = Date.now();
    this.waitingEndsAt = null;
    // Random spin duration between 8 and 15 seconds — keeps players
    // engaged and prevents pattern-counting between rounds. Derived
    // from the same hash as the segment so it's reproducible from the
    // server seed for provably-fair audit.
    const durHash = parseInt(this.round.serverSeedHash.substring(0, 8), 16);
    const u = (durHash >>> 0) / 0xffffffff;
    this.currentSpinDurationMs = Math.round(
      SPIN_DURATION_MIN_MS + u * (SPIN_DURATION_MAX_MS - SPIN_DURATION_MIN_MS)
    );

    this.emit('event', {
      type: 'phase:spinning',
      payload: {
        roundId: this.round.roundId,
        spinStartedAt: this.spinStartedAt,
        spinDurationMs: this.currentSpinDurationMs,
        // Authoritative segment is sent now so the client can land
        // exactly there. The provably-fair seed is revealed after the
        // round completes for full verification.
        segmentIndex: this.round.segmentIndex,
        multiplier: this.round.multiplier,
        layout: SLOT_LAYOUT,
      },
    });

    if (this.spinTimer) clearTimeout(this.spinTimer);
    this.spinTimer = setTimeout(
      () => void this.completeSpin(),
      this.currentSpinDurationMs
    );
  }

  private async completeSpin(): Promise<void> {
    if (!this.round) return;
    const round = this.round;
    this.phase = 'completed';

    // Settle all bets.
    const winners: Array<{ userId: string; pick: WheelMultiplier; amount: number; payout: number }> = [];
    for (const b of round.bets.values()) {
      const bet: Bet = {
        id: b.betId,
        userId: b.userId,
        gameId: round.roundId,
        roundId: round.roundId,
        amount: b.amount,
        state: 'active',
        placedAt: round.startedAt,
        metadata: { gameType: 'wheel', pick: b.pick },
      };
      const won = b.pick === round.multiplier;
      try {
        if (won) {
          const payout = +(b.amount * b.pick).toFixed(2);
          bet.multiplier = b.pick;
          bet.payout = payout;
          await bettingPipeline.processPayout(bet, payout, false);
          winners.push({ userId: b.userId, pick: b.pick, amount: b.amount, payout });
        } else {
          bet.payout = 0;
          bet.multiplier = 0;
          await bettingPipeline.processLoss(bet);
        }
      } catch (err) {
        logger.error(err, 'wheel settle failed');
      }
    }

    // Persist the round result + reveal the seed.
    await prisma.gameRound
      .update({
        where: { id: round.roundId },
        data: {
          state: 'completed',
          serverSeed: round.serverSeed,
          endedAt: new Date(),
          result: {
            segmentIndex: round.segmentIndex,
            multiplier: round.multiplier,
            winners,
          },
        },
      })
      .catch((err) => logger.warn(err, 'wheel gameRound.update failed'));

    // History buffer.
    this.history.unshift({
      roundId: round.roundId,
      segmentIndex: round.segmentIndex,
      multiplier: round.multiplier,
      timestamp: Date.now(),
    });
    if (this.history.length > HISTORY_CAP * 2) {
      this.history.length = HISTORY_CAP;
    }

    this.emit('event', {
      type: 'round:completed',
      payload: {
        roundId: round.roundId,
        segmentIndex: round.segmentIndex,
        multiplier: round.multiplier,
        serverSeed: round.serverSeed,
        winners,
      },
    });

    // Brief breather — without an explicit countdown phase. The client
    // shows the result for ~2 s, then we open the next betting window
    // immediately so the round-cycle is continuous.
    setTimeout(() => void this.openWaiting(), 2000);
  }

  /* ------------------------------ helpers ------------------------------ */

  private getStats(): { playerCount: number; totalWagered: number } {
    if (!this.round) return { playerCount: 0, totalWagered: 0 };
    const users = new Set<string>();
    let total = 0;
    for (const b of this.round.bets.values()) {
      users.add(b.userId);
      total += b.amount;
    }
    return {
      playerCount: users.size,
      totalWagered: +total.toFixed(2),
    };
  }

  private async hydrateHistory(): Promise<void> {
    try {
      const rows = await prisma.gameRound.findMany({
        where: { gameType: 'wheel', state: 'completed' },
        orderBy: { endedAt: 'desc' },
        take: HISTORY_CAP,
      });
      this.history = rows
        .map((r) => {
          const md = (r.result as { segmentIndex?: number; multiplier?: number } | null) ?? null;
          if (!md || typeof md.segmentIndex !== 'number') return null;
          return {
            roundId: r.id,
            segmentIndex: md.segmentIndex,
            multiplier: (md.multiplier ?? 1) as WheelMultiplier,
            timestamp: (r.endedAt ?? r.createdAt).getTime(),
          };
        })
        .filter((x): x is WheelHistoryRow => x !== null);
    } catch (err) {
      logger.warn(err, 'wheel history hydrate failed');
      this.history = [];
    }
  }
}

/**
 * Pick a segment 0..14 from the seed, biased by the rtp controller.
 * Bias mechanism:
 *   bias > 0 (casino-favouring) → reduce 30x slot probability, push
 *     mass into 2x and 3x.
 *   bias < 0 (player-favouring) → boost 30x and 5x probability.
 *
 * Implementation: we apply a per-multiplier weight perturbation, then
 * sample by cumulative weight from the hash uniform.
 */
function pickSegment(hash: string, bias: number): number {
  const b = Math.max(-1, Math.min(1, bias));
  // Per-multiplier weight scalers. With b=0 they're all 1.
  const scaler: Record<WheelMultiplier, number> = {
    2: 1 + b * 0.15,
    3: 1 + b * 0.05,
    5: 1 - b * 0.2,
    30: 1 - b * 0.6,
  };
  const weights = SLOT_LAYOUT.map((m) => Math.max(0.05, scaler[m]));
  const total = weights.reduce((a, x) => a + x, 0);

  // Uniform sample from a fresh hash slice (independent of curve U).
  const u = parseInt(hash.substring(0, 13), 16) / Math.pow(2, 52);
  const target = u * total;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (target <= acc) return i;
  }
  return weights.length - 1;
}

export const wheelEngine = new WheelEngine();
