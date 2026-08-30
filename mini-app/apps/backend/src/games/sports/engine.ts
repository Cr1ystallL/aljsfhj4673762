import { randomUUID } from 'crypto';
import { prisma } from '../../lib/prisma.js';
import { redisClient } from '../../lib/redis.js';
import { logger } from '../../utils/logger.js';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
import type { Bet } from '../../game-engine/types.js';
import { SPORTS_CATALOG, templateById, type EventTemplate, type SportKind } from './catalog.js';
import {
  calculateBasketballLiveOdds,
  calculateEsportsLiveOdds,
  calculateFootballLiveOdds,
  calculateHockeyLiveOdds,
  calculateTennisLiveOdds,
  type LiveOddsResult,
} from './odds.js';

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
  subScores?: number[];
  yellowCards?: number;
  redCards?: number;
}

export interface PublicOdds {
  p1: number;
  x?: number;
  p2: number;
  total?: { threshold: number; over: number; under: number };
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
  leagueCountry?: string;
  team1: PublicTeam;
  team2: PublicTeam;
  startTime: string;
  displayTime: string;
  status: EventStatus;
  isLive: boolean;
  liveMinute?: number;
  liveSecond?: number;
  livePeriod?: string;
  liveTime?: string;
  odds: PublicOdds;
  marketsCount: number;
  isFeatured?: boolean;
  lastEvent?: LastSportsEvent;
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
  templateId: string;
  instanceId: string;
  status: EventStatus;
  startTime: number;
  finishedAt?: number;
  gameSeconds: number;
  score1: number;
  score2: number;
  subScores1: number[];
  subScores2: number[];
  yellow1: number;
  yellow2: number;
  red1: number;
  red2: number;
  lastEvent?: LastSportsEvent;
  odds: LiveOddsResult;
  prevOdds: { p1: number; x?: number; p2: number };
}

interface TrackedBet {
  bet: Bet;
  eventId: string;
  instanceId: string;
  outcome: SportsOutcome;
  odds: number;
}

const REDIS_KEY = 'sports:state';
const TICK_MS = 1_000;
const FINISHED_HOLD_MS = 45_000;
const SNAPSHOT_EVERY = 5;
/** Game-seconds advanced per real second for clock sports. ~3 min football. */
const CLOCK_SPEED = 30;
const NOTIFY_TTL_MS = 8_000;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function trendOf(next: number, prev: number | undefined): OddsTrend {
  if (prev === undefined) return 'same';
  if (next > prev + 0.01) return 'up';
  if (next < prev - 0.01) return 'down';
  return 'same';
}

function threeWay(sport: SportKind): boolean {
  return sport === 'football' || sport === 'hockey';
}

function marketsCount(sport: SportKind): number {
  return threeWay(sport) ? 3 : 2;
}

function computeOdds(tpl: EventTemplate, ev: RuntimeEvent): LiveOddsResult {
  const s1 = { attack: tpl.team1.attack, defense: tpl.team1.defense };
  const s2 = { attack: tpl.team2.attack, defense: tpl.team2.defense };
  const minute = Math.floor(ev.gameSeconds / 60);

  if (tpl.sport === 'football') {
    return calculateFootballLiveOdds(minute, ev.score1, ev.score2, s1, s2, ev.red1, ev.red2);
  }
  if (tpl.sport === 'hockey') {
    return calculateHockeyLiveOdds(minute, ev.score1, ev.score2, s1, s2);
  }
  if (tpl.sport === 'tennis') {
    const games1 = ev.subScores1[ev.subScores1.length - 1] ?? 0;
    const games2 = ev.subScores2[ev.subScores2.length - 1] ?? 0;
    return calculateTennisLiveOdds(
      ev.subScores1,
      ev.subScores2,
      games1,
      games2,
      tpl.team1.attack,
      tpl.team2.attack
    );
  }
  if (tpl.sport === 'basketball') {
    const quarter = Math.min(4, Math.floor(minute / 10) + 1);
    const secInQ = Math.max(0, 600 - (ev.gameSeconds % 600));
    return calculateBasketballLiveOdds(
      ev.score1,
      ev.score2,
      quarter,
      secInQ,
      tpl.team1.attack,
      tpl.team2.attack
    );
  }
  return calculateEsportsLiveOdds(
    ev.score1,
    ev.score2,
    ev.subScores1[ev.subScores1.length - 1] ?? 0,
    ev.subScores2[ev.subScores2.length - 1] ?? 0,
    tpl.team1.attack,
    tpl.team2.attack
  );
}

function clockLabel(sport: SportKind, ev: RuntimeEvent): { period: string; liveTime: string } {
  const minute = Math.floor(ev.gameSeconds / 60);
  const second = ev.gameSeconds % 60;

  if (sport === 'football') {
    const period = minute < 45 ? '1T' : '2T';
    if (minute >= 90) {
      return { period: '2T', liveTime: `2T 90+${minute - 90}:${pad2(second)}` };
    }
    return { period, liveTime: `${period} ${pad2(minute)}:${pad2(second)}` };
  }
  if (sport === 'hockey') {
    const period = minute < 20 ? '1P' : minute < 40 ? '2P' : '3P';
    return { period, liveTime: `${period} ${pad2(minute)}:${pad2(second)}` };
  }
  if (sport === 'basketball') {
    const q = Math.min(4, Math.floor(minute / 10) + 1);
    const rem = Math.max(0, 600 - (ev.gameSeconds % 600));
    return { period: `${q}Ч`, liveTime: `${q}Ч ${pad2(Math.floor(rem / 60))}:${pad2(rem % 60)}` };
  }
  if (sport === 'tennis') {
    const setNo = Math.max(ev.subScores1.length, ev.subScores2.length, 1);
    const g1 = ev.subScores1[setNo - 1] ?? 0;
    const g2 = ev.subScores2[setNo - 1] ?? 0;
    return { period: `${setNo}-й сет`, liveTime: `${setNo}-й сет ${g1}:${g2}` };
  }
  const mapNo = ev.score1 + ev.score2 + 1;
  const r1 = ev.subScores1[ev.subScores1.length - 1] ?? 0;
  const r2 = ev.subScores2[ev.subScores2.length - 1] ?? 0;
  return { period: `Map ${mapNo}`, liveTime: `Map ${mapNo} (${r1}:${r2})` };
}

function setsWon(a: number[], b: number[]): number {
  let n = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] > b[i]) n += 1;
  }
  return n;
}

function tennisSetOver(g1: number, g2: number): boolean {
  if (g1 >= 7 || g2 >= 7) return Math.abs(g1 - g2) >= 1 && (g1 >= 6 && g2 >= 6);
  return (g1 >= 6 || g2 >= 6) && Math.abs(g1 - g2) >= 2;
}

class SportsEngine {
  private events = new Map<string, RuntimeEvent>();
  private pending = new Map<string, TrackedBet[]>();
  private timer: NodeJS.Timeout | null = null;
  private started = false;
  private ticks = 0;
  private ticking = false;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.restore();
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_MS);
    logger.info({ events: this.events.size }, 'Sports engine started');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.started = false;
  }

  listEvents(): PublicSportEvent[] {
    const now = Date.now();
    return SPORTS_CATALOG.map((tpl) => {
      const ev = this.events.get(tpl.id);
      if (!ev) return null;
      return this.toPublic(tpl, ev, now);
    }).filter((x): x is PublicSportEvent => x !== null);
  }

  getEvent(id: string): PublicSportEvent | null {
    const tpl = templateById(id);
    const ev = this.events.get(id);
    if (!tpl || !ev) return null;
    return this.toPublic(tpl, ev, Date.now());
  }

  async placeBet(
    userId: string,
    eventId: string,
    outcome: SportsOutcome,
    stake: number
  ): Promise<SportsBetReceipt> {
    const tpl = templateById(eventId);
    const ev = this.events.get(eventId);
    if (!tpl || !ev) throw new Error('Событие не найдено');
    if (ev.status === 'finished') throw new Error('Событие уже завершено');
    if (outcome === 'x' && !threeWay(tpl.sport)) {
      throw new Error('Ничья недоступна для этого события');
    }

    const odds =
      outcome === 'p1' ? ev.odds.p1 : outcome === 'p2' ? ev.odds.p2 : ev.odds.x;
    if (!odds || !Number.isFinite(odds)) throw new Error('Коэффициент недоступен');

    const existing = (this.pending.get(eventId) ?? []).find((b) => b.bet.userId === userId);
    if (existing) throw new Error('У вас уже есть ставка на это событие');

    const betId = `bet_${Date.now()}_${randomUUID()}`;
    const bet: Bet = {
      id: betId,
      userId,
      gameId: `sports_${eventId}`,
      roundId: ev.instanceId,
      amount: stake,
      state: 'pending',
      placedAt: Date.now(),
      metadata: {
        gameType: 'sports',
        eventId,
        instanceId: ev.instanceId,
        outcome,
        odds,
        eventName: `${tpl.team1.name} — ${tpl.team2.name}`,
        league: tpl.league,
        scoreAtBet: [ev.score1, ev.score2],
      },
    };

    await bettingPipeline.processBet(bet, false);

    const tracked: TrackedBet = { bet, eventId, instanceId: ev.instanceId, outcome, odds };
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

  private toPublic(tpl: EventTemplate, ev: RuntimeEvent, now: number): PublicSportEvent {
    const clock = clockLabel(tpl.sport, ev);
    const lastEvent =
      ev.lastEvent && now - ev.lastEvent.at < NOTIFY_TTL_MS ? ev.lastEvent : undefined;
    const isLive = ev.status === 'live';
    const displayTime = isLive
      ? clock.liveTime
      : ev.status === 'finished'
        ? 'FT'
        : new Date(ev.startTime).toISOString();

    return {
      id: tpl.id,
      sport: tpl.sport,
      league: tpl.league,
      leagueCountry: tpl.leagueCountry,
      team1: {
        name: tpl.team1.name,
        shortName: tpl.team1.shortName,
        initials: tpl.team1.initials,
        color: tpl.team1.color,
        logo: tpl.team1.logo,
        score: ev.status === 'prematch' ? undefined : ev.score1,
        subScores: ev.subScores1.length ? ev.subScores1 : undefined,
        yellowCards: ev.yellow1 || undefined,
        redCards: ev.red1 || undefined,
      },
      team2: {
        name: tpl.team2.name,
        shortName: tpl.team2.shortName,
        initials: tpl.team2.initials,
        color: tpl.team2.color,
        logo: tpl.team2.logo,
        score: ev.status === 'prematch' ? undefined : ev.score2,
        subScores: ev.subScores2.length ? ev.subScores2 : undefined,
        yellowCards: ev.yellow2 || undefined,
        redCards: ev.red2 || undefined,
      },
      startTime: new Date(ev.startTime).toISOString(),
      displayTime,
      status: ev.status,
      isLive,
      liveMinute: isLive ? Math.floor(ev.gameSeconds / 60) : undefined,
      liveSecond: isLive ? ev.gameSeconds % 60 : undefined,
      livePeriod: isLive ? clock.period : ev.status === 'finished' ? 'FT' : undefined,
      liveTime: isLive ? clock.liveTime : ev.status === 'finished' ? 'FT' : undefined,
      odds: {
        p1: ev.odds.p1,
        x: ev.odds.x,
        p2: ev.odds.p2,
        total: ev.odds.total,
        p1Trend: trendOf(ev.odds.p1, ev.prevOdds.p1),
        xTrend: ev.odds.x !== undefined ? trendOf(ev.odds.x, ev.prevOdds.x) : undefined,
        p2Trend: trendOf(ev.odds.p2, ev.prevOdds.p2),
      },
      marketsCount: marketsCount(tpl.sport),
      isFeatured: tpl.isFeatured,
      lastEvent,
    };
  }

  private newInstance(tpl: EventTemplate, now: number, recycle: boolean): RuntimeEvent {
    const live = !recycle && tpl.initialLive;
    const gameSeconds = live ? (live.minute ?? 0) * 60 + (live.second ?? 0) : 0;
    const startTime = live
      ? now - Math.floor((gameSeconds / CLOCK_SPEED) * 1000)
      : now + tpl.initialDelayMs;

    const ev: RuntimeEvent = {
      templateId: tpl.id,
      instanceId: `${tpl.id}_${now}_${randomUUID().slice(0, 8)}`,
      status: live ? 'live' : 'prematch',
      startTime,
      gameSeconds,
      score1: live?.score1 ?? 0,
      score2: live?.score2 ?? 0,
      subScores1: live?.subScores1 ? [...live.subScores1] : this.defaultSubs(tpl.sport),
      subScores2: live?.subScores2 ? [...live.subScores2] : this.defaultSubs(tpl.sport),
      yellow1: live?.yellow1 ?? 0,
      yellow2: live?.yellow2 ?? 0,
      red1: 0,
      red2: 0,
      odds: { p1: 2, p2: 2 },
      prevOdds: { p1: 2, p2: 2 },
    };
    ev.odds = computeOdds(tpl, ev);
    ev.prevOdds = { p1: ev.odds.p1, x: ev.odds.x, p2: ev.odds.p2 };
    return ev;
  }

  private defaultSubs(sport: SportKind): number[] {
    if (sport === 'tennis' || sport === 'cybersport') return [0];
    return [];
  }

  private initFromCatalog(): void {
    const now = Date.now();
    this.events.clear();
    for (const tpl of SPORTS_CATALOG) {
      this.events.set(tpl.id, this.newInstance(tpl, now, false));
    }
  }

  private async restore(): Promise<void> {
    try {
      const raw = await redisClient.getClient().get(REDIS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { events?: RuntimeEvent[] };
        if (Array.isArray(parsed.events) && parsed.events.length > 0) {
          this.events.clear();
          for (const ev of parsed.events) {
            if (ev?.templateId) this.events.set(ev.templateId, ev);
          }
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Sports state restore skipped');
    }

    if (this.events.size === 0) this.initFromCatalog();
    else {
      for (const tpl of SPORTS_CATALOG) {
        if (!this.events.has(tpl.id)) {
          this.events.set(tpl.id, this.newInstance(tpl, Date.now(), true));
        }
      }
    }

    await this.rehydratePending();
  }

  private async persist(): Promise<void> {
    try {
      await redisClient.getClient().set(
        REDIS_KEY,
        JSON.stringify({ savedAt: Date.now(), events: [...this.events.values()] })
      );
    } catch (err) {
      logger.warn({ err }, 'Sports state persist failed');
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
      state: string;
    }> = [];
    try {
      rows = await prisma.bet.findMany({
        where: { gameType: 'sports', state: { in: ['pending', 'active'] } },
      });
    } catch (err) {
      logger.warn({ err }, 'Sports pending rehydrate failed');
      return;
    }

    for (const row of rows) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const eventId = String(meta.eventId ?? '');
      const instanceId = String(meta.instanceId ?? '');
      const outcome = meta.outcome as SportsOutcome;
      const ev = this.events.get(eventId);
      const bet: Bet = {
        id: row.id,
        userId: row.userId,
        gameId: `sports_${eventId}`,
        roundId: instanceId,
        amount: Number(row.amount),
        state: 'pending',
        placedAt: row.placedAt.getTime(),
        metadata: meta,
      };

      if (!ev || ev.instanceId !== instanceId || ev.status === 'finished') {
        try {
          await bettingPipeline.rollbackBet(bet, false);
        } catch (err) {
          logger.warn({ err, betId: bet.id }, 'Sports orphan refund failed');
        }
        continue;
      }
      if (outcome !== 'p1' && outcome !== 'x' && outcome !== 'p2') continue;
      const list = this.pending.get(eventId) ?? [];
      list.push({
        bet,
        eventId,
        instanceId,
        outcome,
        odds: Number(meta.odds ?? 0),
      });
      this.pending.set(eventId, list);
    }
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.tickUnsafe();
    } finally {
      this.ticking = false;
    }
  }

  private async tickUnsafe(): Promise<void> {
    const now = Date.now();
    this.ticks += 1;

    for (const tpl of SPORTS_CATALOG) {
      const ev = this.events.get(tpl.id);
      if (!ev) continue;

      if (ev.status === 'prematch' && now >= ev.startTime) {
        ev.status = 'live';
        ev.gameSeconds = 0;
        ev.score1 = 0;
        ev.score2 = 0;
        ev.subScores1 = this.defaultSubs(tpl.sport);
        ev.subScores2 = this.defaultSubs(tpl.sport);
        ev.lastEvent = undefined;
        this.refreshOdds(tpl, ev);
      } else if (ev.status === 'live') {
        this.advanceLive(tpl, ev);
        if (this.shouldFinish(tpl.sport, ev)) {
          ev.status = 'finished';
          ev.finishedAt = now;
          this.refreshOdds(tpl, ev);
          await this.settleEvent(tpl, ev);
        }
      } else if (ev.status === 'finished' && ev.finishedAt && now - ev.finishedAt >= FINISHED_HOLD_MS) {
        const next = this.newInstance(tpl, now, true);
        next.startTime = now + tpl.recycleDelayMs;
        this.events.set(tpl.id, next);
      }
    }

    if (this.ticks % SNAPSHOT_EVERY === 0) {
      await this.persist();
    }
  }

  private refreshOdds(tpl: EventTemplate, ev: RuntimeEvent): void {
    ev.prevOdds = { p1: ev.odds.p1, x: ev.odds.x, p2: ev.odds.p2 };
    ev.odds = computeOdds(tpl, ev);
  }

  private advanceLive(tpl: EventTemplate, ev: RuntimeEvent): void {
    if (tpl.sport === 'tennis') {
      this.advanceTennis(tpl, ev);
      return;
    }
    if (tpl.sport === 'cybersport') {
      this.advanceEsports(tpl, ev);
      return;
    }
    if (tpl.sport === 'basketball') {
      ev.gameSeconds += CLOCK_SPEED;
      this.advanceBasketball(tpl, ev);
      this.refreshOdds(tpl, ev);
      return;
    }

    ev.gameSeconds += CLOCK_SPEED;
    const gameMinutes = CLOCK_SPEED / 60;
    const lambda1 = tpl.team1.attack * tpl.team2.defense;
    const lambda2 = tpl.team2.attack * tpl.team1.defense;
    const span = tpl.sport === 'hockey' ? 60 : 90;
    const p1 = (lambda1 / span) * gameMinutes;
    const p2 = (lambda2 / span) * gameMinutes;
    if (Math.random() < p1) this.scoreGoal(ev, 1);
    if (Math.random() < p2) this.scoreGoal(ev, 2);
    if (Math.random() < 0.02) {
      if (Math.random() < 0.5) ev.yellow1 += 1;
      else ev.yellow2 += 1;
    }
    this.refreshOdds(tpl, ev);
  }

  private scoreGoal(ev: RuntimeEvent, team: 1 | 2): void {
    if (team === 1) ev.score1 += 1;
    else ev.score2 += 1;
    ev.lastEvent = {
      kind: 'goal',
      team,
      score1: ev.score1,
      score2: ev.score2,
      at: Date.now(),
    };
  }

  private advanceBasketball(tpl: EventTemplate, ev: RuntimeEvent): void {
    const pace1 = 2.2 * tpl.team1.attack;
    const pace2 = 2.2 * tpl.team2.attack;
    if (Math.random() < 0.55) {
      const pts = Math.random() < 0.28 ? 3 : Math.random() < 0.15 ? 1 : 2;
      if (Math.random() < pace1 / (pace1 + pace2)) ev.score1 += pts;
      else ev.score2 += pts;
    }
  }

  private advanceTennis(tpl: EventTemplate, ev: RuntimeEvent): void {
    if (Math.random() > 0.38) return;
    const p1 = tpl.team1.attack / (tpl.team1.attack + tpl.team2.attack);
    const winner: 1 | 2 = Math.random() < p1 ? 1 : 2;
    const i = Math.max(ev.subScores1.length, ev.subScores2.length, 1) - 1;
    if (ev.subScores1.length <= i) ev.subScores1.push(0);
    if (ev.subScores2.length <= i) ev.subScores2.push(0);
    if (winner === 1) ev.subScores1[i] += 1;
    else ev.subScores2[i] += 1;

    const g1 = ev.subScores1[i];
    const g2 = ev.subScores2[i];
    if (tennisSetOver(g1, g2)) {
      if (g1 > g2) ev.score1 += 1;
      else ev.score2 += 1;
      if (ev.score1 < 2 && ev.score2 < 2) {
        ev.subScores1.push(0);
        ev.subScores2.push(0);
      }
    }
    ev.lastEvent = {
      kind: 'point',
      team: winner,
      score1: ev.score1,
      score2: ev.score2,
      at: Date.now(),
    };
    this.refreshOdds(tpl, ev);
  }

  private advanceEsports(tpl: EventTemplate, ev: RuntimeEvent): void {
    if (Math.random() > 0.42) return;
    const p1 = tpl.team1.attack / (tpl.team1.attack + tpl.team2.attack);
    const winner: 1 | 2 = Math.random() < p1 ? 1 : 2;
    const i = Math.max(ev.subScores1.length, ev.subScores2.length, 1) - 1;
    if (ev.subScores1.length <= i) ev.subScores1.push(0);
    if (ev.subScores2.length <= i) ev.subScores2.push(0);
    if (winner === 1) ev.subScores1[i] += 1;
    else ev.subScores2[i] += 1;

    const r1 = ev.subScores1[i];
    const r2 = ev.subScores2[i];
    if (r1 >= 13 || r2 >= 13) {
      if (r1 > r2) ev.score1 += 1;
      else ev.score2 += 1;
      if (ev.score1 < 2 && ev.score2 < 2) {
        ev.subScores1.push(0);
        ev.subScores2.push(0);
      }
    }
    ev.lastEvent = {
      kind: 'point',
      team: winner,
      score1: ev.score1,
      score2: ev.score2,
      at: Date.now(),
    };
    this.refreshOdds(tpl, ev);
  }

  private shouldFinish(sport: SportKind, ev: RuntimeEvent): boolean {
    if (sport === 'football') return ev.gameSeconds >= 92 * 60;
    if (sport === 'hockey') return ev.gameSeconds >= 60 * 60;
    if (sport === 'basketball') {
      return ev.gameSeconds >= 40 * 60 && ev.score1 !== ev.score2;
    }
    if (sport === 'tennis') return ev.score1 >= 2 || ev.score2 >= 2;
    return ev.score1 >= 2 || ev.score2 >= 2;
  }

  private winningOutcome(tpl: EventTemplate, ev: RuntimeEvent): SportsOutcome | null {
    if (tpl.sport === 'tennis' || tpl.sport === 'cybersport' || tpl.sport === 'basketball') {
      if (ev.score1 === ev.score2) return ev.score1 > 0 ? null : 'p1';
      return ev.score1 > ev.score2 ? 'p1' : 'p2';
    }
    if (ev.score1 > ev.score2) return 'p1';
    if (ev.score2 > ev.score1) return 'p2';
    return 'x';
  }

  private async settleEvent(tpl: EventTemplate, ev: RuntimeEvent): Promise<void> {
    const winner = this.winningOutcome(tpl, ev);
    const list = this.pending.get(tpl.id) ?? [];
    this.pending.delete(tpl.id);

    for (const tracked of list) {
      if (tracked.instanceId !== ev.instanceId) {
        try {
          await bettingPipeline.rollbackBet(tracked.bet, false);
        } catch (err) {
          logger.warn({ err, betId: tracked.bet.id }, 'Sports stale instance refund failed');
        }
        continue;
      }
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
}

export const sportsEngine = new SportsEngine();
