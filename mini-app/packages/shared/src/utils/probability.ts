/**
 * Shared probability helpers.
 */

/**
 * Turns raw weights into published percentages that add up to exactly 100.
 *
 * Rounding each share independently leaves the table short by up to a few
 * hundredths, and players do add published drop chances up — a list that stops
 * at 99.55% reads as rigged even when the draw itself is fair. The leftover
 * hundredths go to the shares with the largest truncated remainders (largest
 * remainder method), so every value stays within one unit of the last decimal
 * of its true share.
 *
 * Weights carrying no mass yield all zeros, because no share is defined then.
 */
export function distributePercentages(weights: number[], decimals = 2): number[] {
  if (weights.length === 0) return [];

  const positive = weights.map((weight) => (weight > 0 ? weight : 0));
  const total = positive.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return positive.map(() => 0);

  const scale = 10 ** decimals;
  const budget = 100 * scale;

  const exact = positive.map((weight) => (weight / total) * budget);
  const units = exact.map((value) => Math.floor(value));

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);

  let leftover = budget - units.reduce((sum, unit) => sum + unit, 0);
  for (let i = 0; leftover > 0; i += 1) {
    units[byRemainder[i % byRemainder.length].index] += 1;
    leftover -= 1;
  }

  return units.map((unit) => unit / scale);
}
