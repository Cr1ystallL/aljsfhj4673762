'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Clock, ArrowLeft } from 'lucide-react';
import { PAGE_WIDTH } from '@/components/layout/page-width';
import { SportsTopBar } from '@/components/sports/sports-top-bar';
import { SportsBetslipDrawer } from '@/components/sports/sports-betslip-drawer';
import { SportEventCard } from '@/components/sports/sport-event-card';
import { SportsMyBetsSheet } from '@/components/sports/sports-my-bets';
import { useLiveSports } from '@/hooks/use-live-sports';
import { sportsService } from '@/services/sports.service';
import { useSportsSlip } from '@/store/sports-slip-store';
import { useT } from '@/i18n/use-t';
import type { SportEvent } from '@/types/sports';

export default function SportEventPage() {
  const { t } = useT();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params?.id ?? ''));
  const { events, minBet, maxBet, paused } = useLiveSports();
  const syncFromEvents = useSportsSlip((s) => s.syncFromEvents);
  const [fallback, setFallback] = useState<SportEvent | null>(null);
  const [missing, setMissing] = useState(false);
  const [openMyBets, setOpenMyBets] = useState(false);

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
          <div className="rounded-3xl border border-white/10 bg-[#12141a] p-6 sm:p-8 text-center flex flex-col items-center gap-3.5 shadow-xl">
            <div className="w-12 h-12 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center text-amber-400">
              <Clock size={24} strokeWidth={2} />
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="font-roobert font-bold text-[16px] text-white">
                Событие завершено или перемещено в архив
              </h2>
              <p className="font-roobert text-[12.5px] text-whisper-gray max-w-sm leading-relaxed">
                Матч окончен и результат рассчитан. Вы можете посмотреть выигрыш и подробности в истории ставок.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full max-w-xs mt-2">
              <button
                type="button"
                onClick={() => setOpenMyBets(true)}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-amber-400/15 border border-amber-400/30 text-amber-300 font-bold text-[13px] hover:bg-amber-400/25 transition-colors cursor-pointer"
              >
                <Clock size={15} />
                <span>Открыть «Мои ставки»</span>
              </button>

              <button
                type="button"
                onClick={() => router.push('/sport')}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-white/[0.05] border border-white/10 text-frost-white font-semibold text-[13px] hover:bg-white/10 transition-colors cursor-pointer"
              >
                <ArrowLeft size={15} />
                <span>В линию событий</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-white/10 bg-[#12141a] p-8 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border border-white/20 border-t-frost-white animate-spin" />
          </div>
        )}
      </main>
      <SportsBetslipDrawer minBet={minBet} maxBet={maxBet} paused={paused} />
      <SportsMyBetsSheet open={openMyBets} onClose={() => setOpenMyBets(false)} />
    </div>
  );
}
