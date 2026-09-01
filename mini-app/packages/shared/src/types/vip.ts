export type VipRankId = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export type VipRewardType = 'none' | 'free_case' | 'balance' | 'balance_and_case' | 'freebet';

export interface VipTierConfig {
  level: number;
  id: VipRankId;
  name: string;
  nameRu: string;
  minXp: number;
  wagerZl: number;
  cashbackPercent: number;
  icon: string;
  rewardDescription: string;
  rewardType: VipRewardType;
  rewardBalance?: number;
  rewardCaseId?: string;
  rewardFreebetAmount?: number;
}

export interface VipStatusDto {
  xp: number;
  level: number;
  currentTier: VipTierConfig;
  nextTier: VipTierConfig | null;
  progressPercent: number;
  xpNeededForNext: number;
  claimedLevels: number[];
  unclaimedLevels: number[];
}

export interface CashbackStatusDto {
  available: boolean;
  amount: number;
  cashbackPercent: number;
  netLoss: number;
  totalWagered: number;
  totalWon: number;
  nextClaimAvailableAt: string | null;
  lastClaimedAt: string | null;
  rankName: string;
}
