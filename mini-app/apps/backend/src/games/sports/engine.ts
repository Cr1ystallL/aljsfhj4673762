import { randomUUID } from 'crypto';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../utils/logger.js';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
import type { Bet } from '../../game-engine/types.js';
import type { SportKind } from './catalog.js';
import { fetchLiveBoard, type FeedEvent } from './provider.js';

export type SportsOutcome = 'p1' | 'x' | 'p2';
export type EventStatus = 'prematch' | 'live' | 'finished';
export type OddsTrend = 'up' | 'down' | 'same';

export interface PublicTeam {
  name: string;
  shortName: string;
  initials: string;
  color: string;
  logo?: string;
  score?: number;
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
  odds: PublicOdds;
  marketsCount: number;
  isFeatured?: boolean;
  lastEvent?: LastSportsEvent;
  lastEventNotification?: string;
}

export interface SportsBetReceipt {
  betId: string;
  eventId: string;
  outcome: SportsOutcome;
  stake: number;
  odds: number;
  potentialWin: number;
}

interface RuntimeEvent {
  feed: FeedEvent;
  prevOdds: { p1: number; x?: number; p2: number };
  lastEvent?: LastSportsEvent;
  featured?: boolean;
}

interface TrackedBet {
  bet: Bet;
  eventId: string;
  instanceId: string;
  outcome: SportsOutcome;
  odds: number;
}

const SYNC_MS = 20_000;
const NOTIFY_TTL_MS = 12_000;

function trendOf(next: number, prev: number | undefined): OddsTrend {
  if (prev === undefined) return 'same';
  if (next > prev + 0.01) return 'up';
  if (next < prev - 0.01) return 'down';
  return 'same';
}

class SportsEngine {
  private events = new Map<string, RuntimeEvent>();
  private pending = new Map<string, TrackedBet[]>();
  private timer: NodeJS.Timeout | null = null;
  private started = false;
  private syncing = false;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
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

  listEvents(): PublicSportEvent[] {
    const now = Date.now();
    return [...this.events.values()]
      .map((ev) => this.toPublic(ev, now))
      .sort((a, b) => {
        const rank = (s: EventStatus) => (s === 'live' ? 0 : s === 'prematch' ? 1 : 2);
        const d = rank(a.status) - rank(b.status);
        if (d !== 0) return d;
        return Date.parse(a.startTime) - Date.parse(b.startTime);
      });
  }

  getEvent(id: string): PublicSportEvent | null {
    const ev = this.events.get(id);
    return ev ? this.toPublic(ev, Date.now()) : null;
  }

  async placeBet(
    userId: string,
    eventId: string,
    outcome: SportsOutcome,
    stake: number
  ): Promise<SportsBetReceipt> {
    const ev = this.events.get(eventId);
    if (!ev) throw new Error('Событие не найдено');
    if (ev.feed.status === 'finished') throw new Error('Событие уже завершено');
    if (outcome === 'x' && !ev.feed.threeWay) {
      throw new Error('Ничья недоступна для этого события');
    }

    const odds =
      outcome === 'p1' ? ev.feed.odds.p1 : outcome === 'p2' ? ev.feed.odds.p2 : ev.feed.odds.x;
    if (!odds || !Number.isFinite(odds)) throw new Error('Коэффициент недоступен');

    const existing = (this.pending.get(eventId) ?? []).find((b) => b.bet.userId === userId);
    if (existing) throw new Error('У вас уже есть ставка на это событие');

    const betId = `bet_${Date.now()}_${randomUUID()}`;
    const bet: Bet = {
      id: betId,
      userId,
      gameId: `sports_${eventId}`,
      roundId: eventId,
      amount: stake,
      state: 'pending',
      placedAt: Date.now(),
      metadata: {
        gameType: 'sports',
        eventId,
        instanceId: eventId,
        outcome,
        odds,
        eventName: `${ev.feed.team1.name} — ${ev.feed.team2.name}`,
        league: ev.feed.league,
        scoreAtBet: [ev.feed.team1.score ?? 0, ev.feed.team2.score ?? 0],
      },
    };

    await bettingPipeline.processBet(bet, false);

    const tracked: TrackedBet = { bet, eventId, instanceId: eventId, outcome, odds };
    const list = this.pending.get(eventId) ?? [];
    list.push(tracked);
    this.pending.set(eventId, list);

    return {
      betId,
      eventId,
      outcome,
      stake,
      odds,
      potentialWin: Math.round(stake * odds * 100) / 100,
    };
  }

  async listUserBets(userId: string, take = 20) {
    const rows = await prisma.bet.findMany({
      where: { userId, gameType: 'sports' },
      orderBy: { placedAt: 'desc' },
      take,
    });
    return rows.map((row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      return {
        id: row.id,
        eventId: String(meta.eventId ?? ''),
        eventName: String(meta.eventName ?? ''),
        league: String(meta.league ?? ''),
        outcome: String(meta.outcome ?? ''),
        odds: Number(meta.odds ?? row.multiplier ?? 0),
        stake: Number(row.amount),
        state: row.state,
        payout: Number(row.payout ?? 0),
        placedAt: row.placedAt.toISOString(),
      };
    });
  }

  private toPublic(ev: RuntimeEvent, now: number): PublicSportEvent {
    const f = ev.feed;
    const lastEvent = ev.lastEvent && now - ev.lastEvent.at < NOTIFY_TTL_MS ? ev.lastEvent : undefined;
    return {
      id: f.id,
      sport: f.sport,
      league: f.league,
      team1: { ...f.team1 },
      team2: { ...f.team2 },
      startTime: new Date(f.startTime).toISOString(),
      displayTime:
        f.status === 'live' ? f.liveTime || 'LIVE' : f.status === 'finished' ? 'FT' : new Date(f.startTime).toISOString(),
      status: f.status,
      isLive: f.status === 'live',
      liveMinute: f.liveMinute,
      livePeriod: f.livePeriod,
      liveTime: f.status === 'live' ? f.liveTime : f.status === 'finished' ? 'FT' : undefined,
      odds: {
        p1: f.odds.p1,
        x: f.odds.x,
        p2: f.odds.p2,
        p1Trend: trendOf(f.odds.p1, ev.prevOdds.p1),
        xTrend: f.odds.x !== undefined ? trendOf(f.odds.x, ev.prevOdds.x) : undefined,
        p2Trend: trendOf(f.odds.p2, ev.prevOdds.p2),
      },
      marketsCount: f.threeWay ? 3 : 2,
      isFeatured: ev.featured,
      lastEvent,
      lastEventNotification: f.lastPlay,
    };
  }

  private pickFeatured(): void {
    for (const ev of this.events.values()) ev.featured = false;
    const list = [...this.events.values()];
    const featured =
      list.find((e) => e.feed.status === 'live' && e.feed.sport === 'football') ||
      list.find((e) => e.feed.status === 'live') ||
      list.find((e) => e.feed.status === 'prematch');
    if (featured) featured.featured = true;
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
        });
        if (prev && prev.feed.status !== 'finished' && feed.status === 'finished') {
          await this.settleEvent(feed);
        }
      }

      for (const [id, ev] of this.events) {
        if (seen.has(id)) continue;
        if (ev.feed.status === 'finished' || !this.pending.has(id)) {
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

  private winningOutcome(feed: FeedEvent): SportsOutcome | null {
    const s1 = feed.team1.score ?? 0;
    const s2 = feed.team2.score ?? 0;
    if (s1 > s2) return 'p1';
    if (s2 > s1) return 'p2';
    return feed.threeWay ? 'x' : null;
  }

  private async settleEvent(feed: FeedEvent): Promise<void> {
    const winner = this.winningOutcome(feed);
    const list = this.pending.get(feed.id) ?? [];
    this.pending.delete(feed.id);

    for (const tracked of list) {
      const won = winner !== null && tracked.outcome === winner;
      try {
        if (won) {
          tracked.bet.multiplier = tracked.odds;
          tracked.bet.payout = Math.round(tracked.bet.amount * tracked.odds * 100) / 100;
          await bettingPipeline.processPayout(tracked.bet, tracked.bet.payout, false);
        } else {
          tracked.bet.multiplier = 0;
          tracked.bet.payout = 0;
          await bettingPipeline.processLoss(tracked.bet, false);
        }
      } catch (err) {
        logger.error({ err, betId: tracked.bet.id }, 'Sports settle failed');
      }
    }
  }

  private async rehydratePending(): Promise<void> {
    this.pending.clear();
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
      const eventId = String(meta.eventId ?? '');
      const outcome = meta.outcome as SportsOutcome;
      const bet: Bet = {
        id: row.id,
        userId: row.userId,
        gameId: `sports_${eventId}`,
        roundId: eventId,
        amount: Number(row.amount),
        state: 'pending',
        placedAt: row.placedAt.getTime(),
        metadata: meta,
      };
      if (!eventId || (outcome !== 'p1' && outcome !== 'x' && outcome !== 'p2')) continue;
      if (now - row.placedAt.getTime() > 36 * 60 * 60 * 1000) {
        try {
          await bettingPipeline.rollbackBet(bet, false);
        } catch (err) {
          logger.warn({ err, betId: bet.id }, 'Sports stale bet refund failed');
        }
        continue;
      }
      const list = this.pending.get(eventId) ?? [];
      list.push({
        bet,
        eventId,
        instanceId: eventId,
        outcome,
        odds: Number(meta.odds ?? 0),
      });
      this.pending.set(eventId, list);
    }
  }
}

export const sportsEngine = new SportsEngine();
