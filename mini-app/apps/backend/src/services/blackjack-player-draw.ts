/**
 * Player-side blackjack shoe tilt.
 *
 * Dealer 19/20/21 is left alone. Pressure is on the player's cards:
 *   - перебор — stiff hit busts a bit more
 *   - недобор — hits land 12–16 instead of 19–21
 *   - win streaks get extra squeeze so 5-in-a-row is rare
 * Hook (negative bias) must not flip this into a giveaway.
 */

export type BjPlayerDrawContext = 'deal_player' | 'player_hit' | 'player_double';

export interface BjPlayerDrawCtx {
  context: BjPlayerDrawContext;
  currentTotal: number;
  currentCards: number;
  winStreak: number;
  /** House-positive. Negative hook is capped so it cannot mint streaks. */
  bias: number;
}

export function playerWinStreak(
  history: Array<{ players: Array<{ userId: string; result: string }> }>,
  userId: string
): number {
  let n = 0;
  for (const round of history) {
    const p = round.players.find((x) => x.userId === userId);
    if (!p) continue;
    if (p.result === 'win' || p.result === 'blackjack') n += 1;
    else break;
  }
  return n;
}

function streakSqueeze(winStreak: number): number {
  if (winStreak >= 5) return 0.3;
  if (winStreak >= 4) return 0.22;
  if (winStreak >= 3) return 0.16;
  if (winStreak >= 2) return 0.08;
  return 0;
}

/** Tiny leftover hook help — never enough to farm a table. */
function hookHelp(bias: number): number {
  if (bias >= 0) return 0;
  return Math.min(0.1, Math.abs(bias) * 0.22);
}

function housePush(bias: number): number {
  return Math.max(0, bias) * 0.45;
}

/**
 * Relative weight for one candidate card after it is added to the hand.
 * Higher = more likely to be dealt. Never zero.
 */
export function playerCardWeight(simTotal: number, ctx: BjPlayerDrawCtx): number {
  const squeeze = streakSqueeze(ctx.winStreak);
  const house = housePush(ctx.bias);
  const help = hookHelp(ctx.bias);

  if (ctx.context === 'deal_player') {
    if (ctx.currentCards <= 0) {
      if (simTotal === 10 || simTotal === 11) return 0.9;
      return 1;
    }
    if (simTotal === 21) return Math.max(0.28, 0.58 * (1 - squeeze) * (1 - house * 0.5));
    if (simTotal === 20) return Math.max(0.4, 0.78 * (1 - squeeze * 0.7));
    if (simTotal >= 12 && simTotal <= 16) return 1.16 + squeeze + house * 0.25;
    if (simTotal >= 17 && simTotal <= 19) return 0.96;
    return 1;
  }

  if (ctx.context === 'player_double') {
    if (simTotal > 21) return 1.12 + squeeze + house;
    if (simTotal >= 19) return Math.max(0.35, 0.78 * (1 - squeeze * 0.55) * (1 - house * 0.3));
    if (simTotal >= 17) return 0.94;
    if (simTotal >= 12) return 1.14 + squeeze * 0.45;
    return 1;
  }

  // player_hit
  if (ctx.currentTotal >= 12 && ctx.currentTotal <= 16) {
    if (simTotal > 21) return 1.18 + squeeze + house;
    if (simTotal >= 17 && simTotal <= 21) {
      return Math.max(0.32, (0.7 - squeeze * 0.45) * (1 + help));
    }
    return 1.08 + squeeze * 0.35;
  }

  if (ctx.currentTotal >= 9 && ctx.currentTotal <= 11) {
    if (simTotal >= 19) return Math.max(0.4, 0.8 * (1 - squeeze * 0.45) * (1 - house * 0.25));
    if (simTotal >= 17) return 0.94;
    if (simTotal >= 12 && simTotal <= 16) return 1.14 + squeeze * 0.4;
    return 1;
  }

  if (ctx.currentTotal >= 17) {
    if (simTotal > 21) return 1.28 + squeeze;
    return 0.72;
  }

  return 1;
}
