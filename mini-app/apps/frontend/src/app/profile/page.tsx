'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Copy,
  Check,
  Coins,
  Dice5,
  Trophy,
  Sparkles,
  ChevronRight,
  Wallet,
} from 'lucide-react';

import { PageTransition } from '@/components/ui/page-transition';
import { GameIconTile, gameLabel, resolveGameKey } from '@/components/ui/game-icon';
import { useBalance } from '@/hooks/use-balance';
import { useTransactions } from '@/hooks/use-transactions';
import { useAuthStore } from '@/store/auth-store';
import { useRouter } from 'next/navigation';
import { useIsAdmin } from '@/lib/admin-probe';
import { Shield } from 'lucide-react';

/**
 * Profile Page — Monopo Saigon Style
 *
 * Dark midnight canvas, frosted-glass cards (10px radius, 1px white/10
 * borders, no harsh shadows), pill controls (75px radius), Roobert
 * typography. Deep ocean gradient appears only as an atmospheric backdrop
 * on the avatar plate, never as a flat surface.
 *
 * Sections, top → bottom:
 *   - Header pill row: title.
 *   - Identity card: avatar plate over a soft Deep-Ocean halo, name,
 *     telegram id with copy-to-clipboard, balance pill. The displayed
 *     balance comes from the live store so WebSocket pushes update it
 *     in place after a bet resolves.
 *   - Stat tiles: total bets, total winnings, biggest win, biggest mult.
 *   - Recent bets: per-game icon + label + relative date + stake +
 *     payout. Amounts are normalised so we don't show "Ставка: -4.00 zł".
 */

export default function ProfilePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { balance, fetchBalance } = useBalance();
  const { transactions, isLoading: txLoading, fetchTransactions } = useTransactions();
  const [copied, setCopied] = useState(false);
  const isAdmin = useIsAdmin();

  // Pull a fresh balance on mount and again whenever the user navigates back
  // to the profile screen — covers the case where a Mines / Crash round
  // resolved while the user was on a different page and the WS push went
  // stale.
  useEffect(() => {
    void fetchBalance();
    void fetchTransactions(20);
  }, [fetchBalance, fetchTransactions]);

  const stats = useMemo(() => deriveStats(transactions), [transactions]);

  const handleCopyId = async () => {
    if (!user?.telegramId) return;
    try {
      await navigator.clipboard.writeText(String(user.telegramId));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore — clipboard may be blocked in the embedded webview
    }
  };

  const initials = (user?.firstName?.charAt(0) ?? 'U').toUpperCase();
  const balanceAmount = balance?.amount ?? 0;

  return (
    <PageTransition>
      <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
        <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-3 pt-4 pb-32 flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between px-1">
            <span className="font-roobert text-frost-white text-[24px] font-normal leading-none">
              Аккаунт
            </span>
          </div>

          {/* Identity card */}
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="relative overflow-hidden rounded-card border border-white/10 bg-white/[0.03]"
          >
            {/* Blurred avatar backdrop — heavy gaussian blur on the user's
                own photo. Falls back to a subtle Deep Ocean wash when the
                user has no Telegram photo configured. */}
            {user?.photoUrl ? (
              <>
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage: `url(${user.photoUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'blur(36px) saturate(1.25)',
                    transform: 'scale(1.25)',
                    opacity: 0.65,
                  }}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(10,10,12,0.20) 0%, rgba(10,10,12,0.55) 60%, rgba(10,10,12,0.85) 100%)',
                  }}
                />
              </>
            ) : (
              <>
                <div
                  className="pointer-events-none absolute inset-0 opacity-40"
                  style={{
                    background:
                      'radial-gradient(120% 100% at 50% 0%, rgba(160, 224, 171, 0.18) 0%, rgba(255, 172, 46, 0.10) 45%, transparent 80%)',
                  }}
                />
                <div
                  className="mobile-no-blur pointer-events-none absolute -bottom-12 -right-10 w-56 h-56 rounded-full"
                  style={{
                    background:
                      'radial-gradient(circle, rgba(165, 45, 37, 0.22) 0%, transparent 70%)',
                    filter: 'blur(48px)',
                  }}
                />
              </>
            )}

            <div className="relative px-5 pt-7 pb-5 flex flex-col items-center text-center">
              {/* Avatar */}
              <div className="relative">
                {!user?.photoUrl && (
                  <div
                    className="mobile-no-blur absolute -inset-3 rounded-full opacity-50 blur-2xl"
                    style={{
                      background:
                        'radial-gradient(circle, rgba(160, 224, 171, 0.35) 0%, transparent 70%)',
                    }}
                  />
                )}
                {user?.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.photoUrl}
                    alt={user.firstName || 'User'}
                    className="relative w-20 h-20 rounded-pill object-cover border border-white/20"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="relative w-20 h-20 rounded-pill border border-white/20 bg-white/[0.06] flex items-center justify-center">
                    <span className="font-roobert text-[28px] font-light text-frost-white">
                      {initials}
                    </span>
                  </div>
                )}
              </div>

              {/* Name */}
              <h2 className="mt-4 font-roobert text-[22px] font-normal text-frost-white leading-tight">
                {user?.firstName || 'Игрок'}
                {user?.lastName ? ` ${user.lastName}` : ''}
              </h2>

              {/* Telegram id with copy */}
              {user?.telegramId !== undefined && (
                <button
                  onClick={handleCopyId}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-pill border border-white/15 bg-white/[0.04] hover:border-white/25 transition-colors"
                >
                  <span className="font-roobert text-[11px] text-whisper-gray tabular-nums">
                    #{user.telegramId}
                  </span>
                  {copied ? (
                    <Check size={11} className="text-frost-white" strokeWidth={2} />
                  ) : (
                    <Copy size={11} className="text-whisper-gray" strokeWidth={1.8} />
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => router.push('/balance')}
                aria-label="Открыть кошелёк"
                className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-pill border border-white/15 bg-white/[0.04] backdrop-blur-md hover:bg-white/[0.07] hover:border-white/25 active:scale-95 transition-all"
              >
                <Wallet
                  size={13}
                  className="text-frost-white/70"
                  strokeWidth={1.8}
                />
                <span className="font-roobert text-frost-white text-[14px] tabular-nums">
                  {balanceAmount.toLocaleString('ru-RU', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="text-whisper-gray text-[11px] font-roobert">
                  zł
                </span>
                <ChevronRight
                  size={12}
                  className="text-frost-white/50 -mr-0.5"
                  strokeWidth={1.8}
                />
              </button>
            </div>
          </motion.section>

          {/* Stats */}
          <section className="grid grid-cols-2 gap-2">
            <StatTile
              icon={<Dice5 size={13} className="text-frost-white/60" strokeWidth={1.8} />}
              label="Всего ставок"
              value={stats.totalBets.toLocaleString('ru-RU')}
              suffix={`(${stats.totalWagered.toLocaleString('ru-RU', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })} zł)`}
            />
            <StatTile
              icon={<Coins size={13} className="text-frost-white/60" strokeWidth={1.8} />}
              label="Сумма выигрышей"
              value={`${stats.totalWon.toLocaleString('ru-RU', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })} zł`}
            />
            <StatTile
              icon={<Trophy size={13} className="text-frost-white/60" strokeWidth={1.8} />}
              label="Макс выигрыш"
              value={`${stats.maxWin.toLocaleString('ru-RU', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })} zł`}
            />
            <StatTile
              icon={<Sparkles size={13} className="text-frost-white/60" strokeWidth={1.8} />}
              label="Макс коэфф."
              value={
                stats.maxMultiplier > 0
                  ? `x${stats.maxMultiplier.toFixed(2)}`
                  : '—'
              }
            />
          </section>

          {/* Recent bets */}
          <section>
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="font-roobert text-frost-white text-[14px]">
                Последние ставки
              </span>
              <span className="font-roobert text-[10px] uppercase tracking-[0.2em] text-whisper-gray">
                {Math.min(transactions.length, 7)} из {transactions.length}
              </span>
            </div>

            {txLoading ? (
              <div className="rounded-card border border-white/10 bg-white/[0.03] backdrop-blur-xl py-12 flex items-center justify-center">
                <div className="w-6 h-6 rounded-full border border-white/20 border-t-frost-white animate-spin" />
              </div>
            ) : stats.bets.length === 0 ? (
              <EmptyBets onPlay={() => router.push('/game/crash')} />
            ) : (
              <div className="rounded-card border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
                <div className="divide-y divide-white/5">
                  {stats.bets.slice(0, 7).map((row, idx) => (
                    <BetRow key={row.id} row={row} index={idx} />
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Admin entry — rendered only after the covert /_x/probe returns
              200 for the current session. For everyone else this block
              never paints and the URL is just a 404. */}
          {isAdmin && (
            <button
              onClick={() => router.push('/system/console')}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-pill border border-white/15 bg-white/[0.04] hover:border-white/25 transition-colors mt-2"
            >
              <Shield size={14} strokeWidth={1.7} />
              <span className="font-roobert text-[12px] uppercase tracking-[0.22em] text-frost-white">
                Админ
              </span>
            </button>
          )}
        </div>
      </main>
    </PageTransition>
  );
}

/* ------------------------------------------------------------------ types */

interface BetRowData {
  id: string;
  game: ReturnType<typeof resolveGameKey>;
  gameLabel: string;
  date: Date;
  stake: number;
  payout: number;
  net: number; // signed: positive = won, negative = lost
  multiplier: number | null;
  outcome: 'won' | 'lost' | 'pending';
}

interface DerivedStats {
  totalBets: number;
  totalWagered: number;
  totalWon: number;
  maxWin: number;
  maxMultiplier: number;
  bets: BetRowData[];
}

/* ------------------------------------------------------------ data shaping */

/**
 * Reduce raw transactions into per-bet rows + aggregate stats.
 *
 * The shared transaction table mixes bet debits (negative `amount`),
 * win/cashout credits (positive `amount`), refunds, and deposits. To
 * present a "bet history" we only care about debits typed `bet` (the
 * authoritative stake) and pair them with their corresponding credit
 * (`win` or `cashout`) when one exists — matched via `metadata.betId`
 * or, failing that, the closest credit on the same `gameRoundId`.
 */
function deriveStats(transactions: Array<any>): DerivedStats {
  const bets: BetRowData[] = [];
  let totalWon = 0;
  let maxWin = 0;
  let maxMultiplier = 0;

  // Index credits by betId / roundId for quick pairing.
  const creditsByBetId = new Map<string, any>();
  const creditsByRoundId = new Map<string, any>();
  for (const tx of transactions) {
    if (tx.type === 'win' || tx.type === 'cashout') {
      const betId = tx.metadata?.betId;
      if (betId) creditsByBetId.set(betId, tx);
      else if (tx.gameRoundId) creditsByRoundId.set(tx.gameRoundId, tx);

      const amt = Math.abs(Number(tx.amount));
      totalWon += amt;
      if (amt > maxWin) maxWin = amt;
      const mult = Number(tx.metadata?.multiplier);
      if (Number.isFinite(mult) && mult > maxMultiplier) maxMultiplier = mult;
    }
  }

  for (const tx of transactions) {
    if (tx.type !== 'bet') continue;

    const stake = Math.abs(Number(tx.amount));
    const betId = tx.metadata?.betId ?? tx.id;
    const credit =
      creditsByBetId.get(betId) ??
      (tx.gameRoundId ? creditsByRoundId.get(tx.gameRoundId) : undefined);

    const payout = credit ? Math.abs(Number(credit.amount)) : 0;
    const multiplier =
      credit?.metadata?.multiplier !== undefined
        ? Number(credit.metadata.multiplier)
        : null;

    const outcome: BetRowData['outcome'] = credit
      ? payout > 0
        ? 'won'
        : 'lost'
      : 'pending';

    const game = resolveGameKey(
      tx.metadata?.gameType ?? tx.gameType ?? tx.metadata?.gameId
    );

    bets.push({
      id: tx.id,
      game,
      gameLabel: gameLabel(game),
      date: new Date(tx.createdAt),
      stake,
      payout,
      net: outcome === 'won' ? payout - stake : -stake,
      multiplier: Number.isFinite(multiplier as number) ? (multiplier as number) : null,
      outcome,
    });
  }

  return {
    totalBets: bets.length,
    totalWagered: bets.reduce((acc, b) => acc + b.stake, 0),
    totalWon,
    maxWin,
    maxMultiplier,
    bets,
  };
}

/* -------------------------------------------------------------- subcomponents */

function StatTile({
  icon,
  label,
  value,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-xl px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[9px] uppercase tracking-[0.2em] text-whisper-gray font-roobert">
          {label}
        </span>
      </div>
      <div className="mt-1 font-roobert text-[18px] font-light text-frost-white tabular-nums">
        {value}
        {suffix && (
          <span className="ml-1.5 font-roobert text-[12px] text-whisper-gray tabular-nums">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function BetRow({ row, index }: { row: BetRowData; index: number }) {
  const dateLabel = row.date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const netLabel =
    row.outcome === 'pending'
      ? '…'
      : `${row.net >= 0 ? '+' : '−'}${Math.abs(row.net).toLocaleString('ru-RU', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        })} zł`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3"
    >
      <GameIconTile game={row.game} size="sm" />

      <div className="min-w-0">
        <div className="font-roobert text-[14px] text-frost-white truncate">
          {row.gameLabel}
        </div>
        <div className="font-roobert text-[11px] text-whisper-gray tabular-nums">
          {dateLabel} · ставка{' '}
          {row.stake.toLocaleString('ru-RU', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          })}{' '}
          zł
        </div>
      </div>

      <div className="text-right">
        <div
          className={`font-roobert text-[14px] tabular-nums ${
            row.outcome === 'won'
              ? 'text-frost-white'
              : row.outcome === 'lost'
              ? 'text-[#ff8a76]/80'
              : 'text-whisper-gray'
          }`}
        >
          {netLabel}
        </div>
        {row.multiplier !== null && row.outcome === 'won' && (
          <div className="font-roobert text-[10px] text-whisper-gray tabular-nums">
            x{row.multiplier.toFixed(2)}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function EmptyBets({ onPlay }: { onPlay: () => void }) {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] backdrop-blur-xl py-10 px-6 flex flex-col items-center text-center">
      <div className="w-12 h-12 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center mb-3">
        <Dice5 size={20} className="text-frost-white/70" strokeWidth={1.6} />
      </div>
      <p className="font-roobert text-frost-white text-[15px]">
        Ставки появятся здесь
      </p>
      <p className="mt-1 font-roobert text-[12px] text-whisper-gray max-w-[280px]">
        Самое время сыграть. Принцип честный, RTP от 97% и выше.
      </p>
      <button
        onClick={onPlay}
        className="mt-5 inline-flex items-center gap-1.5 px-5 py-2 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px] uppercase tracking-[0.2em] hover:bg-frost-white/90 transition-colors"
      >
        Играть
        <ChevronRight size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
