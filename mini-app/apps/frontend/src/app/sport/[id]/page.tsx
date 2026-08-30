'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PAGE_WIDTH } from '@/components/layout/page-width';
import { SportsTopBar } from '@/components/sports/sports-top-bar';
import { SportsBetslipDrawer } from '@/components/sports/sports-betslip-drawer';
import { SportEventCard } from '@/components/sports/sport-event-card';
import { useLiveSports } from '@/hooks/use-live-sports';
import { sportsService } from '@/services/sports.service';
import { useSportsSlip } from '@/store/sports-slip-store';
import { useT } from '@/i18n/use-t';
import type { SportEvent } from '@/types/sports';

export default function SportEventPage() {
  const { t } = useT();
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params?.id ?? ''));
  const { events, minBet, maxBet, paused } = useLiveSports();
  const syncFromEvents = useSportsSlip((s) => s.syncFromEvents);
  const [fallback, setFallback] = useState<SportEvent | null>(null);
  const [missing, setMissing] = useState(false);

  const event = events.find((e) => e.id === id) ?? fallback;

  useEffect(() => {
    if (events.length) syncFromEvents(events);
  }, [events, syncFromEvents]);

  useEffect(() => {
    if (!id || events.some((e) => e.id === id)) {
      setMissing(false);
      return;
    }
    let cancelled = false;
    void sportsService
      .fetchEvent(id)
      .then((data) => {
        if (!cancelled) {
          setFallback(data.event);
          setMissing(false);
        }
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id, events]);

  return (
    <div className="min-h-screen bg-midnight-canvas text-frost-white pb-40">
      <SportsTopBar backHref="/sport" />
      <main className={`mx-auto px-3.5 pt-3 ${PAGE_WIDTH.reading}`}>
        {event ? (
          <SportEventCard event={event} />
        ) : missing ? (
          <div className="rounded-3xl border border-white/10 bg-[#12141a] p-8 text-center font-roobert text-[13px] text-whisper-gray">
            {t('sports.eventMissing')}
          </div>
        ) : (
          <div className="rounded-3xl border border-white/10 bg-[#12141a] p-8 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border border-white/20 border-t-frost-white animate-spin" />
          </div>
        )}
      </main>
      <SportsBetslipDrawer minBet={minBet} maxBet={maxBet} paused={paused} />
    </div>
  );
}
