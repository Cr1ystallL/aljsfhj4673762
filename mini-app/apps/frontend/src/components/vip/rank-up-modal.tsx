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

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl overflow-hidden select-none">
        {/* Ambient rotating rays */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
          className="pointer-events-none absolute w-[600px] h-[600px] rounded-full opacity-30 bg-[conic-gradient(from_0deg_at_50%_50%,rgba(245,158,11,0.5)_0deg,transparent_60deg,rgba(245,158,11,0.5)_120deg,transparent_180deg,rgba(245,158,11,0.5)_240deg,transparent_300deg,rgba(245,158,11,0.5)_360deg)] blur-2xl -z-10"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 30 }}
          transition={{ type: 'spring', duration: 0.6, bounce: 0.25 }}
          className="relative w-full max-w-sm rounded-[32px] border border-amber-400/40 bg-gradient-to-b from-[#181a22] via-[#0f1117] to-[#08090c] p-6 text-center shadow-[0_0_80px_rgba(245,158,11,0.25)] flex flex-col items-center"
        >
          {/* Confetti particles */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[32px]">
            {[...Array(12)].map((_, i) => (
              <motion.div
                key={i}
                initial={{
                  opacity: 1,
                  y: 100,
                  x: (i - 6) * 25,
                  scale: Math.random() * 0.5 + 0.5,
                }}
                animate={{
                  opacity: [1, 0.8, 0],
                  y: -220 - Math.random() * 80,
                  x: (i - 6) * 35 + (Math.random() - 0.5) * 40,
                  rotate: Math.random() * 720,
                }}
                transition={{
                  duration: 2.2 + Math.random() * 0.8,
                  ease: 'easeOut',
                  delay: i * 0.08,
                }}
                className="absolute bottom-10 left-1/2 w-2.5 h-2.5 rounded-sm bg-gradient-to-r from-amber-300 to-yellow-500 shadow-md"
              />
            ))}
          </div>

          {/* Top Pill */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="px-3.5 py-1 rounded-full bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-400/40 text-amber-300 font-extrabold text-[11px] uppercase tracking-wider flex items-center gap-1.5 shadow-inner"
          >
            <Sparkles size={13} className="text-amber-400 animate-pulse" />
            <span>Новый VIP Ранг!</span>
          </motion.div>

          {/* Big Center Shield with Zoom animation */}
          <motion.div
            initial={{ scale: 0.3, rotate: -20, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', duration: 0.8, bounce: 0.4, delay: 0.2 }}
            className="relative my-5"
          >
            <div className="absolute inset-0 rounded-full bg-amber-400/30 blur-2xl scale-125 pointer-events-none" />
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
