/**
 * Cases Configuration.
 * 7 tiers of cases, exact 96% RTP.
 */

import { distributePercentages } from '@casino/shared';

export interface CasePrize {
  id: string;
  amount: number;
  weight: number;
  color: string;
  /**
   * Published drop chance. The prizes of a tier always add up to exactly 100,
   * so the client never has to reconcile rounding of its own.
   */
  probabilityPercent: number;
}

export interface CaseTier {
  id: string;
  name: string;
  price: number;
  prizes: CasePrize[];
  totalWeight: number;
}

const TIER_MULTIPLIERS = [1, 5, 10, 50, 100, 500, 1000];
const TIER_NAMES = [
  'Обычный',
  'Обычный',
  'Необычный',
  'Редкий',
  'Эпический',
  'Легендарный',
  'Мифический'
];

function generateExactPrizes(basePrice: number, weights: number[]): CasePrize[] {
  const multipliers = [0.1, 0.2, 0.5, 1, 2.5, 5, 10, 25, 100];
  
  // Colors for prizes (from lowest to highest)
  const prizeColors = ['#b08d57', '#9e9e9e', '#4caf50', '#e0e0e0', '#2196f3', '#9c27b0', '#e91e63', '#ff9800', '#f44336'];

  const prizeWeights = multipliers.map((_, i) => weights[i] ?? 0);
  const percentages = distributePercentages(prizeWeights);

  return multipliers.map((m, i) => ({
    id: `${m}x`,
    amount: basePrice * m,
    weight: prizeWeights[i],
    color: prizeColors[i],
    probabilityPercent: percentages[i],
  }));
}

export function getCases(customWeights?: Record<string, number[]>, customPrices?: number[]): CaseTier[] {
  const defaultWeights = [35, 12.5, 10, 35, 4, 2, 1, 0.4, 0.1];
  const defaultPrices = [10, 50, 100, 500, 1000, 5000, 10000];
  
  return defaultPrices.map((defaultPrice, idx) => {
    const caseId = `case_${idx + 1}`;
    const weights = customWeights?.[caseId] || defaultWeights;
    const price = customPrices?.[idx] || defaultPrice;
    const prizes = generateExactPrizes(price, weights);
    return {
      id: caseId,
      name: TIER_NAMES[idx],
      price,
      prizes,
      // Summed over the prizes that can actually be drawn, so a stored config
      // with extra trailing weights cannot leave probability mass that the
      // draw would silently dump on the last prize.
      totalWeight: prizes.reduce((sum, prize) => sum + prize.weight, 0)
    };
  });
}

export const CASES = getCases();
