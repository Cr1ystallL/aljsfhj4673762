import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { authenticate, adminOnly, type AuthenticatedRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

type PrizeMode = 'percent' | 'fixed';

interface TournamentConfig {
  id: string;
  title: string;
  description: string | null;
  bannerUrl: string | null;
  gameType: string;
  prizePool: number;
  prizeMode: PrizeMode;
  winnersCount: number;
  fixedPrize: number | null;
  startBalance: number;
  entryFee: number;
  startAtGmt1: number; // ms since epoch of first start
  durationHours: number; // usually 10
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

interface CycleState {
  id: string;
  tournamentId: string;
  startsAt: number;
  endsAt: number;
  prizePool: number;
}

interface Participant {
  id: string;
  cycleId: string;
  userId: string;
  balance: number;
  reachedAt: number;
  joinedAt: number;
  refreshCount: number;
  lastRefreshAt?: number;
}

const tournaments = new Map<string, TournamentConfig>();
const cycles = new Map<string, CycleState>();
const participants = new Map<string, Participant>(); // key cycleId:userId

function nextCycleWindow(t: TournamentConfig, now = Date.now()): { startsAt: number; endsAt: number } {
  // All times treated in GMT+1; we offset by +1h to convert to UTC for scheduling.
  const offsetMs = 60 * 60 * 1000;
  const firstStart = t.startAtGmt1 - offsetMs;
  if (now <= firstStart) return { startsAt: firstStart, endsAt: firstStart + t.durationHours * 3600 * 1000 };
  const dayMs = 24 * 3600 * 1000;
  const daysPassed = Math.floor((now - firstStart) / dayMs);
  const currentStart = firstStart + daysPassed * dayMs;
  const currentEnd = currentStart + t.durationHours * 3600 * 1000;
  if (now <= currentEnd) return { startsAt: currentStart, endsAt: currentEnd };
  const nextStart = currentStart + dayMs;
  return { startsAt: nextStart, endsAt: nextStart + t.durationHours * 3600 * 1000 };
}

function getOrCreateCycle(t: TournamentConfig, now = Date.now()): CycleState {
  const { startsAt, endsAt } = nextCycleWindow(t, now);
  const existing = Array.from(cycles.values()).find((c) => c.tournamentId === t.id && c.startsAt === startsAt);
  if (existing) return existing;
  const c: CycleState = {
    id: randomUUID(),
    tournamentId: t.id,
    startsAt,
    endsAt,
    prizePool: t.prizePool,
  };
  cycles.set(c.id, c);
  return c;
}

function participantKey(cycleId: string, userId: string) {
  return `${cycleId}:${userId}`;
}

function percentPayouts(pool: number): Array<{ place: number; amount: number }> {
  const percents = [20, 16, 13, 11, 9, 8, 7, 6, 5, 5];
  return percents.map((p, i) => ({ place: i + 1, amount: +(pool * (p / 100)).toFixed(2) }));
}

export async function tournamentRoutes(app: FastifyInstance): Promise<void> {
  /* ----------------------------- admin CRUD ----------------------------- */
  app.get('/_x/tournaments', { preHandler: adminOnly }, async (_req, reply) => {
    return reply.send({ ok: true, tournaments: Array.from(tournaments.values()) });
  });

  app.post<{
    Body: {
      title?: string;
      description?: string | null;
      bannerUrl?: string | null;
      gameType?: string;
      prizePool?: number;
      prizeMode?: PrizeMode;
      winnersCount?: number;
      fixedPrize?: number | null;
      startBalance?: number;
      entryFee?: number;
      startAtGmt1?: number;
      durationHours?: number;
    };
  }>('/_x/tournaments', { preHandler: adminOnly }, async (request, reply) => {
    const b = request.body ?? {};
    const title = (b.title ?? '').trim();
    const gameType = (b.gameType ?? '').trim();
    const prizePool = Number(b.prizePool ?? 0);
    const winnersCount = Number.isFinite(b.winnersCount) ? Number(b.winnersCount) : 10;
    const startBalance = Number(b.startBalance ?? 0);
    const entryFee = Number(b.entryFee ?? 0);
    const startAtGmt1 = Number(b.startAtGmt1 ?? Date.now());
    const durationHours = Number.isFinite(b.durationHours) && b.durationHours! > 0 ? Number(b.durationHours) : 10;
    const prizeMode: PrizeMode = b.prizeMode === 'fixed' ? 'fixed' : 'percent';
    const fixedPrize = prizeMode === 'fixed' ? Number(b.fixedPrize ?? 0) : null;

    if (!title || !gameType || prizePool <= 0 || startBalance <= 0 || winnersCount < 1) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }

    const now = Date.now();
    const t: TournamentConfig = {
      id: randomUUID(),
      title,
      description: b.description ?? null,
      bannerUrl: b.bannerUrl?.trim() || null,
      gameType,
      prizePool,
      prizeMode,
      winnersCount,
      fixedPrize,
      startBalance,
      entryFee,
      startAtGmt1,
      durationHours,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    tournaments.set(t.id, t);
    getOrCreateCycle(t, now);
    return reply.send({ ok: true, id: t.id });
  });

  app.patch<{ Params: { id: string }; Body: Partial<TournamentConfig> }>(
    '/_x/tournaments/:id',
    { preHandler: adminOnly },
    async (request, reply) => {
      const t = tournaments.get(request.params.id);
      if (!t) return reply.code(404).send({ error: 'Not found' });
      const b = request.body ?? {};
      Object.assign(t, {
        title: b.title ?? t.title,
        description: b.description ?? t.description,
        bannerUrl: b.bannerUrl ?? t.bannerUrl,
        gameType: b.gameType ?? t.gameType,
        prizePool: Number.isFinite(b.prizePool) ? Number(b.prizePool) : t.prizePool,
        prizeMode: (b.prizeMode as PrizeMode) ?? t.prizeMode,
        winnersCount: Number.isFinite(b.winnersCount) ? Number(b.winnersCount) : t.winnersCount,
        fixedPrize: Number.isFinite(b.fixedPrize) ? Number(b.fixedPrize) : t.fixedPrize,
        startBalance: Number.isFinite(b.startBalance) ? Number(b.startBalance) : t.startBalance,
        entryFee: Number.isFinite(b.entryFee) ? Number(b.entryFee) : t.entryFee,
        startAtGmt1: Number.isFinite(b.startAtGmt1) ? Number(b.startAtGmt1) : t.startAtGmt1,
        durationHours: Number.isFinite(b.durationHours) ? Number(b.durationHours) : t.durationHours,
        active: typeof b.active === 'boolean' ? b.active : t.active,
        updatedAt: Date.now(),
      });
      return reply.send({ ok: true });
    }
  );

  /* ------------------------------ public ------------------------------- */
  app.get('/tournaments', { preHandler: authenticate }, async (_req, reply) => {
    const now = Date.now();
    const live = Array.from(tournaments.values())
      .filter((t) => t.active)
      .map((t) => ({ t, cycle: getOrCreateCycle(t, now) }))
      .map(({ t, cycle }) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        bannerUrl: t.bannerUrl,
        gameType: t.gameType,
        prizePool: t.prizePool,
        prizeMode: t.prizeMode,
        winnersCount: t.winnersCount,
        fixedPrize: t.fixedPrize,
        startBalance: t.startBalance,
        entryFee: t.entryFee,
        startsAt: cycle.startsAt,
        endsAt: cycle.endsAt,
      }));
    return reply.send({ ok: true, tournaments: live });
  });

  app.post<{ Params: { id: string } }>(
    '/tournaments/:id/join',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const t = tournaments.get(request.params.id);
      if (!t || !t.active) return reply.code(404).send({ error: 'Not found' });
      const cycle = getOrCreateCycle(t, Date.now());
      const key = participantKey(cycle.id, userId);
      const fee = t.entryFee;
      if (!participants.has(key)) {
        participants.set(key, {
          id: randomUUID(),
          cycleId: cycle.id,
          userId,
          balance: t.startBalance,
          reachedAt: Date.now(),
          joinedAt: Date.now(),
          refreshCount: 0,
        });
      }
      // Fee handling: in-memory stub (no wallet mutation). We only log.
      if (fee > 0) {
        logger.info({ userId, fee, tournamentId: t.id }, 'Tournament fee (stub, not deducted)');
      }
      return reply.send({ ok: true });
    }
  );

  app.post<{ Params: { id: string } }>(
    '/tournaments/:id/refresh',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const t = tournaments.get(request.params.id);
      if (!t || !t.active) return reply.code(404).send({ error: 'Not found' });
      const cycle = getOrCreateCycle(t, Date.now());
      const key = participantKey(cycle.id, userId);
      const p = participants.get(key);
      if (!p) return reply.code(400).send({ error: 'Not registered' });
      if (p.balance > 0) return reply.code(409).send({ error: 'Balance must be <= 0 to refresh' });
      p.balance = t.startBalance;
      p.refreshCount += 1;
      p.reachedAt = Date.now();
      p.lastRefreshAt = Date.now();
      // fee split stub
      if (t.entryFee > 0) {
        const fundAdd = t.entryFee * 0.9;
        const house = t.entryFee * 0.1;
        cycle.prizePool += fundAdd;
        logger.info({ userId, fundAdd, house, tournamentId: t.id }, 'Tournament refresh fee (stub)');
      }
      return reply.send({ ok: true });
    }
  );

  app.get<{ Params: { id: string } }>(
    '/tournaments/:id/leaderboard',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const t = tournaments.get(request.params.id);
      if (!t) return reply.code(404).send({ error: 'Not found' });
      const cycle = getOrCreateCycle(t, Date.now());
      const rows = Array.from(participants.values()).filter((p) => p.cycleId === cycle.id);
      const sorted = rows.sort((a, b) => {
        if (b.balance !== a.balance) return b.balance - a.balance;
        return a.reachedAt - b.reachedAt;
      });
      const top = sorted.slice(0, 50).map((p, idx) => ({
        place: idx + 1,
        userId: p.userId,
        balance: p.balance,
        prize:
          t.prizeMode === 'percent'
            ? percentPayouts(cycle.prizePool)[idx]?.amount ?? 0
            : t.prizeMode === 'fixed'
              ? (idx < t.winnersCount ? t.fixedPrize ?? 0 : 0)
              : 0,
      }));
      const selfIndex = sorted.findIndex((p) => p.userId === userId);
      const self = selfIndex === -1 ? null : {
        place: selfIndex + 1,
        balance: sorted[selfIndex].balance,
      };
      return reply.send({ ok: true, leaderboard: top, self });
    }
  );
}
