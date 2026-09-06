import type { VipTierConfig } from '../types/vip.js';

/** Real-money turnover required for 1 XP. */
export const VIP_ZL_PER_XP = 10;

/** XP granted per 1 zł of real-money wager. 10 zł = 1 XP. */
export const VIP_XP_PER_ZL = 1 / VIP_ZL_PER_XP;

export function xpFromWagerZl(wagerZl: number, xpPerZl: number = VIP_XP_PER_ZL): number {
  if (!Number.isFinite(wagerZl) || wagerZl <= 0 || !Number.isFinite(xpPerZl) || xpPerZl <= 0) {
    return 0;
  }
  return Math.floor(wagerZl * xpPerZl);
}

export function wagerRemainderAfterXp(wagerZl: number, xpPerZl: number = VIP_XP_PER_ZL): number {
  const xp = xpFromWagerZl(wagerZl, xpPerZl);
  const consumed = xpPerZl > 0 ? xp / xpPerZl : 0;
  return Math.round((Math.max(0, wagerZl) - consumed) * 100) / 100;
}

export const VIP_RANKS: readonly VipTierConfig[] = [
  {
    level: 0,
    id: 'none',
    name: 'No Rank',
    nameRu: 'Без ранга',
    minXp: 0,
    wagerZl: 0,
    cashbackPercent: 2,
    icon: '/Rangs/no_rang.png',
    rewardDescription: 'Начальный ранг',
    rewardType: 'none',
  },
  {
    level: 1,
    id: 'bronze',
    name: 'Bronze',
    nameRu: 'Бронза',
    minXp: 500,
    wagerZl: 500 * VIP_ZL_PER_XP,
    cashbackPercent: 3,
    icon: '/Rangs/Bronze.png',
    rewardDescription: 'Бесплатный обычный кейс',
    rewardType: 'free_case',
    rewardCaseId: 'starter',
  },
  {
    level: 2,
    id: 'silver',
    name: 'Silver',
    nameRu: 'Серебро',
    minXp: 1000,
    wagerZl: 1000 * VIP_ZL_PER_XP,
    cashbackPercent: 4,
    icon: '/Rangs/Silver.png',
    rewardDescription: '+30 zł на баланс',
    rewardType: 'balance',
    rewardBalance: 30,
  },
  {
    level: 3,
    id: 'gold',
    name: 'Gold',
    nameRu: 'Золото',
    minXp: 5000,
    wagerZl: 5000 * VIP_ZL_PER_XP,
    cashbackPercent: 5,
    icon: '/Rangs/Gold.png',
    rewardDescription: '+50 zł бонус + Стартовый кейс',
    rewardType: 'balance_and_case',
    rewardBalance: 50,
    rewardCaseId: 'starter',
  },
  {
    level: 4,
    id: 'platinum',
    name: 'Platinum',
    nameRu: 'Platinum',
    minXp: 25000,
    wagerZl: 25000 * VIP_ZL_PER_XP,
    cashbackPercent: 7,
    icon: '/Rangs/Platinum.png',
    rewardDescription: '50 zł фрибет на ставки + Приоритет при выводах',
    rewardType: 'freebet',
    rewardFreebetAmount: 50,
  },
  {
    level: 5,
    id: 'diamond',
    name: 'Diamond',
    nameRu: 'Diamond',
    minXp: 100000,
    wagerZl: 100000 * VIP_ZL_PER_XP,
    cashbackPercent: 10,
    icon: '/Rangs/Diamond.png',
    rewardDescription: '200 zł бонус + Повышенный кэшбэк 10%',
    rewardType: 'balance',
    rewardBalance: 200,
  },
] as const;

/**
 * Returns the active VIP tier based on accumulated XP.
 */
export function getVipTierByXp(xp: number): VipTierConfig {
  const safeXp = Math.max(0, Math.floor(xp || 0));
  for (let i = VIP_RANKS.length - 1; i >= 0; i--) {
    if (safeXp >= VIP_RANKS[i].minXp) {
      return VIP_RANKS[i];
    }
  }
  return VIP_RANKS[0];
}

/**
 * Returns the next VIP tier, or null if maximum tier (Diamond) reached.
 */
export function getNextVipTier(currentLevel: number): VipTierConfig | null {
  if (currentLevel >= VIP_RANKS.length - 1) return null;
  return VIP_RANKS[currentLevel + 1] || null;
}

/**
 * Calculates current level progress percentage and XP required for next rank.
 */
export function calculateVipProgress(xp: number) {
  const currentTier = getVipTierByXp(xp);
  const nextTier = getNextVipTier(currentTier.level);
  
  if (!nextTier) {
    return {
      currentTier,
      nextTier: null,
      progressPercent: 100,
      xpNeededForNext: 0,
    };
  }

  const range = nextTier.minXp - currentTier.minXp;
  const currentProgress = Math.max(0, xp - currentTier.minXp);
  const progressPercent = Math.min(100, Math.max(0, (currentProgress / range) * 100));
  const xpNeededForNext = Math.max(0, nextTier.minXp - xp);

  return {
    currentTier,
    nextTier,
    progressPercent,
    xpNeededForNext,
  };
}
