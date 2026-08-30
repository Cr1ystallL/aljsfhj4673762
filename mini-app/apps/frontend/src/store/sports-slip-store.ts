import { create } from 'zustand';
import type { SelectedBet, SportEvent } from '@/types/sports';
import { findMarketOutcome, sameLeg } from '@/lib/sports-markets';

const MAX_LEGS = 8;

interface SportsSlipState {
  legs: SelectedBet[];
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggle: (bet: SelectedBet) => void;
  remove: (eventId: string) => void;
  removeLeg: (leg: SelectedBet) => void;
  clear: () => void;
  syncFromEvents: (events: SportEvent[]) => void;
}

export const useSportsSlip = create<SportsSlipState>((set, get) => ({
  legs: [],
  collapsed: false,
  setCollapsed: (collapsed) => set({ collapsed }),
  toggle: (bet) => {
    const current = get().legs;
    if (current.some((leg) => sameLeg(leg, bet))) {
      set({ legs: current.filter((leg) => !sameLeg(leg, bet)) });
      return;
    }
    if (current.length >= MAX_LEGS) return;
    set({ legs: [...current, bet], collapsed: false });
  },
  remove: (eventId) => {
    set({ legs: get().legs.filter((leg) => leg.eventId !== eventId) });
  },
  removeLeg: (target) => {
    set({ legs: get().legs.filter((leg) => !sameLeg(leg, target)) });
  },
  clear: () => set({ legs: [] }),
  syncFromEvents: (events) => {
    const next = get()
      .legs.map((leg) => {
        const ev = events.find((e) => e.id === leg.eventId);
        if (!ev || ev.status === 'finished') return null;
        const found = findMarketOutcome(ev, leg.marketKind, leg.outcomeType, leg.line);
        if (!found) return null;
        return { ...leg, odds: found.odds, isLive: ev.isLive, eventName: `${ev.team1.name} — ${ev.team2.name}` };
      })
      .filter((leg): leg is SelectedBet => !!leg);
    const same =
      next.length === get().legs.length &&
      next.every((leg, i) => {
        const prev = get().legs[i];
        return prev && sameLeg(prev, leg) && prev.odds === leg.odds && prev.isLive === leg.isLive;
      });
    if (!same) set({ legs: next });
  },
}));
