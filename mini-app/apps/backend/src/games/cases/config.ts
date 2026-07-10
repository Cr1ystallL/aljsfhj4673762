/**
 * Cases Configuration.
 * 7 tiers of cases, exact 96% RTP.
 */

export interface CasePrize {
  id: string;
  amount: number;
  weight: number;
  color: string;
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
  const prizes = multipliers.map(m => basePrice * m);
  
  // Colors for prizes (from lowest to highest)
  const prizeColors = ['#b08d57', '#9e9e9e', '#4caf50', '#e0e0e0', '#2196f3', '#9c27b0', '#e91e63', '#ff9800', '#f44336'];
  
  return prizes.map((p, i) => ({
    id: `${multipliers[i]}x`,
    amount: p,
    weight: weights[i] ?? 0,
    color: prizeColors[i]
  }));
}

export function getCases(customWeights?: Record<string, number[]>, customPrices?: number[]): CaseTier[] {
  const defaultWeights = [35000, 12500, 10000, 35000, 4000, 2000, 1000, 400, 100];
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
      totalWeight: weights.reduce((a, b) => a + b, 0)
    };
  });
}

export const CASES = getCases();
