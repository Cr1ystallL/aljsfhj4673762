import { randomUUID } from 'crypto';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../utils/logger.js';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
import type { Bet } from '../../game-engine/types.js';
import type { SportKind } from './catalog.js';
import { fetchLiveBoard, type FeedEvent } from './provider.js';
import {
  cashoutPriceFactor,
  findOutcome,
  formatMmSs,
  interpolateClock,
  settleLeg,
  type BetLegSpec,
  type ClockDirection,
  type MarketKind,
  type MatchStats,
  type SettleResult,
  type SportMarket,
} from './markets.js';
import { sportEnabled, sportsLimits } from './limits.js';
import { notifySportsUser, sportsGoalText, sportsSettleText } from './notify.js';
import { redisClient } from '../../lib/redis.js';

export class SportsOddsChangedError extends Error {
  readonly code = 'ODDS_CHANGED';
  constructor(
    public readonly legs: Array<{
      eventId: string;
      marketKind: MarketKind;
      outcomeKey: string;
      line?: number;
      quoted: number;
      current: number;
    }>
  ) {
    super('ODDS_CHANGED');
  }
}

export type SportsOutcome = 'p1' | 'x' | 'p2';
export type EventStatus = 'prematch' | 'live' | 'finished';
export type OddsTrend = 'up' | 'down' | 'same';

export type FeaturedReason = 'live' | 'goals' | 'cards' | 'soon' | 'line';

export interface PublicTeam {
  name: string;
  shortName: string;
  initials: string;
  color: string;
  logo?: string;
  score?: number;
  yellowCards?: number;
  redCards?: number;
}

export interface PublicOdds {
  p1: number;
  x?: number;
  p2: number;
  p1Trend?: OddsTrend;
  xTrend?: OddsTrend;
  p2Trend?: OddsTrend;
}

export interface LastSportsEvent {
  kind: 'goal' | 'point';
  team: 1 | 2;
  score1: number;
  score2: number;
  at: number;
}

export interface PublicSportEvent {
  id: string;
  sport: SportKind;
  league: string;
  team1: PublicTeam;
  team2: PublicTeam;
  startTime: string;
  displayTime: string;
  status: EventStatus;
  isLive: boolean;
  liveMinute?: number;
  livePeriod?: string;
  liveTime?: string;
  clockSeconds?: number | null;
  clockSyncedAt?: number;
  clockDirection?: ClockDirection;
  odds: PublicOdds;
  markets: SportMarket[];
  marketsCount: number;
  isFeatured?: boolean;
  featuredReason?: FeaturedReason;
  lastEvent?: LastSportsEvent;
  lastEventNotification?: string;
  stats?: MatchStats;
  extra?: FeedEvent['extra'];
  streamUrl?: string;
  hasStream?: boolean;
  suspended?: boolean;
}

export interface SportsActivity {
  id: string;
  kind: 'goal' | 'settle' | 'cashout' | 'void';
  text: string;
  at: number;
  eventId?: string;
}

export interface SportsBetReceipt {
  betId: string;
  eventId: string;
  outcome: string;
  type: 'single' | 'express';
  stake: number;
  odds: number;
  potentialWin: number;
  legs: Array<{
    eventId: string;
    marketKind: MarketKind;
    outcomeKey: string;
    line?: number;
    odds: number;
  }>;
}

interface RuntimeEvent {
  feed: FeedEvent;
  prevOdds: { p1: number; x?: number; p2: number };
  lastEvent?: LastSportsEvent;
  featured?: boolean;
  featuredReason?: FeaturedReason;
  suspended?: boolean;
}

interface TrackedLeg {
  eventId: string;
  marketKind: MarketKind;
  outcomeKey: string;
  line?: number;
  odds: number;
  result: SettleResult | 'pending';
}

interface TrackedBet {
  bet: Bet;
  legs: TrackedLeg[];
  combinedOdds: number;
}

const SYNC_MS = 20_000;
const NOTIFY_TTL_MS = 12_000;
const MAX_LEGS = 8;
const CTL_KEY = 'sports:ctl';

function trendOf(next: number, prev: number | undefined): OddsTrend {
  if (prev === undefined) return 'same';
  if (next > prev + 0.01) return 'up';
  if (next < prev - 0.01) return 'down';
  return 'same';
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

class SportsEngine {
  private events = new Map<string, RuntimeEvent>();
  private bets = new Map<string, TrackedBet>();
  private byEvent = new Map<string, string[]>();
  private suspended = new Set<string>();
  private activity: SportsActivity[] = [];
  private timer: NodeJS.Timeout | null = null;
  private started = false;
  private syncing = false;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.loadControls();
    await this.rehydratePending();
    await this.sync();
    this.timer = setInterval(() => {
      void this.sync();
    }, SYNC_MS);
    logger.info({ events: this.events.size }, 'Sports live feed started');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.started = false;
  }

  listEvents(opts?: { includeSuspended?: boolean; enabledSports?: string[] | null }): PublicSportEvent[] {
    const now = Date.now();
    return [...this.events.values()]
      .filter((ev) => opts?.includeSuspended || !this.suspended.has(ev.feed.id))
      .filter((ev) => sportEnabled(ev.feed.sport, opts?.enabledSports ?? null))
      .map((ev) => this.toPublic(ev, now))
      .sort((a, b) => {
        const rank = (s: EventStatus) => (s === 'live' ? 0 : s === 'prematch' ? 1 : 2);
        const d = rank(a.status) - rank(b.status);
        if (d !== 0) return d;
        return Date.parse(a.startTime) - Date.parse(b.startTime);
      });
  }

  listActivity(): SportsActivity[] {
    return this.activity.slice(0, 30);
  }

  getEvent(id: string): PublicSportEvent | null {
    const ev = this.events.get(id);
    return ev ? this.toPublic(ev, Date.now()) : null;
  }

  async placeBet(
    userId: string,
    stake: number,
    rawLegs: BetLegSpec[],
    opts?: { quotedOdds?: number[]; acceptChange?: boolean }
  ): Promise<SportsBetReceipt> {
    const limits = await sportsLimits();
    if (!Array.isArray(rawLegs) || rawLegs.length === 0) {
      throw new Error('Добавьте исход в купон');
    }
    if (rawLegs.length > MAX_LEGS) {
      throw new Error(`Экспресс — максимум ${MAX_LEGS} событий`);
    }

    const seen = new Set<string>();
    const locked: TrackedLeg[] = [];
    const drifted: SportsOddsChangedError['legs'] = [];

    for (let i = 0; i < rawLegs.length; i++) {
      const spec = rawLegs[i];
      if (seen.has(spec.eventId)) {
        throw new Error('В экспрессе можно взять только один исход с одного события');
      }
      seen.add(spec.eventId);

      const ev = this.events.get(spec.eventId);
      if (!ev) throw new Error('Событие не найдено');
      if (this.suspended.has(spec.eventId)) throw new Error('Событие снято с линии');
      if (ev.feed.status === 'finished') throw new Error('Событие уже завершено');
      if (!sportEnabled(ev.feed.sport, limits.enabledSports)) {
        throw new Error('Этот вид спорта сейчас выключен');
      }

      const outcome = findOutcome(ev.feed.markets, spec.marketKind, spec.outcomeKey, spec.line);
      if (!outcome) throw new Error('Исход недоступен');

      if (this.userHasPendingOn(userId, spec.eventId)) {
        throw new Error('У вас уже есть ставка на это событие');
      }

      const quoted = opts?.quotedOdds?.[i];
      if (quoted != null && Number.isFinite(quoted) && quoted > 0 && !opts?.acceptChange) {
        const rel = Math.abs(outcome.odds - quoted) / quoted;
        if (rel > limits.oddsDrift) {
          drifted.push({
            eventId: spec.eventId,
            marketKind: spec.marketKind,
            outcomeKey: spec.outcomeKey,
            line: outcome.line ?? spec.line,
            quoted,
            current: outcome.odds,
          });
        }
      }

      locked.push({
        eventId: spec.eventId,
        marketKind: spec.marketKind,
        outcomeKey: spec.outcomeKey,
        line: outcome.line ?? spec.line,
        odds: outcome.odds,
        result: 'pending',
      });
    }

    if (drifted.length) throw new SportsOddsChangedError(drifted);

    const product = locked.reduce((acc, leg) => acc * leg.odds, 1);
    const combinedOdds = Math.min(limits.maxCombined, formatCombined(product));
    const potentialWin = Math.min(limits.maxPayout, roundMoney(stake * combinedOdds));
    const type = locked.length >= 2 ? 'express' : 'single';
    const first = locked[0];
    const firstEv = this.events.get(first.eventId)!;
    const eventName =
      type === 'express'
        ? `${firstEv.feed.team1.name} — ${firstEv.feed.team2.name} +${locked.length - 1}`
        : `${firstEv.feed.team1.name} — ${firstEv.feed.team2.name}`;

    const betId = `bet_${Date.now()}_${randomUUID()}`;
    const bet: Bet = {
      id: betId,
      userId,
      gameId: type === 'express' ? `sports_express_${betId}` : `sports_${first.eventId}`,
      roundId: first.eventId,
      amount: stake,
      state: 'pending',
      placedAt: Date.now(),
      metadata: {
        gameType: 'sports',
        type,
        eventId: first.eventId,
        instanceId: first.eventId,
        outcome: first.outcomeKey,
        odds: combinedOdds,
        eventName,
        league: firstEv.feed.league,
        scoreAtBet: [firstEv.feed.team1.score ?? 0, firstEv.feed.team2.score ?? 0],
        legs: locked.map((leg) => ({
          eventId: leg.eventId,
          marketKind: leg.marketKind,
          outcomeKey: leg.outcomeKey,
          line: leg.line,
          odds: leg.odds,
        })),
      },
    };

    await bettingPipeline.processBet(bet, false);
    this.indexBet({ bet, legs: locked, combinedOdds });

    return {
      betId,
      eventId: first.eventId,
      outcome: first.outcomeKey,
      type,
      stake,
      odds: combinedOdds,
      potentialWin,
      legs: locked.map((leg) => ({
        eventId: leg.eventId,
        marketKind: leg.marketKind,
        outcomeKey: leg.outcomeKey,
        line: leg.line,
        odds: leg.odds,
      })),
    };
  }

  async listUserBets(userId: string, take = 20) {
    const rows = await prisma.bet.findMany({
      where: { userId, gameType: 'sports' },
      orderBy: { placedAt: 'desc' },
      take,
    });
    const limits = await sportsLimits();
    return rows.map((row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const rawLegs = Array.isArray(meta.legs) ? meta.legs : [];
      const tracked = this.bets.get(row.id);
      const legs = (tracked?.legs ?? parseStoredLegs(meta)).map((leg) => ({
        eventId: leg.eventId,
        marketKind: leg.marketKind,
        outcomeKey: leg.outcomeKey,
        line: leg.line,
        odds: leg.odds,
        result: leg.result,
        eventName: this.events.get(leg.eventId)
          ? `${this.events.get(leg.eventId)!.feed.team1.name} — ${this.events.get(leg.eventId)!.feed.team2.name}`
          : undefined,
      }));
      const pending = row.state === 'pending' || row.state === 'active';
      const cashout = pending ? this.quoteCashout(row.id, Number(row.amount), limits) : null;
      return {
        id: row.id,
        eventId: String(meta.eventId ?? ''),
        eventName: String(meta.eventName ?? ''),
        league: String(meta.league ?? ''),
        outcome: String(meta.outcome ?? ''),
        type: String(meta.type ?? (legs.length >= 2 ? 'express' : 'single')),
        odds: Number(meta.odds ?? row.multiplier ?? 0),
        stake: Number(row.amount),
        state: row.state,
        payout: Number(row.payout ?? 0),
        placedAt: row.placedAt.toISOString(),
        legs: legs.length ? legs : rawLegs,
        cashout,
      };
    });
  }

  quoteCashout(betId: string, stake: number, limits: Awaited<ReturnType<typeof sportsLimits>>) {
    if (!limits.cashoutEnabled) return null;
    const tracked = this.bets.get(betId);
    if (!tracked) return null;
    if (tracked.legs.some((l) => l.result === 'lost')) return null;
    const priced = tracked.legs.map((leg) => {
      if (leg.result === 'void' || leg.result === 'won' || leg.result === 'lost') {
        return { result: leg.result, quoted: leg.odds };
      }
      const ev = this.events.get(leg.eventId);
      if (!ev || ev.feed.status === 'finished' || this.suspended.has(leg.eventId)) {
        return { result: 'pending' as const, quoted: leg.odds, liveOdds: undefined };
      }
      const live = findOutcome(ev.feed.markets, leg.marketKind, leg.outcomeKey, leg.line);
      return { result: 'pending' as const, quoted: leg.odds, liveOdds: live?.odds };
    });
    const factor = cashoutPriceFactor(priced);
    if (factor == null) return null;
    const potential = stake * tracked.combinedOdds;
    const amount = Math.min(
      limits.maxPayout,
      roundMoney(Math.min(potential, stake * factor) * limits.cashoutMargin)
    );
    if (amount < 0.01) return null;
    return { amount, multiplier: formatCombined(amount / Math.max(0.01, stake)) };
  }

  async cashout(userId: string, betId: string) {
    const limits = await sportsLimits();
    const tracked = this.bets.get(betId);
    if (!tracked || tracked.bet.userId !== userId) throw new Error('Ставка не найдена');
    const offer = this.quoteCashout(betId, tracked.bet.amount, limits);
    if (!offer) throw new Error('Выкуп недоступен');
    await bettingPipeline.processCashout(tracked.bet, offer.amount, offer.multiplier, false);
    this.unindexBet(betId);
    const name = String((tracked.bet.metadata as Record<string, unknown> | undefined)?.eventName ?? 'Купон');
    this.pushActivity('cashout', `Выкуп ${offer.amount.toFixed(2)} zł`, tracked.legs[0]?.eventId);
    void notifySportsUser(userId, sportsSettleText(name, tracked.legs.length >= 2 ? 'express' : 'single', 'cashed_out', offer.amount));
    return { ok: true, betId, amount: offer.amount, multiplier: offer.multiplier };
  }

  async adminSetSuspended(eventId: string, suspended: boolean) {
    if (suspended) this.suspended.add(eventId);
    else this.suspended.delete(eventId);
    const ev = this.events.get(eventId);
    if (ev) ev.suspended = suspended;
    await this.saveControls();
    return { eventId, suspended };
  }

  async adminVoidEvent(eventId: string) {
    const betIds = [...new Set(this.byEvent.get(eventId) ?? [])];
    for (const betId of betIds) {
      const tracked = this.bets.get(betId);
      if (!tracked) continue;
      try {
        await bettingPipeline.rollbackBet(tracked.bet, false);
        this.unindexBet(betId);
        void notifySportsUser(
          tracked.bet.userId,
          sportsSettleText(String((tracked.bet.metadata as Record<string, unknown>)?.eventName ?? ''), tracked.legs.length >= 2 ? 'express' : 'single', 'void', tracked.bet.amount)
        );
      } catch (err) {
        logger.error({ err, betId }, 'Sports void failed');
      }
    }
    this.pushActivity('void', `Событие снято, ставки возвращены`, eventId);
    return { eventId, voided: betIds.length };
  }

  async adminSettleEvent(eventId: string, score1: number, score2: number) {
    const ev = this.events.get(eventId);
    if (!ev) throw new Error('Событие не найдено');
    ev.feed.team1.score = score1;
    ev.feed.team2.score = score2;
    ev.feed.status = 'finished';
    await this.settleEvent(ev.feed);
    return { eventId, score1, score2 };
  }

  async listAdminBets(take = 40) {
    const rows = await prisma.bet.findMany({
      where: { gameType: 'sports' },
      orderBy: { placedAt: 'desc' },
      take,
      include: { user: { select: { firstName: true, username: true, telegramId: true } } },
    });
    return rows.map((row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      return {
        id: row.id,
        userId: row.userId,
        userName: row.user.firstName || row.user.username || String(row.user.telegramId ?? ''),
        eventName: String(meta.eventName ?? ''),
        type: String(meta.type ?? 'single'),
        stake: Number(row.amount),
        odds: Number(meta.odds ?? row.multiplier ?? 0),
        state: row.state,
        payout: Number(row.payout ?? 0),
        placedAt: row.placedAt.toISOString(),
      };
    });
  }

  private userHasPendingOn(userId: string, eventId: string): boolean {
    for (const betId of this.byEvent.get(eventId) ?? []) {
      if (this.bets.get(betId)?.bet.userId === userId) return true;
    }
    return false;
  }

  private indexBet(tracked: TrackedBet): void {
    this.bets.set(tracked.bet.id, tracked);
    for (const leg of tracked.legs) {
      const list = this.byEvent.get(leg.eventId) ?? [];
      if (!list.includes(tracked.bet.id)) list.push(tracked.bet.id);
      this.byEvent.set(leg.eventId, list);
    }
  }

  private unindexBet(betId: string): void {
    const tracked = this.bets.get(betId);
    if (!tracked) return;
    this.bets.delete(betId);
    for (const leg of tracked.legs) {
      const next = (this.byEvent.get(leg.eventId) ?? []).filter((id) => id !== betId);
      if (next.length) this.byEvent.set(leg.eventId, next);
      else this.byEvent.delete(leg.eventId);
    }
  }

  private toPublic(ev: RuntimeEvent, now: number): PublicSportEvent {
    const f = ev.feed;
    const lastEvent = ev.lastEvent && now - ev.lastEvent.at < NOTIFY_TTL_MS ? ev.lastEvent : undefined;
    const clock = interpolateClock(
      f.status,
      f.clockSeconds,
      f.clockSyncedAt,
      f.clockDirection,
      now
    );
    const liveTime =
      f.status === 'live'
        ? clock != null
          ? formatMmSs(clock)
          : f.liveTime || 'LIVE'
        : f.status === 'finished'
          ? 'FT'
          : undefined;
    return {
      id: f.id,
      sport: f.sport,
      league: f.league,
      team1: {
        ...f.team1,
        yellowCards: f.stats?.yellow1,
        redCards: f.stats?.red1,
      },
      team2: {
        ...f.team2,
        yellowCards: f.stats?.yellow2,
        redCards: f.stats?.red2,
      },
      startTime: new Date(f.startTime).toISOString(),
      displayTime:
        f.status === 'live'
          ? liveTime || 'LIVE'
          : f.status === 'finished'
            ? 'FT'
            : new Date(f.startTime).toISOString(),
      status: f.status,
      isLive: f.status === 'live',
      liveMinute: clock != null ? Math.floor(clock / 60) : f.liveMinute,
      livePeriod: f.livePeriod,
      liveTime,
      clockSeconds: f.clockSeconds,
      clockSyncedAt: f.clockSyncedAt,
      clockDirection: f.clockDirection,
      odds: {
        p1: f.odds.p1,
        x: f.odds.x,
        p2: f.odds.p2,
        p1Trend: trendOf(f.odds.p1, ev.prevOdds.p1),
        xTrend: f.odds.x !== undefined ? trendOf(f.odds.x, ev.prevOdds.x) : undefined,
        p2Trend: trendOf(f.odds.p2, ev.prevOdds.p2),
      },
      markets: f.markets,
      marketsCount: f.marketsCount,
      isFeatured: ev.featured,
      featuredReason: ev.featuredReason,
      lastEvent,
      lastEventNotification: f.lastPlay,
      stats: f.stats,
      extra: f.extra,
      streamUrl: f.streamUrl,
      hasStream: Boolean(f.streamUrl),
      suspended: this.suspended.has(f.id),
    };
  }

  private pickFeatured(): void {
    for (const ev of this.events.values()) {
      ev.featured = false;
      ev.featuredReason = undefined;
    }
    let best: RuntimeEvent | undefined;
    let bestHeat = -1;
    for (const ev of this.events.values()) {
      const { heat, reason } = featuredScore(ev.feed);
      ev.featuredReason = reason;
      if (heat > bestHeat) {
        bestHeat = heat;
        best = ev;
      }
    }
    if (best) best.featured = true;
    for (const ev of this.events.values()) {
      if (ev !== best) ev.featuredReason = undefined;
    }
  }

  private async sync(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const board = await fetchLiveBoard();
      if (board.length === 0 && this.events.size > 0) {
        logger.warn('Sports feed empty — keeping last snapshot');
        return;
      }
      const seen = new Set<string>();
      for (const feed of board) {
        seen.add(feed.id);
        const prev = this.events.get(feed.id);
        const lastEvent = this.detectScoreEvent(prev?.feed, feed);
        this.events.set(feed.id, {
          feed,
          prevOdds: prev?.feed.odds ?? feed.odds,
          lastEvent: lastEvent ?? prev?.lastEvent,
          featured: prev?.featured,
          suspended: this.suspended.has(feed.id),
        });
        if (lastEvent && (lastEvent.kind === 'goal' || lastEvent.kind === 'point')) {
          this.pushActivity(
            'goal',
            `${feed.team1.name} — ${feed.team2.name} ${lastEvent.score1}:${lastEvent.score2}`,
            feed.id
          );
          await this.settleLiveSpecials(feed, lastEvent);
          await this.notifyBettorsGoal(feed, lastEvent);
        }
        if (prev && prev.feed.status !== 'finished' && feed.status === 'finished') {
          await this.settleEvent(feed);
        }
      }

      for (const [id, ev] of this.events) {
        if (seen.has(id)) continue;
        if (ev.feed.status === 'finished' || !this.byEvent.has(id)) {
          this.events.delete(id);
        }
      }

      this.pickFeatured();
    } catch (err) {
      logger.warn({ err }, 'Sports live sync failed');
    } finally {
      this.syncing = false;
    }
  }

  private detectScoreEvent(prev: FeedEvent | undefined, next: FeedEvent): LastSportsEvent | undefined {
    if (!prev || next.status === 'prematch') return undefined;
    const p1 = prev.team1.score ?? 0;
    const p2 = prev.team2.score ?? 0;
    const n1 = next.team1.score ?? 0;
    const n2 = next.team2.score ?? 0;
    if (n1 === p1 && n2 === p2) return undefined;
    return {
      kind: next.sport === 'football' || next.sport === 'hockey' ? 'goal' : 'point',
      team: n1 > p1 ? 1 : 2,
      score1: n1,
      score2: n2,
      at: Date.now(),
    };
  }

  private async settleEvent(feed: FeedEvent): Promise<void> {
    const s1 = feed.team1.score ?? 0;
    const s2 = feed.team2.score ?? 0;
    const betIds = [...new Set(this.byEvent.get(feed.id) ?? [])];

    for (const betId of betIds) {
      const tracked = this.bets.get(betId);
      if (!tracked) continue;
      const leg = tracked.legs.find((l) => l.eventId === feed.id && l.result === 'pending');
      if (!leg) continue;

      const result = settleLeg(leg.marketKind, leg.outcomeKey, leg.line, s1, s2, feed.threeWay, {
        stats: feed.stats,
        finished: true,
      });
      if (result === 'void' && (leg.marketKind === 'next_goal' || leg.marketKind === 'sooner') && leg.result !== 'pending') {
        continue;
      }
      if (leg.result !== 'pending') continue;
      leg.result = result;

      try {
        await this.finishTracked(tracked, betId, result);
      } catch (err) {
        logger.error({ err, betId }, 'Sports settle failed');
      }
    }
  }

  private async settleLiveSpecials(feed: FeedEvent, last: LastSportsEvent): Promise<void> {
    const betIds = [...new Set(this.byEvent.get(feed.id) ?? [])];
    const sooner = last.kind === 'goal' ? 'goal' : null;
    for (const betId of betIds) {
      const tracked = this.bets.get(betId);
      if (!tracked) continue;
      const leg = tracked.legs.find((l) => l.eventId === feed.id && l.result === 'pending');
      if (!leg) continue;
      if (leg.marketKind !== 'next_goal' && leg.marketKind !== 'sooner') continue;
      const result = settleLeg(leg.marketKind, leg.outcomeKey, leg.line, last.score1, last.score2, feed.threeWay, {
        nextTeam: last.team,
        sooner,
        finished: false,
        stats: feed.stats,
      });
      if (result === 'void') continue;
      leg.result = result;
      try {
        await this.finishTracked(tracked, betId, result);
      } catch (err) {
        logger.error({ err, betId }, 'Sports live special settle failed');
      }
    }
  }

  private async finishTracked(tracked: TrackedBet, betId: string, lastResult: SettleResult): Promise<void> {
    const limits = await sportsLimits();
    const name = String((tracked.bet.metadata as Record<string, unknown> | undefined)?.eventName ?? '');
    const type = tracked.legs.length >= 2 ? 'express' : 'single';
    if (lastResult === 'lost') {
      tracked.bet.multiplier = 0;
      tracked.bet.payout = 0;
      await bettingPipeline.processLoss(tracked.bet, false);
      this.unindexBet(betId);
      this.pushActivity('settle', `Проигрыш · ${name}`, tracked.legs[0]?.eventId);
      void notifySportsUser(tracked.bet.userId, sportsSettleText(name, type, 'lost', 0));
      return;
    }
    if (tracked.legs.every((l) => l.result === 'won' || l.result === 'void')) {
      const multiplier = formatCombined(
        tracked.legs.reduce((acc, l) => acc * (l.result === 'void' ? 1 : l.odds), 1)
      );
      const payout = Math.min(limits.maxPayout, roundMoney(tracked.bet.amount * multiplier));
      tracked.bet.multiplier = multiplier;
      tracked.bet.payout = payout;
      await bettingPipeline.processPayout(tracked.bet, payout, false);
      this.unindexBet(betId);
      this.pushActivity('settle', `Выигрыш ${payout.toFixed(2)} zł · ${name}`, tracked.legs[0]?.eventId);
      void notifySportsUser(tracked.bet.userId, sportsSettleText(name, type, 'won', payout));
    }
  }

  private async notifyBettorsGoal(feed: FeedEvent, last: LastSportsEvent): Promise<void> {
    const seen = new Set<string>();
    for (const betId of this.byEvent.get(feed.id) ?? []) {
      const tracked = this.bets.get(betId);
      if (!tracked || seen.has(tracked.bet.userId)) continue;
      seen.add(tracked.bet.userId);
      void notifySportsUser(
        tracked.bet.userId,
        sportsGoalText(`${feed.team1.name} — ${feed.team2.name}`, last.score1, last.score2, last.team)
      );
    }
  }

  private pushActivity(kind: SportsActivity['kind'], text: string, eventId?: string): void {
    this.activity.unshift({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      kind,
      text,
      at: Date.now(),
      eventId,
    });
    this.activity = this.activity.slice(0, 40);
  }

  private async loadControls(): Promise<void> {
    try {
      const raw = await redisClient.getClient().hgetall(CTL_KEY);
      this.suspended.clear();
      for (const [id, val] of Object.entries(raw ?? {})) {
        if (val === '1') this.suspended.add(id);
      }
    } catch (err) {
      logger.warn({ err }, 'Sports controls load failed');
    }
  }

  private async saveControls(): Promise<void> {
    try {
      const client = redisClient.getClient();
      await client.del(CTL_KEY);
      if (this.suspended.size === 0) return;
      const pairs: string[] = [];
      for (const id of this.suspended) {
        pairs.push(id, '1');
      }
      await client.hset(CTL_KEY, ...pairs);
    } catch (err) {
      logger.warn({ err }, 'Sports controls save failed');
    }
  }

  private async rehydratePending(): Promise<void> {
    this.bets.clear();
    this.byEvent.clear();
    let rows: Array<{
      id: string;
      userId: string;
      amount: unknown;
      placedAt: Date;
      metadata: unknown;
    }> = [];
    try {
      rows = await prisma.bet.findMany({
        where: { gameType: 'sports', state: { in: ['pending', 'active'] } },
      });
    } catch (err) {
      logger.warn({ err }, 'Sports pending rehydrate failed');
      return;
    }

    const now = Date.now();
    for (const row of rows) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const bet: Bet = {
        id: row.id,
        userId: row.userId,
        gameId: `sports_${String(meta.eventId ?? '')}`,
        roundId: String(meta.eventId ?? ''),
        amount: Number(row.amount),
        state: 'pending',
        placedAt: row.placedAt.getTime(),
        metadata: meta,
      };
      if (now - row.placedAt.getTime() > 36 * 60 * 60 * 1000) {
        try {
          await bettingPipeline.rollbackBet(bet, false);
        } catch (err) {
          logger.warn({ err, betId: bet.id }, 'Sports stale bet refund failed');
        }
        continue;
      }

      const legs = parseStoredLegs(meta);
      if (legs.length === 0) continue;
      this.indexBet({
        bet,
        legs,
        combinedOdds: Number(meta.odds ?? 0),
      });
    }
  }
}

function featuredScore(feed: FeedEvent): { heat: number; reason: FeaturedReason } {
  if (feed.status === 'finished') return { heat: -1, reason: 'line' };
  const goals = (feed.team1.score ?? 0) + (feed.team2.score ?? 0);
  const yellow = (feed.stats?.yellow1 ?? 0) + (feed.stats?.yellow2 ?? 0);
  const red = (feed.stats?.red1 ?? 0) + (feed.stats?.red2 ?? 0);
  let heat = feed.sport === 'football' ? 12 : 0;
  let reason: FeaturedReason = 'line';

  if (feed.status === 'live') {
    heat += 40 + goals * 10 + yellow * 2 + red * 8;
    if ((feed.liveMinute ?? 0) >= 75) heat += 8;
    reason = 'live';
    if (goals >= 3) reason = 'goals';
    else if (red > 0 || yellow >= 5) reason = 'cards';
    return { heat, reason };
  }

  const mins = (feed.startTime - Date.now()) / 60_000;
  if (mins >= 0 && mins <= 90) {
    heat += 28 - mins / 4;
    reason = 'soon';
  } else if (mins > 90 && mins < 24 * 60) {
    heat += 8;
  }
  return { heat, reason };
}

function formatCombined(n: number): number {
  if (!Number.isFinite(n) || n < 1.01) return 1.01;
  if (n > 100) return Math.round(n);
  if (n > 20) return Math.round(n * 2) / 2;
  return Math.round(n * 100) / 100;
}

function parseStoredLegs(meta: Record<string, unknown>): TrackedLeg[] {
  if (Array.isArray(meta.legs) && meta.legs.length > 0) {
    return meta.legs.flatMap((raw) => {
      if (!raw || typeof raw !== 'object') return [];
      const row = raw as Record<string, unknown>;
      const eventId = String(row.eventId ?? '');
      const marketKind = String(row.marketKind ?? '1x2') as MarketKind;
      const outcomeKey = String(row.outcomeKey ?? '');
      if (!eventId || !outcomeKey) return [];
      return [
        {
          eventId,
          marketKind,
          outcomeKey,
          line: typeof row.line === 'number' ? row.line : undefined,
          odds: Number(row.odds ?? 0),
          result: 'pending' as const,
        },
      ];
    });
  }

  const eventId = String(meta.eventId ?? '');
  const outcome = String(meta.outcome ?? '');
  if (!eventId || (outcome !== 'p1' && outcome !== 'x' && outcome !== 'p2')) return [];
  return [
    {
      eventId,
      marketKind: '1x2',
      outcomeKey: outcome,
      odds: Number(meta.odds ?? 0),
      result: 'pending',
    },
  ];
}

export const sportsEngine = new SportsEngine();
