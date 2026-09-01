'use client';

import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Crown, Gift, Percent, ShieldCheck, Zap, ArrowRight } from 'lucide-react';
import { VIP_RANKS } from '@/lib/vip';
import { VipBadge } from './vip-badge';
import { Pressable } from '@/components/ui/pressable';

interface VipFaqModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLevel?: number;
}

export function VipFaqModal({
  isOpen,
  onClose,
  currentLevel = 0,
}: VipFaqModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', duration: 0.4, bounce: 0.1 }}
          className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[24px] border border-white/15 bg-[#0d0f12] text-frost-white shadow-2xl flex flex-col p-5 sm:p-6"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all active:scale-95"
          >
            <X size={18} />
          </button>

          {/* Banner Header */}
          <div className="relative w-full rounded-2xl overflow-hidden border border-white/10 bg-black/60 shadow-inner flex flex-col items-center justify-center py-4 px-2">
            <div className="relative w-full h-24 sm:h-28 flex items-center justify-center">
              <Image
                src="/Rangs/all_rungs.png"
                alt="All VIP Ranks"
                width={480}
                height={120}
                className="w-auto h-full object-contain drop-shadow-[0_8px_20px_rgba(0,0,0,0.9)]"
                priority
              />
            </div>
            <div className="mt-2 text-center">
              <h2 className="font-roobert text-lg sm:text-xl font-black text-white tracking-tight flex items-center justify-center gap-1.5">
                <Crown size={18} className="text-amber-400" />
                <span>Система VIP Рангов</span>
              </h2>
              <p className="text-[11.5px] text-white/60 mt-0.5">
                Ставьте в любых играх: <b className="text-amber-300">1 zł = 10 XP</b>. Повышайте ранг, забирайте награды и увеличивайте кэшбэк!
              </p>
            </div>
          </div>

          {/* Ranks list */}
          <div className="mt-4 flex flex-col gap-2.5">
            {VIP_RANKS.map((tier) => {
              const isCurrent = currentLevel === tier.level;
              const isUnlocked = currentLevel >= tier.level;

              return (
                <div
                  key={tier.id}
                  className={`relative p-3 rounded-2xl border transition-all flex items-center gap-3.5 ${
                    isCurrent
                      ? 'border-amber-400/60 bg-gradient-to-r from-amber-950/40 via-[#181a20] to-[#12141a] shadow-[0_0_20px_rgba(245,158,11,0.15)]'
                      : isUnlocked
                      ? 'border-white/15 bg-white/[0.04]'
                      : 'border-white/8 bg-black/40 opacity-70'
                  }`}
                >
                  {/* Badge */}
                  <VipBadge rankId={tier.id} size="md" showGlow={isCurrent} />

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-roobert text-[14px] font-extrabold text-white">
                        {tier.nameRu} (Lvl {tier.level})
                      </span>
                      {isCurrent && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 font-bold text-[9.5px]">
                          Ваш ранг
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-[11px] text-white/60">
                      <span>
                        Оборот: <b className="text-white">{tier.wagerZl.toLocaleString('ru-RU')} zł</b> ({tier.minXp.toLocaleString('ru-RU')} XP)
                      </span>
                      <span className="flex items-center gap-1 text-emerald-400 font-bold">
                        <Percent size={11} />
                        {tier.cashbackPercent}% кэшбэк
                      </span>
                    </div>

                    {tier.level > 0 && (
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-amber-200/90">
                        <Gift size={12} className="text-amber-400 shrink-0" />
                        <span className="truncate">{tier.rewardDescription}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5">
            <Pressable
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm text-center transition-all border border-white/15"
            >
              Понятно
            </Pressable>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
