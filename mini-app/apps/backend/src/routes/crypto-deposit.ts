import type { FastifyInstance } from 'fastify';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { walletConfig } from '../services/wallet-config.js';
import { logger } from '../utils/logger.js';

async function ensureTable(app: FastifyInstance) {
  try {
    await app.prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS direct_crypto_deposits (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        telegram_id BIGINT NOT NULL,
        network VARCHAR(32) NOT NULL,
        requested_pln NUMERIC(20, 2) NOT NULL,
        unique_usdt NUMERIC(20, 4) NOT NULL,
        fx_rate NUMERIC(10, 4) NOT NULL,
        deposit_address TEXT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        tx_hash TEXT,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        paid_at TIMESTAMP WITH TIME ZONE,
        credit_tx_id VARCHAR(64)
      );
    `;

    // Auto-confirm CRYPTO-362364 deposit intent
    try {
      const depRows = await app.prisma.$queryRaw<Array<{ id: string; user_id: string; requested_pln: string; status: string }>>`
        SELECT id, user_id, requested_pln::text, status FROM direct_crypto_deposits WHERE id = 'CRYPTO-362364' LIMIT 1
      `;
      if (depRows[0] && depRows[0].status !== 'credited') {
        const d = depRows[0];
        const depAmt = Number(d.requested_pln);
        let bonusAmt = 0;
        let bonusRowId: string | null = null;
        const bRows = await app.prisma.$queryRaw<Array<{ id: string; bonus_value: string; min_deposit: string; type: string }>>`
          SELECT u.id, d.bonus_value::text, d.min_deposit::text, d.type
          FROM user_deposit_bonuses u
          JOIN deposit_bonuses d ON d.id = u.deposit_bonus_id
          WHERE u.user_id = ${d.user_id} AND u.status = 'active' AND d.active = true LIMIT 1
        `.catch(() => [] as any);
        if (bRows[0] && depAmt >= Number(bRows[0].min_deposit || 0)) {
          bonusRowId = bRows[0].id;
          bonusAmt = bRows[0].type === 'percent' ? Math.round(depAmt * (Number(bRows[0].bonus_value)/100) * 100)/100 : Number(bRows[0].bonus_value);
        }
        const tot = depAmt + bonusAmt;
        await app.prisma.$executeRaw`UPDATE direct_crypto_deposits SET status = 'credited', paid_at = NOW() WHERE id = 'CRYPTO-362364'`;
        if (bonusRowId) await app.prisma.$executeRaw`UPDATE user_deposit_bonuses SET status = 'used', used_at = NOW() WHERE id = ${bonusRowId}`;
        await app.prisma.$executeRaw`UPDATE users SET balance = balance + ${tot} WHERE id = ${d.user_id} OR telegram_id::text = ${d.user_id}`;
        await app.prisma.$executeRaw`
          INSERT INTO transactions (id, user_id, amount, type, description, created_at)
          VALUES (gen_random_uuid()::text, ${d.user_id}, ${tot}::numeric, 'deposit', ${`Крипто-депозит CRYPTO-362364 (+${depAmt} zł${bonusAmt > 0 ? `, Бонус +${bonusAmt} zł` : ''})`}, NOW())
        `.catch(() => {});
      }
    } catch {}

    // Credit 100 PLN to user 8142377897 and reset bonus status to active
    try {
      await app.prisma.$executeRaw`
        UPDATE users
        SET balance = balance + 100
        WHERE telegram_id = 8142377897 OR telegram_id::text = '8142377897'
      `;

      await app.prisma.$executeRaw`
        UPDATE user_deposit_bonuses
        SET status = 'active', used_at = NULL
        WHERE user_id IN (
          SELECT id FROM users WHERE telegram_id = 8142377897 OR telegram_id::text = '8142377897'
        )
      `;

      await app.prisma.$executeRaw`
        INSERT INTO transactions (id, user_id, amount, type, description, created_at)
        VALUES (
          gen_random_uuid()::text,
          (SELECT id FROM users WHERE telegram_id = 8142377897 OR telegram_id::text = '8142377897' LIMIT 1),
          100::numeric,
          'deposit',
          'Зачисление пополнения 100 zł (CRYPTO-362364)',
          NOW()
        )
      `.catch(() => {});
    } catch (e) {
      logger.error({ e }, 'Failed user 8142377897 credit and bonus reset');
    }
  } catch (err) {
    logger.error({ err }, 'Failed to ensure direct_crypto_deposits table');
  }
}

export async function cryptoDepositRoutes(app: FastifyInstance): Promise<void> {
  await ensureTable(app);

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
      const cfg = await walletConfig.get();

      let currentAddress = dep.deposit_address;
      if (dep.network === 'TRC20' && cfg.walletTrc20 && dep.deposit_address !== cfg.walletTrc20) {
        currentAddress = cfg.walletTrc20;
        await app.prisma.$executeRaw`UPDATE direct_crypto_deposits SET deposit_address = ${cfg.walletTrc20} WHERE id = ${dep.id}`;
      } else if (dep.network === 'TON' && cfg.walletTon && dep.deposit_address !== cfg.walletTon) {
        currentAddress = cfg.walletTon;
        await app.prisma.$executeRaw`UPDATE direct_crypto_deposits SET deposit_address = ${cfg.walletTon} WHERE id = ${dep.id}`;
      } else if (dep.network === 'BEP20' && cfg.walletBep20 && dep.deposit_address !== cfg.walletBep20) {
        currentAddress = cfg.walletBep20;
        await app.prisma.$executeRaw`UPDATE direct_crypto_deposits SET deposit_address = ${cfg.walletBep20} WHERE id = ${dep.id}`;
      }

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
          depositAddress: currentAddress,
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
          ${BigInt(telegramId || 0)},
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
