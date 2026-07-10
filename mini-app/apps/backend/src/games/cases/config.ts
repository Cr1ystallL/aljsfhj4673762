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
  'Нищий',
  'Обычный',
  'Необычный',
  'Редкий',
  'Эпический',
  'Легендарный',
  'Мифический'
];

function generateExactPrizes(basePrice: number): CasePrize[] {
  const multipliers = [0.1, 0.2, 0.5, 1, 2.5, 5, 10, 25, 100];
  const prizes = multipliers.map(m => basePrice * m);
  const targetEV = basePrice * 0.96;
  const targetSum = targetEV * 100000;
  
  // Fixed weights exactly calculated for 96% EV:
  const weights = [35000, 12500, 10000, 35000, 4000, 2000, 1000, 400, 100];
  
  // Colors for prizes (from lowest to highest)
  const prizeColors = ['#9e9e9e', '#757575', '#4caf50', '#2196f3', '#9c27b0', '#ff9800', '#ff5722', '#e91e63', '#f44336'];
  
  return prizes.map((p, i) => ({
    id: `${multipliers[i]}x`,
    amount: p,
    weight: weights[i],
    color: prizeColors[i]
  }));
}

export const CASES: CaseTier[] = TIER_MULTIPLIERS.map((mult, idx) => {
  const price = 10 * mult;
  const prizes = generateExactPrizes(price);
  return {
    id: `case_${idx + 1}`,
    name: TIER_NAMES[idx],
    price,
    prizes,
    totalWeight: 100000
  };
});
