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

export interface TeamParticipant {
  name: string;
  shortName?: string;
  logo?: string;
  initials: string;
  color?: string;
  score?: number;
  subScores?: number[]; // Set scores in tennis/basketball quarters
  yellowCards?: number;
  redCards?: number;
  attackStrength?: number; // e.g. 1.8 for powerhouse
  defenseStrength?: number; // e.g. 0.8 for rock solid defense
}

export interface MatchOdds {
  p1: number;
  x?: number; // Optional for 2-way sports
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

export interface SportEvent {
  id: string;
  sport: SportCategoryKey;
  league: string;
  leagueCountry?: string;
  leagueIcon?: string;
  team1: TeamParticipant;
  team2: TeamParticipant;
  startTime: string; // ISO string or human string
  displayTime: string; // e.g. "Сегодня 03:30", "27 авг 22:00"
  status: EventStatus;
  isLive: boolean;
  liveMinute?: number; // e.g. 71
  liveSecond?: number; // e.g. 24
  livePeriod?: string; // e.g. "1T", "HT", "2T", "3-й сет", "Q1"
  liveTime?: string; // e.g. "2T 71:24", "1Ч 08:12", "3-й сет 3:2"
  odds: MatchOdds;
  marketsCount: number; // e.g. 178, 54
  isFeatured?: boolean; // For Match of the Day hero card
  featuredTag?: string; // e.g. "Матч дня"
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
}

export interface SelectedBet {
  eventId: string;
  eventName: string;
  league: string;
  outcomeType: 'p1' | 'x' | 'p2' | 'totalOver' | 'totalUnder';
  outcomeLabel: string;
  odds: number;
  isLive: boolean;
}
