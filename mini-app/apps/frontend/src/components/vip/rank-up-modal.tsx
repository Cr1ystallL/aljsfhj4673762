'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Crown, Gift, Percent, ArrowRight, Check } from 'lucide-react';
import { VipBadge } from './vip-badge';
import { type VipTierConfig, VIP_RANKS } from '@/lib/vip';
import { soundManager } from '@/lib/sound/sound-manager';
import { haptics } from '@/lib/haptics';
import { Pressable } from '@/components/ui/pressable';

interface RankUpModalProps {
  currentTier?: VipTierConfig | null;
  onClaim?: (level: number) => void;
  unclaimedLevels?: number[];
}

const RANK_THEMES: Record<string, {
  color: string;
  glow: string;
  border: string;
  pillBg: string;
  particle: string;
}> = {
  bronze: {
    color: 'rgba(205, 127, 50, 0.6)',
    glow: 'rgba(205, 127, 50, 0.35)',
    border: 'border-[#cd7f32]/60',
    pillBg: 'from-[#cd7f32]/30 to-[#b87333]/20 border-[#cd7f32]/50 text-[#f5cba7]',
    particle: 'from-[#cd7f32] to-[#f5cba7]',
  },
  silver: {
    color: 'rgba(192, 192, 192, 0.7)',
    glow: 'rgba(220, 220, 240, 0.4)',
    border: 'border-slate-300/60',
    pillBg: 'from-slate-400/30 to-slate-200/20 border-slate-300/50 text-slate-100',
    particle: 'from-slate-200 to-white',
  },
  gold: {
    color: 'rgba(245, 158, 11, 0.7)',
    glow: 'rgba(245, 158, 11, 0.4)',
    border: 'border-amber-400/60',
    pillBg: 'from-amber-500/30 to-yellow-400/20 border-amber-400/50 text-amber-200',
    particle: 'from-amber-300 to-yellow-500',
  },
  platinum: {
    color: 'rgba(6, 182, 212, 0.7)',
    glow: 'rgba(6, 182, 212, 0.45)',
    border: 'border-cyan-400/60',
    pillBg: 'from-cyan-500/30 to-teal-400/20 border-cyan-400/50 text-cyan-200',
    particle: 'from-cyan-300 to-teal-400',
  },
  diamond: {
    color: 'rgba(168, 85, 247, 0.7)',
    glow: 'rgba(168, 85, 247, 0.5)',
    border: 'border-purple-400/60',
    pillBg: 'from-purple-500/30 to-pink-500/20 border-purple-400/50 text-purple-200',
    particle: 'from-purple-300 to-pink-400',
  },
  no_rank: {
    color: 'rgba(148, 163, 184, 0.5)',
    glow: 'rgba(148, 163, 184, 0.3)',
    border: 'border-slate-500/50',
    pillBg: 'from-slate-600/30 to-slate-400/20 border-slate-400/50 text-slate-200',
    particle: 'from-slate-300 to-white',
  },
};

export function RankUpModal({
  currentTier,
  onClaim,
  unclaimedLevels = [],
}: RankUpModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [levelUpTier, setLevelUpTier] = useState<VipTierConfig | null>(null);

  useEffect(() => {
    if (!currentTier || currentTier.level <= 0) return;

    try {
      const storageKey = 'macvbet_last_seen_vip_level';
      const lastSeen = localStorage.getItem(storageKey);
      const lastSeenLevel = lastSeen !== null ? parseInt(lastSeen, 10) : 0;

      if (currentTier.level > lastSeenLevel) {
        setLevelUpTier(currentTier);
        setIsOpen(true);
        soundManager.play('game.win');
        haptics.notification('success');
      }
    } catch {
      // ignore
    }
  }, [currentTier]);

  const handleClose = () => {
    if (levelUpTier) {
      try {
        localStorage.setItem('macvbet_last_seen_vip_level', String(levelUpTier.level));
      } catch {
        // ignore
      }
    }
    setIsOpen(false);
  };

  const handleClaim = () => {
    if (levelUpTier && onClaim && unclaimedLevels.includes(levelUpTier.level)) {
      onClaim(levelUpTier.level);
    }
    handleClose();
  };

  if (!isOpen || !levelUpTier) return null;

  const isRewardAvailable = unclaimedLevels.includes(levelUpTier.level);
  const theme = RANK_THEMES[levelUpTier.id] || RANK_THEMES.gold;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl overflow-hidden select-none">
        {/* Ambient rotating rays in rank theme color */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
          style={{
            background: `conic-gradient(from 0deg at 50% 50%, ${theme.color} 0deg, transparent 60deg, ${theme.color} 120deg, transparent 180deg, ${theme.color} 240deg, transparent 300deg, ${theme.color} 360deg)`,
          }}
          className="pointer-events-none absolute w-[650px] h-[650px] rounded-full opacity-35 blur-2xl -z-10"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 30 }}
          transition={{ type: 'spring', duration: 0.6, bounce: 0.25 }}
          style={{
            boxShadow: `0 0 80px ${theme.glow}`,
          }}
          className={`relative w-full max-w-sm rounded-[32px] border ${theme.border} bg-gradient-to-b from-[#181a22] via-[#0f1117] to-[#08090c] p-6 text-center flex flex-col items-center`}
        >
          {/* Confetti particles in rank theme */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[32px]">
            {[...Array(14)].map((_, i) => (
              <motion.div
                key={i}
                initial={{
                  opacity: 1,
                  y: 100,
                  x: (i - 7) * 22,
                  scale: Math.random() * 0.5 + 0.5,
                }}
                animate={{
                  opacity: [1, 0.8, 0],
                  y: -220 - Math.random() * 80,
                  x: (i - 7) * 32 + (Math.random() - 0.5) * 40,
                  rotate: Math.random() * 720,
                }}
                transition={{
                  duration: 2.2 + Math.random() * 0.8,
                  ease: 'easeOut',
                  delay: i * 0.07,
                }}
                className={`absolute bottom-10 left-1/2 w-2.5 h-2.5 rounded-sm bg-gradient-to-r ${theme.particle} shadow-md`}
              />
            ))}
          </div>

          {/* Top Pill */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className={`px-3.5 py-1 rounded-full bg-gradient-to-r ${theme.pillBg} font-extrabold text-[11px] uppercase tracking-wider flex items-center gap-1.5 shadow-inner`}
          >
            <Sparkles size={13} className="animate-pulse" />
            <span>Новый VIP Ранг!</span>
          </motion.div>

          {/* Big Center Shield with Zoom animation */}
          <motion.div
            initial={{ scale: 0.3, rotate: -20, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', duration: 0.8, bounce: 0.4, delay: 0.2 }}
            className="relative my-5"
          >
            <div
              style={{ background: theme.color }}
              className="absolute inset-0 rounded-full blur-2xl scale-125 pointer-events-none opacity-40"
            />
            <VipBadge rankId={levelUpTier.id} size="xl" showGlow={true} />
          </motion.div>

          {/* Title & Level */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <h2 className="font-roobert text-2xl sm:text-3xl font-black text-white tracking-tight">
              {levelUpTier.nameRu}
            </h2>
            <p className="text-xs text-amber-300/80 font-bold uppercase tracking-widest mt-0.5">
              Уровень {levelUpTier.level} достигнут
            </p>
          </motion.div>

          {/* Unlocked Perks List */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="w-full mt-4 p-3.5 rounded-2xl border border-white/10 bg-white/[0.03] flex flex-col gap-2 text-left"
          >
            <div className="flex items-center gap-2.5 text-xs text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                <Percent size={13} strokeWidth={2.5} />
              </span>
              <span>
                Кэшбэк увеличен до <b className="text-emerald-400">{levelUpTier.cashbackPercent}%</b>
              </span>
            </div>

            {levelUpTier.rewardDescription && (
              <div className="flex items-center gap-2.5 text-xs text-white">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
                  <Gift size={13} strokeWidth={2.5} />
                </span>
                <span className="truncate">
                  Награда: <b className="text-amber-300">{levelUpTier.rewardDescription}</b>
                </span>
              </div>
            )}
          </motion.div>

          {/* Action button */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            className="w-full mt-5"
          >
            {isRewardAvailable ? (
              <Pressable
                onClick={handleClaim}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:brightness-110 text-black font-extrabold text-sm transition-all shadow-xl shadow-amber-500/30 flex items-center justify-center gap-2 active:scale-95"
              >
                <Gift size={16} />
                <span>Забрать награду</span>
              </Pressable>
            ) : (
              <Pressable
                onClick={handleClose}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:brightness-110 text-black font-extrabold text-sm transition-all shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-95"
              >
                <span>Продолжить</span>
                <ArrowRight size={16} />
              </Pressable>
            )}
          </motion.div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
