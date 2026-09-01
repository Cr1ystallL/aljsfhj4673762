'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy,
  Check,
  Dice5,
  ChevronRight,
  Wallet,
  HelpCircle,
  X,
  Shield,
  Clock,
  ArrowUpRight,
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
import { ProfileTrophyShelf } from '@/components/profile/profile-trophy-shelf';
import { SportsMyBets } from '@/components/sports/sports-my-bets';
import { SoccerBallIcon } from '@/components/ui/soccer-ball-icon';
import { Pressable } from '@/components/ui/pressable';
import { StreakFlameBadge } from '@/components/ui/streak-flame-badge';
import { useWinStreak } from '@/hooks/use-win-streak';
import { useT } from '@/i18n/use-t';
import { PAGE_WIDTH } from '@/components/layout/page-width';
import { VipBadge } from '@/components/vip/vip-badge';
import { VipFaqModal } from '@/components/vip/vip-faq-modal';
import { RankUpModal } from '@/components/vip/rank-up-modal';
import { useVip } from '@/hooks/use-vip';
import { Sparkles } from 'lucide-react';

/**
 * Profile Page — Pure Black Obsidian & Apple Design System
 *
 * Full redesign of the Hero Identity Card and profile canvas in pure pitch black (#000000 / #050506).
 * Eliminates all dark blue tints, substituting them with deep obsidian glass, crisp white typography,
 * spring physics, and luxury tactile controls.
 */

export default function ProfilePage() {
  const router = useRouter();
  const { t, localeTag } = useT();
  const { user } = useAuthStore();
  const { streak } = useWinStreak();
  const { status: vipStatus, claiming, claimReward } = useVip();
  const { balance, fetchBalance } = useBalance();
  const { transactions, isLoading: txLoading, fetchTransactions } = useTransactions();
  const [copied, setCopied] = useState(false);
  const [isWagerModalOpen, setIsWagerModalOpen] = useState(false);
  const [isVipModalOpen, setIsVipModalOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState<'games' | 'sports'>('games');
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
            className="relative overflow-hidden rounded-[20px] border border-white/12 bg-[#101216] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          >
            <LanguageSwitcher className="absolute top-3 right-3 z-10" />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.06)_0%,transparent_75%)]"
            />

            <div className="relative px-5 pt-8 pb-6 flex flex-col items-center text-center">

              {/* Avatar Frame with Obsidian Dual-Ring */}
              <motion.div 
                whileHover={{ scale: 1.04 }}
                transition={{ type: 'spring', bounce: 0.3 }}
                className="relative group cursor-pointer"
              >
                <div className="relative p-1 rounded-full border border-white/20 bg-[#16181d] shadow-2xl">
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

                {/* VIP Rank Badge Pin */}
                {vipStatus?.currentTier && (
                  <div className="absolute -bottom-1 -right-1 z-20">
                    <VipBadge rankId={vipStatus.currentTier.id} size="sm" showGlow={true} />
                  </div>
                )}
              </motion.div>

              {/* User Full Name & Streak Flame Badge */}
              <div className="mt-3.5 flex items-center justify-center gap-2">
                <h2 className="font-roobert text-[25px] font-bold text-white tracking-tight leading-snug">
                  {user?.firstName || t('profile.player')}
                  {user?.lastName ? ` ${user.lastName}` : ''}
                </h2>
                {streak >= 2 && <StreakFlameBadge streak={streak} size="md" />}
              </div>

              {/* Telegram ID Copy Button */}
              {user?.telegramId !== undefined && (
                <Pressable
                  onClick={handleCopyId}
                  className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-white/10 bg-white/[0.04]"
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
                </Pressable>
              )}

              {/* VIP Rank Progress Element — Full structure above balance, transparent background */}
              {vipStatus?.currentTier && (
                <div className="mt-5 w-full flex flex-col gap-3.5 text-left">
                  {/* Top row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <VipBadge rankId={vipStatus.currentTier.id} size="md" showGlow={true} />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-roobert text-[17px] font-extrabold text-white tracking-tight">
                            {vipStatus.currentTier.nameRu}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/80 font-bold text-[10px] tracking-wide">
                            Lvl {vipStatus.currentTier.level}
                          </span>
                        </div>
                        <p className="text-[11px] text-white/50 mt-0.5">
                          Кэшбэк <b className="text-emerald-400">{vipStatus.currentTier.cashbackPercent}%</b>
                          {vipStatus.nextTier && ` · Следующий: ${vipStatus.nextTier.nameRu}`}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsVipModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition-colors text-[11px] font-bold"
                    >
                      <Sparkles size={12} className="text-white" />
                      <span>Ранги</span>
                    </button>
                  </div>

                  {/* Progress bar */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11.5px]">
                      <span className="font-medium text-white/60">
                        Прогресс XP: <b className="text-white">{vipStatus.xp.toLocaleString('ru-RU')} XP</b>
                      </span>
                      {vipStatus.nextTier ? (
                        <span className="text-white/50 text-[11px]">
                          До {vipStatus.nextTier.nameRu}: <b className="text-amber-300">{(vipStatus.nextTier.minXp - vipStatus.xp).toLocaleString('ru-RU')} XP</b>
                        </span>
                      ) : (
                        <span className="text-amber-300 font-bold text-[11px]">Максимальный ранг! 👑</span>
                      )}
                    </div>

                    <div className="h-2.5 w-full bg-white/10 rounded-full overflow-hidden p-0.5 border border-white/5">
                      <motion.div
                        className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-200 rounded-full shadow-[0_0_12px_rgba(245,158,11,0.5)]"
                        initial={{ width: 0 }}
                        animate={{ width: `${vipStatus.progressPercent}%` }}
                        transition={{ type: 'spring', duration: 0.8, bounce: 0.1 }}
                      />
                    </div>
                  </div>

                  {/* Claim reward alert banner */}
                  {vipStatus.unclaimedLevels.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-950/40 via-black/60 to-black/80 flex items-center justify-between gap-3 shadow-lg shadow-amber-500/10"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-amber-300 font-extrabold text-[12px]">
                          <Sparkles size={14} />
                          <span>Доступна награда за уровень {vipStatus.unclaimedLevels[0]}!</span>
                        </div>
                      </div>

                      <Pressable
                        onClick={() => claimReward(vipStatus.unclaimedLevels[0])}
                        disabled={claiming}
                        className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 hover:brightness-110 text-black font-extrabold text-[11.5px] transition-all shrink-0 shadow-md shadow-amber-500/20 active:scale-95 disabled:opacity-50"
                      >
                        {claiming ? 'Зачисление...' : 'Забрать'}
                      </Pressable>
                    </motion.div>
                  )}
                </div>
              )}

              {/* Elevated Obsidian Balance Card */}
              <Pressable
                onClick={() => router.push('/balance')}
                className="mt-4 w-full p-4 rounded-[16px] border border-white/12 bg-white/[0.04] flex items-center justify-between shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-white group-hover:scale-105 transition-transform shadow-inner">
                    <Wallet size={18} strokeWidth={2} />
                  </div>
                  <div className="text-left">
                    <span className="block text-[10px] uppercase font-bold tracking-[0.16em] text-whisper-gray">
                      {t('profile.currentBalance')}
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="font-roobert text-[20px] font-bold text-white tabular-nums tracking-tight">
                        {balanceAmount.toLocaleString(localeTag, {
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

                <div className="w-9 h-9 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-whisper-gray">
                  <ChevronRight size={22} strokeWidth={2.2} />
                </div>
              </Pressable>

              {/* Active Wager Progress Section */}
              {balance?.wagerTarget && balance.wagerTarget > 0 && balance.wagerProgress !== undefined && balance.wagerProgress < balance.wagerTarget ? (
                <div className="w-full mt-3 p-4 rounded-2xl border border-white/10 bg-white/[0.02] flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-roobert text-[12px] font-medium text-whisper-gray">{t('profile.wager')}</span>
                      <button 
                        onClick={() => setIsWagerModalOpen(true)}
                        className="text-whisper-gray/70 hover:text-white transition-colors p-0.5"
                        aria-label={t('profile.wagerHelp')}
                      >
                        <HelpCircle size={14} strokeWidth={2} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-roobert text-[12px] font-bold text-white tabular-nums">
                        {balance.wagerProgress.toLocaleString(localeTag, { maximumFractionDigits: 2 })} / {balance.wagerTarget.toLocaleString(localeTag, { maximumFractionDigits: 2 })} zł
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

          <ProfileTrophyShelf
            stats={{
              totalBets: stats.totalBets,
              totalWon: stats.totalWon,
              maxWin: stats.maxWin,
              maxMultiplier: stats.maxMultiplier,
              favorite: stats.favorite,
            }}
          />

          <section className="mt-1">
            <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl border border-white/10 bg-[#101216] mb-3">
              <button
                type="button"
                onClick={() => setHistoryTab('games')}
                className={`py-2 rounded-xl font-roobert text-[12px] font-semibold transition-all ${
                  historyTab === 'games'
                    ? 'bg-[#1e222b] text-frost-white border border-white/15'
                    : 'text-whisper-gray'
                }`}
              >
                {t('profile.tabGames')}
              </button>
              <button
                type="button"
                onClick={() => setHistoryTab('sports')}
                className={`py-2 rounded-xl font-roobert text-[12px] font-semibold transition-all ${
                  historyTab === 'sports'
                    ? 'bg-[#1e222b] text-frost-white border border-white/15'
                    : 'text-whisper-gray'
                }`}
              >
                {t('profile.tabSports')}
              </button>
            </div>

            {historyTab === 'games' ? (
              <>
                <div className="flex items-center justify-between px-1 mb-2.5">
                  <div className="flex items-center gap-2">
                    <Clock size={15} className="text-whisper-gray" strokeWidth={1.8} />
                    <span className="font-roobert font-medium text-white text-[15px]">
                      {t('profile.recentBets')}
                    </span>
                  </div>
                  <span className="font-roobert text-[11px] font-medium px-2.5 py-0.5 rounded-full border border-white/10 bg-white/[0.04] text-whisper-gray tracking-wider">
                    {t('profile.shownOf', {
                      n: Math.min(transactions.length, 7),
                      total: transactions.length,
                    })}
                  </span>
                </div>

                {txLoading ? (
                  <div className="rounded-[22px] border border-white/10 bg-[#0c0d0f] py-14 flex flex-col items-center justify-center gap-3">
                    <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                    <span className="text-[12px] text-whisper-gray">{t('profile.loadingHistory')}</span>
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
              </>
            ) : (
              <div className="rounded-[20px] border border-white/12 bg-[#101216] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="flex items-center justify-between px-0.5 mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/12 flex items-center justify-center text-frost-white">
                      <SoccerBallIcon size={16} strokeWidth={2.2} />
                    </div>
                    <span className="font-roobert text-[15px] font-bold text-frost-white">
                      {t('profile.sportsBets')}
                    </span>
                  </div>
                  <Pressable
                    onClick={() => router.push('/sport')}
                    className="px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.04] font-roobert text-[11px] text-whisper-gray"
                  >
                    {t('profile.sportsOpen')}
                  </Pressable>
                </div>
                <SportsMyBets compact hideHeading />
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
                {t('profile.adminPanel')}
              </span>
              <ArrowUpRight size={14} className="text-whisper-gray" strokeWidth={1.8} />
            </motion.button>
          )}

        </div>
      </main>

      {/* VIP FAQ Ranks Modal */}
      <VipFaqModal
        isOpen={isVipModalOpen}
        onClose={() => setIsVipModalOpen(false)}
        currentLevel={vipStatus?.currentTier?.level || 0}
      />

      {/* Rank Up Celebration Modal */}
      <RankUpModal
        currentTier={vipStatus?.currentTier}
        onClaim={claimReward}
        unclaimedLevels={vipStatus?.unclaimedLevels}
      />

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
                aria-label={t('common.close')}
              >
                <X size={16} strokeWidth={2} />
              </button>
              
              <div className="mb-4 flex items-center gap-2.5 text-white">
                <div className="p-2 rounded-xl bg-white/10 border border-white/15 text-white">
                  <HelpCircle size={18} strokeWidth={2} />
                </div>
                <h3 className="font-roobert text-[16.5px] font-medium">{t('profile.wagerHow')}</h3>
              </div>
              
              <div className="space-y-3 font-roobert text-[13px] text-whisper-gray/90 leading-relaxed">
                <p className="p-3 rounded-xl border border-white/10 bg-white/[0.03]">
                  <strong className="text-white font-medium">{t('profile.wager')}</strong>
                  {' — '}
                  {t('profile.wagerBody')}
                </p>
                <div className="p-3 rounded-xl border border-white/10 bg-white/[0.04] text-whisper-gray text-[12.5px]">
                  <strong className="text-white block mb-0.5">{t('profile.wagerExampleTitle')}</strong>
                  {t('profile.wagerExample')}
                </div>
                <p className="text-[12px] text-whisper-gray/80">
                  {t('profile.wagerGames')}
                </p>
              </div>

              <button
                onClick={() => {
                  setIsWagerModalOpen(false);
                  router.push('/info#faq');
                }}
                className="mt-4 w-full rounded-2xl border border-white/15 bg-white/[0.05] hover:bg-white/10 active:scale-[0.98] py-2.5 font-roobert font-medium text-[13.5px] text-white transition-all"
              >
                {t('profile.wagerTable')}
              </button>

              <button
                onClick={() => setIsWagerModalOpen(false)}
                className="mt-2 w-full rounded-2xl bg-white/15 hover:bg-white/20 active:scale-[0.98] py-2.5 font-roobert font-medium text-[13.5px] text-white transition-all border border-white/15"
              >
                {t('common.gotIt')}
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
  favorite: ReturnType<typeof resolveGameKey> | null;
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

  const counts = new Map<BetRowData['game'], number>();
  for (const b of bets) {
    if (b.game === 'unknown') continue;
    counts.set(b.game, (counts.get(b.game) ?? 0) + 1);
  }
  let favorite: BetRowData['game'] | null = null;
  let favoriteN = 0;
  for (const [game, n] of counts) {
    if (n > favoriteN) {
      favorite = game;
      favoriteN = n;
    }
  }

  return {
    totalBets: bets.length,
    totalWagered: bets.reduce((acc, b) => acc + b.stake, 0),
    totalWon,
    maxWin,
    maxMultiplier,
    favorite,
    bets,
  };
}

/* -------------------------------------------------------------- subcomponents */

function BetRow({ row, index }: { row: BetRowData; index: number }) {
  const { t, localeTag } = useT();
  const dateLabel = row.date.toLocaleString(localeTag, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const amount = row.stake.toLocaleString(localeTag, {
    maximumFractionDigits: 2,
  });

  const netLabel =
    row.outcome === 'pending'
      ? '…'
      : `${row.net >= 0 ? '+' : '−'}${Math.abs(row.net).toLocaleString(localeTag, {
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
          {t('profile.stakeAt', { date: dateLabel, amount })}
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
  const { t } = useT();
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
        {t('common.emptyHistory')}
      </p>
      <p className="mt-1 font-roobert text-[12px] text-whisper-gray max-w-[280px] leading-relaxed">
        {t('profile.emptyBets')}
      </p>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={onPlay}
        className="mt-5 inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white text-black font-roobert font-semibold text-[12px] uppercase tracking-[0.18em] shadow-lg hover:bg-white/90 transition-all"
      >
        {t('common.play')}
        <ChevronRight size={14} strokeWidth={2.5} />
      </motion.button>
    </div>
  );
}
