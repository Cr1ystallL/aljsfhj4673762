'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { SportEvent, SportCategoryKey } from '@/types/sports';
import { sportsService, type SportsFilterOptions } from '@/services/sports.service';

const POLL_MS = 5_000;

export function useLiveSports() {
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [minBet, setMinBet] = useState(1);
  const [maxBet, setMaxBet] = useState(500);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    try {
      const data = await sportsService.fetchEvents();
      setEvents(data.events ?? []);
      if (typeof data.minBet === 'number') setMinBet(data.minBet);
      if (typeof data.maxBet === 'number') setMaxBet(data.maxBet);
      setPaused(!!data.paused);
      setError(null);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : 'line-error');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(false);
    const id = setInterval(() => {
      void refresh(true);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const getFilteredEvents = useCallback(
    (filters: SportsFilterOptions) => {
      let list = [...events];

      if (filters.mode === 'live') {
        list = list.filter((e) => e.isLive);
      } else if (filters.mode === 'prematch') {
        list = list.filter((e) => !e.isLive && e.status !== 'finished');
      }

      if (filters.category !== 'all' && filters.category !== 'top') {
        list = list.filter((e) => e.sport === filters.category);
      }

      if (filters.searchQuery?.trim()) {
        const q = filters.searchQuery.toLowerCase().trim();
        list = list.filter(
          (e) =>
            e.team1.name.toLowerCase().includes(q) ||
            e.team2.name.toLowerCase().includes(q) ||
            e.league.toLowerCase().includes(q)
        );
      }

      return list;
    },
    [events]
  );

  const featuredMatch = useMemo(
    () => events.find((e) => e.isFeatured && e.status !== 'finished') || events.find((e) => e.status !== 'finished') || events[0],
    [events]
  );

  const liveCount = useMemo(() => events.filter((e) => e.isLive).length, [events]);

  const categoryCounts = useMemo(() => {
    const counts: Record<SportCategoryKey, number> = {
      all: events.length,
      top: events.length,
      football: 0,
      tennis: 0,
      hockey: 0,
      basketball: 0,
      cybersport: 0,
      table_tennis: 0,
      mma: 0,
    };

    for (const e of events) {
      if (counts[e.sport] !== undefined) {
        counts[e.sport]++;
      }
    }
    return counts;
  }, [events]);

  return {
    events,
    getFilteredEvents,
    featuredMatch,
    liveCount,
    categoryCounts,
    minBet,
    maxBet,
    paused,
    loading,
    error,
    refresh,
  };
}
