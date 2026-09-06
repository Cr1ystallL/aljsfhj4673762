/**
 * Virtual-sports odds. Same line the player sees is the line the server locks.
 *
 * Book-like constraints (not a soft 35.00 dump):
 *  - live 1X2 uses current score + remaining time + team strength
 *  - outcomes below ~6.5% are suspended instead of priced at the cap
 *  - team names match on whole tokens ("villarreal" ≠ "real madrid")
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

/** Single-outcome cap. Real BKs suspend before dumping 25–35 on a dead 1X2. */
export const MAX_SPORTS_ODDS = 15;

/** Below this fair probability the outcome is taken off the board. */
export const MIN_OUTCOME_PROB = 0.065;

const MARGIN = 1.055;

export function formatOdds(odds: number): number {
  if (!Number.isFinite(odds) || odds < 1.01) return 1.01;
  if (odds >= MAX_SPORTS_ODDS) return MAX_SPORTS_ODDS;
  if (odds > 10) return Math.round(odds * 10) / 10;
  return Math.round(odds * 100) / 100;
}

export function priceOutcome(p: number, margin = MARGIN): { odds: number; open: boolean } {
  if (!Number.isFinite(p) || p < MIN_OUTCOME_PROB) {
    return { odds: 1.01, open: false };
  }
  return { odds: formatOdds(1 / (p * margin)), open: true };
}

/**
 * Expected minutes still to play. Stoppage is phased in near full time
 * so 90:00 2-2 is ~4 minutes of football, not 9 seconds (old 0.15 floor).
 */
export function footballRemainingMinutes(minute: number, matchMinutes = 90): number {
  const m = Math.min(Math.max(minute, 0), matchMinutes + 15);
  if (m <= matchMinutes) {
    const raw = matchMinutes - m;
    const intoWindow = Math.max(0, m - (matchMinutes - 8));
    const stoppage = 4.0 * (intoWindow / 8);
    return Math.max(raw + stoppage, 1);
  }
  return Math.max(1.15, 4.2 - (m - matchMinutes) * 0.42);
}

/**
 * If ESPN clock is missing or stuck, fall back to kickoff elapsed.
 * Also reject a 90' clock when the match has only been running ~50 minutes.
 */
export function resolveFootballLiveMinute(
  clockMinute: number | undefined | null,
  startTime: number,
  now: number,
  status: 'prematch' | 'live' | 'finished'
): number {
  if (status !== 'live') return 0;
  const elapsed = Math.max(0, (now - startTime) / 60_000);
  const clock =
    clockMinute != null && Number.isFinite(clockMinute) ? Number(clockMinute) : null;

  if (clock != null && clock > 0) {
    if (clock >= 80 && elapsed >= 8 && elapsed < 68) {
      return Math.min(89, Math.round(elapsed));
    }
    if (clock <= 2 && elapsed > 15) {
      return Math.min(89, Math.round(elapsed));
    }
    return clock;
  }
  if (elapsed > 2) return Math.min(95, Math.round(elapsed));
  return 0;
}

export function strengthFromRating(rating: number): TeamStrength {
  const r = Math.max(60, Math.min(99, rating));
  const t = (r - 72) / 24;
  return {
    attack: 0.95 + t * 0.95,
    defense: 1.18 - t * 0.38,
  };
}

export function teamStrength(name: string): TeamStrength {
  return strengthFromRating(getTeamPowerRating(name));
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
  const remainingMinutes = footballRemainingMinutes(minute, matchMinutes);
  const timeFactor = remainingMinutes / matchMinutes;

  const redPenalty1 = Math.max(0.4, 1 - redCards1 * 0.25);
  const redPenalty2 = Math.max(0.4, 1 - redCards2 * 0.25);

  const lambda1 = Math.max(
    0.02,
    strength1.attack * strength2.defense * timeFactor * redPenalty1
  );
  const lambda2 = Math.max(
    0.02,
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

  const lead = score1 - score2;
  const remainMin = remainingMinutes;
  const pUnder = lead > 0 ? normP2 : lead < 0 ? normP1 : 0;
  const lockUnderdogWin =
    lead !== 0 &&
    (pUnder < MIN_OUTCOME_PROB ||
      (Math.abs(lead) >= 1 && remainMin <= 4) ||
      (Math.abs(lead) >= 2 && remainMin <= 10));
  const lockDraw = lead !== 0 && normPX < MIN_OUTCOME_PROB && remainMin <= 3 && Math.abs(lead) >= 2;

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
  const normUnder = Math.min(Math.max(probUnder / totalProb, MIN_OUTCOME_PROB), 1 - MIN_OUTCOME_PROB);
  const normOver = 1 - normUnder;

  const priced1 = priceOutcome(normP1);
  const pricedX = priceOutcome(normPX);
  const priced2 = priceOutcome(normP2);

  const p1Open = priced1.open && !(lockUnderdogWin && lead < 0);
  const p2Open = priced2.open && !(lockUnderdogWin && lead > 0);
  const xOpen = pricedX.open && !lockDraw;

  return {
    p1: p1Open ? (lockUnderdogWin && lead > 0 ? 1.01 : priced1.odds) : 1.01,
    x: xOpen ? pricedX.odds : 1.01,
    p2: p2Open ? (lockUnderdogWin && lead < 0 ? 1.01 : priced2.odds) : 1.01,
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
  const a = priceOutcome(prob1);
  const b = priceOutcome(1 - prob1);
  return {
    p1: a.odds,
    p2: b.odds,
    available: { p1: a.open, p2: b.open },
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
  const a = priceOutcome(Math.max(0.01, prob1));
  const b = priceOutcome(Math.max(0.01, 1 - prob1));
  return {
    p1: a.odds,
    p2: b.odds,
    available: { p1: a.open, p2: b.open },
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
  const a = priceOutcome(Math.max(0.01, prob1));
  const b = priceOutcome(Math.max(0.01, 1 - prob1));
  return {
    p1: a.odds,
    p2: b.odds,
    available: { p1: a.open, p2: b.open },
  };
}

const POWER_RANKINGS: Record<string, number> = {
  'real madrid': 96, 'manchester city': 96, 'bayern': 94, 'arsenal': 93, 'liverpool': 94,
  'barcelona': 92, 'inter': 90, 'psg': 91, 'juventus': 86, 'chelsea': 88, 'atletico': 88,
  'bayer leverkusen': 90, 'borussia dortmund': 87, 'ac milan': 86, 'aston villa': 85,
  'tottenham': 85, 'manchester united': 84, 'newcastle': 84, 'sporting': 86, 'benfica': 84,
  'porto': 83, 'ajax': 80, 'roma': 83, 'feyenoord': 82, 'psv': 83,
  'villarreal': 82, 'real sociedad': 85, 'real betis': 83, 'sevilla': 83, 'athletic': 84,
  'girona': 84, 'valencia': 80, 'celta': 78, 'rayo vallecano': 77, 'osasuna': 77,
  'getafe': 76, 'espanyol': 76, 'mallorca': 76, 'las palmas': 74, 'deportivo': 74,
  'almeria': 73, 'cadiz': 72, 'leganes': 72, 'eibar': 70, 'valladolid': 71,
  'lokomotiv': 80, 'baltika': 70, 'zenit': 86, 'cska': 81, 'spartak': 82, 'krasnodar': 83,

  'natus vincere': 96, 'navi': 96, 'team vitality': 95, 'vitality': 95, 'spirit': 95,
  'faze clan': 93, 'faze': 93, 'g2 esports': 93, 'g2': 93, 'mouz': 92, 'mousesports': 92,
  'the mongolz': 90, 'mongolz': 90, 'eternal fire': 89, 'astralis': 88, 'virtus.pro': 88, 'vp': 88,
  'liquid': 88, 'heroic': 87, 'complexity': 85, 'furia': 87, 'pain': 84,
  'saw': 84, 'falcons': 92, 'cloud9': 85, 'big': 84, 'ence': 83,
  'gamerlegion': 84, 'nemiga': 80, 'parivision': 84, 'betboom': 90, 'passion ua': 81,
  'flyquest': 83, 'imperial': 83, 'monte': 82, '1win': 81, '9pandas': 82,

  'team falcons': 96, 'team spirit': 95, 'gaimin gladiators': 94, 'gladiators': 94,
  'betboom team': 93, 'xtreme gaming': 93, 'tundra esports': 93, 'tundra': 93,
  'team liquid': 94, 'liquid dota': 94, 'og': 88, 'aurora': 88, 'psg quest': 86,
  'heroic dota': 86, 'beastcoast': 83, 'nouns': 83, 'nigma galaxy': 84, 'nigma': 84,
  'azure ray': 87, 'secret': 85, 'team secret': 85, 'talon': 84, '1win dota': 83,

  'celtics': 96, 'boston celtics': 96, 'nuggets': 94, 'denver nuggets': 94, 'thunder': 94,
  'timberwolves': 92, 'mavericks': 93, 'dallas mavericks': 93, 'bucks': 90, 'knicks': 90,
  '76ers': 88, 'lakers': 89, 'la lakers': 89, 'warriors': 88, 'suns': 87, 'heat': 86,

  'jannik sinner': 97, 'sinner': 97, 'carlos alcaraz': 96, 'alcaraz': 96, 'novak djokovic': 95, 'djokovic': 95,
  'alexander zverev': 93, 'zverev': 93, 'daniil medvedev': 91, 'medvedev': 91, 'andrey rublev': 88,
  'taylor fritz': 89, 'casper ruud': 87, 'grigor dimitrov': 86, 'stefanos tsitsipas': 86,
  'iga swiatek': 96, 'swiatek': 96, 'aryna sabalenka': 95, 'sabalenka': 95, 'coco gauff': 92,
  'elena rybakina': 91, 'jessica pegula': 89, 'mirra andreeva': 86,
};

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function getTeamPowerRating(name: string): number {
  if (!name) return 74;
  const tokens = nameTokens(name);
  const compact = tokens.join('');
  if (!compact) return 74;

  const entries = Object.entries(POWER_RANKINGS).sort((a, b) => b[0].length - a[0].length);
  for (const [key, rating] of entries) {
    const kTokens = nameTokens(key);
    const kCompact = kTokens.join('');
    if (!kCompact) continue;
    if (compact === kCompact) return rating;
    if (kTokens.length >= 2 && kTokens.every((t) => tokens.includes(t))) return rating;
    if (kTokens.length === 1 && tokens.includes(kTokens[0])) return rating;
  }

  let hash = 0;
  for (let i = 0; i < compact.length; i++) {
    hash = (hash << 5) - hash + compact.charCodeAt(i);
    hash |= 0;
  }
  return 72 + (Math.abs(hash) % 9);
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
  const effectiveDiff = Math.max(-20, Math.min(20, diff + homeBonus));

  const scale = sport === 'cybersport' || sport === 'tennis' ? 0.09 : 0.082;
  const rawProb1 = 1 / (1 + Math.exp(-scale * effectiveDiff));
  const rawProb2 = 1 - rawProb1;

  if (threeWay) {
    const maxDraw = sport === 'hockey' ? 0.23 : 0.28;
    const drawFactor = Math.max(0.16, maxDraw - Math.abs(diff) * 0.004);
    const p1Adj = rawProb1 * (1 - drawFactor);
    const p2Adj = rawProb2 * (1 - drawFactor);
    const pxAdj = drawFactor;
    const a = priceOutcome(p1Adj);
    const x = priceOutcome(pxAdj);
    const b = priceOutcome(p2Adj);
    return {
      p1: a.open ? a.odds : 1.01,
      x: x.open ? x.odds : 1.01,
      p2: b.open ? b.odds : 1.01,
    };
  }

  const a = priceOutcome(rawProb1);
  const b = priceOutcome(rawProb2);
  return {
    p1: a.open ? a.odds : 1.01,
    p2: b.open ? b.odds : 1.01,
  };
}
