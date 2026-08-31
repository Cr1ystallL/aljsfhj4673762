/**
 * Virtual-sports odds. Same math as the old client engine — Poisson
 * football/hockey, strength-weighted tennis / basketball / esports —
 * so the line the player sees is the line the server locks on bet.
 * Margin is baked in here; game-config houseEdge for sports is 0.
 */

export interface TeamStrength {
  attack: number;
  defense: number;
}

export interface LiveOddsResult {
  p1: number;
  x?: number;
  p2: number;
  available?: { p1: boolean; x?: boolean; p2: boolean };
  total?: {
    threshold: number;
    over: number;
    under: number;
  };
}

function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let factorial = 1;
  for (let i = 2; i <= k; i++) factorial *= i;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial;
}

export const MAX_SPORTS_ODDS = 35;

export function formatOdds(odds: number): number {
  if (odds < 1.01) return 1.01;
  if (odds >= MAX_SPORTS_ODDS) return MAX_SPORTS_ODDS;
  if (odds > 20) return Math.round(odds * 2) / 2;
  if (odds > 10) return Math.round(odds * 10) / 10;
  return Math.round(odds * 100) / 100;
}

function footballLikeOdds(
  minute: number,
  score1: number,
  score2: number,
  strength1: TeamStrength,
  strength2: TeamStrength,
  matchMinutes: number,
  redCards1 = 0,
  redCards2 = 0
): LiveOddsResult {
  const clampedMinute = Math.min(Math.max(minute, 0), matchMinutes + 5);
  const remainingMinutes = Math.max(matchMinutes - clampedMinute, 0);
  const timeFactor = Math.max(remainingMinutes, 0.15) / matchMinutes;

  const redPenalty1 = Math.max(0.4, 1 - redCards1 * 0.25);
  const redPenalty2 = Math.max(0.4, 1 - redCards2 * 0.25);

  const lambda1 = Math.max(
    0.01,
    strength1.attack * strength2.defense * timeFactor * redPenalty1
  );
  const lambda2 = Math.max(
    0.01,
    strength2.attack * strength1.defense * timeFactor * redPenalty2
  );

  const MAX_GOALS = 6;
  let prob1Wins = 0;
  let probDraw = 0;
  let prob2Wins = 0;

  for (let g1 = 0; g1 <= MAX_GOALS; g1++) {
    const pG1 = poissonPmf(g1, lambda1);
    for (let g2 = 0; g2 <= MAX_GOALS; g2++) {
      const joint = pG1 * poissonPmf(g2, lambda2);
      const final1 = score1 + g1;
      const final2 = score2 + g2;
      if (final1 > final2) prob1Wins += joint;
      else if (final1 === final2) probDraw += joint;
      else prob2Wins += joint;
    }
  }

  const totalProb = Math.max(1e-9, prob1Wins + probDraw + prob2Wins);
  let normP1 = prob1Wins / totalProb;
  let normPX = probDraw / totalProb;
  let normP2 = prob2Wins / totalProb;
  const margin = 1.055;
  const toBook = (p: number) => formatOdds(1 / (Math.max(0.008, p) * margin));

  const lead = score1 - score2;
  const remainMin = remainingMinutes;
  const pUnder = lead > 0 ? normP2 : lead < 0 ? normP1 : 0;
  const lockUnderdogWin =
    lead !== 0 &&
    (pUnder < 0.05 ||
      (Math.abs(lead) >= 1 && remainMin <= 5) ||
      (Math.abs(lead) >= 2 && remainMin <= 12));
  const lockDraw = lead !== 0 && normPX < 0.04 && remainMin <= 3 && Math.abs(lead) >= 2;

  if (lockUnderdogWin) {
    if (lead > 0) {
      normP1 = Math.max(normP1, 0.94);
      normP2 = 0;
    } else {
      normP2 = Math.max(normP2, 0.94);
      normP1 = 0;
    }
  }

  const currentTotal = score1 + score2;
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

  const p1Open = !(lockUnderdogWin && lead < 0);
  const p2Open = !(lockUnderdogWin && lead > 0);
  const xOpen = !lockDraw;

  return {
    p1: p1Open ? (lockUnderdogWin && lead > 0 ? 1.01 : toBook(normP1)) : 1.01,
    x: xOpen ? toBook(normPX) : 1.01,
    p2: p2Open ? (lockUnderdogWin && lead < 0 ? 1.01 : toBook(normP2)) : 1.01,
    available: { p1: p1Open, x: xOpen, p2: p2Open },
    total: {
      threshold,
      over: formatOdds(1 / (normOver * 1.05)),
      under: formatOdds(1 / (normUnder * 1.05)),
    },
  };
}

export function calculateFootballLiveOdds(
  minute: number,
  score1: number,
  score2: number,
  strength1: TeamStrength = { attack: 1.5, defense: 1.0 },
  strength2: TeamStrength = { attack: 1.2, defense: 1.1 },
  redCards1 = 0,
  redCards2 = 0
): LiveOddsResult {
  return footballLikeOdds(
    minute,
    score1,
    score2,
    strength1,
    strength2,
    90,
    redCards1,
    redCards2
  );
}

export function calculateHockeyLiveOdds(
  minute: number,
  score1: number,
  score2: number,
  strength1: TeamStrength = { attack: 2.8, defense: 1.0 },
  strength2: TeamStrength = { attack: 2.6, defense: 1.05 }
): LiveOddsResult {
  return footballLikeOdds(minute, score1, score2, strength1, strength2, 60);
}

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

  let p1Weight = strength1 + (setsWon1 - setsWon2) * 2.2 + (currentGames1 - currentGames2) * 0.35;
  let p2Weight = strength2;
  const totalWeight = Math.max(0.1, p1Weight) + Math.max(0.1, p2Weight);
  const prob1 = Math.max(0.01, Math.min(0.99, Math.max(0.1, p1Weight) / totalWeight));
  const margin = 1.05;
  return {
    p1: formatOdds(1 / (prob1 * margin)),
    p2: formatOdds(1 / ((1 - prob1) * margin)),
  };
}

export function calculateBasketballLiveOdds(
  score1: number,
  score2: number,
  quarter: number,
  secondsRemainingInQuarter: number,
  strength1 = 1.0,
  strength2 = 1.0
): LiveOddsResult {
  const diff = score1 - score2;
  const totalSecondsRemaining = Math.max(10, (4 - quarter) * 600 + secondsRemainingInQuarter);
  const remainingFraction = totalSecondsRemaining / 2400;
  const volatility = 14 * Math.sqrt(remainingFraction);
  const zScore =
    (diff + (strength1 - strength2) * 4 * remainingFraction) / Math.max(1, volatility);
  const prob1 = 1 / (1 + Math.exp(-1.7 * zScore));
  const margin = 1.05;
  return {
    p1: formatOdds(1 / (Math.max(0.01, prob1) * margin)),
    p2: formatOdds(1 / (Math.max(0.01, 1 - prob1) * margin)),
  };
}

export function calculateEsportsLiveOdds(
  mapsWon1: number,
  mapsWon2: number,
  rounds1 = 0,
  rounds2 = 0,
  team1Name = '',
  team2Name = ''
): LiveOddsResult {
  const r1 = getTeamPowerRating(team1Name);
  const r2 = getTeamPowerRating(team2Name);
  const ratingDiff = (r1 - r2) * 0.28;

  const scoreDiff =
    (mapsWon1 - mapsWon2) * 6.5 + (rounds1 - rounds2) * 0.35 + ratingDiff;
  const prob1 = 1 / (1 + Math.exp(-0.35 * scoreDiff));
  const margin = 1.055;
  return {
    p1: formatOdds(1 / (Math.max(0.01, prob1) * margin)),
    p2: formatOdds(1 / (Math.max(0.01, 1 - prob1) * margin)),
  };
}

const POWER_RANKINGS: Record<string, number> = {
  // Football Top Clubs
  'real madrid': 96, 'manchester city': 96, 'bayern': 94, 'arsenal': 93, 'liverpool': 94,
  'barcelona': 92, 'inter': 90, 'psg': 91, 'juventus': 86, 'chelsea': 88, 'atletico': 88,
  'bayer leverkusen': 90, 'borussia dortmund': 87, 'ac milan': 86, 'aston villa': 85,
  'tottenham': 85, 'manchester united': 84, 'newcastle': 84, 'sporting': 86, 'benfica': 84,
  'porto': 83, 'ajax': 80, 'roma': 83, 'feyenoord': 82, 'psv': 83,

  // CS2 Teams
  'natus vincere': 96, 'navi': 96, 'team vitality': 95, 'vitality': 95, 'spirit': 95,
  'faze clan': 93, 'faze': 93, 'g2 esports': 93, 'g2': 93, 'mouz': 92, 'mousesports': 92,
  'the mongolz': 90, 'mongolz': 90, 'eternal fire': 89, 'astralis': 88, 'virtus.pro': 88, 'vp': 88,
  'liquid': 88, 'heroic': 87, 'complexity': 85, 'furia': 87, 'pain': 84,
  'saw': 84, 'falcons': 92, 'cloud9': 85, 'big': 84, 'ence': 83,
  'gamerlegion': 84, 'nemiga': 80, 'parivision': 84, 'betboom': 90, 'passion ua': 81,
  'flyquest': 83, 'imperial': 83, 'monte': 82, '1win': 81, '9pandas': 82,

  // Dota 2 Teams
  'team falcons': 96, 'team spirit': 95, 'gaimin gladiators': 94, 'gladiators': 94,
  'betboom team': 93, 'xtreme gaming': 93, 'tundra esports': 93, 'tundra': 93,
  'team liquid': 94, 'liquid dota': 94, 'og': 88, 'aurora': 88, 'psg quest': 86,
  'heroic dota': 86, 'beastcoast': 83, 'nouns': 83, 'nigma galaxy': 84, 'nigma': 84,
  'azure ray': 87, 'secret': 85, 'team secret': 85, 'talon': 84, '1win dota': 83,

  // Basketball (NBA)
  'celtics': 96, 'boston celtics': 96, 'nuggets': 94, 'denver nuggets': 94, 'thunder': 94,
  'timberwolves': 92, 'mavericks': 93, 'dallas mavericks': 93, 'bucks': 90, 'knicks': 90,
  '76ers': 88, 'lakers': 89, 'la lakers': 89, 'warriors': 88, 'suns': 87, 'heat': 86,

  // Tennis
  'jannik sinner': 97, 'sinner': 97, 'carlos alcaraz': 96, 'alcaraz': 96, 'novak djokovic': 95, 'djokovic': 95,
  'alexander zverev': 93, 'zverev': 93, 'daniil medvedev': 91, 'medvedev': 91, 'andrey rublev': 88,
  'taylor fritz': 89, 'casper ruud': 87, 'grigor dimitrov': 86, 'stefanos tsitsipas': 86,
  'iga swiatek': 96, 'swiatek': 96, 'aryna sabalenka': 95, 'sabalenka': 95, 'coco gauff': 92,
  'elena rybakina': 91, 'jessica pegula': 89, 'mirra andreeva': 86,
};

export function getTeamPowerRating(name: string): number {
  if (!name) return 72;
  const norm = name.toLowerCase().replace(/[^a-z0-9а-яё]/g, '');
  for (const [k, v] of Object.entries(POWER_RANKINGS)) {
    const kNorm = k.replace(/[^a-z0-9а-яё]/g, '');
    if (norm.includes(kNorm) || kNorm.includes(norm)) {
      return v;
    }
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return 68 + (Math.abs(hash) % 20);
}

export function calculatePrematchOdds(
  sport: string,
  name1: string,
  name2: string,
  threeWay = false
): { p1: number; x?: number; p2: number } {
  const r1 = getTeamPowerRating(name1);
  const r2 = getTeamPowerRating(name2);
  const diff = r1 - r2;

  const homeBonus = threeWay ? 2.2 : 1.2;
  const effectiveDiff = diff + homeBonus;

  const scale = sport === 'cybersport' || sport === 'tennis' ? 0.085 : 0.068;
  const rawProb1 = 1 / (1 + Math.exp(-scale * effectiveDiff));
  const rawProb2 = 1 - rawProb1;

  const margin = 1.055;

  if (threeWay) {
    const maxDraw = sport === 'hockey' ? 0.23 : 0.27;
    const drawFactor = Math.max(0.08, maxDraw - Math.abs(diff) * 0.005);
    const p1Adj = rawProb1 * (1 - drawFactor);
    const p2Adj = rawProb2 * (1 - drawFactor);
    const pxAdj = drawFactor;

    return {
      p1: formatOdds(1 / (Math.max(0.02, p1Adj) * margin)),
      x: formatOdds(1 / (Math.max(0.02, pxAdj) * margin)),
      p2: formatOdds(1 / (Math.max(0.02, p2Adj) * margin)),
    };
  }

  return {
    p1: formatOdds(1 / (Math.max(0.02, rawProb1) * margin)),
    p2: formatOdds(1 / (Math.max(0.02, rawProb2) * margin)),
  };
}
