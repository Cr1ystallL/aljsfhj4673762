'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { SportEvent, SportCategoryKey, OddsTrend } from '@/types/sports';
import { INITIAL_SPORTS_EVENTS, type SportsFilterOptions } from '@/services/sports.service';
import {
  calculateFootballLiveOdds,
  calculateTennisLiveOdds,
  calculateBasketballLiveOdds,
  calculateEsportsLiveOdds,
} from '@/services/sports-odds-engine';

export function useLiveSports() {
  const [events, setEvents] = useState<SportEvent[]>(() =>
    JSON.parse(JSON.stringify(INITIAL_SPORTS_EVENTS))
  );

  const prevOddsRef = useRef<Map<string, { p1: number; x?: number; p2: number }>>(
    new Map()
  );

  // Initialize previous odds map
  useEffect(() => {
    for (const ev of events) {
      prevOddsRef.current.set(ev.id, {
        p1: ev.odds.p1,
        x: ev.odds.x,
        p2: ev.odds.p2,
      });
    }
  }, []);

  // Real-time ticking engine: advances seconds/minutes and recalculates odds dynamically
  useEffect(() => {
    const interval = setInterval(() => {
      setEvents((currentEvents) => {
        const now = Date.now();

        return currentEvents.map((ev) => {
          if (!ev.isLive) return ev;

          // 1. Advance real-time clock
          let minute = ev.liveMinute ?? 50;
          let second = (ev.liveSecond ?? 0) + 1;
          let period = ev.livePeriod ?? '2T';

          if (second >= 60) {
            second = 0;
            minute += 1;
          }

          let score1 = ev.team1.score ?? 0;
          let score2 = ev.team2.score ?? 0;
          let notification = ev.lastEventNotification;

          // 2. Probabilistic In-Game Events (e.g. rare goal or point tick)
          // Every ~60 seconds on average, small chance of goal in football
          if (ev.sport === 'football') {
            const chanceOfGoal = Math.random();
            if (chanceOfGoal < 0.005 && minute < 90) {
              // Goal for team 1 or team 2 based on strength
              const t1Attack = ev.team1.attackStrength ?? 1.5;
              const t2Attack = ev.team2.attackStrength ?? 1.2;
              const pickT1 = Math.random() < t1Attack / (t1Attack + t2Attack);

              if (pickT1) {
                score1 += 1;
                notification = `⚽ ГОЛ! ${ev.team1.shortName || ev.team1.name} (${score1}:${score2})`;
              } else {
                score2 += 1;
                notification = `⚽ ГОЛ! ${ev.team2.shortName || ev.team2.name} (${score1}:${score2})`;
              }
            }
          } else if (ev.sport === 'basketball') {
            // Basketball ticks points every few seconds
            if (Math.random() < 0.3) {
              if (Math.random() > 0.5) score1 += Math.random() > 0.7 ? 3 : 2;
              else score2 += Math.random() > 0.7 ? 3 : 2;
            }
          }

          // 3. Format dynamic live time display
          let liveTime = `${period} ${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
          if (minute > 90 && ev.sport === 'football') {
            liveTime = `2T 90+${minute - 90}:${String(second).padStart(2, '0')}`;
          } else if (ev.sport === 'tennis') {
            liveTime = `${period} ${score1}:${score2}`;
          }

          // 4. Calculate Dynamic Odds using Mathematical Sports Engine
          let newOddsResult = ev.odds;
          if (ev.sport === 'football') {
            const calc = calculateFootballLiveOdds(
              minute,
              score1,
              score2,
              {
                attack: ev.team1.attackStrength ?? 1.5,
                defense: ev.team1.defenseStrength ?? 1.0,
              },
              {
                attack: ev.team2.attackStrength ?? 1.2,
                defense: ev.team2.defenseStrength ?? 1.1,
              },
              ev.team1.redCards ?? 0,
              ev.team2.redCards ?? 0
            );

            // Determine trend compared to previous odds
            const prev = prevOddsRef.current.get(ev.id);
            let p1Trend: OddsTrend = 'same';
            let xTrend: OddsTrend = 'same';
            let p2Trend: OddsTrend = 'same';

            if (prev) {
              if (calc.p1 > prev.p1) p1Trend = 'up';
              else if (calc.p1 < prev.p1) p1Trend = 'down';

              if (calc.x && prev.x) {
                if (calc.x > prev.x) xTrend = 'up';
                else if (calc.x < prev.x) xTrend = 'down';
              }

              if (calc.p2 > prev.p2) p2Trend = 'up';
              else if (calc.p2 < prev.p2) p2Trend = 'down';
            }

            // Update cache
            prevOddsRef.current.set(ev.id, {
              p1: calc.p1,
              x: calc.x,
              p2: calc.p2,
            });

            newOddsResult = {
              p1: calc.p1,
              x: calc.x,
              p2: calc.p2,
              total: calc.total,
              p1Trend: p1Trend !== 'same' ? p1Trend : ev.odds.p1Trend,
              xTrend: xTrend !== 'same' ? xTrend : ev.odds.xTrend,
              p2Trend: p2Trend !== 'same' ? p2Trend : ev.odds.p2Trend,
              lastChangedAt: now,
            };
          } else if (ev.sport === 'tennis') {
            const calc = calculateTennisLiveOdds(
              ev.team1.subScores || [6, 4, 3],
              ev.team2.subScores || [4, 6, 2]
            );
            newOddsResult = {
              ...ev.odds,
              p1: calc.p1,
              p2: calc.p2,
            };
          } else if (ev.sport === 'basketball') {
            const calc = calculateBasketballLiveOdds(score1, score2, 1, 600 - second);
            newOddsResult = {
              ...ev.odds,
              p1: calc.p1,
              p2: calc.p2,
            };
          }

          return {
            ...ev,
            liveMinute: minute,
            liveSecond: second,
            livePeriod: period,
            liveTime,
            displayTime: liveTime,
            team1: { ...ev.team1, score: score1 },
            team2: { ...ev.team2, score: score2 },
            odds: newOddsResult,
            lastEventNotification: notification,
          };
        });
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Filtered getter
  const getFilteredEvents = useCallback(
    (filters: SportsFilterOptions) => {
      let list = [...events];

      if (filters.mode === 'live') {
        list = list.filter((e) => e.isLive);
      } else if (filters.mode === 'prematch') {
        list = list.filter((e) => !e.isLive);
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
    () => events.find((e) => e.isFeatured) || events[0],
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
  };
}
