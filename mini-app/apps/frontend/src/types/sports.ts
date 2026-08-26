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
}

export interface MatchOdds {
  p1: number;
  x?: number; // Optional for 2-way sports like Tennis, Basketball, Esports
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
  liveTime?: string; // e.g. "2T 51'", "1Ч 0'", "3-й сет"
  period?: string;
  odds: MatchOdds;
  marketsCount: number; // e.g. 178, 54
  isFeatured?: boolean; // For Match of the Day hero card
  featuredTag?: string; // e.g. "Матч дня"
  hasStream?: boolean;
  isFavorite?: boolean;
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
