import type { SelectedBet, SportCategoryKey, SportEvent } from '@/types/sports';

export interface SportsFilterOptions {
  category: SportCategoryKey;
  mode: 'all' | 'live' | 'prematch';
  searchQuery?: string;
}

export interface SportsEventsResponse {
  ok: boolean;
  virtual?: boolean;
  paused?: boolean;
  minBet?: number;
  maxBet?: number;
  events: SportEvent[];
}

export interface SportsBetReceipt {
  ok: boolean;
  betId: string;
  eventId: string;
  outcome: SelectedBet['outcomeType'];
  stake: number;
  odds: number;
  potentialWin: number;
  error?: string;
}

export interface SportsUserBet {
  id: string;
  eventId: string;
  eventName: string;
  league: string;
  outcome: string;
  odds: number;
  stake: number;
  state: string;
  payout: number;
  placedAt: string;
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || `HTTP ${res.status}`);
  }
}

export const sportsService = {
  async fetchEvents(): Promise<SportsEventsResponse> {
    const res = await fetch('/api/sports/events', {
      credentials: 'include',
      cache: 'no-store',
    });
    const data = await parseJson<SportsEventsResponse & { error?: string }>(res);
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  },

  async placeBet(input: {
    eventId: string;
    outcome: SelectedBet['outcomeType'];
    stake: number;
  }): Promise<SportsBetReceipt> {
    const res = await fetch('/api/sports/bet', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await parseJson<SportsBetReceipt & { error?: string }>(res);
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Не удалось принять ставку');
    }
    return data;
  },

  async fetchMyBets(): Promise<SportsUserBet[]> {
    const res = await fetch('/api/sports/my-bets', {
      credentials: 'include',
      cache: 'no-store',
    });
    const data = await parseJson<{ ok?: boolean; bets?: SportsUserBet[]; error?: string }>(res);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data.bets ?? [];
  },
};
