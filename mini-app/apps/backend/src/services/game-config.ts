import { redisClient } from '../lib/redis.js';
import { logger } from '../utils/logger.js';

/**
 * Per-game runtime configuration.
 *
 * The casino's risk parameters (min/max bet, house edge, pause flag)
 * live in Redis under `game_config:<gameType>` and are read by the
 * engines on every bet through `gameConfig.get(...)`. Admins update
 * them through the `/api/_x/games/:type` endpoints; the change takes
 * effect immediately for new bets without a server restart.
 *
 * Already-running rounds keep the parameters they were started with —
 * the engine reads the config on `processBet` (entry), not in flight,
 * so a mid-round edge change cannot retroactively bias an in-progress
 * round.
 */

export type GameType =
  | 'crash'
  | 'mines'
  | 'plinko'
  | 'keno'
  | 'coinflip'
  | 'wheel'
  | 'bridges'
  | 'blackjack'
  | 'hilo'
  | 'cases'
  | 'chicken-road'
  | 'macvpot';

export interface GameConfig {
  /** True freezes the game — engines refuse new bets but resolve
   *  outstanding ones cleanly. */
  paused: boolean;
  /** True hides the game from non-admins (UI and API guards). */
  hidden: boolean;
  minBet: number;
  maxBet: number;
  /**
   * House edge as a fraction. 0.01 = 1%. Engines apply this as
   * `payout × (1 - edge)` or as part of the multiplier table compute,
   * depending on the game.
   */
  houseEdge: number;
  /**
   * Contribution to wager progress (0.0 to 1.0).
   * E.g. 0.3 means a 100 PLN bet counts as 30 PLN towards wager.
   */
  wagerContribution: number;
  /** Game-specific extras — kept loose so we don't need a migration to
   *  add a new field for one game. */
  extras?: Record<string, unknown>;
}

/** Defaults. Used when Redis has no value yet for a game. */
const DEFAULTS: Record<GameType, GameConfig> = {
  crash: {
    paused: false,
    hidden: false,
    minBet: 1,
    maxBet: 10000,
    houseEdge: 0.01,
    wagerContribution: 1.0,
    extras: {
      waitingPhaseSeconds: 15,
      countdownSeconds: 0,
    },
  },
  mines: {
    paused: false,
    hidden: false,
    minBet: 1,
    maxBet: 10000,
    houseEdge: 0.01,
    wagerContribution: 0.3, // Mines default to 30% contribution
    extras: {
      minMines: 1,
      maxMines: 24,
      maxPayout: 1_000_000,
    },
  },
  plinko: {
    paused: false,
    hidden: false,
    minBet: 1,
    maxBet: 10000,
    houseEdge: 0.01,
    wagerContribution: 0.5, // Plinko default to 50%
    extras: {
      maxPayout: 1_000_000,
    },
  },
  'chicken-road': {
    paused: false,
    hidden: false,
    minBet: 1,
    maxBet: 10000,
    houseEdge: 0.04, // Used only if dynamic math is needed, but we hardcoded 96% RTP (4% edge)
    wagerContribution: 1.0,
    extras: {
      maxPayout: 1_000_000,
    },
  },
  coinflip: {
    paused: false,
    hidden: false,
    minBet: 1,
    maxBet: 10000,
    houseEdge: 0.03,
    wagerContribution: 1.0,
    extras: {
      stepMultiplier: 1.94,
      maxRounds: 20,
    },
  },
  wheel: {
    paused: false,
    hidden: false,
    minBet: 1,
    maxBet: 10000,
    houseEdge: 0.0, // baked into the slot distribution
    wagerContribution: 1.0,
    extras: {
      waitingPhaseSeconds: 9,
    },
  },
  bridges: {
    paused: false,
    hidden: false,
    minBet: 1,
    maxBet: 10000,
    houseEdge: 0.01,
    wagerContribution: 1.0,
    extras: {
      // 5 rows × 4 cells, broken cells per row by difficulty.
      rows: 5,
      cells: 4,
    },
  },
  blackjack: {
    paused: true,
    hidden: false,
    minBet: 1,
    maxBet: 10000,
    houseEdge: 0.01,
    wagerContribution: 1.0,
    extras: {},
  },
  hilo: {
    paused: false,
    hidden: false,
    minBet: 1,
    maxBet: 50000,
    houseEdge: 0.04,
    wagerContribution: 1.0,
    extras: {},
  },
  cases: {
    paused: false,
    hidden: false,
    minBet: 1,
    maxBet: 100000,
    houseEdge: 0.04, // baked into the probabilities (96% RTP)
    wagerContribution: 1.0,
    extras: {
      casesWeights: {}
    },
  },
  keno: {
    paused: false,
    hidden: false,
    minBet: 1,
    maxBet: 10000,
    houseEdge: 0.01,
    wagerContribution: 1.0,
    extras: {},
  },
  macvpot: {
    paused: false,
    hidden: true, // Visible ONLY to admins by default
    minBet: 10,
    maxBet: 100000,
    houseEdge: 0.04, // 96% RTP
    wagerContribution: 1.0,
    extras: {
      bettingDuration: 25,
      rollDelay: 3,
      rollDuration: 12,
      rtp: 96,
    },
  },
};

const TTL_MS = 5_000; // engine-side cache TTL.
const cache = new Map<GameType, { config: GameConfig; expiresAt: number }>();

class GameConfigService {
  /**
   * Read the live config for a game. Falls back to defaults if Redis is
   * missing the key or unreachable. The result is cached for 5s in
   * memory to avoid hammering Redis on every bet.
   */
  async get(gameType: GameType): Promise<GameConfig> {
    const now = Date.now();
    const cached = cache.get(gameType);
    if (cached && cached.expiresAt > now) return cached.config;

    let value: GameConfig = DEFAULTS[gameType];
    try {
      const raw = await redisClient
        .getClient()
        .get(`game_config:${gameType}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<GameConfig>;
        value = {
          ...DEFAULTS[gameType],
          ...parsed,
          extras: { ...DEFAULTS[gameType].extras, ...(parsed.extras ?? {}) },
        };
      }
    } catch (err) {
      // Best-effort — if Redis is down, fall back to defaults to keep
      // the games online instead of refusing every bet.
      logger.warn({ err, gameType }, 'Failed to read game config; using defaults');
    }

    cache.set(gameType, { config: value, expiresAt: now + TTL_MS });
    return value;
  }

  /** Same as `get` but synchronous — uses the cached value or defaults. */
  getCachedOrDefault(gameType: GameType): GameConfig {
    const cached = cache.get(gameType);
    if (cached) return cached.config;
    return DEFAULTS[gameType];
  }

  /**
   * Persist a partial config update to Redis. The update is shallow-
   * merged with the existing values; `extras` is merged one level deep
   * so per-game knobs aren't blown away by a partial save.
   */
  async update(
    gameType: GameType,
    patch: Partial<GameConfig>
  ): Promise<GameConfig> {
    const current = await this.get(gameType);
    const next: GameConfig = {
      ...current,
      ...patch,
      extras: { ...(current.extras ?? {}), ...(patch.extras ?? {}) },
    };

    // Sanity caps so a fat-finger admin can't brick the casino.
    if (next.minBet < 0) next.minBet = 0;
    if (next.maxBet < next.minBet) next.maxBet = next.minBet;
    if (next.houseEdge < 0) next.houseEdge = 0;
    if (next.houseEdge > 1.0) next.houseEdge = 1.0;
    if (next.wagerContribution < 0) next.wagerContribution = 0;
    if (next.wagerContribution > 1) next.wagerContribution = 1;

    try {
      await redisClient
        .getClient()
        .set(`game_config:${gameType}`, JSON.stringify(next));
    } catch (err) {
      logger.error({ err, gameType }, 'Failed to persist game config');
      throw new Error('Failed to persist game config');
    }

    // Invalidate the local cache so the next `get` re-reads from Redis.
    cache.delete(gameType);
    return next;
  }

  defaults(): Record<GameType, GameConfig> {
    return DEFAULTS;
  }
}

export const gameConfig = new GameConfigService();
