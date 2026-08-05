import type { FastifyInstance } from 'fastify';
import { randomUUID, randomBytes } from 'crypto';
import { rtpEngine } from '../services/rtp-engine.js';
import { authenticate, isAdminTelegramIdAsync, type AuthenticatedRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { balanceService } from '../services/balance-service.js';

/**
 * Bonuses — user-facing routes.
 *
 * Three pillars:
 *   - Promo codes:  POST /api/bonuses/promo/redeem
 *   - Lucky Wheel:  GET  /api/bonuses/wheel/state
 *                    POST /api/bonuses/wheel/spin
 *   - Contests:     GET  /api/bonuses/contests
 *                    GET  /api/bonuses/contests/:id
 *                    POST /api/bonuses/contests/:id/join  (private contests)
 *
 * Implementation note: the bonuses tables (`promo_codes`, `promo_redemptions`,
 * `bonus_wheel_spins`, `contests`, `contest_participants`) are created via
 * SQL migration; the generated Prisma client may not have them yet on a
 * given build, so we use raw SQL throughout. Once Prisma is regenerated
 * site-wide the file can be migrated to typed calls.
 */

/* ============================================================== Lucky Wheel */

/**
 * Sector pool — drawn proportionally to weight so the expected payout
 * per spin sits around 0.20 zł. Configurable per-spin floor 0.05 / cap
 * 1.00. Sum of weights = 100, no need to normalise.
 */
const LUCKY_SECTORS: ReadonlyArray<{ amount: number; weight: number }> = [
  { amount: 0.05, weight: 36 },
  { amount: 0.1, weight: 28 },
  { amount: 0.25, weight: 18 },
  { amount: 0.5, weight: 11 },
  { amount: 0.75, weight: 5 },
  { amount: 10.0, weight: 2 },
];

const SPIN_DAILY_CAP = 10;
const SPIN_COOLDOWN_MS = 20 * 60 * 1000;

function pickSector(): { amount: number; index: number } {
  const total = LUCKY_SECTORS.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < LUCKY_SECTORS.length; i++) {
    r -= LUCKY_SECTORS[i].weight;
    if (r <= 0) return { amount: LUCKY_SECTORS[i].amount, index: i };
  }
  return { amount: LUCKY_SECTORS[0].amount, index: 0 };
}

/* ================================================================ Routes */

export async function bonusesRoutes(app: FastifyInstance): Promise<void> {
  void initDepositBonuses(app);

  /* -------------------------------------------------- deposit bonuses */

  /**
   * GET /api/bonuses/deposit-offers
   * Returns list of available deposit bonuses and player's activation status.
   */
  app.get('/deposit-offers', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    try {
      const bonuses = await app.prisma.$queryRaw<
        Array<{
          id: string;
          title: string;
          description: string | null;
          banner_url: string | null;
          type: string;
          bonus_value: string;
          min_deposit: string;
          wager_multiplier: string;
          active: boolean;
        }>
      >`
        SELECT id, title, description, banner_url, type, bonus_value::text,
               min_deposit::text, wager_multiplier::text, active
        FROM deposit_bonuses
        WHERE active = true
        ORDER BY min_deposit ASC
      `;

      const userBonuses = await app.prisma.$queryRaw<
        Array<{ deposit_bonus_id: string; status: string }>
      >`
        SELECT deposit_bonus_id, status
        FROM user_deposit_bonuses
        WHERE user_id = ${userId}
      `;

      const userMap = new Map<string, string>();
      for (const u of userBonuses) {
        userMap.set(u.deposit_bonus_id, u.status);
      }

      const items = bonuses.map((b) => ({
        id: b.id,
        title: b.title,
        description: b.description,
        bannerUrl: b.banner_url,
        type: b.type,
        bonusValue: Number(b.bonus_value),
        minDeposit: Number(b.min_deposit),
        wagerMultiplier: Number(b.wager_multiplier),
        userStatus: userMap.get(b.id) || 'none', // 'active', 'used', 'none'
      }));

      return reply.send({ ok: true, offers: items });
    } catch (err) {
      logger.error(err, 'Failed to fetch deposit offers');
      return reply.code(500).send({ error: 'Failed to fetch deposit offers' });
    }
  });

  /**
   * POST /api/bonuses/deposit-offers/:id/toggle
   * Body: { action: 'activate' | 'deactivate' }
   */
  app.post<{ Params: { id: string }; Body: { action?: 'activate' | 'deactivate' } }>(
    '/deposit-offers/:id/toggle',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { id } = request.params;
      const action = request.body?.action ?? 'activate';

      try {
        const bonusRows = await app.prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM deposit_bonuses WHERE id = ${id} AND active = true LIMIT 1
        `;
        if (!bonusRows[0]) {
          return reply.code(404).send({ error: 'Депозитный бонус не найден' });
        }

        const userRows = await app.prisma.$queryRaw<Array<{ status: string }>>`
          SELECT status FROM user_deposit_bonuses
          WHERE deposit_bonus_id = ${id} AND user_id = ${userId}
          LIMIT 1
        `;

        if (userRows[0]?.status === 'used') {
          return reply.code(400).send({ error: 'Вы уже использовали этот разовый бонус' });
        }

        if (action === 'activate') {
          // Deactivate any other active deposit bonus for this user so only 1 is active
          await app.prisma.$executeRaw`
            UPDATE user_deposit_bonuses
            SET status = 'cancelled'
            WHERE user_id = ${userId} AND status = 'active'
          `;

          // Activate this bonus
          await app.prisma.$executeRaw`
            INSERT INTO user_deposit_bonuses (id, deposit_bonus_id, user_id, status, created_at)
            VALUES (gen_random_uuid()::text, ${id}, ${userId}, 'active', NOW())
            ON CONFLICT (deposit_bonus_id, user_id)
            DO UPDATE SET status = 'active'
          `;

          return reply.send({ ok: true, active: true });
        } else {
          // Deactivate
          await app.prisma.$executeRaw`
            UPDATE user_deposit_bonuses
            SET status = 'cancelled'
            WHERE deposit_bonus_id = ${id} AND user_id = ${userId}
          `;

          return reply.send({ ok: true, active: false });
        }
      } catch (err) {
        logger.error(err, 'Failed to toggle deposit bonus');
        return reply.code(500).send({ error: 'Failed to toggle deposit bonus' });
      }
    }
  );

  /* ----------------------------------------------------- promo codes */

  /**
   * POST /api/bonuses/promo/redeem
   * Body: { code: string }
   *
   * Looks up the code, validates limits, credits the bonus and writes
   * a redemption row + balance transaction in a single transaction.
   */
  app.post<{ Body: { code?: string } }>(
    '/promo/redeem',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const code = (request.body?.code ?? '').trim().toUpperCase();
      if (!code || code.length < 2 || code.length > 32) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Enter a valid promo code',
          code: 'INVALID_CODE',
        });
      }

      try {
        const result = await app.prisma.$transaction(async (tx) => {
          // Lock the row so concurrent redemptions can't double-spend
          // the per-user limit or the global cap.
          const rows = await tx.$queryRaw<
            Array<{
              id: string;
              code: string;
              amount: string;
              currency: string;
              max_redemptions: number | null;
              per_user_limit: number;
              expires_at: Date | null;
              active: boolean;
              rules: unknown;
            }>
          >`SELECT id, code, amount::text, currency, max_redemptions,
                   per_user_limit, expires_at, active, rules
              FROM promo_codes WHERE code = ${code} LIMIT 1 FOR UPDATE`;
          const promo = rows[0];
          if (!promo) {
            // Check if it's an affiliate code instead
            const affRows = await tx.$queryRaw<Array<{ user_id: string }>>`SELECT user_id FROM affiliate_promo_codes WHERE LOWER(code) = ${code.toLowerCase()} LIMIT 1`;
            const affPromo = affRows[0];
            if (affPromo) {
              const currentUser = await tx.user.findUnique({ where: { id: userId } });
              if (!currentUser) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');
              if (currentUser.referrerTelegramId) {
                throw new HttpError(400, 'ALREADY_HAVE_REFERRER', 'У вас уже есть реферер');
              }
              
              const affiliate = await tx.user.findUnique({ where: { id: affPromo.user_id } });
              if (!affiliate || affiliate.telegramId === currentUser.telegramId) {
                 throw new HttpError(400, 'INVALID_CODE', 'Нельзя использовать свой же промокод');
              }
              
              // Link user
              await tx.user.update({
                where: { id: userId },
                data: { referrerTelegramId: affiliate.telegramId }
              });
              
              // Add click stat
              await tx.$executeRaw`
                INSERT INTO affiliate_clicks (id, affiliate_telegram_id, timestamp)
                VALUES (${randomUUID()}, ${affiliate.telegramId}, NOW())
              `;

              return { isAffiliate: true };
            }

            throw new HttpError(404, 'PROMO_NOT_FOUND', 'Promo code not found');
          }
          if (!promo.active) {
            throw new HttpError(403, 'PROMO_INACTIVE', 'Promo code is no longer active');
          }
          if (promo.expires_at && new Date(promo.expires_at).getTime() < Date.now()) {
            throw new HttpError(403, 'PROMO_EXPIRED', 'Promo code has expired');
          }

          // Activation rules — same shape as contests' eligibility list.
          // Empty array (default) means "no conditions". Failure returns
          // a generic message; the rule label is included so the user
          // knows which gate they didn't pass.
          if (Array.isArray(promo.rules) && promo.rules.length > 0) {
            const failed = await checkActivationRules(
              tx,
              userId,
              promo.rules as Array<Record<string, unknown>>
            );
            if (failed) {
              throw new HttpError(403, 'PROMO_INELIGIBLE', failed);
            }
          }

          // Per-user usage —
          // perUserLimit < 1 means "unlimited" (admin opt-in).
          if (promo.per_user_limit > 0) {
            const own = await tx.$queryRaw<Array<{ n: bigint }>>`
              SELECT COUNT(*)::bigint AS n FROM promo_redemptions
               WHERE promo_code_id = ${promo.id} AND user_id = ${userId}`;
            const ownCount = Number(own[0]?.n ?? 0n);
            if (ownCount >= promo.per_user_limit) {
              throw new HttpError(409, 'PROMO_USED', 'You have already redeemed this code');
            }

            // [SECURITY] Check for Multi-Account Promo Abuse (same IP redeeming the same promo)
            if (request.ip) {
              const sameIpRedemptions = await app.prisma.$queryRaw<{ n: bigint }[]>`
                SELECT COUNT(*)::bigint AS n FROM promo_redemptions pr
                JOIN user_ip_addresses uia ON pr.user_id = uia.user_id
                WHERE pr.promo_code_id = ${promo.id} 
                  AND uia.ip_address = ${request.ip}
                  AND pr.user_id != ${userId}
              `;
              if (Number(sameIpRedemptions[0]?.n || 0) > 0) {
                // Another user on this EXACT IP already redeemed THIS promo. High probability of abuse!
                
                // 1. Block current user
                await app.prisma.user.update({
                  where: { id: userId },
                  data: {
                    isBlocked: true,
                    adminNote: `Auto-blocked for Promo Abuse. Claimed promo ${promo.code} on shared IP ${request.ip}`,
                  },
                });

                // 2. Log to admin audit
                await app.prisma.adminAuditLog.create({
                  data: {
                    adminUserId: 'system',
                    adminTelegramId: 0n,
                    action: 'user.auto_ban_promo_abuse',
                    targetType: 'user',
                    targetId: userId,
                    reason: `Автоматический бан: Абуз промокода ${promo.code} с IP адреса (${request.ip}), который уже использовал этот промокод на другом аккаунте.`,
                  }
                });

                // 3. Create Security Alert
                await app.prisma.securityAlert.create({
                  data: {
                    userId,
                    type: 'promo_abuse_detected',
                    severity: 'critical',
                    description: `Strict Multi-Account ban applied. Promo abuse on IP: ${request.ip}.`,
                  },
                });

                throw new HttpError(403, 'PROMO_ABUSE', 'Suspicious activity detected. Account blocked.');
              }
            }
          }
          // Global cap — values < 1 mean "unlimited" (sentinel from
          // the admin form, where -1 is the human input for ∞).
          if (promo.max_redemptions !== null && promo.max_redemptions > 0) {
            const total = await tx.$queryRaw<Array<{ n: bigint }>>`
              SELECT COUNT(*)::bigint AS n FROM promo_redemptions
               WHERE promo_code_id = ${promo.id}`;
            const totalCount = Number(total[0]?.n ?? 0n);
            if (totalCount >= promo.max_redemptions) {
              throw new HttpError(
                409,
                'PROMO_EXHAUSTED',
                'Promo code has reached its limit'
              );
            }
          }

          const amount = Number(promo.amount);
          if (!Number.isFinite(amount) || amount <= 0) {
            throw new HttpError(500, 'PROMO_BROKEN', 'Promo code is misconfigured');
          }

          // Credit balance + record txn + redemption row.
          const balRows = await tx.$queryRaw<
            Array<{ amount: string; version: number; free_cases_json: any }>
          >`SELECT amount::text, version, free_cases_json FROM balances
              WHERE user_id = ${userId} LIMIT 1 FOR UPDATE`;
          const before = Number(balRows[0]?.amount ?? 0);
          let after = before;
          
          if (promo.currency === 'FREE_CASES') {
            let caseId = 'case_1';
            let wager = 0;
            if (Array.isArray(promo.rules)) {
              const rewardRule = promo.rules.find((r: any) => r && r.type === 'free_cases_reward');
              if (rewardRule) {
                caseId = rewardRule.caseId || 'case_1';
                wager = Number(rewardRule.wager) || 0;
              }
            }
            const freeCasesJson = (balRows[0]?.free_cases_json as Record<string, { count: number, wager: number }>) || {};
            if (!freeCasesJson[caseId]) {
                freeCasesJson[caseId] = { count: 0, wager: 0 };
            }
            freeCasesJson[caseId].count += amount; // amount is spins count here
            freeCasesJson[caseId].wager = wager;
            
            const freeCasesAdd = caseId === 'case_1' ? amount : 0;
            await tx.$executeRaw`
              UPDATE balances SET free_cases_json = ${JSON.stringify(freeCasesJson)}::jsonb,
                                  free_cases = free_cases + ${freeCasesAdd},
                                  version = version + 1,
                                  last_synced_at = NOW(),
                                  updated_at = NOW()
                WHERE user_id = ${userId}`;
                
            await tx.$executeRaw`
              INSERT INTO transactions (id, user_id, type, amount, balance_before,
                                         balance_after, game_type, metadata, created_at)
              VALUES (${randomUUID()}, ${userId}, 'bonus', 0,
                      ${before}::numeric, ${after}::numeric, NULL,
                      ${JSON.stringify({
                        kind: 'promo_cases',
                        code: promo.code,
                        promoCodeId: promo.id,
                        spins: amount,
                        caseId
                      })}::jsonb, NOW())`;
          } else {
            after = +(before + amount).toFixed(2);
            await tx.$executeRaw`
              UPDATE balances SET amount = ${after}::numeric,
                                  wager_target = wager_target + (${amount} * 2)::numeric,
                                  auto_rtp_target = auto_rtp_target + (${amount} * 2)::numeric,
                                  version = version + 1,
                                  last_synced_at = NOW(),
                                  updated_at = NOW()
                WHERE user_id = ${userId}`;
            await tx.$executeRaw`
              INSERT INTO transactions (id, user_id, type, amount, balance_before,
                                         balance_after, game_type, metadata, created_at)
              VALUES (${randomUUID()}, ${userId}, 'bonus', ${amount}::numeric,
                      ${before}::numeric, ${after}::numeric, NULL,
                      ${JSON.stringify({
                        kind: 'promo',
                        code: promo.code,
                        promoCodeId: promo.id,
                      })}::jsonb, NOW())`;
          }

          await tx.$executeRaw`
            INSERT INTO promo_redemptions (id, promo_code_id, user_id, amount, created_at)
            VALUES (${randomUUID()}, ${promo.id}, ${userId}, ${amount}::numeric, NOW())`;

          return { amount, balance: after, isFreeCases: promo.currency === 'FREE_CASES' };
        });

        // Handle affiliate promo code return
        if ('isAffiliate' in result) {
          return reply.send({
            ok: true,
            message: 'Реферальный код успешно применён',
          });
        }

        // Invalidate the balance cache + push WS notification so the
        // frontend store updates immediately rather than waiting up to
        // 60s for the next stale-cache hit.
        await balanceService.invalidateCache(userId);
        const updatedBalance = await app.prisma.balance.findUnique({ where: { userId } });
        await balanceService.notifyBalance(
          userId, 
          result.balance, 
          Number(updatedBalance?.wagerTarget ?? 0), 
          Number(updatedBalance?.wagerProgress ?? 0), 
          Number(updatedBalance?.autoRtpTarget ?? 0), 
          Number(updatedBalance?.autoRtpProgress ?? 0)
        );

        // --- Auto-RTP Hook ---
        // Apply RTP "earn" mode with 80% loss intensity since it's a bonus
        try {
          if (!result.isFreeCases) {
            const target = Math.max(0, result.amount * 2);
            await rtpEngine.setUserConfig(userId, {
              mode: target > 0 ? 'earn' : 'off',
              target,
              windowMs: 6 * 60 * 60 * 1000,
              intensity: 0.8,
            }, { reset: true });
            await rtpEngine.getUserStatus(userId);
          }
        } catch (err) {
          logger.warn({ err, userId }, 'Auto-RTP set failed on promo code');
        }

        return reply.send({
          ok: true,
          amount: result.amount,
          balance: result.balance,
        });
      } catch (err) {
        if (err instanceof HttpError) {
          return reply.code(err.status).send({
            error: err.code,
            message: err.message,
            code: err.code,
          });
        }
        logger.error(err, 'Promo redeem failed');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to redeem promo code',
          code: 'PROMO_FAILED',
        });
      }
    }
  );

  /* ------------------------------------------------------ lucky wheel */

  /**
   * GET /api/bonuses/wheel/state
   * Returns daily quota left, cooldown progress, sector list and recent
   * spins for the live ticker.
   */
  app.get(
    '/wheel/state',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      try {
        const sinceMidnight = new Date();
        sinceMidnight.setHours(0, 0, 0, 0);
        const todayRows = await app.prisma.$queryRaw<
          Array<{ n: bigint; last: Date | null }>
        >`SELECT COUNT(*)::bigint AS n, MAX(created_at) AS last
            FROM bonus_wheel_spins
           WHERE user_id = ${userId} AND created_at >= ${sinceMidnight}`;
        const usedToday = Number(todayRows[0]?.n ?? 0n);
        const lastAt = todayRows[0]?.last
          ? new Date(todayRows[0].last).getTime()
          : null;
        const cooldownEndsAt =
          lastAt !== null ? lastAt + SPIN_COOLDOWN_MS : null;

        // Recent ticker — last 12 spins across all users, masked names.
        const ticker = await app.prisma.$queryRaw<
          Array<{
            amount: string;
            created_at: Date;
            user_id: string;
            first_name: string | null;
            username: string | null;
            photo_url: string | null;
          }>
        >`SELECT s.amount::text, s.created_at, s.user_id,
                 u.first_name, u.username, u.photo_url
            FROM bonus_wheel_spins s
            LEFT JOIN users u ON u.id = s.user_id
           ORDER BY s.created_at DESC
           LIMIT 12`;

        return reply.send({
          ok: true,
          sectors: LUCKY_SECTORS.map((s) => s.amount),
          dailyCap: SPIN_DAILY_CAP,
          cooldownMs: SPIN_COOLDOWN_MS,
          usedToday,
          remaining: Math.max(0, SPIN_DAILY_CAP - usedToday),
          cooldownEndsAt,
          ticker: ticker.map((t) => ({
            amount: Number(t.amount),
            at: t.created_at.getTime(),
            name:
              t.first_name?.trim() ||
              t.username?.trim() ||
              `id${t.user_id.slice(0, 4)}`,
            photoUrl: t.photo_url,
          })),
        });
      } catch (err) {
        logger.error(err, 'Wheel state failed');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to load wheel state',
          code: 'WHEEL_STATE_FAILED',
        });
      }
    }
  );

  /**
   * POST /api/bonuses/wheel/spin
   * Validates cooldown + daily quota, picks a sector, credits the
   * payout to the user's main balance.
   */
  app.post('/wheel/spin', { preHandler: authenticate }, async (request, reply) => {
    const { userId, telegramId } = (request as AuthenticatedRequest).user;
    try {
      const result = await app.prisma.$transaction(async (tx) => {
        const sinceMidnight = new Date();
        sinceMidnight.setHours(0, 0, 0, 0);
        const today = await tx.$queryRaw<
          Array<{ n: bigint; last: Date | null }>
        >`SELECT COUNT(*)::bigint AS n, MAX(created_at) AS last
            FROM bonus_wheel_spins
           WHERE user_id = ${userId} AND created_at >= ${sinceMidnight}`;
        const usedToday = Number(today[0]?.n ?? 0n);
        if (usedToday >= SPIN_DAILY_CAP) {
          throw new HttpError(429, 'DAILY_CAP', 'No more spins today, come back tomorrow');
        }
        const lastAt = today[0]?.last ? new Date(today[0].last).getTime() : null;
        if (lastAt !== null && Date.now() - lastAt < SPIN_COOLDOWN_MS) {
          const remaining = Math.ceil(
            (SPIN_COOLDOWN_MS - (Date.now() - lastAt)) / 1000
          );
          throw new HttpError(
            429,
            'COOLDOWN',
            `Wait ${Math.ceil(remaining / 60)} minute(s) before the next spin`
          );
        }

        const isAdmin = await isAdminTelegramIdAsync(telegramId);
        const { amount, index } = isAdmin ? { amount: 10.0, index: 5 } : pickSector();

        // Credit balance + write txn + spin row.
        const balRows = await tx.$queryRaw<
          Array<{ amount: string; version: number; free_cases_json: any }>
        >`SELECT amount::text, version, free_cases_json FROM balances
            WHERE user_id = ${userId} LIMIT 1 FOR UPDATE`;
        const before = Number(balRows[0]?.amount ?? 0);
        let after = before;
        
        if (amount === 10.0) {
          let currentJson = balRows[0]?.free_cases_json;
          if (typeof currentJson === 'string') {
            try { currentJson = JSON.parse(currentJson); } catch(e) { currentJson = {}; }
          }
          if (!currentJson || typeof currentJson !== 'object') currentJson = {};
          
          if (!currentJson['case_1']) currentJson['case_1'] = { count: 0, wager: 0 };
          currentJson['case_1'].count += 1;
          
          await tx.$executeRaw`
            UPDATE balances SET free_cases_json = ${JSON.stringify(currentJson)}::jsonb,
                                free_cases = free_cases + 1,
                                version = version + 1,
                                last_synced_at = NOW(),
                                updated_at = NOW()
              WHERE user_id = ${userId}`;
          await tx.$executeRaw`
            INSERT INTO transactions (id, user_id, type, amount, balance_before,
                                       balance_after, game_type, metadata, created_at)
            VALUES (${randomUUID()}, ${userId}, 'bonus', 0,
                    ${before}::numeric, ${before}::numeric, NULL,
                    ${JSON.stringify({ kind: 'lucky_wheel', sector: index, free_case: true })}::jsonb,
                    NOW())`;
        } else {
          after = +(before + amount).toFixed(2);
          await tx.$executeRaw`
            UPDATE balances SET amount = ${after}::numeric,
                                version = version + 1,
                                last_synced_at = NOW(),
                                updated_at = NOW()
              WHERE user_id = ${userId}`;
          await tx.$executeRaw`
            INSERT INTO transactions (id, user_id, type, amount, balance_before,
                                       balance_after, game_type, metadata, created_at)
            VALUES (${randomUUID()}, ${userId}, 'bonus', ${amount}::numeric,
                    ${before}::numeric, ${after}::numeric, NULL,
                    ${JSON.stringify({ kind: 'lucky_wheel', sector: index })}::jsonb,
                    NOW())`;
        }

        await tx.$executeRaw`
          INSERT INTO bonus_wheel_spins (id, user_id, amount, created_at)
          VALUES (${randomUUID()}, ${userId}, ${amount}::numeric, NOW())`;

        return { amount, index, balance: after, usedToday: usedToday + 1 };
      });

      // Push fresh balance to the WS subscriber so the home pill and
      // the bonuses page header update without polling.
      await balanceService.invalidateCache(userId);
      await balanceService.syncBalance(userId);

      return reply.send({
        ok: true,
        amount: result.amount,
        sectorIndex: result.index,
        balance: result.balance,
        remaining: Math.max(0, SPIN_DAILY_CAP - result.usedToday),
        cooldownEndsAt: Date.now() + SPIN_COOLDOWN_MS,
      });
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.status).send({
          error: err.code,
          message: err.message,
          code: err.code,
        });
      }
      logger.error(err, 'Wheel spin failed');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to spin the wheel',
        code: 'WHEEL_SPIN_FAILED',
      });
    }
  });

  /* -------------------------------------------------------- contests */

  /**
   * GET /api/bonuses/contests
   * Lists public contests that are scheduled or live, plus any private
   * contests the current user has joined.
   */
  app.get('/contests', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    try {
      const rows = await app.prisma.$queryRaw<
        Array<{
          id: string;
          title: string;
          description: string | null;
          visibility: string;
          banner_url: string | null;
          prize_pool: string;
          winners_count: number;
          prize_shares: unknown;
          rules: unknown;
          starts_at: Date;
          ends_at: Date;
          state: string;
          joined: boolean;
          participant_count: bigint;
        }>
      >`
        SELECT c.id, c.title, c.description, c.visibility, c.banner_url,
               c.prize_pool::text, c.winners_count, c.prize_shares,
               c.rules, c.starts_at, c.ends_at, c.state,
               EXISTS (
                 SELECT 1 FROM contest_participants p
                  WHERE p.contest_id = c.id AND p.user_id = ${userId}
               ) AS joined,
               (
                 SELECT COUNT(*)::bigint FROM contest_participants p
                  WHERE p.contest_id = c.id
               ) AS participant_count
          FROM contests c
         WHERE c.state IN ('scheduled', 'live')
           AND (
             c.visibility IN ('public', 'global')
             OR EXISTS (
               SELECT 1 FROM contest_participants p
                WHERE p.contest_id = c.id AND p.user_id = ${userId}
             )
           )
         ORDER BY c.ends_at ASC
         LIMIT 30`;
      return reply.send({
        ok: true,
        contests: rows.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          visibility: r.visibility,
          bannerUrl: r.banner_url,
          prizePool: Number(r.prize_pool),
          winnersCount: r.winners_count,
          prizeShares: r.prize_shares,
          rules: r.rules,
          startsAt: r.starts_at.getTime(),
          endsAt: r.ends_at.getTime(),
          state: r.state,
          joined: !!r.joined,
          participantCount: Number(r.participant_count),
        })),
      });
    } catch (err) {
      logger.error(err, 'List contests failed');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to load contests',
        code: 'CONTESTS_FAILED',
      });
    }
  });

  /**
   * POST /api/bonuses/contests/:id/join
   * Enrolls the user. Public contests can be joined freely; private
   * contests require the bot-issued token in the body (see ContestToken
   * note in admin.ts). For now both visibilities accept the call so
   * players can opt in from the page.
   */
  app.post<{ Params: { id: string } }>(
    '/contests/:id/join',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const id = request.params.id;
      try {
        const rows = await app.prisma.$queryRaw<
          Array<{
            id: string;
            state: string;
            visibility: string;
            rules: unknown;
          }>
        >`SELECT id, state, visibility, rules FROM contests WHERE id = ${id} LIMIT 1`;
        const contest = rows[0];
        if (!contest) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Contest not found',
            code: 'NOT_FOUND',
          });
        }
        if (contest.state !== 'scheduled' && contest.state !== 'live') {
          return reply.code(409).send({
            error: 'Conflict',
            message: 'Contest is closed',
            code: 'CONTEST_CLOSED',
          });
        }
        // Проверяем условия eligibility (rules конкурса) тем же
        // валидатором, что и для промокодов — только так гарантировано,
        // что пользователь, не выполнивший «депозит ≥ 100 за 30 дней»
        // и т.п., не сможет тыкнуть «Участвовать» в обход условий.
        // Глобальные конкурсы записывают всех — пропускаем проверку
        // (она всё равно делается при подсчёте победителей).
        if (contest.visibility !== 'global') {
          const rawRules = contest.rules;
          const rules: Array<Record<string, unknown>> = Array.isArray(rawRules)
            ? (rawRules as Array<Record<string, unknown>>)
            : [];
          if (rules.length > 0) {
            const failure = await checkActivationRules(
              app.prisma,
              userId,
              rules
            );
            if (failure) {
              return reply.code(403).send({
                error: 'Forbidden',
                message: failure,
                code: 'CONTEST_NOT_ELIGIBLE',
              });
            }
          }
        }
        await app.prisma.$executeRaw`
          INSERT INTO contest_participants (id, contest_id, user_id, banned, joined_at)
          VALUES (${randomUUID()}, ${id}, ${userId}, FALSE, NOW())
          ON CONFLICT (contest_id, user_id) DO NOTHING`;
        return reply.send({ ok: true });
      } catch (err) {
        logger.error(err, 'Contest join failed');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to join contest',
          code: 'JOIN_FAILED',
        });
      }
    }
  );

  /**
   * POST /api/bonuses/_bot/wheel/spin
   * Internal endpoint for the Telegram bot to spin the wheel.
   */
  app.post('/_bot/wheel/spin', async (request: any, reply: any) => {
    // Only allow localhost
    if (request.ip !== '127.0.0.1' && request.ip !== '::1') {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const { telegramId } = request.body as { telegramId: number };
    if (!telegramId) return reply.code(400).send({ error: 'telegramId required' });

    try {
      const userRows = await app.prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM users WHERE telegram_id = ${telegramId} LIMIT 1`;
      if (!userRows.length) return reply.code(404).send({ error: 'User not found' });
      const userId = userRows[0].id;

      const result = await app.prisma.$transaction(async (tx: any) => {
        const sinceMidnight = new Date();
        sinceMidnight.setHours(0, 0, 0, 0);
        const today = await tx.$queryRaw<
          Array<{ n: bigint; last: Date | null }>
        >`SELECT COUNT(*)::bigint AS n, MAX(created_at) AS last
            FROM bonus_wheel_spins
           WHERE user_id = ${userId} AND created_at >= ${sinceMidnight}`;
        const usedToday = Number(today[0]?.n ?? 0n);
        if (usedToday >= SPIN_DAILY_CAP) {
          throw new HttpError(429, 'DAILY_CAP', 'No more spins today');
        }
        const lastAt = today[0]?.last ? new Date(today[0].last).getTime() : null;
        if (lastAt !== null && Date.now() - lastAt < SPIN_COOLDOWN_MS) {
          const remaining = Math.ceil(
            (SPIN_COOLDOWN_MS - (Date.now() - lastAt)) / 1000
          );
          throw new HttpError(
            429,
            'COOLDOWN',
            remaining.toString()
          );
        }

        const isAdmin = await isAdminTelegramIdAsync(telegramId);
        const { amount, index } = isAdmin ? { amount: 10.0, index: 5 } : pickSector();

        // Credit balance + write txn + spin row.
        const balRows = await tx.$queryRaw<
          Array<{ amount: string; version: number; free_cases_json: any }>
        >`SELECT amount::text, version, free_cases_json FROM balances
            WHERE user_id = ${userId} LIMIT 1 FOR UPDATE`;
        const before = Number(balRows[0]?.amount ?? 0);
        let after = before;
        
        if (amount === 10.0) {
          let currentJson = balRows[0]?.free_cases_json;
          if (typeof currentJson === 'string') {
            try { currentJson = JSON.parse(currentJson); } catch(e) { currentJson = {}; }
          }
          if (!currentJson || typeof currentJson !== 'object') currentJson = {};
          
          if (!currentJson['case_1']) currentJson['case_1'] = { count: 0, wager: 0 };
          currentJson['case_1'].count += 1;
          
          await tx.$executeRaw`
            UPDATE balances SET free_cases_json = ${JSON.stringify(currentJson)}::jsonb,
                                free_cases = free_cases + 1,
                                version = version + 1,
                                last_synced_at = NOW(),
                                updated_at = NOW()
              WHERE user_id = ${userId}`;
          await tx.$executeRaw`
            INSERT INTO transactions (id, user_id, type, amount, balance_before,
                                       balance_after, game_type, metadata, created_at)
            VALUES (${randomUUID()}, ${userId}, 'bonus', 0,
                    ${before}::numeric, ${before}::numeric, NULL,
                    ${JSON.stringify({ kind: 'lucky_wheel', sector: index, free_case: true })}::jsonb,
                    NOW())`;
        } else {
          after = +(before + amount).toFixed(2);
          await tx.$executeRaw`
            UPDATE balances SET amount = ${after}::numeric,
                                version = version + 1,
                                last_synced_at = NOW(),
                                updated_at = NOW()
              WHERE user_id = ${userId}`;
          await tx.$executeRaw`
            INSERT INTO transactions (id, user_id, type, amount, balance_before,
                                       balance_after, game_type, metadata, created_at)
            VALUES (${randomUUID()}, ${userId}, 'bonus', ${amount}::numeric,
                    ${before}::numeric, ${after}::numeric, NULL,
                    ${JSON.stringify({ kind: 'lucky_wheel', sector: index })}::jsonb,
                    NOW())`;
        }
        await tx.$executeRaw`
          INSERT INTO bonus_wheel_spins (id, user_id, amount, created_at)
          VALUES (${randomUUID()}, ${userId}, ${amount}::numeric, NOW())`;

        return { amount, index, balance: after, usedToday: usedToday + 1 };
      });

      // Push fresh balance to the WS subscriber
      await balanceService.invalidateCache(userId);
      await balanceService.syncBalance(userId);

      return reply.send({
        ok: true,
        amount: result.amount,
        sectorIndex: result.index,
        balance: result.balance,
        remaining: Math.max(0, SPIN_DAILY_CAP - result.usedToday),
        cooldownEndsAt: Date.now() + SPIN_COOLDOWN_MS,
      });
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.status).send({
          error: err.code,
          message: err.message,
        });
      }
      logger.error(err, 'Bot wheel spin failed');
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });
}

/* ================================================================ helpers */

class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

/**
 * Run promo activation rules — same shape as contest eligibility:
 *   { type: 'deposit_window', amount: number, days: number }
 *   { type: 'wagered_window', amount: number, days: number }
 *   { type: 'deposit_total',  amount: number }
 *   { type: 'referrals',      count: number }
 *   { type: 'registered_after', date: ISO-8601 }
 *
 * Returns null if the user passes every rule, or a human message
 * describing the first rule the user failed.
 */
async function checkActivationRules(
  tx: { $queryRaw: <T>(s: TemplateStringsArray, ...vals: unknown[]) => Promise<T> },
  userId: string,
  rules: Array<Record<string, unknown>>
): Promise<string | null> {
  for (const r of rules) {
    if (!r || typeof r !== 'object') continue;
    if (r.type === 'deposit_window' || r.type === 'wagered_window') {
      const amount = Number(r.amount);
      const days = Number(r.days);
      if (!Number.isFinite(amount) || !Number.isFinite(days) || days <= 0) continue;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const txType =
        r.type === 'deposit_window'
          ? 'deposit'
          : 'bet';
      const rows = await tx.$queryRaw<Array<{ s: string }>>`
        SELECT COALESCE(SUM(amount), 0)::text AS s FROM transactions
         WHERE user_id = ${userId}
           AND type = ${txType}
           AND created_at >= ${since}`;
      const total = Math.abs(Number(rows[0]?.s ?? 0));
      if (total < amount) {
        // Сообщение видит пользователь в UI — пишем по-русски,
        // с указанием недостающей суммы. Раньше отдавали английский
        // текст, и игроки не понимали, чего от них хотят.
        const lack = Math.max(0, amount - total).toFixed(2);
        return r.type === 'deposit_window'
          ? `Не хватает ${lack} zł депозитов за последние ${days} дн.`
          : `Не хватает ${lack} zł оборота ставок за последние ${days} дн.`;
      }
    } else if (r.type === 'deposit_total') {
      const amount = Number(r.amount);
      if (!Number.isFinite(amount)) continue;
      const rows = await tx.$queryRaw<Array<{ s: string }>>`
        SELECT COALESCE(SUM(amount), 0)::text AS s FROM transactions
         WHERE user_id = ${userId} AND type = 'deposit'`;
      const total = Number(rows[0]?.s ?? 0);
      if (total < amount) {
        const lack = Math.max(0, amount - total).toFixed(2);
        return `Не хватает ${lack} zł депозитов за всё время`;
      }
    } else if (r.type === 'referrals') {
      // Referral system isn't shipped yet — treat as always-fail so
      // admins can't accidentally lock a code behind a non-existent
      // gate.
      const count = Number(r.count);
      if (!Number.isFinite(count) || count <= 0) continue;
      // TODO: replace with real referral lookup when partner/affiliate
      // ships. Keep the check skipped (pass) to avoid blocking promos.
      void count;
    } else if (r.type === 'registered_after') {
      const date =
        typeof r.date === 'string' ? new Date(r.date).getTime() : NaN;
      if (!Number.isFinite(date)) continue;
      const rows = await tx.$queryRaw<Array<{ created_at: Date }>>`
        SELECT created_at FROM users WHERE id = ${userId} LIMIT 1`;
      const createdAt = rows[0]?.created_at?.getTime() ?? 0;
      if (createdAt < date) {
        const human = new Date(date).toLocaleDateString('ru-RU');
        return `Доступно только аккаунтам, зарегистрированным после ${human}`;
      }
    }
  }
  return null;
}

/* ================================================================ Deposit Bonuses */

/**
 * Ensures deposit_bonuses and user_deposit_bonuses tables exist and seeds
 * initial 4 default deposit bonuses if empty.
 */
async function initDepositBonuses(app: FastifyInstance) {
  try {
    await app.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS deposit_bonuses (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        banner_url TEXT,
        type TEXT NOT NULL DEFAULT 'percent',
        bonus_value NUMERIC(12, 2) NOT NULL,
        min_deposit NUMERIC(12, 2) NOT NULL,
        wager_multiplier NUMERIC(12, 2) NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS user_deposit_bonuses (
        id TEXT PRIMARY KEY,
        deposit_bonus_id TEXT NOT NULL REFERENCES deposit_bonuses(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'active',
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT user_dep_bonus_unique UNIQUE (deposit_bonus_id, user_id)
      );
    `);

    const countRows = await app.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM deposit_bonuses
    `;
    if (Number(countRows[0]?.count ?? 0) === 0) {
      await app.prisma.$executeRawUnsafe(`
        INSERT INTO deposit_bonuses (id, title, description, banner_url, type, bonus_value, min_deposit, wager_multiplier, active)
        VALUES 
          (gen_random_uuid()::text, '🔥 +100% к депозиту', 'Получите дополнительно +100% к сумме пополнения при депозите от 100 zł.', NULL, 'percent', 100, 100, 50, true),
          (gen_random_uuid()::text, '⚡ +50 zł в подарок', 'Фиксированный подарок +50 zł на ваш счет при депозите от 100 zł.', NULL, 'fixed', 50, 100, 45, true),
          (gen_random_uuid()::text, '👑 VIP Booster +150%', 'Эксклюзивный хайроллер-бонус +150% к пополнению при депозите от 250 zł.', NULL, 'percent', 150, 250, 40, true),
          (gen_random_uuid()::text, '🚀 Стартовый бонус +50%', 'Лёгкий старт с бонусом +50% к депозиту от 50 zł.', NULL, 'percent', 50, 50, 30, true);
      `);
    }
  } catch (err) {
    logger.error(err, 'Failed to init deposit bonuses tables');
  }
}

// suppress unused — helper kept for future ref-link issuance
void randomBytes;

