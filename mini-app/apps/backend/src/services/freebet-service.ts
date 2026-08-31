import { prisma } from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import { telegramApi } from '../lib/telegram-api.js';
import type { FreebetCampaignDto, UserFreebetDto, FreebetPayoutType, FreebetStatus } from '@casino/shared';

export class FreebetService {
  private tablesEnsured = false;

  constructor() {
    void this.ensureTables();
  }

  async ensureTables(): Promise<void> {
    if (this.tablesEnsured) return;
    try {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS freebet_campaigns (
          id VARCHAR(64) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          amount NUMERIC(12, 2) NOT NULL,
          trigger_type VARCHAR(32) NOT NULL DEFAULT 'deposit',
          min_deposit NUMERIC(12, 2) NOT NULL DEFAULT 0,
          min_odds NUMERIC(8, 2) NOT NULL DEFAULT 2.50,
          max_odds NUMERIC(8, 2) NOT NULL DEFAULT 35.00,
          min_legs INT NOT NULL DEFAULT 1,
          valid_days INT NOT NULL DEFAULT 7,
          payout_type VARCHAR(32) NOT NULL DEFAULT 'net_win',
          allowed_sports JSONB,
          max_per_user INT NOT NULL DEFAULT 1,
          active BOOLEAN NOT NULL DEFAULT true,
          created_by VARCHAR(64),
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `;
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS freebet_campaigns_active_trigger_idx
          ON freebet_campaigns (active, trigger_type);
      `;
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS user_freebets (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL,
          campaign_id VARCHAR(64),
          amount NUMERIC(12, 2) NOT NULL,
          min_odds NUMERIC(8, 2) NOT NULL DEFAULT 2.50,
          max_odds NUMERIC(8, 2) NOT NULL DEFAULT 35.00,
          min_legs INT NOT NULL DEFAULT 1,
          payout_type VARCHAR(32) NOT NULL DEFAULT 'net_win',
          allowed_sports JSONB,
          status VARCHAR(32) NOT NULL DEFAULT 'available',
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          bet_id VARCHAR(64),
          source_deposit_id VARCHAR(64),
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          used_at TIMESTAMP WITH TIME ZONE
        );
      `;
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS user_freebets_user_status_idx
          ON user_freebets (user_id, status);
      `;
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS user_freebets_status_expires_idx
          ON user_freebets (status, expires_at);
      `;
      this.tablesEnsured = true;
    } catch (err) {
      logger.error({ err }, 'Failed to ensure freebet tables');
    }
  }

  /**
   * Automatically grant freebets when a user deposits >= minDeposit.
   */
  async checkAndGrantDepositFreebets(
    userId: string,
    depositAmount: number,
    sourceDepositId?: string
  ): Promise<UserFreebetDto[]> {
    await this.ensureTables();
    try {
      const now = new Date();
      // Find all active deposit campaigns where depositAmount >= minDeposit
      const campaigns = await prisma.freebetCampaign.findMany({
        where: {
          active: true,
          triggerType: 'deposit',
          minDeposit: { lte: depositAmount },
        },
      });

      if (!campaigns.length) return [];

      const granted: UserFreebetDto[] = [];

      for (const camp of campaigns) {
        // Check how many freebets the user already received from this campaign
        const existingCount = await prisma.userFreebet.count({
          where: {
            userId,
            campaignId: camp.id,
          },
        });

        if (existingCount >= camp.maxPerUser) continue;

        const expiresAt = new Date(now.getTime() + camp.validDays * 24 * 60 * 60 * 1000);

        const freebet = await prisma.userFreebet.create({
          data: {
            userId,
            campaignId: camp.id,
            amount: camp.amount,
            minOdds: camp.minOdds,
            maxOdds: camp.maxOdds,
            minLegs: camp.minLegs,
            payoutType: camp.payoutType,
            allowedSports: camp.allowedSports ?? undefined,
            status: 'available',
            expiresAt,
            sourceDepositId,
          },
        });

        granted.push({
          id: freebet.id,
          userId: freebet.userId,
          campaignId: camp.id,
          campaignTitle: camp.title,
          amount: Number(freebet.amount),
          minOdds: Number(freebet.minOdds),
          maxOdds: Number(freebet.maxOdds),
          minLegs: freebet.minLegs,
          payoutType: freebet.payoutType as FreebetPayoutType,
          allowedSports: freebet.allowedSports as string[] | null,
          status: freebet.status as FreebetStatus,
          expiresAt: freebet.expiresAt.toISOString(),
          createdAt: freebet.createdAt.toISOString(),
        });

        // Notify user via Telegram
        void this.notifyFreebetGranted(userId, camp.title, Number(freebet.amount), Number(freebet.minOdds), camp.validDays);
      }

      return granted;
    } catch (err) {
      logger.error({ err, userId, depositAmount }, 'Failed to check and grant deposit freebets');
      return [];
    }
  }

  /**
   * Manual grant by admin
   */
  async grantManualFreebet(params: {
    userId: string;
    campaignId?: string;
    amount?: number;
    minOdds?: number;
    maxOdds?: number;
    minLegs?: number;
    validDays?: number;
    payoutType?: FreebetPayoutType;
    allowedSports?: string[] | null;
  }): Promise<UserFreebetDto> {
    await this.ensureTables();
    let camp = null;
    if (params.campaignId) {
      camp = await prisma.freebetCampaign.findUnique({ where: { id: params.campaignId } });
    }

    const amount = params.amount ?? (camp ? Number(camp.amount) : 25);
    const minOdds = params.minOdds ?? (camp ? Number(camp.minOdds) : 2.50);
    const maxOdds = params.maxOdds ?? (camp ? Number(camp.maxOdds) : 35.00);
    const minLegs = params.minLegs ?? (camp ? camp.minLegs : 1);
    const validDays = params.validDays ?? (camp ? camp.validDays : 7);
    const payoutType = params.payoutType ?? (camp ? (camp.payoutType as FreebetPayoutType) : 'net_win');
    const allowedSports = params.allowedSports ?? (camp?.allowedSports as string[] | null) ?? null;

    const expiresAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);

    const freebet = await prisma.userFreebet.create({
      data: {
        userId: params.userId,
        campaignId: params.campaignId ?? null,
        amount,
        minOdds,
        maxOdds,
        minLegs,
        payoutType,
        allowedSports: allowedSports ?? undefined,
        status: 'available',
        expiresAt,
      },
    });

    const title = camp?.title ?? `Фрибет ${amount} zł`;
    void this.notifyFreebetGranted(params.userId, title, amount, minOdds, validDays);

    return {
      id: freebet.id,
      userId: freebet.userId,
      campaignId: freebet.campaignId,
      campaignTitle: title,
      amount: Number(freebet.amount),
      minOdds: Number(freebet.minOdds),
      maxOdds: Number(freebet.maxOdds),
      minLegs: freebet.minLegs,
      payoutType: freebet.payoutType as FreebetPayoutType,
      allowedSports: freebet.allowedSports as string[] | null,
      status: freebet.status as FreebetStatus,
      expiresAt: freebet.expiresAt.toISOString(),
      createdAt: freebet.createdAt.toISOString(),
    };
  }

  /**
   * Get user's available active freebets
   */
  async getUserFreebets(userId: string): Promise<UserFreebetDto[]> {
    await this.ensureTables();
    const now = new Date();
    // Auto-expire outdated
    await prisma.userFreebet.updateMany({
      where: {
        userId,
        status: 'available',
        expiresAt: { lte: now },
      },
      data: { status: 'expired' },
    });

    const rows = await prisma.userFreebet.findMany({
      where: {
        userId,
        status: 'available',
        expiresAt: { gt: now },
      },
      include: {
        campaign: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      campaignId: r.campaignId,
      campaignTitle: r.campaign?.title ?? `Фрибет ${Number(r.amount)} zł`,
      amount: Number(r.amount),
      minOdds: Number(r.minOdds),
      maxOdds: Number(r.maxOdds),
      minLegs: r.minLegs,
      payoutType: r.payoutType as FreebetPayoutType,
      allowedSports: r.allowedSports as string[] | null,
      status: r.status as FreebetStatus,
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Validate and lock freebet for bet placement
   */
  async lockFreebetForBet(
    userId: string,
    freebetId: string,
    betSpec: { odds: number; legsCount: number; sports: string[] }
  ): Promise<UserFreebetDto> {
    const now = new Date();
    const fb = await prisma.userFreebet.findFirst({
      where: {
        id: freebetId,
        userId,
        status: 'available',
        expiresAt: { gt: now },
      },
      include: { campaign: { select: { title: true } } },
    });

    if (!fb) {
      throw new Error('Фрибет недоступен или истёк срок действия');
    }

    const minOdds = Number(fb.minOdds);
    const maxOdds = Number(fb.maxOdds);
    if (betSpec.odds < minOdds - 0.001) {
      throw new Error(`Минимальный коэффициент для этого фрибета: x${minOdds.toFixed(2)}`);
    }
    if (betSpec.odds > maxOdds + 0.001) {
      throw new Error(`Максимальный коэффициент для этого фрибета: x${maxOdds.toFixed(2)}`);
    }
    if (betSpec.legsCount < fb.minLegs) {
      throw new Error(`Минимум событий в купоне: ${fb.minLegs}`);
    }

    const allowed = fb.allowedSports as string[] | null;
    if (allowed && allowed.length > 0 && !allowed.includes('all')) {
      const allMatch = betSpec.sports.every((s) => allowed.includes(s));
      if (!allMatch) {
        throw new Error('Фрибет действует только на определенные виды спорта');
      }
    }

    // Lock freebet
    await prisma.userFreebet.update({
      where: { id: freebetId },
      data: { status: 'locked' },
    });

    return {
      id: fb.id,
      userId: fb.userId,
      campaignId: fb.campaignId,
      campaignTitle: fb.campaign?.title ?? `Фрибет ${Number(fb.amount)} zł`,
      amount: Number(fb.amount),
      minOdds: Number(fb.minOdds),
      maxOdds: Number(fb.maxOdds),
      minLegs: fb.minLegs,
      payoutType: fb.payoutType as FreebetPayoutType,
      allowedSports: fb.allowedSports as string[] | null,
      status: 'locked',
      expiresAt: fb.expiresAt.toISOString(),
      createdAt: fb.createdAt.toISOString(),
    };
  }

  /**
   * Settle freebet after match finish
   */
  async settleFreebet(
    freebetId: string,
    betId: string,
    state: 'won' | 'lost' | 'void'
  ): Promise<void> {
    try {
      if (state === 'void') {
        // Refund freebet back to available
        await prisma.userFreebet.update({
          where: { id: freebetId },
          data: { status: 'available', betId: null },
        });
      } else {
        // Mark as used
        await prisma.userFreebet.update({
          where: { id: freebetId },
          data: { status: 'used', usedAt: new Date(), betId },
        });
      }
    } catch (err) {
      logger.error({ err, freebetId, betId, state }, 'Failed to settle user freebet');
    }
  }

  private async notifyFreebetGranted(
    userId: string,
    title: string,
    amount: number,
    minOdds: number,
    validDays: number
  ): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { telegramId: true },
      });
      const chatId = user?.telegramId ? Number(user.telegramId) : 0;
      if (!chatId) return;

      const text = [
        `🎁 <b>ВАМ НАЧИСЛЕН ФРИБЕТ!</b>`,
        `🏷 <b>${title}</b>`,
        `💵 Номинал: <b>${amount.toFixed(2)} zł</b>`,
        `📈 Условие: кэф от <b>x${minOdds.toFixed(2)}</b>`,
        `⏳ Срок действия: <b>${validDays} дней</b>`,
        ``,
        `⚽ Используйте фрибет прямо сейчас в разделе «Спорт»!`,
      ].join('\n');

      await telegramApi.sendMessage(chatId, text);
    } catch (err) {
      logger.warn({ err, userId }, 'Failed to send freebet Telegram notification');
    }
  }
}

export const freebetService = new FreebetService();
