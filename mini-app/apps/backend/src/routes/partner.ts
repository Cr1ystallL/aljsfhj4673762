import type { FastifyInstance } from 'fastify';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { z } from 'zod';

export async function partnerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/stats', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    const { prisma } = await import('../lib/prisma.js');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        telegramId: true,
        revshareBalance: true,
        negativeCarryover: true
      }
    });

    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    const promo = await prisma.affiliatePromoCode.findFirst({
      where: { userId }
    });

    // Fetch daily stats for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const stats = await prisma.affiliateStatsDaily.findMany({
      where: {
        affiliateTelegramId: user.telegramId,
        date: { gte: thirtyDaysAgo }
      },
      orderBy: { date: 'asc' }
    });

    // Generate link if promo exists
    let link = null;
    if (promo) {
      // In production, we'd use the bot link from config
      link = `t.me/macvbet_bot?start=${promo.code}`;
    } else {
      link = `t.me/macvbet_bot?start=${user.telegramId.toString()}`;
    }

    // Convert Decimals to numbers for JSON serialization
    const serializedStats = stats.map(s => ({
      date: s.date.toISOString(),
      clicks: s.clicks,
      fdCount: s.fdCount,
      rdCount: s.rdCount,
      depSum: Number(s.depSum),
      ggr: Number(s.ggr),
      ngr: Number(s.ngr),
      income: Number(s.income)
    }));

    // Fetch minimum withdrawal limit
    const minWithdrawalConfig = await prisma.systemConfig.findUnique({
      where: { key: 'MIN_PARTNER_WITHDRAWAL' }
    });
    
    // Parse value, fallback to 50
    let minWithdrawal = 50;
    if (minWithdrawalConfig && minWithdrawalConfig.value) {
      try {
        const parsed = Number(JSON.parse(minWithdrawalConfig.value as string));
        if (!isNaN(parsed)) minWithdrawal = parsed;
      } catch (e) {}
    }

    // Fetch registrations count
    const registrations = await prisma.user.count({
      where: { referrerTelegramId: user.telegramId }
    });

    return {
      balance: Number(user.revshareBalance),
      negativeCarryover: Number(user.negativeCarryover),
      promoCode: promo?.code || null,
      link,
      minWithdrawal,
      registrations,
      stats: serializedStats
    };
  });

  const createPromoSchema = z.object({
    code: z.string().min(3).max(15).regex(/^[a-z0-9]+$/i, "Только английские буквы и цифры")
  });

  app.post('/promo', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    const { prisma } = await import('../lib/prisma.js');

    try {
      const { code } = createPromoSchema.parse(request.body);
      const lowerCode = code.toLowerCase();

      // Check if already exists
      const exists = await prisma.affiliatePromoCode.findUnique({
        where: { code: lowerCode }
      });

      if (exists) {
        return reply.code(400).send({ error: 'Этот промокод уже занят' });
      }

      const existingUserPromo = await prisma.affiliatePromoCode.findFirst({
        where: { userId }
      });

      if (existingUserPromo) {
        return reply.code(400).send({ error: 'У вас уже есть промокод' });
      }

      const newPromo = await prisma.affiliatePromoCode.create({
        data: {
          userId,
          code: lowerCode
        }
      });

      return { success: true, code: newPromo.code };
    } catch (e) {
      if (e instanceof z.ZodError) {
        return reply.code(400).send({ error: e.errors[0].message });
      }
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  app.post('/withdraw', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    const { prisma } = await import('../lib/prisma.js');

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { telegramId: true, revshareBalance: true }
      });

      if (!user) return reply.code(404).send({ error: 'User not found' });

      // Check min withdrawal
      const minWithdrawalConfig = await prisma.systemConfig.findUnique({
        where: { key: 'MIN_PARTNER_WITHDRAWAL' }
      });
      let minWithdrawal = 50;
      if (minWithdrawalConfig && minWithdrawalConfig.value) {
        try { minWithdrawal = Number(JSON.parse(minWithdrawalConfig.value as string)) || 50; } catch (e) {}
      }

      const balance = Number(user.revshareBalance);
      if (balance < minWithdrawal) {
        return reply.code(400).send({ error: `Минимальная сумма вывода: ${minWithdrawal}` });
      }

      if (balance <= 0) {
        return reply.code(400).send({ error: 'Недостаточно средств' });
      }

      await prisma.$transaction(async (tx) => {
        // Find user balance
        const bal = await tx.balance.findUnique({ where: { userId } });
        if (!bal) throw new Error('Balance not found');
        
        const balanceBefore = Number(bal.amount);
        const balanceAfter = balanceBefore + balance;

        // Reset revshareBalance
        await tx.user.update({
          where: { id: userId },
          data: { revshareBalance: 0 }
        });
        
        // Add to main balance
        await tx.balance.update({
          where: { userId },
          data: { amount: { increment: balance } }
        });

        // Add a transaction record for auditing
        await tx.transaction.create({
          data: {
            userId,
            amount: balance,
            balanceBefore,
            balanceAfter,
            type: 'affiliate_withdrawal',
            metadata: { type: 'transfer_to_main_balance' }
          }
        });
      });

      return { success: true, amount: balance };
    } catch (e) {
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });
}
