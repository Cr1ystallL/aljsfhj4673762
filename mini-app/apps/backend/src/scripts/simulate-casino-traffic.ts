/**
 * MACVBET Monte Carlo Game Engine Simulation
 * Simulates 100, 200, 300, 400 concurrent players across Crash, Mines, Wheel, Coinflip, Keno, and Cases.
 * Evaluates the real-world statistical impact of:
 *  - Hook / Plateau / Drain funnel (funnel-decision.ts)
 *  - Anti-Scalper and SmartDrain (mines-click-decision.ts & rtp-engine.ts)
 *  - Biased Provably Fair distributions (provably-fair.ts)
 *  - Wheel 30x math flaw (wheel-engine.ts)
 *  - Hidden Debt & Force-Loss mechanics
 */

import { createHash } from 'crypto';

export type FunnelPhase = 'hook' | 'plateau' | 'drain' | 'recapture' | 'normal';

export interface PlayerState {
  id: string;
  depositIndex: number;
  initialDeposit: number;
  balance: number;
  peakBalance: number;
  totalWagered: number;
  totalPayout: number;
  totalRounds: number;
  wins: number;
  losses: number;
  streak: number;
  sessionProfit: number;
  hiddenDebt: number;
  drainActive: boolean;
  drainRoundsLeft: number;
  scamEvents: number; // Suspicious 1st click mine busts, 7+ coinflip loss streaks, etc.
  bustOnRound: number | null;
  favoriteGame: 'crash' | 'mines' | 'wheel' | 'coinflip' | 'keno' | 'cases';
}

function hashToFloat(hash: string): number {
  const hex = hash.substring(0, 13);
  return parseInt(hex, 16) / Math.pow(2, 52);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// 1. Crash Outcome Formula (provably-fair.ts)
function generateCrashMultiplier(hash: string, bias: number): number {
  const b = clamp(bias, -1, 1);
  const u = hashToFloat(hash);
  let shiftedU = u;
  if (b > 0) {
    shiftedU = Math.max(0, u - b * 0.35);
  } else if (b < 0) {
    shiftedU = Math.min(1 - 1e-6, u - b * 0.15);
  }
  const raw = (0.95 * (1 - Math.max(0, b * 0.15))) / (1 - shiftedU);
  const result = Math.floor(raw * 100) / 100;
  return Math.max(1.0, Math.min(10000, result));
}

// 2. Wheel Outcome (wheel-engine.ts)
const SLOT_LAYOUT = [
  30, 3, 2, 5, 2, 3, 2, 2, 5, 3, 2, 2, 3, 5, 3
]; // 15 segments: 6x (2x), 5x (3x), 3x (5x), 1x (30x)
const SEGMENT_COUNTS: Record<number, number> = { 2: 6, 3: 5, 5: 3, 30: 1 };

function pickWheelSegment(hash: string, bias: number): number {
  const b = clamp(bias, -1, 1);
  const baseCategoryWeight: Record<number, number> = {
    2: 6.0 * (1 + b * 0.15),
    3: 4.0 * (1 + b * 0.05),
    5: 2.4 * (1 - b * 0.2),
    30: 0.2 * (1 - b * 0.6),
  };
  const weights = SLOT_LAYOUT.map((m) =>
    Math.max(0.001, baseCategoryWeight[m] / SEGMENT_COUNTS[m])
  );
  const total = weights.reduce((a, x) => a + x, 0);
  const u = hashToFloat(hash);
  const target = u * total;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (target <= acc) return i;
  }
  return weights.length - 1;
}

// 3. Coinflip Outcome (provably-fair.ts)
function pickCoinflip(hash: string, choice: 'heads' | 'tails', bias: number): { outcome: 'heads' | 'tails'; won: boolean } {
  const b = clamp(bias, -1, 1);
  const winChance = Math.max(0.38, Math.min(0.62, 0.5 - b * 0.15));
  const u = hashToFloat(hash);
  const playerWins = u < winChance;
  return {
    won: playerWins,
    outcome: playerWins ? choice : choice === 'heads' ? 'tails' : 'heads'
  };
}

// 4. Mines Click Decision (mines-click-decision.ts)
function decideMinesClick(
  betAmount: number,
  potentialMultiplier: number,
  sessionProfit: number,
  streak: number,
  drainActive: boolean,
  funnelPhase: FunnelPhase,
  depositIndex: number
): { action: 'must_bust' | 'neutral'; reason: string } {
  const rng = Math.random();

  if (drainActive) {
    if (rng < 0.78) return { action: 'must_bust', reason: 'smartdrain' };
    return { action: 'neutral', reason: 'smartdrain_pass' };
  }

  // Scalp click: mult between 1.15 and 2.20
  if (potentialMultiplier >= 1.15 && potentialMultiplier <= 2.20) {
    let p = 0.5;
    if (sessionProfit > 0) p += Math.min(0.24, sessionProfit / 90);
    if (betAmount >= 8 && sessionProfit >= 0) p += 0.08;
    if (betAmount >= 16 && sessionProfit > 5) p += 0.08;
    if (sessionProfit < -20) p -= 0.08;
    const bustChance = clamp(p, 0.42, 0.86);
    if (rng < bustChance) return { action: 'must_bust', reason: 'mines_scalp_pressure' };
    return { action: 'neutral', reason: 'mines_scalp_live' };
  }

  if (streak >= 3) {
    let streakBustChance = 0.45;
    if (streak >= 5) streakBustChance = 0.7;
    else if (streak >= 4) streakBustChance = 0.58;
    if (sessionProfit > 15) streakBustChance = Math.min(0.8, streakBustChance + 0.1);
    if (potentialMultiplier >= 1.2 && rng < streakBustChance) {
      return { action: 'must_bust', reason: 'anti_scalper_streak' };
    }
  }

  if (funnelPhase === 'drain' || funnelPhase === 'recapture') {
    let bustChance = 0.58;
    if (potentialMultiplier >= 2.5) bustChance = 0.78;
    else if (potentialMultiplier >= 1.6) bustChance = 0.68;
    if (sessionProfit > 20) bustChance = Math.min(0.84, bustChance + 0.1);
    if (rng < bustChance) return { action: 'must_bust', reason: 'funnel_drain' };
  }

  return { action: 'neutral', reason: 'normal' };
}

// 5. Funnel Resolution (funnel-decision.ts)
function resolveFunnel(p: PlayerState): { phase: FunnelPhase; bias: number } {
  if (p.depositIndex === 1) {
    const hookCeiling = p.initialDeposit + 70;
    const ceilingBalance = p.initialDeposit * 1.85;

    if (p.balance < hookCeiling && p.totalWagered < p.initialDeposit * 2.5) {
      return { phase: 'hook', bias: -0.30 };
    } else if (p.balance >= hookCeiling && p.balance <= ceilingBalance) {
      return { phase: 'plateau', bias: 0.05 };
    } else if (p.balance > ceilingBalance) {
      return { phase: 'drain', bias: 0.40 };
    }
  }
  return { phase: 'normal', bias: 0.0 };
}

// --- Monte Carlo Simulation Engine ---

function createHashHex(round: number, userId: string): string {
  return createHash('sha256').update(`seed_${userId}_${round}_${Math.random()}`).digest('hex');
}

export interface SimulationSummary {
  playerCount: number;
  totalDeposits: number;
  totalWagered: number;
  totalPayouts: number;
  casinoGgr: number;
  casinoRtpPercent: number;
  bustedPlayersCount: number;
  bustedPercent: number;
  playersInProfitCount: number;
  playersInProfitPercent: number;
  avgRoundsPlayed: number;
  scamPerceptionAlerts: number;
  scamAlertsPerPlayer: number;
  funnelPhasesBreakdown: Record<string, number>;
  gameStats: Record<string, { bets: number; wagered: number; payouts: number; rtp: number }>;
}

export function runSimulation(playerCount: number, maxRoundsPerPlayer = 100): SimulationSummary {
  const players: PlayerState[] = [];
  const gameStats: Record<string, { bets: number; wagered: number; payouts: number }> = {
    crash: { bets: 0, wagered: 0, payouts: 0 },
    mines: { bets: 0, wagered: 0, payouts: 0 },
    wheel: { bets: 0, wagered: 0, payouts: 0 },
    coinflip: { bets: 0, wagered: 0, payouts: 0 },
    cases: { bets: 0, wagered: 0, payouts: 0 },
    keno: { bets: 0, wagered: 0, payouts: 0 },
  };

  const funnelPhaseHits: Record<string, number> = {
    hook: 0,
    plateau: 0,
    drain: 0,
    normal: 0,
  };

  // Initialize Players
  for (let i = 0; i < playerCount; i++) {
    // Deposit Distribution: 60% casual (50-100), 30% mid (100-300), 10% highroller (500-1000)
    let deposit = 50 + Math.floor(Math.random() * 50);
    const r = Math.random();
    if (r > 0.90) {
      deposit = 500 + Math.floor(Math.random() * 500);
    } else if (r > 0.60) {
      deposit = 100 + Math.floor(Math.random() * 200);
    }

    // Favorite game distribution
    const gameRoll = Math.random();
    let favoriteGame: PlayerState['favoriteGame'] = 'crash';
    if (gameRoll < 0.35) favoriteGame = 'crash';
    else if (gameRoll < 0.60) favoriteGame = 'mines';
    else if (gameRoll < 0.75) favoriteGame = 'wheel';
    else if (gameRoll < 0.88) favoriteGame = 'coinflip';
    else if (gameRoll < 0.94) favoriteGame = 'cases';
    else favoriteGame = 'keno';

    players.push({
      id: `usr_${i + 1}`,
      depositIndex: 1,
      initialDeposit: deposit,
      balance: deposit,
      peakBalance: deposit,
      totalWagered: 0,
      totalPayout: 0,
      totalRounds: 0,
      wins: 0,
      losses: 0,
      streak: 0,
      sessionProfit: 0,
      hiddenDebt: 0,
      drainActive: false,
      drainRoundsLeft: 0,
      scamEvents: 0,
      bustOnRound: null,
      favoriteGame,
    });
  }

  // Simulate Player Activity
  for (const player of players) {
    for (let round = 1; round <= maxRoundsPerPlayer; round++) {
      if (player.balance < 2) {
        player.bustOnRound = round;
        break;
      }

      // Bet Sizing: between 2% and 8% of current balance, min 2 PLN
      let bet = Math.max(2, Math.floor(player.balance * (0.03 + Math.random() * 0.05)));
      if (bet > player.balance) bet = player.balance;

      player.balance -= bet;
      player.totalWagered += bet;
      player.totalRounds += 1;

      // 1. Resolve Funnel & Bias
      const funnel = resolveFunnel(player);
      funnelPhaseHits[funnel.phase] = (funnelPhaseHits[funnel.phase] || 0) + 1;
      let bias = funnel.bias;

      // Check SmartDrain
      if (player.drainActive) {
        bias = 0.32;
      }

      // Check Hidden Debt (if net win >= 5x stake occurred previously)
      if (player.hiddenDebt > 0 && Math.random() < 0.50) {
        bias = Math.max(bias, 0.40);
      }

      const hash = createHashHex(round, player.id);
      let payout = 0;
      let won = false;

      // 2. Play Selected Game
      const g = player.favoriteGame;
      gameStats[g].bets += 1;
      gameStats[g].wagered += bet;

      if (g === 'crash') {
        const crashPoint = generateCrashMultiplier(hash, bias);
        // Player target cashout: mostly 1.3x to 2.5x, occasional 5x+
        const targetMult = 1.25 + Math.random() * 1.5;
        if (crashPoint >= targetMult) {
          won = true;
          payout = Math.floor(bet * targetMult * 100) / 100;
        } else {
          won = false;
          payout = 0;
        }
      } else if (g === 'mines') {
        // Typical casual choice: 3 mines out of 25 (safe prob = 88% on click 1)
        // Scalper choice: 1-2 clicks target multiplier 1.25x - 1.50x
        const targetMult = 1.35;
        const decision = decideMinesClick(
          bet,
          targetMult,
          player.sessionProfit,
          player.streak,
          player.drainActive,
          funnel.phase,
          player.depositIndex
        );

        if (decision.action === 'must_bust') {
          won = false;
          payout = 0;
          // SCAM PERCEPTION EVENT:
          // Player hit a mine on 1st click on low risk board!
          player.scamEvents += 1;
        } else {
          // Natural 3-mine click: 22/25 = 88% win on click 1
          won = Math.random() < 0.85;
          payout = won ? Math.floor(bet * targetMult * 100) / 100 : 0;
        }
      } else if (g === 'wheel') {
        const segIdx = pickWheelSegment(hash, bias);
        const mult = SLOT_LAYOUT[segIdx];
        // Player randomly bets on 2x (40%), 3x (30%), 5x (20%), 30x (10%)
        const pickRoll = Math.random();
        const pickMult = pickRoll < 0.4 ? 2 : pickRoll < 0.7 ? 3 : pickRoll < 0.9 ? 5 : 30;

        if (mult === pickMult) {
          won = true;
          payout = bet * mult;
        } else {
          won = false;
          payout = 0;
          // If betting on 30x repeatedly and losing
          if (pickMult === 30 && player.streak <= -10) {
            player.scamEvents += 1;
          }
        }
      } else if (g === 'coinflip') {
        const choice = Math.random() < 0.5 ? 'heads' : 'tails';
        const res = pickCoinflip(hash, choice, bias);
        won = res.won;
        payout = won ? Math.floor(bet * 1.94 * 100) / 100 : 0;
        if (!won && player.streak <= -6) {
          player.scamEvents += 1; // 6+ losses in a row on 50/50
        }
      } else if (g === 'cases') {
        // Tier 1 case: 10 PLN base, 96% RTP distribution
        const u = hashToFloat(hash);
        if (u < 0.35) payout = bet * 0.1;
        else if (u < 0.475) payout = bet * 0.2;
        else if (u < 0.575) payout = bet * 0.5;
        else if (u < 0.925) payout = bet * 1.0;
        else if (u < 0.965) payout = bet * 2.5;
        else if (u < 0.985) payout = bet * 5.0;
        else if (u < 0.995) payout = bet * 10.0;
        else if (u < 0.999) payout = bet * 25.0;
        else payout = bet * 100.0;
        won = payout >= bet;
      } else {
        // Keno
        const u = hashToFloat(hash);
        won = u < 0.30;
        payout = won ? bet * (1.5 + Math.random() * 2.5) : 0;
      }

      // 3. Update Balances & Stats
      player.balance += payout;
      player.totalPayout += payout;
      gameStats[g].payouts += payout;

      const net = payout - bet;
      player.sessionProfit += net;

      if (won) {
        player.wins += 1;
        player.streak = player.streak > 0 ? player.streak + 1 : 1;
        if (player.balance > player.peakBalance) {
          player.peakBalance = player.balance;
        }
        // Hidden debt logic
        if (payout >= bet * 6) {
          player.hiddenDebt += (payout - bet);
        }
        // Decrement drain rounds if active
        if (player.drainActive) {
          player.drainRoundsLeft -= 1;
          if (player.drainRoundsLeft <= 0) {
            player.drainActive = false;
          }
        }
      } else {
        player.losses += 1;
        player.streak = player.streak < 0 ? player.streak - 1 : -1;
        if (player.hiddenDebt > 0) {
          player.hiddenDebt = Math.max(0, player.hiddenDebt - bet);
        }
      }

      // 4. Check SmartDrain Auto-Trigger:
      // profit >= +75 PLN or win streak >= 4
      if (!player.drainActive && (player.streak >= 4 || player.sessionProfit >= 75)) {
        player.drainActive = true;
        player.drainRoundsLeft = player.sessionProfit > 150 ? 8 : 6;
      }
    }
  }

  // Aggregate Calculations
  const totalDeposits = players.reduce((sum, p) => sum + p.initialDeposit, 0);
  const totalWagered = players.reduce((sum, p) => sum + p.totalWagered, 0);
  const totalPayouts = players.reduce((sum, p) => sum + p.totalPayout, 0);
  const casinoGgr = totalWagered - totalPayouts;
  const casinoRtpPercent = totalWagered > 0 ? (totalPayouts / totalWagered) * 100 : 0;

  const bustedPlayers = players.filter((p) => p.balance < 2);
  const inProfitPlayers = players.filter((p) => p.balance > p.initialDeposit);
  const totalRoundsPlayed = players.reduce((sum, p) => sum + p.totalRounds, 0);
  const totalScamAlerts = players.reduce((sum, p) => sum + p.scamEvents, 0);

  const formattedGameStats: Record<string, { bets: number; wagered: number; payouts: number; rtp: number }> = {};
  for (const [key, val] of Object.entries(gameStats)) {
    formattedGameStats[key] = {
      bets: val.bets,
      wagered: Math.round(val.wagered),
      payouts: Math.round(val.payouts),
      rtp: val.wagered > 0 ? Math.round((val.payouts / val.wagered) * 10000) / 100 : 0,
    };
  }

  return {
    playerCount,
    totalDeposits,
    totalWagered: Math.round(totalWagered),
    totalPayouts: Math.round(totalPayouts),
    casinoGgr: Math.round(casinoGgr),
    casinoRtpPercent: Math.round(casinoRtpPercent * 100) / 100,
    bustedPlayersCount: bustedPlayers.length,
    bustedPercent: Math.round((bustedPlayers.length / playerCount) * 1000) / 10,
    playersInProfitCount: inProfitPlayers.length,
    playersInProfitPercent: Math.round((inProfitPlayers.length / playerCount) * 1000) / 10,
    avgRoundsPlayed: Math.round((totalRoundsPlayed / playerCount) * 10) / 10,
    scamPerceptionAlerts: totalScamAlerts,
    scamAlertsPerPlayer: Math.round((totalScamAlerts / playerCount) * 100) / 100,
    funnelPhasesBreakdown: funnelPhaseHits,
    gameStats: formattedGameStats,
  };
}

// CLI runner if invoked directly
function main() {
  console.log('================================================================');
  console.log('      MACVBET CASINO ENGINE MULTI-PLAYER MONTE CARLO AUDIT      ');
  console.log('================================================================\n');

  const cohorts = [100, 200, 300, 400];
  const results: SimulationSummary[] = [];

  for (const c of cohorts) {
    console.log(`Running simulation for cohort: ${c} active players (up to 100 rounds each)...`);
    const res = runSimulation(c, 100);
    results.push(res);
  }

  console.log('\n================================================================');
  console.log('                     SIMULATION RESULTS SUMMARY                 ');
  console.log('================================================================\n');

  console.table(
    results.map((r) => ({
      Players: r.playerCount,
      Deposits: `${r.totalDeposits.toLocaleString()} zł`,
      Turnover: `${r.totalWagered.toLocaleString()} zł`,
      Casino_GGR: `${r.casinoGgr.toLocaleString()} zł`,
      Actual_RTP: `${r.casinoRtpPercent}%`,
      Busted: `${r.bustedPlayersCount} (${r.bustedPercent}%)`,
      In_Profit: `${r.playersInProfitCount} (${r.playersInProfitPercent}%)`,
      Avg_Rounds: r.avgRoundsPlayed,
      Scam_Alerts: `${r.scamPerceptionAlerts} (${r.scamAlertsPerPlayer}/pl)`,
    }))
  );

  console.log('\n================================================================');
  console.log('            DETAILED PER-GAME RTP & DRAIN BREAKDOWN             ');
  console.log('================================================================\n');

  console.log('Cohort 400 Players Game Breakdown:');
  console.table(results[3].gameStats);

  console.log('\nCohort 400 Players Funnel Phase Hits:');
  console.table(results[3].funnelPhasesBreakdown);
}

main();
