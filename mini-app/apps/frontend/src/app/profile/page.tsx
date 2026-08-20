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
  Sparkles,
} from 'lucide-react';
import { PageTransition } from '@/components/ui/page-transition';
import { GameTopBar } from '@/components/game/game-top-bar';
import { GameIconTile, gameLabel, resolveGameKey } from '@/components/ui/game-icon';
import { useBalance } from '@/hooks/use-balance';
import { useTransactions } from '@/hooks/use-transactions';
import { useAuthStore } from '@/store/auth-store';
import { useRouter } from 'next/navigation';
import { useIsAdmin } from '@/lib/admin-probe';
import { LanguageSwitcher } from '@/components/profile/language-switcher';
import { useT } from '@/i18n/use-t';
import { PAGE_WIDTH } from '@/components/layout/page-width';

/**
 * Profile Page — Pure Black Obsidian & Apple Design System
 *
 * Full redesign of the Hero Identity Card and profile canvas in pure pitch black (#000000 / #050506).
 * Eliminates all dark blue tints, substituting them with deep obsidian glass, crisp white typography,
 * spring physics, and luxury tactile controls.
 */

export default function ProfilePage() {
  const router = useRouter();
  const { t } = useT();
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
      <main className="relative min-h-screen w-full bg-black text-frost-white overflow-x-hidden pb-36 font-roobert">
        {/* Pure Black Subtle Ambient Spotlight */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden z-0 opacity-30">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.06)_0%,transparent_70%)] blur-[90px]" />
        </div>

        {/* Sticky Header */}
        <GameTopBar title={t('profile.title')} hideBalance={true} width="wide" />

        <div className={`relative z-10 mx-auto w-full ${PAGE_WIDTH.wide} px-3.5 pt-4 flex flex-col gap-4`}>

          {/* ========================================================================= */}
          {/* HERO IDENTITY CARD — FULL REDESIGN (Pure Pitch Black & Obsidian Glass)    */}
          {/* ========================================================================= */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', duration: 0.5, bounce: 0 }}
            className="relative overflow-hidden rounded-[32px] border border-white/12 bg-[#0c0d0f] shadow-[0_24px_60px_rgba(0,0,0,0.95)]"
          >
            <LanguageSwitcher className="absolute top-3 right-3 z-10" />
            {/* Pure Black User Photo Backdrop (No Blue Tint) */}
            {user?.photoUrl ? (
              <>
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-20"
                  style={{
                    backgroundImage: `url(${user.photoUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'blur(50px) grayscale(0.6)',
                    transform: 'scale(1.3)',
                  }}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-[#0c0d0f]/90 to-[#0c0d0f]"
                />
              </>
            ) : (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.06)_0%,transparent_75%)]"
              />
            )}

            <div className="relative px-5 pt-8 pb-6 flex flex-col items-center text-center">

              {/* Avatar Frame with Obsidian Dual-Ring */}
              <motion.div 
                whileHover={{ scale: 1.04 }}
                transition={{ type: 'spring', bounce: 0.3 }}
                className="relative group cursor-pointer"
              >
                <div className="relative p-1 rounded-full border border-white/20 bg-gradient-to-b from-white/15 to-white/5 shadow-2xl backdrop-blur-xl">
                  {user?.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.photoUrl}
                      alt={user.firstName || 'User'}
                      className="relative w-20 h-20 rounded-full object-cover border border-black"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="relative w-20 h-20 rounded-full border border-black bg-black flex items-center justify-center">
                      <span className="font-roobert text-3xl font-light text-frost-white tracking-wider">
                        {initials}
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>

              {/* User Full Name */}
              <h2 className="mt-3.5 font-roobert text-[25px] font-bold text-white tracking-tight leading-snug">
                {user?.firstName || t('profile.player')}
                {user?.lastName ? ` ${user.lastName}` : ''}
              </h2>

              {/* Telegram ID Copy Button */}
              {user?.telegramId !== undefined && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleCopyId}
                  className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 active:scale-95 transition-all shadow-sm"
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
                        className="flex items-center gap-1 text-frost-white"
                      >
                        <Check size={12} strokeWidth={2.5} />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-whisper-gray">{t('profile.copied')}</span>
                      </motion.div>
                    ) : (
                      <motion.div key="copy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Copy size={12} className="text-whisper-gray/70" strokeWidth={1.8} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              )}

              {/* Elevated Obsidian Balance Card */}
              <motion.div
                whileHover={{ scale: 1.01, y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push('/balance')}
                className="mt-5 w-full p-4 rounded-2xl border border-white/12 bg-gradient-to-b from-white/[0.06] via-white/[0.03] to-white/[0.01] backdrop-blur-xl flex items-center justify-between shadow-xl cursor-pointer hover:border-white/25 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-white group-hover:scale-105 transition-transform shadow-inner">
                    <Wallet size={18} strokeWidth={2} />
                  </div>
                  <div className="text-left">
                    <span className="block text-[10px] uppercase font-bold tracking-[0.16em] text-whisper-gray">
                      Текущий баланс
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="font-roobert text-[20px] font-bold text-white tabular-nums tracking-tight">
                        {balanceAmount.toLocaleString('ru-RU', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <span className="text-whisper-gray text-[13px] font-bold uppercase">
                        zł
                      </span>
                    </div>
                  </div>
                </div>

                <div className="w-9 h-9 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-whisper-gray group-hover:text-white group-hover:bg-white/10 transition-all">
                  <ChevronRight size={22} strokeWidth={2.2} />
                </div>
              </motion.div>

              {/* Active Wager Progress Section */}
              {balance?.wagerTarget && balance.wagerTarget > 0 && balance.wagerProgress !== undefined && balance.wagerProgress < balance.wagerTarget ? (
                <div className="w-full mt-3 p-4 rounded-2xl border border-white/10 bg-white/[0.02] flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-roobert text-[12px] font-medium text-whisper-gray">Отыгрыш бонуса</span>
                      <button 
                        onClick={() => setIsWagerModalOpen(true)}
                        className="text-whisper-gray/70 hover:text-white transition-colors p-0.5"
                        aria-label="Что такое отыгрыш?"
                      >
                        <HelpCircle size={14} strokeWidth={2} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-roobert text-[12px] font-bold text-white tabular-nums">
                        {balance.wagerProgress.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} / {balance.wagerTarget.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} zł
                      </span>
                      <span className="text-[10px] font-bold text-white px-2 py-0.5 rounded-md bg-white/10 border border-white/15 tabular-nums">
                        {wagerProgressPercent.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden p-0.5 border border-white/5">
                    <motion.div
                      className="h-full bg-gradient-to-r from-white/70 via-white to-white/90 rounded-full shadow-[0_0_12px_rgba(255,255,255,0.5)]"
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
              icon={<Dice5 size={16} className="text-white/80" strokeWidth={1.8} />}
              label="Всего ставок"
              value={stats.totalBets.toLocaleString('ru-RU')}
              suffix={`(${stats.totalWagered.toLocaleString('ru-RU', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })} zł)`}
            />
            <StatTile
              icon={<Coins size={16} className="text-white/80" strokeWidth={1.8} />}
              label="Сумма выигрышей"
              value={`${stats.totalWon.toLocaleString('ru-RU', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })} zł`}
            />
            <StatTile
              icon={<Trophy size={16} className="text-white/80" strokeWidth={1.8} />}
              label="Макс выигрыш"
              value={`${stats.maxWin.toLocaleString('ru-RU', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })} zł`}
            />
            <StatTile
              icon={<Sparkles size={16} className="text-white/80" strokeWidth={1.8} />}
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
                <Clock size={15} className="text-whisper-gray" strokeWidth={1.8} />
                <span className="font-roobert font-medium text-white text-[15px]">
                  Последние ставки
                </span>
              </div>
              <span className="font-roobert text-[11px] font-medium px-2.5 py-0.5 rounded-full border border-white/10 bg-white/[0.04] text-whisper-gray tracking-wider">
                {Math.min(transactions.length, 7)} из {transactions.length}
              </span>
            </div>

            {txLoading ? (
              <div className="rounded-[22px] border border-white/10 bg-[#0c0d0f] py-14 flex flex-col items-center justify-center gap-3">
                <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                <span className="text-[12px] text-whisper-gray">Загрузка истории...</span>
              </div>
            ) : stats.bets.length === 0 ? (
              <EmptyBets onPlay={() => router.push('/game/crash')} />
            ) : (
              <div className="rounded-[24px] border border-white/10 bg-[#0c0d0f] overflow-hidden shadow-xl">
                <div className="divide-y divide-white/[0.05]">
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
              className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-2xl border border-white/15 bg-[#0c0d0f] hover:bg-white/[0.05] hover:border-white/25 shadow-lg transition-all mt-2"
            >
              <Shield size={16} className="text-white/80" strokeWidth={1.8} />
              <span className="font-roobert text-[12px] font-medium uppercase tracking-[0.2em] text-white">
                Панель администратора
              </span>
              <ArrowUpRight size={14} className="text-whisper-gray" strokeWidth={1.8} />
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
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
              className="relative w-full max-w-[350px] rounded-[24px] border border-white/15 bg-[#0e0f12] p-6 shadow-2xl overflow-hidden"
            >
              <button
                onClick={() => setIsWagerModalOpen(false)}
                className="absolute right-4 top-4 p-1.5 rounded-full bg-white/5 border border-white/10 text-whisper-gray hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Закрыть"
              >
                <X size={16} strokeWidth={2} />
              </button>
              
              <div className="mb-4 flex items-center gap-2.5 text-white">
                <div className="p-2 rounded-xl bg-white/10 border border-white/15 text-white">
                  <HelpCircle size={18} strokeWidth={2} />
                </div>
                <h3 className="font-roobert text-[16.5px] font-medium">Как работает отыгрыш?</h3>
              </div>
              
              <div className="space-y-3 font-roobert text-[13px] text-whisper-gray/90 leading-relaxed">
                <p className="p-3 rounded-xl border border-white/10 bg-white/[0.03]">
                  <strong className="text-white font-medium">Отыгрыш (вейджер)</strong> — это сумма ставок, которую необходимо сделать в играх, чтобы перевести бонусные средства в реальный баланс.
                </p>
                <div className="p-3 rounded-xl border border-white/10 bg-white/[0.04] text-whisper-gray text-[12.5px]">
                  <strong className="text-white block mb-0.5">Пример:</strong>
                  Бонус 100 zł с вейджером x5 требует суммарных ставок на 500 zł (100 × 5).
                </div>
                <p className="text-[12px] text-whisper-gray/80">
                  Учитываются ставки во всех играх, но вклад отличается: Mines
                  засчитывается на 30%, Plinko — на 50%, остальные игры — полностью.
                  По достижении 100% средства доступны к выводу.
                </p>
              </div>

              <button
                onClick={() => {
                  setIsWagerModalOpen(false);
                  router.push('/info#faq');
                }}
                className="mt-4 w-full rounded-2xl border border-white/15 bg-white/[0.05] hover:bg-white/10 active:scale-[0.98] py-2.5 font-roobert font-medium text-[13.5px] text-white transition-all"
              >
                Таблица отыгрыша по играм
              </button>

              <button
                onClick={() => setIsWagerModalOpen(false)}
                className="mt-2 w-full rounded-2xl bg-white/15 hover:bg-white/20 active:scale-[0.98] py-2.5 font-roobert font-medium text-[13.5px] text-white transition-all border border-white/15"
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
  net: number;
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
    <motion.div 
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', bounce: 0.2 }}
      className="rounded-[22px] border border-white/10 bg-[#0c0d0f] p-3.5 shadow-lg flex flex-col justify-between"
    >
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-xl border border-white/10 bg-white/[0.05] flex items-center justify-center shrink-0">
          {icon}
        </div>
        <span className="text-[10px] uppercase font-semibold tracking-[0.18em] text-whisper-gray truncate font-roobert">
          {label}
        </span>
      </div>
      <div className="mt-2.5 font-roobert text-[18.5px] font-medium text-white tabular-nums tracking-tight leading-none">
        {value}
        {suffix && (
          <span className="block mt-1 font-roobert text-[11px] font-normal text-whisper-gray/70 tabular-nums">
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
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', duration: 0.4, delay: index * 0.04 }}
      className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3.5 hover:bg-white/[0.03] transition-colors"
    >
      <GameIconTile game={row.game} size="sm" />

      <div className="min-w-0">
        <div className="font-roobert font-medium text-[14px] text-white truncate">
          {row.gameLabel}
        </div>
        <div className="font-roobert text-[11.5px] text-whisper-gray/70 tabular-nums">
          {dateLabel} · ставка{' '}
          <span className="text-white/90">
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
          className={`font-roobert font-medium text-[14px] tabular-nums ${
            row.outcome === 'won'
              ? 'text-white font-semibold'
              : row.outcome === 'lost'
              ? 'text-[#ff8a76]/80'
              : 'text-whisper-gray'
          }`}
        >
          {netLabel}
        </div>
        {row.multiplier !== null && row.outcome === 'won' && (
          <div className="mt-0.5 font-roobert text-[10px] font-medium text-whisper-gray tabular-nums">
            x{row.multiplier.toFixed(2)}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function EmptyBets({ onPlay }: { onPlay: () => void }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-[#0c0d0f] py-12 px-6 flex flex-col items-center text-center shadow-lg">
      <motion.div 
        animate={{ y: [0, -3, 0] }}
        transition={{ repeat: Infinity, duration: 3.5, ease: 'easeInOut' }}
        className="w-14 h-14 rounded-2xl border border-white/15 bg-white/[0.04] flex items-center justify-center mb-3 shadow-inner"
      >
        <Dice5 size={22} className="text-white/70" strokeWidth={1.8} />
      </motion.div>
      <p className="font-roobert font-medium text-white text-[15.5px]">
        Ставки появятся здесь
      </p>
      <p className="mt-1 font-roobert text-[12px] text-whisper-gray max-w-[280px] leading-relaxed">
        Самое время сыграть. Честный RTP от 97% и моментальные выплаты.
      </p>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={onPlay}
        className="mt-5 inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white text-black font-roobert font-semibold text-[12px] uppercase tracking-[0.18em] shadow-lg hover:bg-white/90 transition-all"
      >
        Играть
        <ChevronRight size={14} strokeWidth={2.5} />
      </motion.button>
    </div>
  );
}
