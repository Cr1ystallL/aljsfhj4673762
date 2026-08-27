'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Flame, Radio, Calendar, SlidersHorizontal, Trophy, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsAdmin } from '@/lib/admin-probe';
import { PAGE_WIDTH } from '@/components/layout/page-width';
import { SportsTopBar } from '@/components/sports/sports-top-bar';
import { SportsCategoryNav } from '@/components/sports/sports-category-nav';
import { FeaturedMatchCard } from '@/components/sports/featured-match-card';
import { SportEventRow } from '@/components/sports/sport-event-row';
import { SportsBetslipDrawer } from '@/components/sports/sports-betslip-drawer';
import { useLiveSports } from '@/hooks/use-live-sports';
import type { SportCategoryKey, SportEvent, SelectedBet } from '@/types/sports';
import { useT } from '@/i18n/use-t';
import { cn } from '@/lib/utils';

export default function SportPage() {
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const { t } = useT();

  const [selectedCategory, setSelectedCategory] = useState<SportCategoryKey>('top');
  const [mode, setMode] = useState<'all' | 'live' | 'prematch'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBet, setSelectedBet] = useState<SelectedBet | null>(null);

  // If explicitly not admin, redirect to home
  useEffect(() => {
    if (isAdmin === false) {
      router.replace('/');
    }
  }, [isAdmin, router]);

  // Real-time live sports engine hook
  const {
    getFilteredEvents,
    featuredMatch,
    liveCount,
    categoryCounts,
  } = useLiveSports();

  // Filtered events list
  const events = useMemo(() => {
    return getFilteredEvents({
      category: selectedCategory,
      mode,
      searchQuery,
    });
  }, [getFilteredEvents, selectedCategory, mode, searchQuery]);

  // Group events by league
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

  return (
    <div className="min-h-screen bg-midnight-canvas text-frost-white pb-32">
      {/* Fixed Sticky Header */}
      <SportsTopBar />

      <main className={`mx-auto px-3.5 pt-3 flex flex-col gap-4 ${PAGE_WIDTH.reading}`}>
        {/* Search & Filter Bar */}
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
              className="w-full pl-9 pr-8 py-2.5 rounded-2xl border border-white/10 bg-[#12141a] text-frost-white placeholder:text-whisper-gray/70 text-[13px] font-roobert focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30 transition-all shadow-inner"
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

        {/* Sports Horizontal Category Carousel */}
        <SportsCategoryNav
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          counts={categoryCounts}
        />

        {/* Mode Switcher: All | Live (Count) | Prematch */}
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl border border-white/10 bg-[#101217]">
          {/* Mode All */}
          <button
            onClick={() => setMode('all')}
            className={cn(
              'py-2 px-3 rounded-xl font-roobert text-[12px] font-semibold transition-all active:scale-95 flex items-center justify-center gap-1.5',
              mode === 'all'
                ? 'bg-[#1e222b] text-frost-white border border-white/15 shadow-md'
                : 'text-whisper-gray hover:text-frost-white'
            )}
          >
            <Trophy size={13} className="text-amber-400" />
            <span>{t('sports.all')}</span>
          </button>

          {/* Mode Live */}
          <button
            onClick={() => setMode('live')}
            className={cn(
              'py-2 px-3 rounded-xl font-roobert text-[12px] font-semibold transition-all active:scale-95 flex items-center justify-center gap-1.5 relative',
              mode === 'live'
                ? 'bg-red-500/20 text-red-300 border border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                : 'text-whisper-gray hover:text-frost-white'
            )}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span>{t('sports.live')}</span>
            <span className="text-[10px] opacity-75 tabular-nums">({liveCount})</span>
          </button>

          {/* Mode Prematch */}
          <button
            onClick={() => setMode('prematch')}
            className={cn(
              'py-2 px-3 rounded-xl font-roobert text-[12px] font-semibold transition-all active:scale-95 flex items-center justify-center gap-1.5',
              mode === 'prematch'
                ? 'bg-[#1e222b] text-frost-white border border-white/15 shadow-md'
                : 'text-whisper-gray hover:text-frost-white'
            )}
          >
            <Calendar size={13} className="text-cyan-400" />
            <span>{t('sports.prematch')}</span>
          </button>
        </div>

        {/* Featured Hero: "Матч дня" (Winline style) */}
        {showFeaturedHero && (
          <div className="flex flex-col gap-2">
            <FeaturedMatchCard
              event={featuredMatch}
              selectedBet={selectedBet}
              onSelectBet={setSelectedBet}
            />
          </div>
        )}

        {/* Section Heading */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <h2 className="font-roobert text-[15px] font-bold text-frost-white tracking-tight">
              {mode === 'live'
                ? 'Live события'
                : selectedCategory === 'top'
                ? t('sports.mainEvents')
                : 'Матчи'}
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-roobert font-bold bg-white/[0.08] text-whisper-gray">
              {events.length}
            </span>
          </div>
        </div>

        {/* Matches Feed grouped by League */}
        {groupedByLeague.length > 0 ? (
          <div className="flex flex-col gap-4">
            {groupedByLeague.map(([leagueName, leagueEvents]) => (
              <div key={leagueName} className="flex flex-col gap-2">
                {/* League Header */}
                <div className="flex items-center justify-between px-1 py-1 rounded-xl bg-white/[0.03] border border-white/5">
                  <span className="font-roobert text-[12px] font-bold text-frost-white/90 truncate max-w-[85%]">
                    {leagueName}
                  </span>
                  <span className="text-[11px] font-roobert text-whisper-gray/70">
                    {leagueEvents.length}
                  </span>
                </div>

                {/* Match Cards */}
                <div className="flex flex-col gap-2">
                  {leagueEvents.map((ev) => (
                    <SportEventRow
                      key={ev.id}
                      event={ev}
                      selectedBet={selectedBet}
                      onSelectBet={setSelectedBet}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Empty state */
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
              className="mt-2 px-4 py-2 rounded-xl border border-amber-400/40 bg-amber-400/10 text-amber-300 font-roobert text-[12px] font-semibold hover:bg-amber-400/20 active:scale-95 transition-all"
            >
              {t('sports.resetFilters')}
            </button>
          </div>
        )}
      </main>

      {/* Floating Betslip Drawer */}
      <SportsBetslipDrawer
        selectedBet={selectedBet}
        onClearBet={() => setSelectedBet(null)}
      />
    </div>
  );
}
