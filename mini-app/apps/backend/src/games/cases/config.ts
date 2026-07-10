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
  const prizes = [basePrice * 0.1, basePrice * 0.2, basePrice * 0.5, basePrice, basePrice * 2.5, basePrice * 5, basePrice * 10, basePrice * 25, basePrice * 100];
  const targetEV = basePrice * 0.96;
  const targetSum = targetEV * 100000;
  
  // Base fixed weights for top prizes (out of 100,000)
  const weights = [0, 0, 0, 0, 4000, 2000, 1000, 400, 100];
  
  let remainingWeight = 100000 - weights.slice(4).reduce((a,b)=>a+b, 0);
  let remainingEV = targetSum - weights.slice(4).reduce((acc, w, i) => acc + w * prizes[i + 4], 0);
  
  // Assign W3 (basePrice) and W2 (basePrice * 0.5) to reasonable values
  weights[3] = 15000;
  weights[2] = 20000;
  remainingWeight -= (weights[2] + weights[3]);
  remainingEV -= (weights[2]*prizes[2] + weights[3]*prizes[3]);
  
  // W0*P0 + W1*P1 = remainingEV
  // W0 + W1 = remainingWeight
  // W0 = (remainingEV - remainingWeight * P1) / (P0 - P1)
  weights[0] = Math.round((remainingEV - remainingWeight * prizes[1]) / (prizes[0] - prizes[1]));
  weights[1] = remainingWeight - weights[0];
  
  // Colors for prizes (from lowest to highest)
  const prizeColors = ['#9e9e9e', '#757575', '#4caf50', '#2196f3', '#9c27b0', '#ff9800', '#ff5722', '#e91e63', '#f44336'];
  
  return prizes.map((p, i) => ({
    id: `prize_${i}`,
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
