'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, X, Check, ArrowUpRight, Sparkles } from 'lucide-react';
import { sportsService, type SportsUserBet } from '@/services/sports.service';
import { useBalance } from '@/hooks/use-balance';
import { useT } from '@/i18n/use-t';
import { GamePrimaryButton } from '@/components/game/kit/game-primary-button';
import { SoccerBallIcon } from '@/components/ui/soccer-ball-icon';
import { ExpressIcon } from '@/components/ui/express-train-icon';
import { cn } from '@/lib/utils';

function isOpenBet(state: string) {
  return state === 'pending' || state === 'active';
}

export function formatOutcomeLabel(outcomeKey?: string, marketKind?: string, line?: number): string {
  if (!outcomeKey) return '—';
  const k = outcomeKey.toLowerCase().trim();
  if (k === 'p1' || k === '1') return 'П1 (Победа 1)';
  if (k === 'x') return 'X (Ничья)';
  if (k === 'p2' || k === '2') return 'П2 (Победа 2)';
  if (k === 'over' || k === 'total_over') return `ТБ ${line ?? 2.5}`;
  if (k === 'under' || k === 'total_under') return `ТМ ${line ?? 2.5}`;
  if (k === '1x') return '1X (П1 или ничья)';
  if (k === '12') return '12 (П1 или П2)';
  if (k === 'x2') return 'X2 (Ничья или П2)';
  if (k === 'h1' || k === 'handicap_1') return `Ф1 (${line != null ? (line > 0 ? `+${line}` : line) : ''})`;
  if (k === 'h2' || k === 'handicap_2') return `Ф2 (${line != null ? (line > 0 ? `+${line}` : line) : ''})`;
  if (k === 'yes' || k === 'btts_yes') return 'Обе забьют: Да';
  if (k === 'no' || k === 'btts_no') return 'Обе забьют: Нет';
  if (k === 'cs2_0') return 'Точный счёт: 2:0 (Карты)';
  if (k === 'cs2_1') return 'Точный счёт: 2:1 (Карты)';
  if (k === 'cs1_2') return 'Точный счёт: 1:2 (Карты)';
  if (k === 'cs0_2') return 'Точный счёт: 0:2 (Карты)';
  return outcomeKey;
}

function useSportsBetList(reloadToken = 0, active = true) {
  const { syncBalance } = useBalance();
  const [bets, setBets] = useState<SportsUserBet[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBets(await sportsService.fetchMyBets());
    } catch {
      /* keep last */
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void load();
    const id = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(id);
  }, [load, reloadToken, active]);

  const onCashout = async (id: string) => {
    setBusy(id);
    try {
      await sportsService.cashout(id);
      await syncBalance();
      await load();
    } catch {
      await load();
    } finally {
      setBusy(null);
    }
  };

  return { bets, busy, onCashout };
}

/**
 * Ticket Barcode Graphic Component
 */
function TicketBarcode({ seed }: { seed: string }) {
  return (
    <div className="flex items-center gap-[2px] opacity-25 h-3.5 select-none" aria-hidden>
      {Array.from({ length: 28 }).map((_, i) => {
        const charCode = seed.charCodeAt(i % seed.length) || 1;
        const width = (charCode + i) % 3 === 0 ? 'w-[2.5px]' : (charCode + i) % 2 === 0 ? 'w-[1.5px]' : 'w-[1px]';
        return <div key={i} className={cn('h-full bg-white rounded-full', width)} />;
      })}
    </div>
  );
}

/**
 * Single Bet Ticket / Coupon Card
 */
function BetCouponCard({
  bet,
  localeTag,
  busy,
  onCashout,
}: {
  bet: SportsUserBet;
  localeTag: string;
  busy: string | null;
  onCashout: (id: string) => Promise<void>;
}) {
  const isExpress = bet.type === 'express' || (bet.legs && bet.legs.length > 1);
  const openBet = isOpenBet(bet.state);
  const legCount = bet.legs?.length || 1;
  const dateLabel = new Date(bet.placedAt).toLocaleString(localeTag, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const net = openBet
    ? null
    : bet.isFreebet
    ? bet.state === 'won'
      ? Number(bet.payout)
      : 0
    : bet.state === 'lost'
    ? Number(bet.payout) > 0
      ? Number(bet.payout) - bet.stake
      : -bet.stake
    : Number(bet.payout) - bet.stake;

  const ticketCode = bet.id.slice(-6).toUpperCase();

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-[22px] border transition-all',
        'bg-gradient-to-b from-[#141720] via-[#0f1117] to-[#0c0e13]',
        openBet
          ? 'border-amber-400/35 shadow-[0_8px_24px_rgba(251,191,36,0.08)]'
          : bet.state === 'won'
          ? 'border-emerald-500/35 shadow-[0_8px_24px_rgba(16,185,129,0.08)]'
          : 'border-white/10 shadow-[0_8px_20px_rgba(0,0,0,0.4)] opacity-95'
      )}
    >
      {/* Background Subtle Watermark Sigil */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-[0.03] bg-white blur-xl"
      />

      {/* 1. TICKET STUB HEADER */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-white/[0.03] border-b border-white/8">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              'w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 shadow-sm',
              isExpress
                ? 'border-amber-400/40 bg-amber-400/15 text-amber-300'
                : 'border-white/15 bg-white/[0.08] text-frost-white'
            )}
          >
            {isExpress ? (
              <ExpressIcon size={15} strokeWidth={2.4} />
            ) : (
              <SoccerBallIcon size={14} strokeWidth={2.2} />
            )}
          </div>

          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-roobert font-extrabold text-[12.5px] text-white tracking-wide uppercase">
              {isExpress ? `Экспресс (${legCount})` : 'Ординар'}
            </span>
            <span className="font-mono text-[10px] text-whisper-gray/70 tracking-wider">
              #{ticketCode}
            </span>
          </div>
        </div>

        {/* STATUS BADGE / STAMP */}
        <div
          className={cn(
            'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold tracking-tight border',
            openBet
              ? 'border-amber-400/40 bg-amber-400/15 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.2)]'
              : bet.state === 'won'
              ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.2)]'
              : bet.state === 'lost'
              ? 'border-rose-500/30 bg-rose-500/15 text-rose-300'
              : bet.state === 'cashed_out'
              ? 'border-cyan-400/30 bg-cyan-400/15 text-cyan-300'
              : 'border-white/10 bg-white/[0.05] text-whisper-gray'
          )}
        >
          {openBet && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
          {bet.state === 'won' && <span>✓</span>}
          {bet.state === 'lost' && <span>✕</span>}
          <span>
            {openBet
              ? 'В игре'
              : bet.state === 'won'
              ? 'Выигрыш'
              : bet.state === 'lost'
              ? 'Проигрыш'
              : bet.state === 'cashed_out'
              ? 'Выкуплен'
              : 'Рассчитан'}
          </span>
        </div>
      </div>

      {/* 2. TICKET BODY: EVENT LEGS */}
      <div className="px-4 py-3 space-y-2.5">
        {bet.legs && bet.legs.length > 0 ? (
          <div className="space-y-2">
            {bet.legs.map((leg, idx) => {
              const matchTitle = leg.eventName || bet.eventName || `Событие #${idx + 1}`;
              const outcomePick = formatOutcomeLabel(leg.outcomeKey, leg.marketKind, leg.line);

              return (
                <div
                  key={`${bet.id}-leg-${idx}`}
                  className="relative p-2.5 rounded-xl bg-black/40 border border-white/6 flex items-center justify-between gap-3"
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-roobert font-semibold text-[13px] text-white truncate leading-snug">
                      {matchTitle}
                    </span>
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-400/15 border border-amber-400/25 text-amber-300 font-bold text-[11px] leading-none">
                        {outcomePick}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-roobert font-bold text-[13px] text-white tabular-nums px-2 py-0.5 rounded-lg bg-white/[0.06] border border-white/10">
                      {leg.odds ? Number(leg.odds).toFixed(2) : '—'}
                    </span>
                    {leg.result === 'won' && (
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-[10px] font-bold">
                        ✓
                      </span>
                    )}
                    {leg.result === 'lost' && (
                      <span className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 flex items-center justify-center text-[10px] font-bold">
                        ✕
                      </span>
                    )}
                    {(!leg.result || leg.result === 'pending') && (
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-2.5 rounded-xl bg-black/40 border border-white/6 flex items-center justify-between gap-3">
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-roobert font-semibold text-[13px] text-white truncate">
                {bet.eventName || 'Спортивное событие'}
              </span>
            </div>
            <span className="font-roobert font-bold text-[13px] text-white tabular-nums px-2 py-0.5 rounded-lg bg-white/[0.06] border border-white/10">
              x{bet.odds.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* 3. TICKET PERFORATION TEAR LINE (With left and right cutouts) */}
      <div className="relative flex items-center my-1">
        {/* Left notch cutout */}
        <div className="absolute -left-2.5 w-5 h-5 rounded-full bg-[#07090e] border border-white/10 shadow-inner z-10" />
        {/* Dotted perforation */}
        <div className="w-full border-t-2 border-dashed border-white/15 mx-3" />
        {/* Right notch cutout */}
        <div className="absolute -right-2.5 w-5 h-5 rounded-full bg-[#07090e] border border-white/10 shadow-inner z-10" />
      </div>

      {/* 4. TICKET RECEIPT FOOTER */}
      <div className="px-4 py-3 bg-white/[0.02] flex flex-col gap-2.5">
        <div className="grid grid-cols-3 items-center gap-2">
          {/* Stake */}
          <div>
            <span className="block text-[10px] uppercase tracking-wider font-semibold text-whisper-gray">
              Ставка
            </span>
            <span className="font-roobert font-bold text-[13px] text-white tabular-nums">
              {bet.stake.toLocaleString(localeTag, { maximumFractionDigits: 2 })} zł
            </span>
            {bet.isFreebet && (
              <span className="block text-[9.5px] text-amber-300 font-bold">Фрибет</span>
            )}
          </div>

          {/* Total Odds */}
          <div className="text-center">
            <span className="block text-[10px] uppercase tracking-wider font-semibold text-whisper-gray">
              Итог. КФ
            </span>
            <span className="inline-block font-roobert font-extrabold text-[13px] text-amber-300 tabular-nums px-2 py-0.5 rounded-md bg-amber-400/10 border border-amber-400/20">
              x{bet.odds.toFixed(2)}
            </span>
          </div>

          {/* Potential / Actual Payout */}
          <div className="text-right">
            <span className="block text-[10px] uppercase tracking-wider font-semibold text-whisper-gray">
              {openBet ? 'К выплате' : bet.state === 'won' ? 'Выигрыш' : 'Результат'}
            </span>
            <span
              className={cn(
                'font-roobert font-black text-[14px] sm:text-[15px] tabular-nums',
                openBet
                  ? 'text-amber-300'
                  : bet.state === 'won'
                  ? 'text-emerald-400'
                  : bet.state === 'lost'
                  ? 'text-[#ff8a76]'
                  : 'text-white'
              )}
            >
              {openBet
                ? `${(bet.stake * bet.odds).toLocaleString(localeTag, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} zł`
                : bet.payout > 0
                ? `+${bet.payout.toLocaleString(localeTag, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} zł`
                : `${(net ?? -bet.stake).toLocaleString(localeTag, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} zł`}
            </span>
          </div>
        </div>

        {/* Cashout Option */}
        {bet.cashout && (
          <div className="pt-1">
            <GamePrimaryButton
              onClick={() => void onCashout(bet.id)}
              disabled={busy === bet.id}
            >
              Выкупить билет за {bet.cashout.amount.toFixed(2)} zł
            </GamePrimaryButton>
          </div>
        )}

        {/* Date & Vector Barcode Strip */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/6 text-[10px] text-whisper-gray/70">
          <span className="font-mono">{dateLabel}</span>
          <TicketBarcode seed={bet.id} />
        </div>
      </div>
    </div>
  );
}

export function SportsMyBets({
  compact = false,
  hideHeading = false,
  reloadToken = 0,
}: {
  compact?: boolean;
  hideHeading?: boolean;
  reloadToken?: number;
}) {
  const { t, localeTag } = useT();
  const { bets, busy, onCashout } = useSportsBetList(reloadToken);

  const list = compact ? bets.slice(0, 4) : bets;

  return (
    <section className="flex flex-col gap-2.5">
      {!hideHeading && (
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-1.5">
            <h3 className="font-roobert text-[15px] font-extrabold text-frost-white">
              {t('sports.myBets')}
            </h3>
            <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-white/[0.08] text-whisper-gray tabular-nums border border-white/8">
              {list.length}
            </span>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div className="rounded-[22px] border border-white/10 bg-[#0e1015] px-4 py-8 text-center font-roobert text-[12.5px] text-whisper-gray">
          {t('sports.noBets')}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((bet) => (
            <BetCouponCard
              key={bet.id}
              bet={bet}
              localeTag={localeTag}
              busy={busy}
              onCashout={onCashout}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function SportsMyBetsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t, localeTag } = useT();
  const { bets, busy, onCashout } = useSportsBetList(0, open);

  const list = useMemo(() => {
    return [...bets].sort((a, b) => {
      const ao = isOpenBet(a.state) ? 0 : 1;
      const bo = isOpenBet(b.state) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime();
    });
  }, [bets]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label={t('sports.myBetsClose')}
            className="absolute inset-0 bg-black/85 backdrop-blur-sm cursor-pointer"
          />

          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="relative z-10 w-full max-w-lg max-h-[88vh] flex flex-col rounded-t-[28px] sm:rounded-3xl border border-white/12 bg-[#0c0d12] overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-[#12141c]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-amber-400/15 border border-amber-400/30 flex items-center justify-center">
                  <Clock size={16} className="text-amber-400 shrink-0" strokeWidth={2.4} />
                </div>
                <div>
                  <h2 className="font-roobert font-extrabold text-white text-[16px] tracking-tight">
                    {t('sports.myBets')}
                  </h2>
                  <span className="text-[10px] text-whisper-gray font-mono">
                    Всего билетов: {list.length}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('sports.myBetsClose')}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-whisper-gray hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                >
                  <X size={16} strokeWidth={2.2} />
                </button>
              </div>
            </div>

            {/* Coupons List */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3 custom-scrollbar">
              {list.length === 0 ? (
                <div className="px-4 py-16 text-center font-roobert text-[13px] text-whisper-gray">
                  {t('sports.noBets')}
                </div>
              ) : (
                list.map((bet) => (
                  <BetCouponCard
                    key={bet.id}
                    bet={bet}
                    localeTag={localeTag}
                    busy={busy}
                    onCashout={onCashout}
                  />
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

