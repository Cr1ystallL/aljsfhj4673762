import { randomUUID } from 'crypto';
import { BaseGameEngine } from '../../game-engine/base-game-engine.js';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
import { provablyFair } from '../../game-engine/provably-fair.js';
import { rtpEngine } from '../../services/rtp-engine.js';
import { gameConfig } from '../../services/game-config.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../utils/logger.js';
import type {
  GameRound,
  Bet,
  GameTick,
  GameConfig,
} from '../../game-engine/types.js';

/**
 * Crash Game Engine — Slot-aware Multiplayer
 *
 * RULES:
 * - One global round at a time. ~15s cooldown between rounds (9s open
 *   betting + 3s countdown + 3s post-round resolve).
 * - Each user can place up to TWO bets per round (slot 0 and slot 1).
 *   Each slot has its own amount and optional auto-cashout target.
 * - During WAITING/STARTING (countdown) bets can be placed AND cancelled
 *   (refunded). Once ACTIVE, the only outgoing action is cashout.
 * - On crash, all active (non-cashed-out) slots lose.
 * - Provably fair: server seed hashed before round opens, revealed after
 *   completion. House edge = 1% (RTP 99%) — see provably-fair.ts.
 *
 * EVENTS (server → clients via room broadcast):
 *   round:created, phase:waiting, phase:countdown, phase:active,
 *   bet:placed, bet:cancelled, multiplier:update, player:cashout,
 *   player:lost, game:crashed, round:completed.
 */

export interface CrashUserInfo {
  userId: string;
  username?: string | null;
  firstName?: string | null;
  photoUrl?: string | null;
}

interface SlotKey {
  userId: string;
  slot: number;
}

interface CashedOutInfo {
  multiplier: number;
  payout: number;
  timestamp: number;
}

interface CrashState {
  currentMultiplier: number;
  crashPoint: number;
  elapsedTime: number;
  startTime: number;
  /** key = `${userId}:${slot}` */
  slotBets: Map<string, Bet>;
  /** key = `${userId}:${slot}` */
  slotAutoCashouts: Map<string, number>;
  /** key = `${userId}:${slot}` */
  slotCashedOut: Map<string, CashedOutInfo>;
  cashoutQueue: Array<SlotKey & { timestamp: number }>;
}

interface CrashHistory {
  roundId: string;
  crashPoint: number;
  timestamp: number;
  playerCount: number;
  totalWagered: number;
}

const VALID_SLOTS = new Set([0, 1]);

export class CrashGameEngine extends BaseGameEngine {
  private crashState: CrashState = this.makeInitialCrashState();
  private history: CrashHistory[] = [];
  private userInfo: Map<string, CrashUserInfo> = new Map();
  private playerDemoMode: Map<string, boolean> = new Map();

  private readonly MAX_HISTORY = 50;

  // Phase durations are pulled from gameConfig.extras at the start of
  // each round so an admin can change them live (15 sec waiting, 3 sec
  // countdown) without restarting the worker. Defaults fall back to a
  // reasonable 9s / 3s.
  private waitingTimeMs = 9000;
  private countdownTimeMs = 3000;

  private waitingTimeout?: NodeJS.Timeout;
  private countdownTimeout?: NodeJS.Timeout;
  private currentServerSeedHash = '';
  /** Wall-clock timestamp the current phase will end at (ms). */
  private currentPhaseEndsAt: number | null = null;

  constructor(gameId: string) {
    const config: GameConfig = {
      minBet: 1,
      maxBet: 10000,
      maxPlayers: 200,
      tickRate: 100,
      autoStartDelay: 0, // not used; we manage phases ourselves
      provablyFair: true,
    };
    super(gameId, 'crash', config);
  }

  /**
   * Bootstrap: bring the room online and start the round loop.
   *
   * Note: the room runs continuously while the backend process is up.
   * There used to be an inactivity-based cleanup that called `this.stop()`
   * after 5 minutes with no players — but the manager never restarted
   * the engine afterwards, so the room ended up frozen until the next
   * deploy. Removed; the engine is cheap to keep alive.
   */
  start(): void {
    super.start();
    // Hydrate the in-memory history strip from the persistent table so a
    // fresh server still shows the last 20 crashes from previous sessions.
    void this.hydrateHistory()
      .catch((err) => logger.error(err, 'Failed to hydrate crash history'))
      .finally(() => {
        void this.startRound().catch((err) =>
          logger.error(err, 'Failed to start initial crash round')
        );
      });
  }

  /**
   * Load the last 20 completed crashes from the `game_rounds` table.
   * Newest first internally, but we present old → new in events.
   */
  private async hydrateHistory(): Promise<void> {
    const rows = await prisma.gameRound.findMany({
      where: { gameType: 'crash', state: 'completed' },
      orderBy: { endedAt: 'desc' },
      take: 20,
    });

    const items: CrashHistory[] = rows
      .map((r) => {
        const meta = (r.metadata as { crashPoint?: number } | null) ?? null;
        const cp = meta?.crashPoint;
        if (typeof cp !== 'number') return null;
        return {
          roundId: r.id,
          crashPoint: cp,
          timestamp: r.endedAt?.getTime() ?? r.createdAt.getTime(),
          playerCount: 0,
          totalWagered: 0,
        } as CrashHistory;
      })
      .filter((x): x is CrashHistory => x !== null)
      .reverse(); // chronological

    this.history = items;
    logger.info({ count: items.length }, 'Crash history hydrated');
  }

  /* -----------------------------------------------------------------------
   * Public API used by HTTP routes
   * ----------------------------------------------------------------------*/

  hasUserInfo(userId: string): boolean {
    return this.userInfo.has(userId);
  }

  setUserInfo(info: CrashUserInfo): void {
    this.userInfo.set(info.userId, info);
  }

  /**
   * Place a bet on a specific slot (0 or 1).
   */
  async placeCrashBet(
    userId: string,
    slot: number,
    amount: number,
    autoCashout: number | null,
    demoMode: boolean
  ): Promise<Bet> {
    if (!VALID_SLOTS.has(slot)) {
      throw new Error('Invalid slot (use 0 or 1)');
    }
    if (amount < this.config.minBet || amount > this.config.maxBet) {
      throw new Error(
        `Bet amount must be between ${this.config.minBet} and ${this.config.maxBet}`
      );
    }
    if (!this.canPlaceBet()) {
      throw new Error('Round is already running, betting is closed');
    }
    const key = this.slotKey(userId, slot);
    if (this.crashState.slotBets.has(key)) {
      throw new Error('This slot already has a bet');
    }
    if (autoCashout != null && autoCashout < 1.01) {
      throw new Error('Auto-cashout must be at least 1.01x');
    }

    if (!this.room.players.has(userId)) {
      this.addPlayer(userId, demoMode);
    }
    this.playerDemoMode.set(userId, demoMode);

    const bet: Bet = {
      id: `bet_${Date.now()}_${randomUUID()}`,
      userId,
      gameId: this.gameId,
      roundId: this.room.currentRound?.id || '',
      amount,
      state: 'pending',
      placedAt: Date.now(),
      metadata: { slot, autoCashout: autoCashout ?? null },
    };

    await bettingPipeline.processBet(bet, demoMode);
    bet.state = 'active';

    this.crashState.slotBets.set(key, bet);
    if (autoCashout) {
      this.crashState.slotAutoCashouts.set(key, autoCashout);
    }

    this.emitEvent('bet:placed', {
      bet,
      userId,
      slot,
      amount: bet.amount,
      autoCashout: autoCashout ?? null,
      user: this.userInfo.get(userId) ?? { userId },
      stats: this.getRoomStats(),
    });

    logger.info({ betId: bet.id, userId, slot, amount }, 'Crash bet placed');

    return bet;
  }

  /**
   * Cancel a pending bet during waiting/countdown — refunds via rollback.
   */
  async cancelCrashBet(userId: string, slot: number): Promise<void> {
    if (!VALID_SLOTS.has(slot)) {
      throw new Error('Invalid slot');
    }
    if (this.room.state === 'active' || this.room.state === 'resolving') {
      throw new Error('Cannot cancel: round already started');
    }
    const key = this.slotKey(userId, slot);
    const bet = this.crashState.slotBets.get(key);
    if (!bet) {
      throw new Error('No bet on that slot');
    }
    const demoMode = this.playerDemoMode.get(userId) ?? false;

    await bettingPipeline.rollbackBet(bet, demoMode);

    this.crashState.slotBets.delete(key);
    this.crashState.slotAutoCashouts.delete(key);

    this.emitEvent('bet:cancelled', {
      userId,
      slot,
      betId: bet.id,
      stats: this.getRoomStats(),
    });

    logger.info({ betId: bet.id, userId, slot }, 'Crash bet cancelled');
  }

  /**
   * Queue cashout for a specific slot. Resolved on next tick.
   */
  queueSlotCashout(userId: string, slot: number): void {
    if (!VALID_SLOTS.has(slot)) {
      throw new Error('Invalid slot');
    }
    if (this.room.state !== 'active') {
      throw new Error('Round is not active');
    }
    const key = this.slotKey(userId, slot);
    if (!this.crashState.slotBets.has(key)) {
      throw new Error('No bet on that slot');
    }
    if (this.crashState.slotCashedOut.has(key)) {
      return; // already cashed out
    }
    this.crashState.cashoutQueue.push({ userId, slot, timestamp: Date.now() });
  }

  /**
   * Snapshot used by REST `/crash/state` and late-joiners.
   */
  getCurrentState(): unknown {
    return {
      phase: this.room.state,
      multiplier: this.crashState.currentMultiplier,
      elapsedTime: this.crashState.elapsedTime,
      phaseEndsAt: this.currentPhaseEndsAt,
      crashPointPreview:
        this.room.state === 'completed'
          ? this.crashState.crashPoint
          : null,
      serverSeedHash: this.currentServerSeedHash,
      activePlayers: this.getActivePlayersList(),
      cashedOut: Array.from(this.crashState.slotCashedOut.entries()).map(
        ([k, v]) => {
          const [userId, slotStr] = k.split(':');
          return {
            userId,
            slot: parseInt(slotStr, 10),
            multiplier: v.multiplier,
            payout: v.payout,
            timestamp: v.timestamp,
          };
        }
      ),
      history: this.history.slice(-20).reverse(),
      stats: this.getRoomStats(),
    };
  }

  getHistory(): CrashHistory[] {
    return [...this.history];
  }

  /* -----------------------------------------------------------------------
   * Lifecycle (overrides BaseGameEngine hooks)
   * ----------------------------------------------------------------------*/

  protected async createRound(): Promise<GameRound> {
    // Pull live phase durations from gameConfig.extras — admin's
    // настройки в `/system/console/games` влияют на следующий раунд.
    try {
      const cfg = await gameConfig.get('crash');
      const extras = (cfg.extras ?? {}) as {
        waitingPhaseSeconds?: number;
        countdownSeconds?: number;
      };
      // Hard floors so the engine can never crash-loop with a 0-second
      // phase. Hard ceilings so a fat-finger admin can't halt the room
      // for an hour.
      const ws = Number(extras.waitingPhaseSeconds);
      const cs = Number(extras.countdownSeconds);
      this.waitingTimeMs =
        Number.isFinite(ws) && ws > 0
          ? Math.max(3, Math.min(120, ws)) * 1000
          : 9000;
      this.countdownTimeMs =
        Number.isFinite(cs) && cs > 0
          ? Math.max(1, Math.min(15, cs)) * 1000
          : 3000;
    } catch {
      // Best-effort: keep last-known values.
    }

    const serverSeed = provablyFair.generateServerSeed();
    const clientSeed = provablyFair.generateClientSeed();
    const nonce = (this.room.currentRound?.nonce || 0) + 1;
    const hash = provablyFair.generateResult(serverSeed, clientSeed, nonce);
    // Crash is multiplayer — every player in this round shares the same
    // crashPoint. We apply only the global controller bias (no per-user
    // component), and only the bias snapshot at round-creation time.
    const bias = 0; // Auto-RTP disabled for Crash
    let crashPoint = provablyFair.generateCrashMultiplier(hash, bias);

    // ---- Hard ceiling -------------------------------------------------
    // Random per-round between 120x and 184x. The natural Bustabit
    // distribution very rarely produces these, but when it does it
    // wrecks the casino's bankroll on a single player who happens to
    // auto-cashout high. Capping at a per-round random ceiling smooths
    // payouts without making the cap visible to the player.
    const ceilingHash = provablyFair
      .hashServerSeed(`${serverSeed}:cap`)
      .substring(0, 8);
    const ceilingInt = parseInt(ceilingHash, 16);
    const ceiling =
      120 + ((ceilingInt >>> 0) / 0xffffffff) * (184 - 120);
    crashPoint = Math.min(crashPoint, +ceiling.toFixed(2));

    // ---- Budget-aware further cap ------------------------------------
    // If everyone in the room held until `crashPoint`, total payout
    // would be `sum(stake_i) * crashPoint`. We don't want a single
    // round to liquidate a meaningful chunk of the casino's bankroll,
    // so we shrink the crashPoint until that scenario stays under
    // `BUDGET_FRACTION` of the rolling 24h profit. This is a soft
    // safety net — the controller (rtp-engine) already does the
    // primary smoothing.
    try {
      const status = await rtpEngine.getStatus();
      const totalStake = Array.from(this.crashState.slotBets.values()).reduce(
        (sum, b) => sum + b.amount,
        0
      );
      // Bankroll proxy: 10x today's actual profit so target=0 doesn't
      // trip every round. Floor at 1000 PLN so empty windows still
      // allow some payout.
      const bankroll = Math.max(1000, status.windowProfit * 10);
      const BUDGET_FRACTION = 0.6;
      if (totalStake > 0) {
        const maxAffordableMult = (bankroll * BUDGET_FRACTION) / totalStake;
        if (Number.isFinite(maxAffordableMult) && maxAffordableMult >= 1.5) {
          crashPoint = Math.min(crashPoint, +maxAffordableMult.toFixed(2));
        }
      }
    } catch {
      // best-effort, fall through
    }

    // Final floor so we never produce a sub-1.01 crash, UNLESS loss mode (houseEdge >= 1.0) is active
    // If loss mode is active and there are real bets, force crashPoint to 1.00.
    const cfg = await gameConfig.get('crash').catch(() => null);
    const isLossMode = cfg && cfg.houseEdge >= 1.0;
    const hasBets = Array.from(this.crashState.slotBets.values()).some((b) => !b.metadata?.demoMode);

    if (isLossMode && hasBets) {
      crashPoint = 1.00;
    } else {
      crashPoint = Math.max(1.01, crashPoint);
      if (cfg && cfg.extras?.maxCrashX && typeof cfg.extras.maxCrashX === 'number') {
        crashPoint = Math.min(crashPoint, cfg.extras.maxCrashX as number);
      }
    }

    this.crashState = this.makeInitialCrashState();
    this.crashState.crashPoint = crashPoint;
    this.currentServerSeedHash = provablyFair.hashServerSeed(serverSeed);

    const round: GameRound = {
      // Use a UUID suffix instead of `nonce` so a backend restart that
      // lands within the same millisecond as a previous round can't
      // produce a duplicate id (Prisma P2002).
      id: `crash_${Date.now()}_${randomUUID().slice(0, 8)}`,
      gameId: this.gameId,
      state: 'waiting',
      startedAt: Date.now(),
      seed: hash,
      serverSeed,
      clientSeed,
      nonce,
      metadata: { crashPoint, serverSeedHash: this.currentServerSeedHash },
    };

    this.emitEvent('round:created', {
      roundId: round.id,
      serverSeedHash: this.currentServerSeedHash,
      history: this.history.slice(-20).reverse(),
    });

    setTimeout(() => this.startWaitingPhase(), 50);

    logger.info(
      {
        roundId: round.id,
        crashPoint,
        waitingMs: this.waitingTimeMs,
        countdownMs: this.countdownTimeMs,
      },
      'Crash round created'
    );
    return round;
  }

  protected async processBet(bet: Bet, demoMode: boolean): Promise<void> {
    // Not used directly. placeCrashBet calls bettingPipeline itself.
    await bettingPipeline.processBet(bet, demoMode);
  }

  protected canPlaceBet(): boolean {
    return this.room.state === 'waiting' || this.room.state === 'starting';
  }

  protected getTickState(): unknown {
    return {
      multiplier: this.crashState.currentMultiplier,
      elapsedTime: this.crashState.elapsedTime,
    };
  }

  protected onRoundStarted(round: GameRound): void {
    this.crashState.startTime = Date.now();
    this.currentPhaseEndsAt = null;
    this.emitEvent('phase:active', {
      startTime: this.crashState.startTime,
      roundId: round.id,
    });
  }

  protected onTick(tick: GameTick): void {
    if (this.room.state !== 'active') return;

    this.crashState.elapsedTime += tick.deltaTime;
    const growthRate = 0.00006;
    this.crashState.currentMultiplier = Math.pow(
      Math.E,
      growthRate * this.crashState.elapsedTime
    );

    this.processCashoutQueue();
    this.checkAutoCashouts();

    if (this.crashState.currentMultiplier >= this.crashState.crashPoint) {
      this.room.state = 'resolving';
      void this.crash();
      return;
    }

    this.emitEvent('multiplier:update', {
      multiplier: this.crashState.currentMultiplier,
      elapsedTime: this.crashState.elapsedTime,
    });
  }

  protected async resolveBets(): Promise<void> {
    for (const [key, bet] of this.crashState.slotBets.entries()) {
      if (this.crashState.slotCashedOut.has(key)) continue;
      const [userId, slotStr] = key.split(':');
      const slot = parseInt(slotStr, 10);
      try {
        await bettingPipeline.processLoss(bet);
      } catch (err) {
        logger.error(err, 'processLoss failed');
      }
      this.emitEvent('player:lost', {
        userId,
        slot,
        betAmount: bet.amount,
        crashPoint: parseFloat(this.crashState.crashPoint.toFixed(2)),
        user: this.userInfo.get(userId) ?? { userId },
      });
    }
  }

  protected onRoundCompleted(round: GameRound, result: unknown): void {
    const r = result as { crashPoint: number };
    this.emitEvent('round:completed', {
      roundId: round.id,
      crashPoint: r.crashPoint,
      serverSeed: round.serverSeed,
      clientSeed: round.clientSeed,
      nonce: round.nonce,
    });
  }

  /* -----------------------------------------------------------------------
   * Internal helpers
   * ----------------------------------------------------------------------*/

  private makeInitialCrashState(): CrashState {
    return {
      currentMultiplier: 1.0,
      crashPoint: 0,
      elapsedTime: 0,
      startTime: 0,
      slotBets: new Map(),
      slotAutoCashouts: new Map(),
      slotCashedOut: new Map(),
      cashoutQueue: [],
    };
  }

  private slotKey(userId: string, slot: number): string {
    return `${userId}:${slot}`;
  }

  private startWaitingPhase(): void {
    this.clearTimeouts();
    this.room.state = 'waiting';
    const endsAt = Date.now() + this.waitingTimeMs;
    this.currentPhaseEndsAt = endsAt;
    this.emitEvent('phase:waiting', {
      duration: this.waitingTimeMs,
      endsAt,
      roundId: this.room.currentRound?.id ?? null,
      serverSeedHash: this.currentServerSeedHash,
      history: this.history.slice(-20).reverse(),
      stats: this.getRoomStats(),
    });
    // Skip the countdown phase — once betting closes, the round flips
    // to `active` immediately so the curve starts without a 3-2-1
    // ceremony. Admin's `countdownSeconds` config is therefore ignored.
    this.waitingTimeout = setTimeout(
      () => this.activateRound(),
      this.waitingTimeMs
    );
  }

  private startCountdown(): void {
    // Retained as a no-op for binary compatibility with any caller that
    // still references it. The lifecycle now goes waiting → active.
    this.activateRound();
  }

  private clearTimeouts(): void {
    if (this.waitingTimeout) {
      clearTimeout(this.waitingTimeout);
      this.waitingTimeout = undefined;
    }
    if (this.countdownTimeout) {
      clearTimeout(this.countdownTimeout);
      this.countdownTimeout = undefined;
    }
  }

  private processCashoutQueue(): void {
    while (this.crashState.cashoutQueue.length > 0) {
      const item = this.crashState.cashoutQueue.shift()!;
      this.executeCashout(item.userId, item.slot, item.timestamp).catch(
        (err) => logger.error(err, 'cashout failed')
      );
    }
  }

  private checkAutoCashouts(): void {
    for (const [key, target] of this.crashState.slotAutoCashouts.entries()) {
      if (this.crashState.currentMultiplier >= target) {
        const [userId, slotStr] = key.split(':');
        const slot = parseInt(slotStr, 10);
        if (!this.crashState.slotCashedOut.has(key)) {
          this.crashState.cashoutQueue.push({
            userId,
            slot,
            timestamp: Date.now(),
          });
        }
        this.crashState.slotAutoCashouts.delete(key);
      }
    }
  }

  private async executeCashout(
    userId: string,
    slot: number,
    timestamp: number
  ): Promise<void> {
    const key = this.slotKey(userId, slot);
    const bet = this.crashState.slotBets.get(key);
    if (!bet) return;
    if (this.crashState.slotCashedOut.has(key)) return;

    const multiplier = this.crashState.currentMultiplier;
    const cashoutAmount = bet.amount * multiplier;
    const demoMode = this.playerDemoMode.get(userId) ?? false;

    this.crashState.slotCashedOut.set(key, {
      multiplier,
      payout: cashoutAmount,
      timestamp,
    });

    bet.multiplier = multiplier;
    bet.payout = cashoutAmount;

    await bettingPipeline.processCashout(bet, cashoutAmount, multiplier, demoMode, multiplier >= 1.10);

    this.emitEvent('player:cashout', {
      userId,
      slot,
      betAmount: bet.amount,
      multiplier: parseFloat(multiplier.toFixed(2)),
      payout: parseFloat(cashoutAmount.toFixed(2)),
      timestamp,
      user: this.userInfo.get(userId) ?? { userId },
    });
  }

  private async crash(): Promise<void> {
    const crashPoint = this.crashState.crashPoint;
    const round = this.room.currentRound!;

    this.emitEvent('game:crashed', {
      crashPoint: parseFloat(crashPoint.toFixed(2)),
      finalMultiplier: parseFloat(this.crashState.currentMultiplier.toFixed(2)),
      cashedOutCount: this.crashState.slotCashedOut.size,
    });

    const totalWagered = Array.from(this.crashState.slotBets.values()).reduce(
      (sum, b) => sum + b.amount,
      0
    );

    this.history.push({
      roundId: round.id,
      crashPoint,
      timestamp: Date.now(),
      playerCount: this.getRoomStats().playerCount,
      totalWagered,
    });
    if (this.history.length > this.MAX_HISTORY) this.history.shift();

    // Persist this round to `game_rounds` so the history strip is durable
    // across server restarts and visible to all clients (not just those
    // who were online when the round happened).
    try {
      await prisma.gameRound.create({
        data: {
          id: round.id,
          gameType: 'crash',
          state: 'completed',
          serverSeedHash: this.currentServerSeedHash,
          serverSeed: round.serverSeed,
          clientSeed: round.clientSeed ?? null,
          nonce: round.nonce,
          startedAt: round.startedAt ? new Date(round.startedAt) : null,
          endedAt: new Date(),
          metadata: {
            crashPoint,
            finalMultiplier: this.crashState.currentMultiplier,
            playerCount: this.getRoomStats().playerCount,
            totalWagered,
          },
          result: { crashPoint },
        },
      });
    } catch (err) {
      logger.error(err, 'Failed to persist crash round');
    }

    await this.endRound({
      crashPoint,
      finalMultiplier: this.crashState.currentMultiplier,
      totalWagered,
    });

    logger.info(
      { crashPoint, players: this.getRoomStats().playerCount },
      'Crash occurred'
    );
  }

  private getActivePlayersList(): Array<{
    userId: string;
    slot: number;
    betAmount: number;
    user: CrashUserInfo | null;
  }> {
    const list: Array<{
      userId: string;
      slot: number;
      betAmount: number;
      user: CrashUserInfo | null;
    }> = [];
    for (const [key, bet] of this.crashState.slotBets.entries()) {
      const [userId, slotStr] = key.split(':');
      list.push({
        userId,
        slot: parseInt(slotStr, 10),
        betAmount: bet.amount,
        user: this.userInfo.get(userId) ?? null,
      });
    }
    return list;
  }

  private getRoomStats(): {
    playerCount: number;
    totalWagered: number;
    betsCount: number;
  } {
    const userIds = new Set<string>();
    let totalWagered = 0;
    for (const [key, bet] of this.crashState.slotBets.entries()) {
      if (bet.metadata?.tournamentId) continue;
      const [userId] = key.split(':');
      userIds.add(userId);
      totalWagered += bet.amount;
    }
    return {
      playerCount: userIds.size,
      totalWagered: parseFloat(totalWagered.toFixed(2)),
      betsCount: this.crashState.slotBets.size,
    };
  }
}
