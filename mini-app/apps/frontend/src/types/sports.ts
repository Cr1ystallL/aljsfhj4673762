export type SportCategoryKey =
  | 'all'
  | 'top'
  | 'football'
  | 'tennis'
  | 'hockey'
  | 'basketball'
  | 'cybersport'
  | 'table_tennis'
  | 'mma';

export type EventStatus = 'live' | 'prematch' | 'finished';

export type OddsTrend = 'up' | 'down' | 'same';

export type MarketKind =
  | '1x2'
  | 'double_chance'
  | 'total'
  | 'handicap'
  | 'btts'
  | 'next_goal'
  | 'cards'
  | 'corners'
  | 'sooner';

export type ClockDirection = 'up' | 'down' | 'none';

export interface TeamParticipant {
  name: string;
  shortName?: string;
  logo?: string;
  initials: string;
  color?: string;
  score?: number;
  subScores?: number[];
  yellowCards?: number;
  redCards?: number;
  attackStrength?: number;
  defenseStrength?: number;
}

export interface MatchOdds {
  p1: number;
  x?: number;
  p2: number;
  total?: {
    threshold: number;
    over: number;
    under: number;
  };
  handicap?: {
    value: number;
    h1: number;
    h2: number;
  };
  p1Trend?: OddsTrend;
  xTrend?: OddsTrend;
  p2Trend?: OddsTrend;
  lastChangedAt?: number;
}

export interface SportMarketOutcome {
  key: string;
  label: string;
  odds: number;
  line?: number;
  available: boolean;
}

export interface SportMarketLine {
  line: number;
  outcomes: SportMarketOutcome[];
}

export interface SportMarket {
  id: string;
  kind: MarketKind;
  outcomes?: SportMarketOutcome[];
  lines?: SportMarketLine[];
}

export interface SportEvent {
  id: string;
  sport: SportCategoryKey;
  league: string;
  leagueCountry?: string;
  leagueIcon?: string;
  team1: TeamParticipant;
  team2: TeamParticipant;
  startTime: string;
  displayTime: string;
  status: EventStatus;
  isLive: boolean;
  liveMinute?: number;
  liveSecond?: number;
  livePeriod?: string;
  liveTime?: string;
  clockSeconds?: number | null;
  clockSyncedAt?: number;
  clockDirection?: ClockDirection;
  odds: MatchOdds;
  markets?: SportMarket[];
  marketsCount: number;
  isFeatured?: boolean;
  featuredTag?: string;
  hasStream?: boolean;
  isFavorite?: boolean;
  lastEventNotification?: string;
  lastEvent?: {
    kind: 'goal' | 'point';
    team: 1 | 2;
    score1: number;
    score2: number;
    at: number;
  };
  stats?: {
    yellow1?: number;
    yellow2?: number;
    corners1?: number;
    corners2?: number;
  };
  suspended?: boolean;
}

export interface SelectedBet {
  eventId: string;
  eventName: string;
  league: string;
  sport: SportCategoryKey;
  marketKind: MarketKind;
  outcomeType: string;
  outcomeLabel: string;
  line?: number;
  odds: number;
  isLive: boolean;
}

export interface SportsBetLegPayload {
  eventId: string;
  marketKind: MarketKind;
  outcomeKey: string;
  line?: number;
}
