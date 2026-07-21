'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy,
  Check,
  Coins,
  Dice5,
  Trophy,
  ChevronRight,
  Wallet,
  HelpCircle,
  X,
  Shield,
  Clock,
  CheckCircle2,
  ArrowUpRight,
  Zap,
} from 'lucide-react';
import { PageTransition } from '@/components/ui/page-transition';
import { GameTopBar } from '@/components/game/game-top-bar';
import { GameIconTile, gameLabel, resolveGameKey } from '@/components/ui/game-icon';
import { useBalance } from '@/hooks/use-balance';
import { useTransactions } from '@/hooks/use-transactions';
import { useAuthStore } from '@/store/auth-store';
import { useRouter } from 'next/navigation';
import { useIsAdmin } from '@/lib/admin-probe';

/**
 * Profile Page — Apple & UI/UX Pro Max Redesign
 *
 * Glassmorphic design system with midnight canvas, frosted glass cards (backdrop-blur-2xl),
 * glowing ambient mesh lights, spring-driven micro-interactions, and refined typography.
 *
 * Preserves all original elements, live balance updates, stats calculations, wager progress tracking,
 * bet history list, and admin console probe integration.
 */

export default function ProfilePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { balance, fetchBalance } = useBalance();
  const { transactions, isLoading: txLoading, fetchTransactions } = useTransactions();
  const [copied, setCopied] = useState(false);
  const [isWagerModalOpen, setIsWagerModalOpen] = useState(false);
  const isAdmin = useIsAdmin();

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
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const initials = (user?.firstName?.charAt(0) ?? 'U').toUpperCase();
  const balanceAmount = balance?.amount ?? 0;

  const wagerProgressPercent = useMemo(() => {
    if (!balance?.wagerTarget || balance.wagerTarget <= 0) return 0;
    return Math.min(100, Math.max(0, ((balance.wagerProgress ?? 0) / balance.wagerTarget) * 100));
  }, [balance]);

  return (
    <PageTransition>
      <main className="relative min-h-screen w-full bg-[#08090c] text-frost-white overflow-x-hidden pb-36 font-roobert">
        {/* Atmospheric Ambient Glow Background Orbs (Taste Skill & Apple Design) */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[340px] h-[340px] rounded-full bg-gradient-to-tr from-amber-500/15 via-emerald-500/10 to-indigo-500/15 blur-[80px]" />
          <div className="absolute top-[35%] -right-20 w-[260px] h-[260px] rounded-full bg-cyan-500/10 blur-[90px]" />
          <div className="absolute top-[65%] -left-20 w-[280px] h-[280px] rounded-full bg-purple-500/10 blur-[100px]" />
        </div>

        {/* Sticky Top Navigation */}
        <GameTopBar title="Профиль" hideBalance={true} />

        <div className="relative z-10 mx-auto w-full max-w-[480px] sm:max-w-[640px] px-3.5 pt-4 flex flex-col gap-4">

          {/* Identity & Profile Hero Card */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', duration: 0.5, bounce: 0 }}
            className="relative overflow-hidden rounded-[28px] border border-white/12 bg-gradient-to-b from-white/[0.08] via-white/[0.03] to-white/[0.01] backdrop-blur-2xl shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
          >
            {/* Dynamic Ambient Header Backdrop */}
            {user?.photoUrl ? (
              <>
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-40"
                  style={{
                    backgroundImage: `url(${user.photoUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'blur(40px) saturate(1.4)',
                    transform: 'scale(1.3)',
                  }}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-[#08090c]/70 to-[#08090c]"
                />
              </>
            ) : (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-30"
                style={{
                  background:
                    'radial-gradient(100% 120% at 50% 0%, rgba(245, 158, 11, 0.25) 0%, rgba(16, 185, 129, 0.15) 50%, transparent 100%)',
                }}
              />
            )}

            <div className="relative px-5 pt-7 pb-6 flex flex-col items-center text-center">

              {/* Avatar with luxury glowing ring */}
              <motion.div 
                whileHover={{ scale: 1.03 }}
                transition={{ type: 'spring', bounce: 0.3 }}
                className="relative group cursor-pointer"
              >
                {/* Glowing halo behind avatar */}
                <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-amber-500/40 via-emerald-400/40 to-indigo-500/40 opacity-70 blur-md group-hover:opacity-100 transition-opacity" />

                <div className="relative p-1 rounded-full bg-gradient-to-tr from-amber-500 via-emerald-400 to-indigo-500 shadow-xl">
                  {user?.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.photoUrl}
                      alt={user.firstName || 'User'}
                      className="relative w-20 h-20 rounded-full object-cover border-2 border-[#08090c] shadow-inner"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="relative w-20 h-20 rounded-full border-2 border-[#08090c] bg-gradient-to-br from-white/15 to-white/5 flex items-center justify-center backdrop-blur-md">
                      <span className="font-roobert text-3xl font-light text-frost-white tracking-wider">
                        {initials}
                      </span>
                    </div>
                  )}

                  {/* Verified check indicator badge */}
                  <div className="absolute bottom-0 right-0 p-1 bg-[#08090c] rounded-full shadow-md">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-r from-amber-400 to-emerald-400 flex items-center justify-center">
                      <CheckCircle2 size={11} className="text-[#08090c]" strokeWidth={3} />
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* User Full Name */}
              <h2 className="mt-4 font-roobert text-[23px] font-semibold text-frost-white tracking-tight leading-snug">
                {user?.firstName || 'Игрок'}
                {user?.lastName ? ` ${user.lastName}` : ''}
              </h2>

              {/* Telegram ID with Interactive Copy Pill */}
              {user?.telegramId !== undefined && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleCopyId}
                  className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-white/12 bg-white/[0.05] hover:bg-white/[0.09] hover:border-white/20 transition-all shadow-sm"
                >
                  <span className="font-roobert text-[12px] font-medium text-whisper-gray tabular-nums">
                    #{user.telegramId}
                  </span>
                  <AnimatePresence mode="wait">
                    {copied ? (
                      <motion.div
                        key="check"
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        className="flex items-center gap-1 text-emerald-400"
                      >
                        <Check size={12} strokeWidth={2.5} />
                        <span className="text-[10px] font-semibold uppercase tracking-wider">Скопировано</span>
                      </motion.div>
                    ) : (
                      <motion.div key="copy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Copy size={12} className="text-whisper-gray/80" strokeWidth={2} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              )}

              {/* Balance Card Button */}
              <motion.button
                type="button"
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => router.push('/balance')}
                aria-label="Открыть кошелёк"
                className="mt-4 group relative inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-amber-500/8 to-emerald-500/10 backdrop-blur-xl hover:border-amber-500/50 shadow-[0_4px_20px_rgba(245,158,11,0.15)] transition-all"
              >
                <div className="w-7 h-7 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                  <Wallet size={15} strokeWidth={2.2} />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-roobert text-[17px] font-bold text-frost-white tabular-nums tracking-tight">
                    {balanceAmount.toLocaleString('ru-RU', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span className="text-amber-400 text-[12px] font-bold uppercase tracking-wider">
                    zł
                  </span>
                </div>
                <div className="ml-1 pl-2 border-l border-white/10 text-whisper-gray/70 group-hover:text-frost-white transition-colors">
                  <ChevronRight size={14} strokeWidth={2} />
                </div>
              </motion.button>

              {/* Active Wager Progress Bar */}
              {balance?.wagerTarget && balance.wagerTarget > 0 && balance.wagerProgress !== undefined && balance.wagerProgress < balance.wagerTarget ? (
                <div className="w-full mt-6 pt-5 border-t border-white/10 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-roobert text-[12px] font-medium text-whisper-gray">Отыгрыш бонуса</span>
                      <button 
                        onClick={() => setIsWagerModalOpen(true)}
                        className="text-whisper-gray/70 hover:text-amber-400 transition-colors p-0.5"
                        aria-label="Что такое отыгрыш?"
                      >
                        <HelpCircle size={14} strokeWidth={2} />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-roobert text-[12px] font-semibold text-frost-white tabular-nums">
                        {balance.wagerProgress.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} / {balance.wagerTarget.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} zł
                      </span>
                      <span className="text-[10px] font-bold text-emerald-400 px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/20 tabular-nums">
                        {wagerProgressPercent.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden p-0.5 border border-white/5">
                    <motion.div
                      className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.6)]"
                      initial={{ width: 0 }}
                      animate={{ width: `${wagerProgressPercent}%` }}
                      transition={{ type: 'spring', duration: 0.8, bounce: 0.1 }}
                    />
                  </div>
                </div>
              ) : null}

            </div>
          </motion.section>

          {/* Key Gaming Stats (2x2 Grid) */}
          <section className="grid grid-cols-2 gap-2.5">
            <StatTile
              icon={<Dice5 size={16} className="text-indigo-400" strokeWidth={2} />}
              iconBg="bg-indigo-500/15 border-indigo-500/25"
              label="Всего ставок"
              value={stats.totalBets.toLocaleString('ru-RU')}
              suffix={`(${stats.totalWagered.toLocaleString('ru-RU', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })} zł)`}
            />
            <StatTile
              icon={<Coins size={16} className="text-emerald-400" strokeWidth={2} />}
              iconBg="bg-emerald-500/15 border-emerald-500/25"
              label="Сумма выигрышей"
              value={`${stats.totalWon.toLocaleString('ru-RU', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })} zł`}
            />
            <StatTile
              icon={<Trophy size={16} className="text-amber-400" strokeWidth={2} />}
              iconBg="bg-amber-500/15 border-amber-500/25"
              label="Макс выигрыш"
              value={`${stats.maxWin.toLocaleString('ru-RU', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })} zł`}
            />
            <StatTile
              icon={<Zap size={16} className="text-purple-400" strokeWidth={2} />}
              iconBg="bg-purple-500/15 border-purple-500/25"
              label="Макс коэфф."
              value={
                stats.maxMultiplier > 0
                  ? `x${stats.maxMultiplier.toFixed(2)}`
                  : '—'
              }
            />
          </section>

          {/* Recent Bets Section */}
          <section className="mt-1">
            <div className="flex items-center justify-between px-1 mb-2.5">
              <div className="flex items-center gap-2">
                <Clock size={15} className="text-amber-400" strokeWidth={2} />
                <span className="font-roobert font-semibold text-frost-white text-[15px]">
                  Последние ставки
                </span>
              </div>
              <span className="font-roobert text-[11px] font-medium px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.04] text-whisper-gray tracking-wider">
                {Math.min(transactions.length, 7)} из {transactions.length}
              </span>
            </div>

            {txLoading ? (
              <div className="rounded-[22px] border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] backdrop-blur-xl py-14 flex flex-col items-center justify-center gap-3">
                <div className="w-7 h-7 rounded-full border-2 border-white/20 border-t-amber-400 animate-spin" />
                <span className="text-[12px] text-whisper-gray">Загрузка истории...</span>
              </div>
            ) : stats.bets.length === 0 ? (
              <EmptyBets onPlay={() => router.push('/game/crash')} />
            ) : (
              <div className="rounded-[24px] border border-white/10 bg-gradient-to-b from-white/[0.05] via-white/[0.02] to-white/[0.01] backdrop-blur-xl overflow-hidden shadow-xl">
                <div className="divide-y divide-white/[0.06]">
                  {stats.bets.slice(0, 7).map((row, idx) => (
                    <BetRow key={row.id} row={row} index={idx} />
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Admin Console Entry (Only for probe-verified Admins) */}
          {isAdmin && (
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => router.push('/system/console')}
              className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-red-500/10 to-purple-500/10 hover:border-amber-500/50 shadow-lg transition-all mt-2"
            >
              <Shield size={16} className="text-amber-400" strokeWidth={2} />
              <span className="font-roobert text-[13px] font-bold uppercase tracking-[0.2em] text-frost-white">
                Панель администратора
              </span>
              <ArrowUpRight size={14} className="text-amber-400" strokeWidth={2} />
            </motion.button>
          )}

        </div>
      </main>

      {/* Wager Explanation Modal */}
      <AnimatePresence>
        {isWagerModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsWagerModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 12 }}
              transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
              className="relative w-full max-w-[360px] rounded-[24px] border border-white/15 bg-[#0e1117] p-6 shadow-2xl overflow-hidden"
            >
              {/* Top ambient glow */}
              <div className="pointer-events-none absolute -top-12 -right-12 w-32 h-32 rounded-full bg-amber-500/20 blur-2xl" />

              <button
                onClick={() => setIsWagerModalOpen(false)}
                className="absolute right-4 top-4 p-1.5 rounded-full bg-white/5 border border-white/10 text-whisper-gray hover:text-frost-white hover:bg-white/10 transition-colors"
                aria-label="Закрыть"
              >
                <X size={16} strokeWidth={2} />
              </button>
              
              <div className="mb-4 flex items-center gap-2.5 text-frost-white">
                <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400">
                  <HelpCircle size={20} strokeWidth={2} />
                </div>
                <h3 className="font-roobert text-[17px] font-bold">Как работает отыгрыш?</h3>
              </div>
              
              <div className="space-y-3 font-roobert text-[13.5px] text-whisper-gray/90 leading-relaxed">
                <p className="p-3 rounded-xl border border-white/10 bg-white/[0.03]">
                  <strong className="text-frost-white font-semibold">Отыгрыш (вейджер)</strong> — это общая сумма ставок, которую необходимо сделать в играх, чтобы перевести бонусные средства в реальный баланс для вывода.
                </p>
                <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] text-amber-200/90 text-[12.5px]">
                  <strong className="text-amber-400 block mb-0.5">Пример:</strong>
                  Если вы получили бонус 100 zł с вейджером x5, нужно сделать ставок на общую сумму 500 zł (100 × 5).
                </div>
                <p className="text-[12.5px] text-whisper-gray/80">
                  В зачет прогресса идут как выигрышные, так и проигрышные ставки. По достижении 100% средства моментально разблокируются!
                </p>
              </div>
              
              <button
                onClick={() => setIsWagerModalOpen(false)}
                className="mt-5 w-full rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 hover:opacity-95 active:scale-[0.98] py-3 font-roobert font-bold text-[14px] text-[#08090c] shadow-lg transition-all"
              >
                Понятно
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
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

function deriveStats(transactions: Array<any>): DerivedStats {
  const bets: BetRowData[] = [];
  let totalWon = 0;
  let maxWin = 0;
  let maxMultiplier = 0;

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
  iconBg,
  label,
  value,
  suffix,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <motion.div 
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', bounce: 0.3 }}
      className="rounded-[22px] border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] backdrop-blur-xl p-3.5 shadow-lg flex flex-col justify-between"
    >
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded-xl border ${iconBg} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <span className="text-[10px] uppercase font-bold tracking-[0.16em] text-whisper-gray truncate font-roobert">
          {label}
        </span>
      </div>
      <div className="mt-2.5 font-roobert text-[19px] font-bold text-frost-white tabular-nums tracking-tight leading-none">
        {value}
        {suffix && (
          <span className="block mt-1 font-roobert text-[11px] font-normal text-whisper-gray/80 tabular-nums">
            {suffix}
          </span>
        )}
      </div>
    </motion.div>
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', duration: 0.4, delay: index * 0.04 }}
      className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3.5 hover:bg-white/[0.03] transition-colors"
    >
      <GameIconTile game={row.game} size="sm" />

      <div className="min-w-0">
        <div className="font-roobert font-medium text-[14.5px] text-frost-white truncate">
          {row.gameLabel}
        </div>
        <div className="font-roobert text-[11.5px] text-whisper-gray/80 tabular-nums">
          {dateLabel} · ставка{' '}
          <span className="text-frost-white/90 font-medium">
            {row.stake.toLocaleString('ru-RU', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}{' '}
            zł
          </span>
        </div>
      </div>

      <div className="text-right">
        <div
          className={`font-roobert font-semibold text-[14.5px] tabular-nums ${
            row.outcome === 'won'
              ? 'text-emerald-400'
              : row.outcome === 'lost'
              ? 'text-[#ff7b6b]'
              : 'text-whisper-gray'
          }`}
        >
          {netLabel}
        </div>
        {row.multiplier !== null && row.outcome === 'won' && (
          <div className="mt-0.5 inline-block font-roobert text-[10px] font-bold text-emerald-400 px-1.5 py-0.2 rounded-md bg-emerald-500/15 border border-emerald-500/20 tabular-nums">
            x{row.multiplier.toFixed(2)}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function EmptyBets({ onPlay }: { onPlay: () => void }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] backdrop-blur-xl py-12 px-6 flex flex-col items-center text-center shadow-lg">
      <motion.div 
        animate={{ y: [0, -4, 0] }}
        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
        className="w-14 h-14 rounded-2xl border border-white/15 bg-white/[0.05] flex items-center justify-center mb-3 shadow-inner"
      >
        <Dice5 size={24} className="text-amber-400" strokeWidth={1.8} />
      </motion.div>
      <p className="font-roobert font-semibold text-frost-white text-[16px]">
        Ставки появятся здесь
      </p>
      <p className="mt-1 font-roobert text-[12.5px] text-whisper-gray max-w-[290px] leading-relaxed">
        Самое время сыграть! Честный RTP от 97% и моментальные выплаты.
      </p>
      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={onPlay}
        className="mt-5 inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 text-[#08090c] font-roobert font-bold text-[12.5px] uppercase tracking-[0.18em] shadow-[0_4px_20px_rgba(245,158,11,0.3)] transition-all"
      >
        Играть
        <ChevronRight size={15} strokeWidth={2.5} />
      </motion.button>
    </div>
  );
}
