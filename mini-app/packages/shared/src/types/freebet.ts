import { z } from 'zod';

export type FreebetTriggerType = 'deposit' | 'welcome' | 'manual';
export type FreebetPayoutType = 'net_win' | 'full_win';
export type FreebetStatus = 'available' | 'locked' | 'used' | 'expired';

export interface FreebetCampaignDto {
  id: string;
  title: string;
  description?: string | null;
  amount: number;
  triggerType: FreebetTriggerType;
  minDeposit: number;
  minOdds: number;
  maxOdds: number;
  minLegs: number;
  validDays: number;
  payoutType: FreebetPayoutType;
  allowedSports?: string[] | null;
  maxPerUser: number;
  active: boolean;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  issuedCount?: number;
  usedCount?: number;
}

export interface UserFreebetDto {
  id: string;
  userId: string;
  campaignId?: string | null;
  campaignTitle?: string;
  amount: number;
  minOdds: number;
  maxOdds: number;
  minLegs: number;
  payoutType: FreebetPayoutType;
  allowedSports?: string[] | null;
  status: FreebetStatus;
  expiresAt: string;
  betId?: string | null;
  createdAt: string;
  usedAt?: string | null;
}

export const CreateFreebetCampaignSchema = z.object({
  title: z.string().min(1, 'Укажите название'),
  description: z.string().optional().nullable(),
  amount: z.number().min(1, 'Минимальный номинал 1 zł'),
  triggerType: z.enum(['deposit', 'welcome', 'manual']).default('deposit'),
  minDeposit: z.number().min(0).default(0),
  minOdds: z.number().min(1.01).max(35).default(2.50),
  maxOdds: z.number().min(1.01).max(35).default(35.00),
  minLegs: z.number().int().min(1).max(20).default(1),
  validDays: z.number().int().min(1).max(365).default(7),
  payoutType: z.enum(['net_win', 'full_win']).default('net_win'),
  allowedSports: z.array(z.string()).optional().nullable(),
  maxPerUser: z.number().int().min(1).default(1),
  active: z.boolean().default(true),
  reason: z.string().min(3, 'Укажите причину для аудита'),
});

export const GrantFreebetSchema = z.object({
  userIdOrTelegramId: z.string().min(1, 'Укажите ID пользователя или Telegram ID'),
  campaignId: z.string().optional(),
  amount: z.number().min(1).optional(),
  minOdds: z.number().min(1.01).max(35).optional(),
  maxOdds: z.number().min(1.01).max(35).optional(),
  minLegs: z.number().int().min(1).optional(),
  validDays: z.number().int().min(1).max(365).optional(),
  payoutType: z.enum(['net_win', 'full_win']).optional(),
  allowedSports: z.array(z.string()).optional().nullable(),
  reason: z.string().min(3, 'Укажите причину выдачи'),
});
