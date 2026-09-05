import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { authenticate, adminOnly, type AuthenticatedRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { balanceService } from '../services/balance-service.js';
import { logger } from '../utils/logger.js';
import { rtpEngine } from '../services/rtp-engine.js';

type PrizeMode = 'percent' | 'fixed';
export const MIN_TOURNAMENT_BETS_FOR_QUALIFICATION = 5;

// Payouts for 5 winners on 555 zł (1st: 200, 2nd: 125, 3rd: 100, 4th: 75, 5th: 55)
const PERCENT_PAYOUTS_5 = [36.04, 22.52, 18.02, 13.51, 9.91];
const PERCENT_PAYOUTS_DEFAULT = [20, 16, 13, 11, 9, 8, 7, 6, 5, 5];

const toNumber = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0);

function cycleBounds(t: { startAtGmt1: Date; durationHours: number; repeatType?: string }, now = Date.now()) {
  const offsetMs = 60 * 60 * 1000;
  const firstStartUtc = t.startAtGmt1.getTime() - offsetMs;
  const durationMs = t.durationHours * 3600 * 1000;

  if (t.repeatType === 'once') {
    return { startsAt: firstStartUtc, endsAt: firstStartUtc + durationMs };
  }

  const dayMs = 24 * 3600 * 1000;
  if (now <= firstStartUtc) return { startsAt: firstStartUtc, endsAt: firstStartUtc + durationMs };
  const daysPassed = Math.floor((now - firstStartUtc) / dayMs);
  const currentStart = firstStartUtc + daysPassed * dayMs;
  const currentEnd = currentStart + durationMs;
  if (now <= currentEnd) return { startsAt: currentStart, endsAt: currentEnd };
  const nextStart = currentStart + dayMs;
  return { startsAt: nextStart, endsAt: nextStart + durationMs };
}

async function ensureCycle(t: { id: string; startAtGmt1: Date; durationHours: number; prizePool: Prisma.Decimal; repeatType?: string }) {
  const { startsAt, endsAt } = cycleBounds(t);
  let cycle = await (prisma as any).tournamentCycle.findFirst({
    where: { tournamentId: t.id, startsAt: new Date(startsAt) },
  });
  const now = Date.now();
  if (!cycle) {
    cycle = await (prisma as any).tournamentCycle.findFirst({
      where: { tournamentId: t.id, state: { in: ['live', 'waiting'] } },
      orderBy: { startsAt: 'desc' },
    });
  }

  if (!cycle) {
    cycle = await (prisma as any).tournamentCycle.create({
      data: {
        tournamentId: t.id,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        prizePool: t.prizePool,
        state: now < startsAt ? 'waiting' : (now > endsAt ? 'ended' : 'live'),
      },
    });
  } else {
    const updates: Record<string, any> = {};
    if (Number(cycle.prizePool) !== Number(t.prizePool)) {
      updates.prizePool = t.prizePool;
    }
    const expectedEnd = new Date(cycle.startsAt.getTime() + t.durationHours * 3600 * 1000);
    if (cycle.endsAt.getTime() !== expectedEnd.getTime()) {
      updates.endsAt = expectedEnd;
    }
    if (cycle.state === 'waiting' && now >= cycle.startsAt.getTime() && now <= expectedEnd.getTime()) {
      updates.state = 'live';
    } else if (cycle.state === 'ended' && now <= expectedEnd.getTime()) {
      updates.state = 'live';
    } else if (cycle.state === 'live' && now > expectedEnd.getTime()) {
      updates.state = 'ended';
    }
    if (Object.keys(updates).length > 0) {
      cycle = await (prisma as any).tournamentCycle.update({
        where: { id: cycle.id },
        data: updates,
      });
    }
  }
  return cycle;
}

async function debitRealBalance(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  metadata: Record<string, unknown>
) {
  // Ensure balance row exists
  await tx.balance.upsert({
    where: { userId },
    update: {},
    create: { userId, amount: 0, currency: 'PLN', demoMode: false },
  });

  const rows = await tx.$queryRaw<Array<{ before: string; after: string }>>`
    UPDATE balances
    SET amount = amount - ${amount}::numeric,
        updated_at = NOW(),
        last_synced_at = NOW(),
        version = version + 1
    WHERE user_id = ${userId}
      AND amount >= ${amount}::numeric
    RETURNING amount + ${amount}::numeric as before, amount as after
  `;
  if (rows.length === 0) {
    throw new Error('Недостаточно средств');
  }

  await tx.transaction.create({
    data: {
      userId,
      type: 'tournament_fee',
      amount: -amount,
      balanceBefore: Number(rows[0].before),
      balanceAfter: Number(rows[0].after),
      metadata: metadata as Prisma.InputJsonValue,
    },
  });

  return Number(rows[0].after);
}

async function creditRealBalance(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  metadata: Record<string, unknown>
) {
  // Ensure balance row exists
  await tx.balance.upsert({
    where: { userId },
    update: {},
    create: { userId, amount: 0, currency: 'PLN', demoMode: false },
  });

  const wagerMult = metadata.wagerMultiplier ? Number(metadata.wagerMultiplier) : 2;
  const rows = await tx.$queryRaw<Array<{ before: string; after: string; wager_target: string; wager_progress: string; auto_rtp_target: string; auto_rtp_progress: string }>>`
    UPDATE balances
    SET amount = amount + ${amount}::numeric,
        wager_target = wager_target + (${amount} * ${wagerMult})::numeric,
        auto_rtp_target = auto_rtp_target + (${amount} * ${wagerMult})::numeric,
        updated_at = NOW(),
        last_synced_at = NOW(),
        version = version + 1
    WHERE user_id = ${userId}
    RETURNING amount - ${amount}::numeric as before, amount as after, wager_target, wager_progress, auto_rtp_target, auto_rtp_progress
  `;

  const before = rows[0] ? Number(rows[0].before) : 0;
  const after = rows[0] ? Number(rows[0].after) : before + amount;

  await tx.transaction.create({
    data: {
      userId,
      type: 'tournament_prize',
      amount,
      balanceBefore: before,
      balanceAfter: after,
      gameType: null,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });

  return after;
}

export async function payoutCycle(t: any, cycle: any) {
  const participants = await (prisma as any).tournamentParticipant.findMany({
    where: { cycleId: cycle.id },
    orderBy: [
      { balance: 'desc' },
      { reachedAt: 'asc' },
    ],
  });

  // Fetch actual bets count from bets table
  let betCounts: Array<{ user_id: string; cnt: string }> = [];
  try {
    betCounts = await (prisma as any).$queryRaw`
      SELECT user_id, COUNT(*)::text as cnt
      FROM bets
      WHERE metadata->>'tournamentCycleId' = ${cycle.id}
      GROUP BY user_id
    `;
  } catch (e) {
    logger.warn({ e, cycleId: cycle.id }, 'Failed to query tournament bet counts for payout');
  }

  const betCountMap = new Map<string, number>();
  for (const b of betCounts) {
    betCountMap.set(b.user_id, Number(b.cnt));
  }

  const enrichedParticipants = participants.map((p: any) => {
    const betsCount = Math.max(Number(p.betsCount || 0), betCountMap.get(p.userId) || 0);
    const isQualified =
      betsCount >= MIN_TOURNAMENT_BETS_FOR_QUALIFICATION ||
      p.refreshCount > 0 ||
      toNumber(p.balance) <= 0;
    return { ...p, betsCount, isQualified };
  });

  // Qualified participants rank first, then by balance desc, reachedAt asc
  enrichedParticipants.sort((a: any, b: any) => {
    if (a.isQualified !== b.isQualified) {
      return a.isQualified ? -1 : 1;
    }
    const balDiff = toNumber(b.balance) - toNumber(a.balance);
    if (balDiff !== 0) return balDiff;
    return new Date(a.reachedAt).getTime() - new Date(b.reachedAt).getTime();
  });

  const qualifiedParticipants = enrichedParticipants.filter((p: any) => p.isQualified);

  const winnerIds: string[] = [];
  const pool = toNumber(cycle.prizePool);
  const fixedPrize = t.fixedPrize ? toNumber(t.fixedPrize) : null;

  await prisma.$transaction(async (tx) => {
    for (let idx = 0; idx < Math.min(t.winnersCount, qualifiedParticipants.length); idx += 1) {
      const p = qualifiedParticipants[idx];
      const prize = computePrize(pool, t.prizeMode as PrizeMode, idx, t.winnersCount, fixedPrize);
      if (prize <= 0) continue;
      await creditRealBalance(tx, p.userId, prize, {
        tournamentId: t.id,
        cycleId: cycle.id,
        place: idx + 1,
        wagerMultiplier: t.wagerMultiplier ?? 0,
        reason: 'payout',
      });
      winnerIds.push(p.userId);
    }

    await (tx as any).tournamentCycle.update({
      where: { id: cycle.id },
      data: { state: 'ended', endsAt: new Date() },
    });

    if (t.repeatType === 'once') {
      await (tx as any).tournament.update({
        where: { id: t.id },
        data: { active: false },
      });
    }
  });

  for (const userId of winnerIds) {
    await balanceService.syncBalance(userId);
    try {
      await rtpEngine.getUserStatus(userId);
    } catch (e) {
      logger.error(e, 'Failed to update rtp status for tournament winner');
    }
  }

  return { winnersPaid: winnerIds.length };
}

function computePrize(pool: number, mode: PrizeMode, idx: number, winnersCount: number, fixedPrize: number | null) {
  if (idx >= winnersCount) return 0;
  if (mode === 'percent') {
    const table = winnersCount === 5 ? PERCENT_PAYOUTS_5 : PERCENT_PAYOUTS_DEFAULT;
    return +(pool * (table[idx] ? table[idx] / 100 : 0)).toFixed(2);
  }
  if (mode === 'fixed') return fixedPrize ?? 0;
  return 0;
}

export async function tournamentRoutes(app: FastifyInstance): Promise<void> {
  try {
    await (prisma as any).$executeRawUnsafe(`
      ALTER TABLE tournament_participants ADD COLUMN IF NOT EXISTS bets_count INT NOT NULL DEFAULT 0;
      ALTER TABLE tournament_participants ADD COLUMN IF NOT EXISTS turnover NUMERIC(20, 2) NOT NULL DEFAULT 0;
    `);
  } catch (e) {
    logger.warn({ e }, 'Failed to run tournament participant migrations');
  }

  /* ----------------------------- admin CRUD ----------------------------- */
  app.get('/_x/tournaments', { preHandler: adminOnly }, async (_req, reply) => {
    const items = await (prisma as any).tournament.findMany({ orderBy: { createdAt: 'desc' } });
    const mapped = await Promise.all(
      items.map(async (t: any) => {
        const cycle = await ensureCycle(t);
        return {
          ...t,
          prizePool: toNumber(t.prizePool),
          fixedPrize: t.fixedPrize ? toNumber(t.fixedPrize) : null,
          wagerMultiplier: t.wagerMultiplier ?? 0,
          startBalance: toNumber(t.startBalance),
          entryFee: toNumber(t.entryFee),
          rebuyFee: toNumber(t.rebuyFee),
          startsAt: cycle.startsAt.getTime(),
          endsAt: cycle.endsAt.getTime(),
          cycleState: cycle.state,
        };
      })
    );
    return reply.send({ ok: true, tournaments: mapped });
  });

  app.get<{ Params: { id: string } }>('/_x/tournaments/:id', { preHandler: adminOnly }, async (request, reply) => {
    const t = await (prisma as any).tournament.findUnique({ where: { id: request.params.id } });
    if (!t) return reply.code(404).send({ error: 'Not found' });
    const cycle = await ensureCycle(t);
    const participants = await (prisma as any).tournamentParticipant.findMany({
      where: { cycleId: cycle.id },
      include: { user: { select: { id: true, username: true, firstName: true } } },
      orderBy: [
        { balance: 'desc' },
        { reachedAt: 'asc' },
      ],
      take: 200,
    });
    const enriched = {
      ...t,
      prizePool: toNumber(t.prizePool),
      fixedPrize: t.fixedPrize ? toNumber(t.fixedPrize) : null,
      wagerMultiplier: t.wagerMultiplier ?? 0,
      startBalance: toNumber(t.startBalance),
      entryFee: toNumber(t.entryFee),
      rebuyFee: toNumber(t.rebuyFee),
      startsAt: cycle.startsAt.getTime(),
      endsAt: cycle.endsAt.getTime(),
      cycleState: cycle.state,
      participants: participants.map((p: any) => ({
        id: p.id,
        userId: p.userId,
        username: p.user?.username,
        firstName: p.user?.firstName,
        balance: toNumber(p.balance),
        joinedAt: p.joinedAt.getTime(),
      })),
    };
    return reply.send({ ok: true, tournament: enriched });
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
      wagerMultiplier?: number;
      startBalance?: number;
      entryFee?: number;
      rebuyFee?: number;
      startAtGmt1?: number;
      durationHours?: number;
      repeatType?: string;
    };
  }>('/_x/tournaments', { preHandler: adminOnly }, async (request, reply) => {
    const b = request.body ?? {};
    const title = (b.title ?? '').trim();
    const gameType = (b.gameType ?? '').trim();
    const prizePool = Number(b.prizePool ?? 0);
    const winnersCount = Number.isFinite(b.winnersCount) ? Number(b.winnersCount) : 10;
    const startBalance = Number(b.startBalance ?? 0);
    const entryFee = Number(b.entryFee ?? 0);
    const rebuyFee = Number(b.rebuyFee ?? 0);
    const startAtGmt1 = Number(b.startAtGmt1 ?? Date.now());
    const durationHours = Number.isFinite(b.durationHours) && b.durationHours! > 0 ? Number(b.durationHours) : 10;
    const repeatType = b.repeatType === 'once' ? 'once' : 'daily';
    const prizeMode: PrizeMode = b.prizeMode === 'fixed' ? 'fixed' : 'percent';
    const fixedPrize = prizeMode === 'fixed' ? Number(b.fixedPrize ?? 0) : null;
    const rawWager = Number(b.wagerMultiplier);
    const wagerMultiplier = Number.isFinite(rawWager) && rawWager > 0 ? Math.floor(rawWager) : 0;
    const normalizedPrizePool =
      prizeMode === 'fixed' && fixedPrize !== null ? fixedPrize * winnersCount : prizePool;

    if (!title || !gameType || startBalance <= 0 || winnersCount < 1) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }
    if (prizeMode === 'percent' && normalizedPrizePool <= 0) {
      return reply.code(400).send({ error: 'Prize pool required for percent mode' });
    }
    if (prizeMode === 'fixed' && (!fixedPrize || fixedPrize <= 0)) {
      return reply.code(400).send({ error: 'Fixed prize must be > 0' });
    }

    const t = await (prisma as any).tournament.create({
      data: {
        title,
        description: b.description ?? null,
        bannerUrl: b.bannerUrl?.trim() || null,
        gameType,
        prizePool: normalizedPrizePool,
        prizeMode,
        winnersCount,
        fixedPrize,
        wagerMultiplier,
        startBalance,
        entryFee,
        rebuyFee,
        startAtGmt1: new Date(startAtGmt1),
        durationHours,
        repeatType,
        active: true,
      },
    });
    await ensureCycle(t);
    return reply.send({ ok: true, id: t.id });
  });

  app.patch<{ Params: { id: string }; Body: Partial<{ title: string; description: string | null; bannerUrl: string | null; gameType: string; prizePool: number; prizeMode: PrizeMode; winnersCount: number; fixedPrize: number | null; wagerMultiplier: number; startBalance: number; entryFee: number; rebuyFee: number; startAtGmt1: number; durationHours: number; repeatType: string; active: boolean }> }>(
    '/_x/tournaments/:id',
    { preHandler: adminOnly },
    async (request, reply) => {
      const t = await (prisma as any).tournament.findUnique({ where: { id: request.params.id } });
      if (!t) return reply.code(404).send({ error: 'Not found' });
      const b = request.body ?? {};
      const nextPrizeMode = (b.prizeMode as PrizeMode) ?? (t.prizeMode as PrizeMode);
      const nextFixedPrize = Number.isFinite(b.fixedPrize) ? Number(b.fixedPrize) : t.fixedPrize;
      const nextWinners = Number.isFinite(b.winnersCount) ? Number(b.winnersCount) : t.winnersCount;
      const nextPrizePool =
        nextPrizeMode === 'fixed' && nextFixedPrize !== null
          ? Number(nextFixedPrize) * Number(nextWinners)
          : Number.isFinite(b.prizePool)
            ? Number(b.prizePool)
            : t.prizePool;

      const newStartAt = Number.isFinite(b.startAtGmt1) ? new Date(Number(b.startAtGmt1)) : t.startAtGmt1;
      const nextStartAt = Math.abs(newStartAt.getTime() - t.startAtGmt1.getTime()) < 60000 ? t.startAtGmt1 : newStartAt;
      const nextDurationHours = Number.isFinite(b.durationHours) ? Number(b.durationHours) : t.durationHours;
      const nextRepeatType = typeof b.repeatType === 'string' ? b.repeatType : t.repeatType;

      const updated = await (prisma as any).tournament.update({
        where: { id: t.id },
        data: {
          title: b.title ?? t.title,
          description: b.description ?? t.description,
          bannerUrl: b.bannerUrl ?? t.bannerUrl,
          gameType: b.gameType ?? t.gameType,
          prizePool: nextPrizePool,
          prizeMode: nextPrizeMode,
          winnersCount: nextWinners,
          fixedPrize: nextPrizeMode === 'fixed' ? nextFixedPrize : null,
          wagerMultiplier: Number.isFinite(b.wagerMultiplier) && b.wagerMultiplier! >= 0 ? Math.floor(Number(b.wagerMultiplier)) : t.wagerMultiplier,
          startBalance: Number.isFinite(b.startBalance) ? Number(b.startBalance) : t.startBalance,
          entryFee: Number.isFinite(b.entryFee) ? Number(b.entryFee) : t.entryFee,
          rebuyFee: Number.isFinite(b.rebuyFee) ? Number(b.rebuyFee) : t.rebuyFee,
          startAtGmt1: nextStartAt,
          durationHours: nextDurationHours,
          repeatType: nextRepeatType,
          active: typeof b.active === 'boolean' ? b.active : t.active,
        },
      });

      // Update existing cycles of this tournament with new endsAt, state, and prizePool
      const cycles = await (prisma as any).tournamentCycle.findMany({
        where: { tournamentId: t.id },
        orderBy: { startsAt: 'desc' },
        take: 5,
      });

      const now = Date.now();
      for (const c of cycles) {
        const newEndsAt = new Date(c.startsAt.getTime() + nextDurationHours * 3600 * 1000);
        const updates: Record<string, any> = {
          endsAt: newEndsAt,
          prizePool: nextPrizePool,
        };
        if (now >= c.startsAt.getTime() && now <= newEndsAt.getTime()) {
          updates.state = 'live';
        } else if (now > newEndsAt.getTime()) {
          updates.state = 'ended';
        } else if (now < c.startsAt.getTime()) {
          updates.state = 'waiting';
        }
        await (prisma as any).tournamentCycle.update({
          where: { id: c.id },
          data: updates,
        });
      }

      await ensureCycle(updated);
      return reply.send({ ok: true });
    }
  );

  app.delete<{ Params: { id: string } }>('/_x/tournaments/:id', { preHandler: adminOnly }, async (request, reply) => {
    const t = await (prisma as any).tournament.findUnique({ where: { id: request.params.id } });
    if (!t) return reply.code(404).send({ error: 'Not found' });
    await (prisma as any).tournament.delete({ where: { id: t.id } });
    return reply.send({ ok: true });
  });

  app.post<{ Params: { id: string } }>('/_x/tournaments/:id/force-start', { preHandler: adminOnly }, async (request, reply) => {
    const t = await (prisma as any).tournament.findUnique({ where: { id: request.params.id } });
    if (!t) return reply.code(404).send({ error: 'Not found' });

    const now = Date.now();
    const endsAt = now + t.durationHours * 3600 * 1000;
    let cycle = await (prisma as any).tournamentCycle.findFirst({
      where: { tournamentId: t.id },
      orderBy: { startsAt: 'desc' },
    });

    if (!cycle) {
      cycle = await (prisma as any).tournamentCycle.create({
        data: {
          tournamentId: t.id,
          startsAt: new Date(now),
          endsAt: new Date(endsAt),
          prizePool: t.prizePool,
          state: 'live',
        },
      });
    } else {
      cycle = await (prisma as any).tournamentCycle.update({
        where: { id: cycle.id },
        data: {
          startsAt: new Date(now),
          endsAt: new Date(endsAt),
          prizePool: t.prizePool,
          state: 'live',
        },
      });
    }

    await (prisma as any).tournament.update({
      where: { id: t.id },
      data: { startAtGmt1: new Date(now + 60 * 60 * 1000) },
    });

    return reply.send({ ok: true, startsAt: cycle.startsAt.getTime(), endsAt: cycle.endsAt.getTime() });
  });

  app.post<{ Params: { id: string } }>('/_x/tournaments/:id/force-end', { preHandler: adminOnly }, async (request, reply) => {
    const t = await (prisma as any).tournament.findUnique({ where: { id: request.params.id } });
    if (!t) return reply.code(404).send({ error: 'Not found' });

    const cycle = await (prisma as any).tournamentCycle.findFirst({
      where: { tournamentId: t.id },
      orderBy: { startsAt: 'desc' },
    });
    if (!cycle) return reply.code(404).send({ error: 'Cycle not found' });
    if (cycle.state === 'ended') return reply.code(400).send({ error: 'Cycle already ended' });

    const result = await payoutCycle(t, cycle);
    return reply.send({ ok: true, ...result });
  });

  app.patch<{ Params: { id: string; userId: string }; Body: { balance: number; reason?: string } }>(
    '/_x/tournaments/:id/participants/:userId/balance',
    { preHandler: adminOnly },
    async (request, reply) => {
      const { id, userId } = request.params;
      const { balance, reason } = request.body;

      if (!Number.isFinite(balance) || balance < 0) {
        return reply.code(400).send({ error: 'Invalid balance' });
      }

      if (!reason || reason.trim().length < 3) {
        return reply.code(400).send({ error: 'Reason required (min 3 chars)' });
      }

      const t = await (prisma as any).tournament.findUnique({ where: { id } });
      if (!t) return reply.code(404).send({ error: 'Tournament not found' });

      const cycle = await (prisma as any).tournamentCycle.findFirst({
        where: { tournamentId: t.id },
        orderBy: { startsAt: 'desc' },
      });
      if (!cycle) return reply.code(404).send({ error: 'Cycle not found' });

      const participant = await (prisma as any).tournamentParticipant.findUnique({
        where: { cycleId_userId: { cycleId: cycle.id, userId } },
      });
      if (!participant) return reply.code(404).send({ error: 'Participant not found' });

      await (prisma as any).tournamentParticipant.update({
        where: { id: participant.id },
        data: { balance: balance },
      });

      async function audit(params: {
        request: AuthenticatedRequest;
        action: string;
        targetType: string;
        targetId?: string | null;
        payloadBefore?: unknown;
        payloadAfter?: unknown;
        reason?: string;
      }) {
        try {
          const auditId = (globalThis as { crypto?: { randomUUID(): string } }).crypto?.randomUUID() ??
            `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          await (prisma as any).$executeRaw`
            INSERT INTO admin_audit_log (
              id, admin_user_id, admin_telegram_id, action,
              target_type, target_id, payload_before, payload_after,
              reason, ip_address, created_at
            ) VALUES (
              ${auditId},
              ${params.request.user.userId},
              ${BigInt(params.request.user.telegramId)},
              ${params.action},
              ${params.targetType},
              ${params.targetId ?? null},
              ${params.payloadBefore !== undefined ? JSON.stringify(params.payloadBefore) : null}::jsonb,
              ${params.payloadAfter !== undefined ? JSON.stringify(params.payloadAfter) : null}::jsonb,
              ${params.reason ?? null},
              ${params.request.ip ?? null},
              NOW()
            )
          `;
        } catch (err) {
          logger.error({ err, params }, 'Failed to record admin audit log');
        }
      }

      await audit({
        request: request as AuthenticatedRequest,
        action: 'tournament.participant_balance.update',
        targetType: 'user',
        targetId: userId,
        payloadBefore: { balance: Number(participant.balance) },
        payloadAfter: { balance },
        reason: reason.trim(),
      });

      return reply.send({ ok: true });
    }
  );

  /* ------------------------------ public ------------------------------- */
  app.get('/tournaments', { preHandler: authenticate }, async (req, reply) => {
    const { userId } = (req as AuthenticatedRequest).user;
    const tournaments = await (prisma as any).tournament.findMany({ where: { active: true } });
    const now = Date.now();
    const enriched = await Promise.all(
      tournaments.map(async (t: any) => {
        const cycle = await ensureCycle(t);
        const participant = await (prisma as any).tournamentParticipant.findUnique({
          where: { cycleId_userId: { cycleId: cycle.id, userId } },
        });
        return {
          id: t.id,
          title: t.title,
          description: t.description,
          bannerUrl: t.bannerUrl,
          gameType: t.gameType,
          prizePool: toNumber(cycle.prizePool),
          prizeMode: t.prizeMode,
          winnersCount: t.winnersCount,
          fixedPrize: t.fixedPrize ? toNumber(t.fixedPrize) : null,
          startBalance: toNumber(t.startBalance),
          entryFee: toNumber(t.entryFee),
          rebuyFee: toNumber(t.rebuyFee),
          repeatType: t.repeatType,
          startsAt: cycle.startsAt.getTime(),
          endsAt: cycle.endsAt.getTime(),
          joined: Boolean(participant),
          tournamentBalance: participant ? toNumber(participant.balance) : null,
          live: now >= cycle.startsAt.getTime() && now <= cycle.endsAt.getTime(),
        };
      })
    );
    return reply.send({ ok: true, tournaments: enriched });
  });

  app.post<{ Params: { id: string } }>(
    '/tournaments/:id/join',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const t = await (prisma as any).tournament.findUnique({ where: { id: request.params.id } });
      if (!t || !t.active) return reply.code(404).send({ error: 'Not found' });
      const cycle = await ensureCycle(t);
      const now = Date.now();
      if (cycle.state === 'waiting') return reply.code(400).send({ error: 'Турнир еще не начался' });
      if (cycle.state === 'ended' || now > cycle.endsAt.getTime()) return reply.code(400).send({ error: 'Цикл завершён' });

      try {
        await prisma.$transaction(async (tx) => {
          const existing = await (tx as any).tournamentParticipant.findUnique({
            where: { cycleId_userId: { cycleId: cycle.id, userId } },
          });
          if (existing) return;

          const fee = toNumber(t.entryFee);
          if (fee > 0) {
            await debitRealBalance(tx, userId, fee, { tournamentId: t.id, cycleId: cycle.id, reason: 'join' });
          }

          await (tx as any).tournamentParticipant.create({
            data: {
              cycleId: cycle.id,
              userId,
              balance: t.startBalance,
              reachedAt: new Date(),
              refreshCount: 0,
            },
          });
        });
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }

      await balanceService.invalidateCache(userId);
      return reply.send({ ok: true });
    }
  );

  app.post<{ Params: { id: string } }>(
    '/tournaments/:id/leave',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const t = await (prisma as any).tournament.findUnique({ where: { id: request.params.id } });
      if (!t || !t.active) return reply.code(404).send({ error: 'Not found' });
      const cycle = await ensureCycle(t);
      if (cycle.state === 'ended' || Date.now() > cycle.endsAt.getTime()) return reply.code(400).send({ error: 'Цикл завершён' });

      try {
        await prisma.$transaction(async (tx) => {
          const participant = await (tx as any).tournamentParticipant.findUnique({
            where: { cycleId_userId: { cycleId: cycle.id, userId } },
          });
          if (!participant) throw new Error('Not registered');

          await (tx as any).tournamentParticipant.delete({
            where: { id: participant.id },
          });
        });
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }

      await balanceService.invalidateCache(userId);
      return reply.send({ ok: true });
    }
  );

  app.post<{ Params: { id: string } }>(
    '/tournaments/:id/refresh',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const t = await (prisma as any).tournament.findUnique({ where: { id: request.params.id } });
      if (!t || !t.active) return reply.code(404).send({ error: 'Not found' });
      const cycle = await ensureCycle(t);
      if (cycle.state === 'ended' || Date.now() > cycle.endsAt.getTime()) return reply.code(400).send({ error: 'Цикл завершён' });

      try {
        await prisma.$transaction(async (tx) => {
          const participant = await (tx as any).tournamentParticipant.findUnique({
            where: { cycleId_userId: { cycleId: cycle.id, userId } },
          });
          if (!participant) throw new Error('Not registered');
          if (toNumber(participant.balance) > 0) throw new Error('Balance must be <= 0 to refresh');

          // Check for unresolved bets
          const [{ count: activeBets }] = await (tx as any).$queryRaw`
            SELECT COUNT(*) as count FROM bets
            WHERE user_id = ${userId}
              AND state = 'active'
              AND metadata->>'tournamentCycleId' = ${cycle.id}
          `;
          if (Number(activeBets) > 0) {
            throw new Error('Нельзя обновить баланс, пока есть незавершенные турнирные ставки');
          }

          const fee = toNumber(t.rebuyFee);
          if (fee > 0) {
            await debitRealBalance(tx, userId, fee, { tournamentId: t.id, cycleId: cycle.id, reason: 'refresh' });
            await (tx as any).tournamentCycle.update({
              where: { id: cycle.id },
              data: { prizePool: new Prisma.Decimal(toNumber(cycle.prizePool) + fee * 0.9) },
            });
          }

          await (tx as any).tournamentParticipant.update({
            where: { id: participant.id },
            data: {
              balance: t.startBalance,
              refreshCount: participant.refreshCount + 1,
              reachedAt: new Date(),
              lastRefreshAt: new Date(),
            },
          });
        });
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }

      await balanceService.invalidateCache(userId);
      return reply.send({ ok: true });
    }
  );

  app.get<{ Params: { id: string } }>(
    '/tournaments/:id/leaderboard',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const t = await (prisma as any).tournament.findUnique({ where: { id: request.params.id } });
      if (!t) return reply.code(404).send({ error: 'Not found' });
      const cycle = await ensureCycle(t);
      let targetCycle = cycle;
      let isPreviousCycle = false;

      if (cycle.state === 'waiting') {
        const prevCycle = await (prisma as any).tournamentCycle.findFirst({
          where: { tournamentId: t.id, state: 'ended', endsAt: { lte: cycle.startsAt } },
          orderBy: { endsAt: 'desc' }
        });
        if (prevCycle) {
          targetCycle = prevCycle;
          isPreviousCycle = true;
        }
      }

      const participant = await (prisma as any).tournamentParticipant.findUnique({
        where: { cycleId_userId: { cycleId: targetCycle.id, userId } },
      });
      const rows = await (prisma as any).tournamentParticipant.findMany({
        where: { cycleId: targetCycle.id },
        include: { user: { select: { username: true, firstName: true, photoUrl: true } } },
        orderBy: [
          { balance: 'desc' },
          { reachedAt: 'asc' },
        ],
        take: 200,
      });
      // Fetch actual bets count from bets table for current cycle
      let betCounts: Array<{ user_id: string; cnt: string }> = [];
      try {
        betCounts = await (prisma as any).$queryRaw`
          SELECT user_id, COUNT(*)::text as cnt
          FROM bets
          WHERE metadata->>'tournamentCycleId' = ${targetCycle.id}
          GROUP BY user_id
        `;
      } catch (e) {
        logger.warn({ e, cycleId: targetCycle.id }, 'Failed to query tournament bet counts for leaderboard');
      }

      const betCountMap = new Map<string, number>();
      for (const b of betCounts) {
        betCountMap.set(b.user_id, Number(b.cnt));
      }

      const enrichedRows = rows.map((p: any) => {
        const betsCount = Math.max(Number(p.betsCount || 0), betCountMap.get(p.userId) || 0);
        const isQualified =
          betsCount >= MIN_TOURNAMENT_BETS_FOR_QUALIFICATION ||
          p.refreshCount > 0 ||
          toNumber(p.balance) <= 0;
        return {
          ...p,
          betsCount,
          isQualified,
        };
      });

      // Sort qualified first, then by balance desc, reachedAt asc
      enrichedRows.sort((a: any, b: any) => {
        if (a.isQualified !== b.isQualified) {
          return a.isQualified ? -1 : 1;
        }
        const balDiff = toNumber(b.balance) - toNumber(a.balance);
        if (balDiff !== 0) return balDiff;
        return new Date(a.reachedAt).getTime() - new Date(b.reachedAt).getTime();
      });

      const top = enrichedRows.slice(0, 50).map((p: any, idx: number) => ({
        place: idx + 1,
        userId: p.userId,
        user: p.user,
        balance: toNumber(p.balance),
        betsCount: p.betsCount,
        isQualified: p.isQualified,
        prize: p.isQualified
          ? computePrize(toNumber(cycle.prizePool), t.prizeMode as PrizeMode, idx, t.winnersCount, t.fixedPrize ? toNumber(t.fixedPrize) : null)
          : 0,
      }));
      const selfItem = enrichedRows.find((p: any) => p.userId === userId);
      const selfIndex = selfItem ? enrichedRows.indexOf(selfItem) : -1;
      const self = selfIndex === -1 ? null : {
        place: selfIndex + 1,
        balance: toNumber(selfItem.balance),
        betsCount: selfItem.betsCount,
        isQualified: selfItem.isQualified,
        minBetsRequired: MIN_TOURNAMENT_BETS_FOR_QUALIFICATION,
      };
      const enrichedTournament = {
        id: t.id,
        title: t.title,
        description: t.description,
        bannerUrl: t.bannerUrl,
        gameType: t.gameType,
        prizePool: toNumber(cycle.prizePool),
        prizeMode: t.prizeMode,
        winnersCount: t.winnersCount,
        fixedPrize: t.fixedPrize ? toNumber(t.fixedPrize) : null,
        startBalance: toNumber(t.startBalance),
        entryFee: toNumber(t.entryFee),
        rebuyFee: toNumber(t.rebuyFee),
        repeatType: t.repeatType,
        startsAt: cycle.startsAt.getTime(),
        endsAt: cycle.endsAt.getTime(),
        cycleState: cycle.state,
        joined: Boolean(participant),
        tournamentBalance: participant ? toNumber(participant.balance) : null,
        minBetsRequired: MIN_TOURNAMENT_BETS_FOR_QUALIFICATION,
      };
      return reply.send({ ok: true, leaderboard: top, self, tournament: enrichedTournament, isPreviousCycle });
    }
  );
}
