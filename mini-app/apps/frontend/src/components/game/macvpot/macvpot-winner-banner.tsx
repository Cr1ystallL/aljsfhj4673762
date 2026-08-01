'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { Trophy, Sparkles, X } from 'lucide-react';
import type { MacvpotHistoryRow } from '@/app/game/macvpot/page';

interface MacvpotWinnerBannerProps {
  winner: MacvpotHistoryRow['winner'] | null;
  onClose: () => void;
}

export function MacvpotWinnerBanner({ winner, onClose }: MacvpotWinnerBannerProps) {
  if (!winner) return null;

  const initial = winner.name.charAt(0).toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      className="w-full rounded-3xl border border-amber-400/30 bg-gradient-to-r from-[#1c1608] via-[#120d04] to-[#1c1608] p-4 text-white flex items-center justify-between gap-3 shadow-[0_4px_30px_rgba(245,158,11,0.2)] relative overflow-hidden backdrop-blur-2xl"
    >
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/10 rounded-full blur-[40px] pointer-events-none" />

      {/* Left: Winner info */}
      <div className="flex items-center gap-3 z-10">
        <div className="w-12 h-12 rounded-full p-[2px] bg-gradient-to-tr from-amber-400 via-white to-amber-500 shadow-md flex items-center justify-center shrink-0">
          {winner.photoUrl ? (
            <Image
              src={winner.photoUrl}
              alt={winner.name}
              width={48}
              height={48}
              className="rounded-full object-cover w-full h-full"
              unoptimized
            />
          ) : (
            <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-white font-bold text-base">
              {initial}
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1">
            <Trophy size={12} />Победитель раунда
          </span>
          <h4 className="font-extrabold text-sm text-white truncate max-w-[140px] sm:max-w-[220px]">
            {winner.name}
          </h4>
          <span className="text-[11px] text-white/60">
            Шанс: <strong className="text-amber-300 font-semibold">{winner.chance}%</strong>
          </span>
        </div>
      </div>

      {/* Right: Win Amount */}
      <div className="flex items-center gap-3 z-10">
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-medium text-white/50 uppercase tracking-wider">Выигрыш</span>
          <span className="text-base sm:text-lg font-black text-amber-400 font-roobert tracking-tight">
            +{winner.payout.toLocaleString('ru-RU')} <span className="text-xs text-white/60 font-normal">zł</span>
          </span>
        </div>

        <button
          onClick={onClose}
          className="w-7 h-7 rounded-xl bg-white/[0.08] hover:bg-white/20 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all active:scale-95"
        >
          <X size={14} />
        </button>
      </div>
    </motion.div>
  );
}
