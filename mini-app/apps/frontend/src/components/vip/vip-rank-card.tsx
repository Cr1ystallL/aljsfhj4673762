'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Crown, Gift, Info, ChevronRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { useVip } from '@/hooks/use-vip';
import { VipBadge } from './vip-badge';
import { VipFaqModal } from './vip-faq-modal';
import { Pressable } from '@/components/ui/pressable';
import { VIP_RANKS } from '@/lib/vip';

export function VipRankCard({ className }: { className?: string }) {
  const { status, loading, claiming, claimReward } = useVip();
  const [faqOpen, setFaqOpen] = useState(false);

  if (loading || !status) {
    return (
      <div className="w-full h-36 rounded-[20px] border border-white/10 bg-white/[0.03] animate-pulse" />
    );
  }

  const { currentTier, nextTier, xp, progressPercent, unclaimedLevels } = status;
  const hasUnclaimed = unclaimedLevels.length > 0;
  const firstUnclaimedLevel = unclaimedLevels[0];
  const unclaimedTier = firstUnclaimedLevel ? VIP_RANKS.find((r) => r.level === firstUnclaimedLevel) : null;

  return (
    <>
      <div
        className={`relative overflow-visible rounded-[20px] border border-white/12 bg-gradient-to-b from-[#13151b] to-[#0c0e12] p-4 sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] flex flex-col gap-3.5 ${
          className || ''
        }`}
      >
        {/* Glow ambient */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full bg-amber-500/10 blur-3xl"
        />

        {/* Top row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <VipBadge rankId={currentTier.id} size="md" showGlow={true} />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-roobert text-[17px] font-extrabold text-white tracking-tight">
                  {currentTier.nameRu}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/80 font-bold text-[10px] tracking-wide">
                  Lvl {currentTier.level}
                </span>
              </div>
              <p className="text-[11px] text-white/50 mt-0.5">
                Кэшбэк <b className="text-emerald-400">{currentTier.cashbackPercent}%</b>
                {nextTier && ` · Следующий: ${nextTier.nameRu}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setFaqOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition-colors text-[11px] font-bold"
          >
            <Info size={13} />
            <span>Ранги</span>
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex flex-col gap-1.5 mt-1">
          <div className="flex items-center justify-between text-[11.5px]">
            <span className="font-medium text-white/60">
              Прогресс XP: <b className="text-white">{xp.toLocaleString('ru-RU')} XP</b>
            </span>
            {nextTier ? (
              <span className="text-white/50 text-[11px]">
                До {nextTier.nameRu}: <b className="text-amber-300">{(nextTier.minXp - xp).toLocaleString('ru-RU')} XP</b>
              </span>
            ) : (
              <span className="text-amber-300 font-bold text-[11px]">Максимальный ранг! 👑</span>
            )}
          </div>

          <div className="h-2.5 w-full bg-white/10 rounded-full overflow-hidden p-0.5 border border-white/5">
            <motion.div
              className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-200 rounded-full shadow-[0_0_12px_rgba(245,158,11,0.5)]"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ type: 'spring', duration: 0.8, bounce: 0.1 }}
            />
          </div>
        </div>

        {/* Claim reward alert banner */}
        {hasUnclaimed && unclaimedTier && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-950/40 via-black/60 to-black/80 flex items-center justify-between gap-3 shadow-lg shadow-amber-500/10"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-amber-300 font-extrabold text-[12px]">
                <Sparkles size={14} />
                <span>Доступна награда за {unclaimedTier.nameRu}!</span>
              </div>
              <div className="text-[11px] text-white/70 truncate mt-0.5">
                {unclaimedTier.rewardDescription}
              </div>
            </div>

            <Pressable
              onClick={() => claimReward(firstUnclaimedLevel)}
              disabled={claiming}
              className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 hover:brightness-110 text-black font-extrabold text-[11.5px] transition-all shrink-0 shadow-md shadow-amber-500/20 active:scale-95 disabled:opacity-50"
            >
              {claiming ? 'Зачисление...' : 'Забрать'}
            </Pressable>
          </motion.div>
        )}
      </div>

      <VipFaqModal
        isOpen={faqOpen}
        onClose={() => setFaqOpen(false)}
        currentLevel={currentTier.level}
      />
    </>
  );
}
