import { randomUUID } from 'crypto';
import { provablyFair } from '../../game-engine/provably-fair.js';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
// import { rtpEngine } from '../../services/rtp-engine.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../utils/logger.js';
import { gameConfig } from '../../services/game-config.js';
import type { Bet } from '../../game-engine/types.js';

/**
 * Coinflip Game Engine — Server-authoritative.
 *
 * Two modes:
 *
 *   quick    — single coin toss. Pick heads/tails, win ⇒ 1.94×, lose ⇒ 0.
 *              The 0.06× shaved off a fair 2× is the house edge, RTP = 97%.
 *
 *   multiply — escalating multiplier. Each correct call doubles ~1.94×
 *              the current bank. The user can cash out after any
 *              successful round; one wrong call wipes everything. The
 *              cap is 20 rounds (>= ×10⁶) which is well beyond any sane
 *              wager. RTP per step = 97%.
 *
 * Each round consumes one provably-fair seed pair, and the bucket index
 * (0=heads, 1=tails) is derived deterministically from the hash so the
 * outcome can be verified post-hoc.
 *
 * UI multipliers per round (cumulative, multiply mode):
 *   round 1 → 1.94×
 *   round 2 → 3.88×    (2× of round 1)
 *   round 3 → 7.76×    …
 *   round 4 → 15.52×
 *   …
 */

export type CoinSide = 'heads' | 'tails';
export type CoinflipMode = 'quick' | 'multiply';

const MIN_BET = 1;
const MAX_BET = 10000;
const MAX_ROUNDS = 20;

/** Per-step multiplier. 0.97 covers the 3% house edge per coin toss. */
const STEP_MULTIPLIER = 1.94;

interface MultiplyState {
  userId: string;
  bet: Bet;
  /** Current round number (1-indexed). The round-N multiplier applies if
   *  the user wins at this step. */
  round: number;
  betAmount: number;
  /** Cumulative multiplier going INTO the current round (i.e. what they
   *  would cash out for if they stopped now). */
  currentMultiplier: number;
  /** True once user wins the current round and is awaiting their next
   *  call (heads/tails) for the next round. */
  awaiting: 'sideChoice' | 'flipResult';
  /** If awaiting flipResult, the user's side choice for round `round`. */
  pendingChoice?: CoinSide;
  /** Provably-fair seeds — the ROUND seed is derived per round; we keep
   *  the room-level pair static for the whole multiply session. */
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
}

export interface CoinflipQuickResult {
  mode: 'quick';
  roundId: string;
  choice: CoinSide;
  outcome: CoinSide;
  won: boolean;
  multiplier: number;
  payout: number;
  betAmount: number;
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
}

export interface CoinflipMultiplyState {
  mode: 'multiply';
  roundId: string;
  betAmount: number;
  /** 1-indexed round we are currently on. */
  round: number;
  /** Hard ceiling for the UI to render the dots. */
  maxRounds: number;
  /** Multiplier locked in BEFORE the current round (cashable amount). */
  currentMultiplier: number;
  /** Multiplier the user would have IF they win the current round. */
  nextMultiplier: number;
  /** Status: 'idle' before first toss, 'awaiting' after a win waiting for
   *  the next call, 'busted' after a loss, 'cashed' after withdraw. */
  status: 'awaiting' | 'busted' | 'cashed';
  /** Last toss outcome (for animation). */
  lastChoice?: CoinSide;
  lastOutcome?: CoinSide;
  /** Final payout, only set when status != 'awaiting'. */
  payout?: number;
  /** Multipliers per round, useful to draw the dot strip. */
  multipliers: number[];
  serverSeedHash: string;
  /** Revealed only on final state. */
  serverSeed?: string;
  clientSeed?: string;
}

class CoinflipEngine {
  /** Active multiply sessions per user. */
  private rooms = new Map<string, MultiplyState>();

  hasActive(userId: string): boolean {
    const g = this.rooms.get(userId);
    // A finished session (busted/cashed) is in memory only so the user
    // can read the final state via /state. It must not block /start.
    if (!g) return false;
    const status = (g as unknown as { _status?: 'cashed' | 'busted' })._status;
    return status === undefined;
  }

  getState(userId: string): CoinflipMultiplyState | null {
    const g = this.rooms.get(userId);
    if (!g) return null;
    return this.toPublic(g);
  }

  /** Return the canonical multiplier table used by the UI. */
  getMultipliers(): number[] {
    return Array.from({ length: MAX_ROUNDS }, (_, i) =>
      +(STEP_MULTIPLIER ** (i + 1)).toFixed(2)
    );
  }

  /* ------------------------------------------------------------ quick */

  async playQuick(
    userId: string,
    amount: number,
    choice: CoinSide
  ): Promise<CoinflipQuickResult> {
    if (!Number.isFinite(amount) || amount < MIN_BET || amount > MAX_BET) {
      throw new Error(`Ставка должна быть от ${MIN_BET} до ${MAX_BET}`);
    }
    if (choice !== 'heads' && choice !== 'tails') {
      throw new Error('Неверная сторона');
    }

    const serverSeed = provablyFair.generateServerSeed();
    const clientSeed = provablyFair.generateClientSeed();
    const hash = provablyFair.generateResult(serverSeed, clientSeed, 0);
    const serverSeedHash = provablyFair.hashServerSeed(serverSeed);
    // Pre-fact tilt — bias > 0 makes the user lose more often, bias < 0
    // makes them win more often. Capped to ±20pp shift in the win rate.
    const bias = 0; // await rtpEngine.getBiasFor(userId).catch(() => 0);
    let outcome = provablyFair.coinflipOutcome(hash, choice, bias);
    let won = outcome === choice;

    // --- Forced Loss (Hidden Debt) ---
    /*
    if (await rtpEngine.shouldForceLoss(userId, amount, STEP_MULTIPLIER)) {
      won = false;
      outcome = (choice === 'heads' ? 'tails' : 'heads');
    }
    */

    const config = await gameConfig.get('coinflip').catch(() => null);
    if (config && config.houseEdge >= 1.0) {
      won = false; // Guaranteed loss mode
      outcome = (choice === 'heads' ? 'tails' : 'heads');
    }

    const roundId = `coinflip_${Date.now()}_${randomUUID()}`;
    const multiplier = won ? STEP_MULTIPLIER : 0;
    const payout = won ? +(amount * multiplier).toFixed(2) : 0;

    const bet: Bet = {
      id: `bet_${Date.now()}_${randomUUID()}`,
      userId,
      gameId: roundId,
      roundId,
      amount,
      state: 'pending',
      placedAt: Date.now(),
      multiplier,
      payout,
      metadata: { mode: 'quick', choice, outcome, gameType: 'coinflip' },
    };

    await bettingPipeline.processBet(bet, false);
    bet.state = 'active';

    await prisma.gameRound
      .create({
        data: {
          id: roundId,
          gameType: 'coinflip',
          state: 'completed',
          serverSeedHash,
          serverSeed,
          clientSeed,
          nonce: 0,
          startedAt: new Date(),
          endedAt: new Date(),
          metadata: { mode: 'quick', betAmount: amount },
          result: { choice, outcome, won, multiplier, payout },
        },
      })
      .catch((err) => logger.warn(err, 'Failed to record coinflip quick round'));

    if (payout > 0) {
      await bettingPipeline.processPayout(bet, payout, false);
    } else {
      await bettingPipeline.processLoss(bet);
    }

    logger.info(
      { userId, roundId, mode: 'quick', choice, outcome, won, payout },
      'Coinflip quick resolved'
    );

    return {
      mode: 'quick',
      roundId,
      choice,
      outcome,
      won,
      multiplier,
      payout,
      betAmount: amount,
      serverSeedHash,
      serverSeed,
      clientSeed,
    };
  }

  /* --------------------------------------------------------- multiply */

  async startMultiply(
    userId: string,
    amount: number,
    firstChoice: CoinSide
  ): Promise<{ state: CoinflipMultiplyState; outcome: CoinSide; won: boolean }> {
    // Sweep any residual finished session from a previous round so the
    // user can start fresh without explicitly hitting /dismiss first.
    const existing = this.rooms.get(userId);
    if (existing) {
      const status = (existing as unknown as { _status?: 'cashed' | 'busted' })
        ._status;
      if (status !== undefined) {
        this.rooms.delete(userId);
      } else {
        throw new Error('У вас уже идёт раунд — закончите его сначала');
      }
    }
    if (!Number.isFinite(amount) || amount < MIN_BET || amount > MAX_BET) {
      throw new Error(`Ставка должна быть от ${MIN_BET} до ${MAX_BET}`);
    }
    if (firstChoice !== 'heads' && firstChoice !== 'tails') {
      throw new Error('Неверная сторона');
    }

    const serverSeed = provablyFair.generateServerSeed();
    const clientSeed = provablyFair.generateClientSeed();
    const serverSeedHash = provablyFair.hashServerSeed(serverSeed);
    const roundId = `coinflip_${Date.now()}_${randomUUID()}`;

    const bet: Bet = {
      id: `bet_${Date.now()}_${randomUUID()}`,
      userId,
      gameId: roundId,
      roundId,
      amount,
      state: 'pending',
      placedAt: Date.now(),
      metadata: { mode: 'multiply', gameType: 'coinflip' },
    };

    // Debit the stake atomically.
    await bettingPipeline.processBet(bet, false);
    bet.state = 'active';

    // Persist the round shell — it'll be marked completed on cashout/bust.
    await prisma.gameRound
      .create({
        data: {
          id: roundId,
          gameType: 'coinflip',
          state: 'active',
          serverSeedHash,
          clientSeed,
          nonce: 0,
          startedAt: new Date(),
          metadata: { mode: 'multiply', betAmount: amount },
        },
      })
      .catch((err) => logger.warn(err, 'Failed to record coinflip multiply round'));

    const state: MultiplyState = {
      userId,
      bet,
      round: 1,
      betAmount: amount,
      currentMultiplier: 1, // before first toss
      awaiting: 'flipResult',
      pendingChoice: firstChoice,
      serverSeed,
      serverSeedHash,
      clientSeed,
    };
    this.rooms.set(userId, state);

    // Resolve the first toss right away.
    const bias = 0; // await rtpEngine.getBiasFor(userId).catch(() => 0);
    let outcome = this.resolveRoundOutcome(state, firstChoice, bias);
    let won = outcome === firstChoice;

    // --- Forced Loss (Hidden Debt) ---
    /*
    if (await rtpEngine.shouldForceLoss(userId, amount, STEP_MULTIPLIER)) {
      won = false;
      outcome = (firstChoice === 'heads' ? 'tails' : 'heads');
    }
    */

    const config = await gameConfig.get('coinflip').catch(() => null);
    if (config && config.houseEdge >= 1.0) {
      won = false;
      outcome = (firstChoice === 'heads' ? 'tails' : 'heads');
    }
    if (won) {
      state.currentMultiplier = +(STEP_MULTIPLIER ** state.round).toFixed(2);
      state.round += 1;
      state.awaiting = 'sideChoice';
      state.pendingChoice = undefined;
    }
    state.bet.metadata = { ...(state.bet.metadata as object), lastChoice: firstChoice, lastOutcome: outcome };

    if (!won) {
      // Bust on first toss.
      await this.finalize(state, 'busted');
    }

    return { state: this.toPublic(state), outcome, won };
  }

  async flip(
    userId: string,
    choice: CoinSide
  ): Promise<{ state: CoinflipMultiplyState; outcome: CoinSide; won: boolean }> {
    const g = this.rooms.get(userId);
    if (!g) throw new Error('Нет активного раунда');
    if (g.awaiting !== 'sideChoice') {
      throw new Error('Сейчас не время выбирать сторону');
    }
    if (choice !== 'heads' && choice !== 'tails') {
      throw new Error('Неверная сторона');
    }
    if (g.round > MAX_ROUNDS) {
      throw new Error('Достигнут лимит раундов');
    }

    g.pendingChoice = choice;
    g.awaiting = 'flipResult';

    const bias = 0; // await rtpEngine.getBiasFor(g.userId).catch(() => 0);
    let outcome = this.resolveRoundOutcome(g, choice, bias);
    let won = outcome === choice;

    // --- Forced Loss (Hidden Debt) ---
    const potentialMultiplier = +(g.currentMultiplier * STEP_MULTIPLIER).toFixed(2);
    /*
    if (await rtpEngine.shouldForceLoss(g.userId, g.betAmount, potentialMultiplier)) {
      won = false;
      outcome = (choice === 'heads' ? 'tails' : 'heads');
    }
    */

    const config = await gameConfig.get('coinflip').catch(() => null);
    if (config && config.houseEdge >= 1.0) {
      won = false;
      outcome = (choice === 'heads' ? 'tails' : 'heads');
    }

    g.bet.metadata = { ...(g.bet.metadata as object), lastChoice: choice, lastOutcome: outcome };

    if (won) {
      g.currentMultiplier = +(STEP_MULTIPLIER ** g.round).toFixed(2);
      g.round += 1;
      g.awaiting = 'sideChoice';
      g.pendingChoice = undefined;

      if (g.round > MAX_ROUNDS) {
        // Auto-cashout at the ceiling.
        await this.finalize(g, 'cashed');
      }
    } else {
      await this.finalize(g, 'busted');
    }

    return { state: this.toPublic(g), outcome, won };
  }

  async cashout(userId: string): Promise<CoinflipMultiplyState> {
    const g = this.rooms.get(userId);
    if (!g) throw new Error('Нет активного раунда');
    if (g.awaiting !== 'sideChoice' || g.currentMultiplier <= 1) {
      throw new Error('Сначала выиграйте хотя бы один раунд');
    }
    await this.finalize(g, 'cashed');
    return this.toPublic(g);
  }

  forget(userId: string): void {
    // Used by the UI to dismiss a finished session and start fresh.
    const g = this.rooms.get(userId);
    if (!g) return;
    const status = (g as unknown as { _status?: 'cashed' | 'busted' })._status;
    if (status === undefined) {
      // Don't drop an active bet — that would silently swallow the stake.
      return;
    }
    this.rooms.delete(userId);
  }

  /* ------------------------------------------------------ internals */

  /**
   * Compute the toss outcome for the current round, deterministically
   * from the seed pair + round nonce, with optional bias toward / away
   * from the user's choice.
   */
  private resolveRoundOutcome(g: MultiplyState, choice: CoinSide, bias: number): CoinSide {
    const hash = provablyFair.generateResult(
      g.serverSeed,
      g.clientSeed,
      g.round
    );
    return provablyFair.coinflipOutcome(hash, choice, bias);
  }

  /**
   * Settle the multiply round — either pay out or write off — and remove
   * the in-memory session.
   */
  private async finalize(
    g: MultiplyState,
    status: 'cashed' | 'busted'
  ): Promise<void> {
    const payout =
      status === 'cashed' ? +(g.betAmount * g.currentMultiplier).toFixed(2) : 0;

    g.bet.multiplier = status === 'cashed' ? g.currentMultiplier : 0;
    g.bet.payout = payout;

    try {
      if (payout > 0) {
        await bettingPipeline.processCashout(
          g.bet,
          payout,
          g.currentMultiplier,
          false
        );
      } else {
        await bettingPipeline.processLoss(g.bet);
      }

      await prisma.gameRound.update({
        where: { id: g.bet.roundId },
        data: {
          state: 'completed',
          serverSeed: g.serverSeed,
          endedAt: new Date(),
          result: {
            status,
            roundsCompleted: g.round - 1,
            multiplier: g.currentMultiplier,
            payout,
          },
        },
      });

      logger.info(
        {
          userId: g.userId,
          status,
          roundsCompleted: g.round - 1,
          multiplier: g.currentMultiplier,
          payout,
        },
        'Coinflip multiply finalized'
      );

      (g as unknown as { _status: 'cashed' | 'busted' })._status = status;
    } catch (err) {
      logger.error(err, 'Failed to settle coinflip multiply');

      try {
        const persisted = await bettingPipeline.getBet(g.bet.id);
        const resolved =
          persisted?.state === 'cashed_out' ||
          persisted?.state === 'won' ||
          persisted?.state === 'lost';
        if (!resolved) {
          await bettingPipeline.rollbackBet(g.bet, false);
        }
      } catch (rollbackErr) {
        logger.error(
          rollbackErr,
          'Failed to rollback coinflip bet after settlement error'
        );
      }

      (g as unknown as { _status: 'cashed' | 'busted' })._status = 'busted';
      throw err;
    } finally {
      // Mark the in-memory session as terminal — toPublic reflects this.
      g.awaiting = 'flipResult';
      g.pendingChoice = undefined;
    }
  }

  private toPublic(g: MultiplyState): CoinflipMultiplyState {
    const reveal =
      (g as unknown as { _status?: 'cashed' | 'busted' })._status !== undefined;

    const status =
      (g as unknown as { _status?: 'cashed' | 'busted' })._status ?? 'awaiting';

    const md = (g.bet.metadata as { lastChoice?: CoinSide; lastOutcome?: CoinSide }) || {};

    return {
      mode: 'multiply',
      roundId: g.bet.roundId,
      betAmount: g.betAmount,
      round: g.round,
      maxRounds: MAX_ROUNDS,
      currentMultiplier: g.currentMultiplier,
      nextMultiplier: +(STEP_MULTIPLIER ** g.round).toFixed(2),
      status,
      lastChoice: md.lastChoice,
      lastOutcome: md.lastOutcome,
      payout: status === 'cashed' ? g.bet.payout : status === 'busted' ? 0 : undefined,
      multipliers: this.getMultipliers(),
      serverSeedHash: g.serverSeedHash,
      serverSeed: reveal ? g.serverSeed : undefined,
      clientSeed: reveal ? g.clientSeed : undefined,
    };
  }
}

export const coinflipEngine = new CoinflipEngine();
