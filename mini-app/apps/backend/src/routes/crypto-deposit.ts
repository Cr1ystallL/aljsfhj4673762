import type { FastifyInstance } from 'fastify';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { walletConfig } from '../services/wallet-config.js';
import { logger } from '../utils/logger.js';

export function cryptoDepositRoutes(app: FastifyInstance): void {
  // Fetch current exchange rate USDT/PLN
  app.get('/rates', async (_request, reply) => {
    try {
      const res = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=PLN');
      const json = (await res.json()) as any;
      const rate = Number(json?.rates?.PLN) || 3.9;
      return reply.send({ ok: true, rate });
    } catch {
      return reply.send({ ok: true, rate: 3.9 });
    }
  });

  // Get active pending direct crypto deposit for user
  app.get('/active', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;

    try {
      const rows = await app.prisma.$queryRaw<
        {
          id: string;
          network: string;
          requested_pln: string;
          unique_usdt: string;
          fx_rate: string;
          deposit_address: string;
          status: string;
          expires_at: Date;
          created_at: Date;
        }[]
      >`
        SELECT id, network, requested_pln, unique_usdt, fx_rate, deposit_address, status, expires_at, created_at
        FROM direct_crypto_deposits
        WHERE user_id = ${userId}
          AND status = 'pending'
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
      `;

      if (!rows.length) {
        return reply.send({ ok: true, activeDeposit: null });
      }

      const dep = rows[0];
      const remainingMs = new Date(dep.expires_at).getTime() - Date.now();
      const expiresInSeconds = Math.max(0, Math.floor(remainingMs / 1000));

      return reply.send({
        ok: true,
        activeDeposit: {
          id: dep.id,
          network: dep.network,
          requestedPln: Number(dep.requested_pln),
          uniqueUsdt: Number(dep.unique_usdt),
          fxRate: Number(dep.fx_rate),
          depositAddress: dep.deposit_address,
          status: dep.status,
          expiresInSeconds,
          createdAt: dep.created_at,
        },
      });
    } catch (err) {
      logger.error({ err, userId }, 'Failed to fetch active direct crypto deposit');
      return reply.send({ ok: true, activeDeposit: null });
    }
  });

  // Create new direct crypto deposit intent
  app.post<{
    Body: { amountPln: number; network: 'TRC20' | 'TON' | 'BEP20' };
  }>('/create', { preHandler: authenticate }, async (request, reply) => {
    const { userId, telegramId } = (request as AuthenticatedRequest).user;
    const amountPln = Number(request.body?.amountPln);
    const network = request.body?.network;

    if (!Number.isFinite(amountPln) || amountPln <= 0) {
      return reply.code(400).send({ error: 'Некорректная сумма' });
    }
    if (!['TRC20', 'TON', 'BEP20'].includes(network)) {
      return reply.code(400).send({ error: 'Некорректная крипто-сеть' });
    }

    const cfg = await walletConfig.get();
    if (!cfg.depositsEnabled) {
      return reply.code(403).send({ error: 'Пополнения временно отключены' });
    }
    if (amountPln < cfg.minDeposit) {
      return reply.code(400).send({ error: `Минимальный депозит ${cfg.minDeposit} PLN` });
    }

    // Determine deposit target wallet address
    let depositAddress = '';
    if (network === 'TRC20') depositAddress = cfg.walletTrc20;
    else if (network === 'TON') depositAddress = cfg.walletTon;
    else if (network === 'BEP20') depositAddress = cfg.walletBep20;

    if (!depositAddress) {
      return reply.code(500).send({ error: 'Адрес кошелька для данной сети не настроен' });
    }

    // Get current USDT rate
    let fxRate = 3.9;
    try {
      const res = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=PLN');
      const json = (await res.json()) as any;
      const parsedRate = Number(json?.rates?.PLN);
      if (parsedRate > 0) fxRate = parsedRate;
    } catch {}

    const baseUsdt = amountPln / fxRate;

    // Cancel existing pending deposits for this user first
    try {
      await app.prisma.$executeRaw`
        UPDATE direct_crypto_deposits
        SET status = 'cancelled', updated_at = NOW()
        WHERE user_id = ${userId} AND status = 'pending'
      `;
    } catch {}

    // Generate unique micro delta between 0.0010 and 0.0999 USDT
    let uniqueUsdt = Math.round((baseUsdt + (Math.floor(Math.random() * 900) + 10) / 10000) * 10000) / 10000;

    // Check collision with other active pending deposits
    try {
      const existing = await app.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM direct_crypto_deposits
        WHERE status = 'pending' AND unique_usdt = ${uniqueUsdt} AND expires_at > NOW()
      `;
      if (Number(existing[0]?.count || 0) > 0) {
        uniqueUsdt = Math.round((uniqueUsdt + 0.0001) * 10000) / 10000;
      }
    } catch {}

    const depositId = `CRYPTO-${Math.floor(100000 + Math.random() * 900000)}`;
    const expiresAt = new Date(Date.now() + 25 * 60 * 1000); // 25 minutes timer

    try {
      await app.prisma.$executeRaw`
        INSERT INTO direct_crypto_deposits (
          id, user_id, telegram_id, network, requested_pln,
          unique_usdt, fx_rate, deposit_address, status,
          expires_at, created_at, updated_at
        ) VALUES (
          ${depositId},
          ${userId},
          ${BigInt(telegramId)},
          ${network},
          ${amountPln}::numeric,
          ${uniqueUsdt}::numeric,
          ${fxRate}::numeric,
          ${depositAddress},
          'pending',
          ${expiresAt},
          NOW(),
          NOW()
        )
      `;

      return reply.send({
        ok: true,
        deposit: {
          id: depositId,
          network,
          requestedPln: amountPln,
          uniqueUsdt,
          fxRate,
          depositAddress,
          status: 'pending',
          expiresInSeconds: 25 * 60,
          createdAt: new Date(),
        },
      });
    } catch (err) {
      logger.error({ err, userId }, 'Failed to create direct crypto deposit');
      return reply.code(500).send({ error: 'Ошибка создания заявки' });
    }
  });

  // Cancel active deposit intent
  app.post<{ Body: { depositId: string } }>(
    '/cancel',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const depositId = request.body?.depositId;

      if (!depositId) {
        return reply.code(400).send({ error: 'ID заявки обязателен' });
      }

      try {
        await app.prisma.$executeRaw`
          UPDATE direct_crypto_deposits
          SET status = 'cancelled', updated_at = NOW()
          WHERE id = ${depositId} AND user_id = ${userId} AND status = 'pending'
        `;
        return reply.send({ ok: true });
      } catch (err) {
        logger.error({ err, depositId }, 'Failed to cancel direct crypto deposit');
        return reply.code(500).send({ error: 'Ошибка отмены заявки' });
      }
    }
  );
}
