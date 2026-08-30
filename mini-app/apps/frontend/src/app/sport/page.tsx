'use client';

import { useState, useMemo, useEffect } from 'react';
import { Search, Trophy, Calendar, X } from 'lucide-react';
import { PAGE_WIDTH } from '@/components/layout/page-width';
import { SportsTopBar } from '@/components/sports/sports-top-bar';
import { SportsCategoryNav } from '@/components/sports/sports-category-nav';
import { FeaturedMatchCard } from '@/components/sports/featured-match-card';
import { SportEventRow } from '@/components/sports/sport-event-row';
import { SportsBetslipDrawer } from '@/components/sports/sports-betslip-drawer';
import { SportsMyBets } from '@/components/sports/sports-my-bets';
import { useLiveSports } from '@/hooks/use-live-sports';
import type { SportCategoryKey, SportEvent } from '@/types/sports';
import { useSportsSlip } from '@/store/sports-slip-store';
import { useT } from '@/i18n/use-t';
import { cn } from '@/lib/utils';

export default function SportPage() {
  const { t } = useT();

  const [selectedCategory, setSelectedCategory] = useState<SportCategoryKey>('top');
  const [mode, setMode] = useState<'all' | 'live' | 'prematch'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const syncFromEvents = useSportsSlip((s) => s.syncFromEvents);

  const {
    events: allEvents,
    getFilteredEvents,
    featuredMatch,
    liveCount,
    categoryCounts,
    minBet,
    maxBet,
    paused,
    loading,
    error,
  } = useLiveSports();

  useEffect(() => {
    if (allEvents.length) syncFromEvents(allEvents);
  }, [allEvents, syncFromEvents]);

  const events = useMemo(() => {
    const list = getFilteredEvents({
      category: selectedCategory,
      mode,
      searchQuery,
    });
    if (
      featuredMatch &&
      !searchQuery.trim() &&
      mode !== 'live' &&
      (selectedCategory === 'top' || selectedCategory === 'all' || selectedCategory === 'football')
    ) {
      return list.filter((e) => e.id !== featuredMatch.id);
    }
    return list;
  }, [getFilteredEvents, selectedCategory, mode, searchQuery, featuredMatch]);

  const groupedByLeague = useMemo(() => {
    const map = new Map<string, SportEvent[]>();
    for (const ev of events) {
      const existing = map.get(ev.league) || [];
      existing.push(ev);
      map.set(ev.league, existing);
    }
    return Array.from(map.entries());
  }, [events]);

  const showFeaturedHero =
    featuredMatch &&
    !searchQuery.trim() &&
    mode !== 'live' &&
    (selectedCategory === 'top' || selectedCategory === 'all' || selectedCategory === 'football');

  const heading =
    mode === 'live'
      ? t('sports.liveEvents')
      : selectedCategory === 'top'
        ? t('sports.mainEvents')
        : t('sports.matches');

  return (
    <div className="min-h-screen bg-midnight-canvas text-frost-white pb-40">
      <SportsTopBar />

      <main className={`mx-auto px-3.5 pt-3 flex flex-col gap-4 ${PAGE_WIDTH.reading}`}>
        <p className="font-roobert text-[11px] text-whisper-gray px-0.5">
          {t('sports.virtualLine')}
        </p>

        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-whisper-gray pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('sports.searchPlaceholder')}
              className="w-full pl-9 pr-8 py-2.5 rounded-2xl border border-white/10 bg-[#12141a] text-frost-white placeholder:text-whisper-gray/70 text-[13px] font-roobert focus:outline-none focus:border-white/25 transition-all shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-whisper-gray hover:text-frost-white"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <SportsCategoryNav
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          counts={categoryCounts}
        />

        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl border border-white/10 bg-[#101217]">
          <button
            onClick={() => setMode('all')}
            className={cn(
              'py-2 px-3 rounded-xl font-roobert text-[12px] font-semibold transition-all active:scale-95 flex items-center justify-center gap-1.5',
              mode === 'all'
                ? 'bg-[#1e222b] text-frost-white border border-white/15'
                : 'text-whisper-gray hover:text-frost-white'
            )}
          >
            <Trophy size={13} className="text-frost-white/70" />
            <span>{t('sports.all')}</span>
          </button>

          <button
            onClick={() => setMode('live')}
            className={cn(
              'py-2 px-3 rounded-xl font-roobert text-[12px] font-semibold transition-all active:scale-95 flex items-center justify-center gap-1.5',
              mode === 'live'
                ? 'bg-red-500/15 text-red-200 border border-red-500/30'
                : 'text-whisper-gray hover:text-frost-white'
            )}
          >
            <span className="inline-flex rounded-full h-2 w-2 bg-red-400" />
            <span>{t('sports.live')}</span>
            <span className="text-[10px] opacity-75 tabular-nums">({liveCount})</span>
          </button>

          <button
            onClick={() => setMode('prematch')}
            className={cn(
              'py-2 px-3 rounded-xl font-roobert text-[12px] font-semibold transition-all active:scale-95 flex items-center justify-center gap-1.5',
              mode === 'prematch'
                ? 'bg-[#1e222b] text-frost-white border border-white/15'
                : 'text-whisper-gray hover:text-frost-white'
            )}
          >
            <Calendar size={13} className="text-whisper-gray" />
            <span>{t('sports.prematch')}</span>
          </button>
        </div>

        {paused && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 font-roobert text-[12px] text-whisper-gray">
            {t('sports.linePaused')}
          </div>
        )}

        {showFeaturedHero && featuredMatch && (
          <FeaturedMatchCard event={featuredMatch} />
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <h2 className="font-roobert text-[15px] font-bold text-frost-white tracking-tight">
              {heading}
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-roobert font-bold bg-white/[0.08] text-whisper-gray">
              {events.length}
            </span>
          </div>
        </div>

        {loading && events.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-[#12141a] p-8 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border border-white/20 border-t-frost-white animate-spin" />
          </div>
        ) : error && events.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-[#12141a] p-8 flex flex-col items-center justify-center text-center gap-2">
            <h4 className="font-roobert text-[15px] font-bold text-frost-white">
              {t('sports.lineError')}
            </h4>
          </div>
        ) : groupedByLeague.length > 0 ? (
          <div className="flex flex-col gap-4">
            {groupedByLeague.map(([leagueName, leagueEvents]) => (
              <div key={leagueName} className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-1 py-1 rounded-xl bg-white/[0.03] border border-white/5">
                  <span className="font-roobert text-[12px] font-bold text-frost-white/90 truncate max-w-[85%]">
                    {leagueName}
                  </span>
                  <span className="text-[11px] font-roobert text-whisper-gray/70">
                    {leagueEvents.length}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {leagueEvents.map((ev) => (
                    <SportEventRow key={ev.id} event={ev} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-white/10 bg-[#12141a] p-8 flex flex-col items-center justify-center text-center gap-3 shadow-inner my-6">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-whisper-gray">
              <Search size={22} />
            </div>
            <div className="flex flex-col gap-1">
              <h4 className="font-roobert text-[15px] font-bold text-frost-white">
                {t('sports.noEventsFound')}
              </h4>
              <p className="font-roobert text-[12px] text-whisper-gray max-w-[240px]">
                {t('sports.noEventsMatchingFilter')}
              </p>
            </div>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
                setMode('all');
              }}
              className="mt-2 px-4 py-2 rounded-xl border border-white/15 bg-white/[0.06] text-frost-white font-roobert text-[12px] font-semibold active:scale-95 transition-all"
            >
              {t('sports.resetFilters')}
            </button>
          </div>
        )}

        <SportsMyBets />
      </main>

      <SportsBetslipDrawer minBet={minBet} maxBet={maxBet} paused={paused} />
    </div>
  );
}
