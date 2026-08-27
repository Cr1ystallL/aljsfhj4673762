/**
 * Sports Odds Calculation Engine
 *
 * Professional mathematical engine for real-time live & prematch sports betting odds.
 * Uses Poisson probability distributions, time-decay modeling, and margin application.
 */

export interface TeamStrength {
  attack: number; // Expected goals per 90 min (e.g. 1.8 for top teams, 1.1 for mid)
  defense: number; // Defensive multiplier (e.g. 0.8 is strong, 1.2 is leaky)
}

export interface LiveOddsResult {
  p1: number;
  x?: number;
  p2: number;
  total?: {
    threshold: number;
    over: number;
    under: number;
  };
  p1Trend?: 'up' | 'down' | 'same';
  xTrend?: 'up' | 'down' | 'same';
  p2Trend?: 'up' | 'down' | 'same';
}

/**
 * Poisson PMF calculation: P(k; λ) = (λ^k * e^-λ) / k!
 */
function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let factorial = 1;
  for (let i = 2; i <= k; i++) {
    factorial *= i;
  }
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial;
}

/**
 * Helper to clamp and round odds cleanly (e.g. 1.04, 3.85, 45.0)
 */
function formatOdds(odds: number): number {
  if (odds < 1.01) return 1.01;
  if (odds > 100) return Math.round(odds);
  if (odds > 20) return Math.round(odds * 2) / 2; // e.g. 21.5, 22.0
  if (odds > 10) return Math.round(odds * 10) / 10; // e.g. 10.5, 11.2
  return Math.round(odds * 100) / 100; // e.g. 1.74, 3.80
}

/**
 * Football (Soccer) Live Odds Calculator
 *
 * Models remaining goals as independent Poisson processes decaying with time.
 * Calculates exact probabilities of Win 1, Draw, Win 2, Over/Under.
 */
export function calculateFootballLiveOdds(
  minute: number,
  score1: number,
  score2: number,
  strength1: TeamStrength = { attack: 1.5, defense: 1.0 },
  strength2: TeamStrength = { attack: 1.2, defense: 1.1 },
  redCards1 = 0,
  redCards2 = 0
): LiveOddsResult {
  // Effective remaining time in 90-minute match
  const clampedMinute = Math.min(Math.max(minute, 0), 95);
  const remainingMinutes = Math.max(90 - clampedMinute, 1);
  const timeFactor = remainingMinutes / 90;

  // Expected remaining goals for each team
  // Red cards penalize attack by ~25% and worsen defense by ~20%
  const redPenalty1 = 1 - redCards1 * 0.25;
  const redPenalty2 = 1 - redCards2 * 0.25;

  const lambda1 = Math.max(0.01, strength1.attack * strength2.defense * timeFactor * redPenalty1);
  const lambda2 = Math.max(0.01, strength2.attack * strength1.defense * timeFactor * redPenalty2);

  // Maximum goals to evaluate in Poisson matrix (up to +6 goals in remaining time)
  const MAX_GOALS = 6;
  let prob1Wins = 0;
  let probDraw = 0;
  let prob2Wins = 0;

  for (let g1 = 0; g1 <= MAX_GOALS; g1++) {
    const pG1 = poissonPmf(g1, lambda1);
    for (let g2 = 0; g2 <= MAX_GOALS; g2++) {
      const pG2 = poissonPmf(g2, lambda2);
      const jointProb = pG1 * pG2;

      const finalScore1 = score1 + g1;
      const finalScore2 = score2 + g2;

      if (finalScore1 > finalScore2) {
        prob1Wins += jointProb;
      } else if (finalScore1 === finalScore2) {
        probDraw += jointProb;
      } else {
        prob2Wins += jointProb;
      }
    }
  }

  // Normalize probabilities to 1.0
  const totalProb = prob1Wins + probDraw + prob2Wins;
  const normP1 = Math.max(0.005, prob1Wins / totalProb);
  const normPX = Math.max(0.005, probDraw / totalProb);
  const normP2 = Math.max(0.005, prob2Wins / totalProb);

  // Standard bookmaker margin (approx 5.5%)
  const margin = 1.055;

  const rawOdds1 = margin / normP1;
  const rawOddsX = margin / normPX;
  const rawOdds2 = margin / normP2;

  // Dynamic Total Over / Under (e.g. 2.5)
  const currentTotal = score1 + score2;
  const expectedAdditional = lambda1 + lambda2;
  const threshold = currentTotal <= 1 ? 2.5 : currentTotal + 1.5;
  const goalsNeeded = threshold - currentTotal;
  let probUnder = 0;
  for (let g1 = 0; g1 <= MAX_GOALS; g1++) {
    for (let g2 = 0; g2 <= MAX_GOALS; g2++) {
      if (g1 + g2 < goalsNeeded) {
        probUnder += poissonPmf(g1, lambda1) * poissonPmf(g2, lambda2);
      }
    }
  }
  const normUnder = Math.min(Math.max(probUnder / totalProb, 0.05), 0.95);
  const normOver = 1 - normUnder;

  return {
    p1: formatOdds(rawOdds1),
    x: formatOdds(rawOddsX),
    p2: formatOdds(rawOdds2),
    total: {
      threshold,
      over: formatOdds(1.05 / normOver),
      under: formatOdds(1.05 / normUnder),
    },
  };
}

/**
 * Tennis Live Odds Calculator
 * Models match based on sets won, games in current set, and player rankings.
 */
export function calculateTennisLiveOdds(
  setScores1: number[],
  setScores2: number[],
  currentGames1 = 0,
  currentGames2 = 0,
  strength1 = 1.0,
  strength2 = 1.0
): LiveOddsResult {
  const setsWon1 = setScores1.filter((s, i) => s > (setScores2[i] ?? 0)).length;
  const setsWon2 = setScores2.filter((s, i) => s > (setScores1[i] ?? 0)).length;

  // Base strength ratio
  let p1Weight = strength1;
  let p2Weight = strength2;

  // Set advantage: +2.0 weight per set lead
  p1Weight += (setsWon1 - setsWon2) * 2.2;
  // Game advantage in current set
  p1Weight += (currentGames1 - currentGames2) * 0.35;

  const totalWeight = Math.max(0.1, p1Weight) + Math.max(0.1, p2Weight);
  const prob1 = Math.max(0.01, Math.min(0.99, Math.max(0.1, p1Weight) / totalWeight));
  const prob2 = 1 - prob1;

  const margin = 1.05;
  return {
    p1: formatOdds(margin / prob1),
    p2: formatOdds(margin / prob2),
  };
}

/**
 * Basketball Live Odds Calculator
 * Models point difference, remaining quarter time, and team pace.
 */
export function calculateBasketballLiveOdds(
  score1: number,
  score2: number,
  quarter: number, // 1 to 4
  secondsRemainingInQuarter: number,
  strength1 = 1.0,
  strength2 = 1.0
): LiveOddsResult {
  const diff = score1 - score2;
  const totalSecondsRemaining = Math.max(
    10,
    (4 - quarter) * 600 + secondsRemainingInQuarter
  );
  const remainingFraction = totalSecondsRemaining / 2400; // 40 min total

  // Standard deviation of point differential scales with sqrt(time)
  const volatility = 14 * Math.sqrt(remainingFraction);
  const zScore = (diff + (strength1 - strength2) * 4 * remainingFraction) / Math.max(1, volatility);

  // Approximate normal CDF: Φ(z)
  const prob1 = 1 / (1 + Math.exp(-1.7 * zScore));
  const prob2 = 1 - prob1;

  const margin = 1.05;
  return {
    p1: formatOdds(margin / Math.max(0.01, prob1)),
    p2: formatOdds(margin / Math.max(0.01, prob2)),
  };
}

/**
 * Esports (CS 2 / Dota 2) Live Odds Calculator
 */
export function calculateEsportsLiveOdds(
  mapsWon1: number,
  mapsWon2: number,
  rounds1 = 0,
  rounds2 = 0,
  strength1 = 1.0,
  strength2 = 1.0
): LiveOddsResult {
  let scoreDiff = (mapsWon1 - mapsWon2) * 8 + (rounds1 - rounds2) * 0.4;
  scoreDiff += (strength1 - strength2) * 2;

  const prob1 = 1 / (1 + Math.exp(-0.4 * scoreDiff));
  const prob2 = 1 - prob1;

  const margin = 1.05;
  return {
    p1: formatOdds(margin / Math.max(0.01, prob1)),
    p2: formatOdds(margin / Math.max(0.01, prob2)),
  };
}
