'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck, Coins, Zap, Trophy } from 'lucide-react';
import { useT } from '@/i18n/use-t';

interface CoinflipRulesModalProps {
  open: boolean;
  onClose: () => void;
}

export function CoinflipRulesModal({ open, onClose }: CoinflipRulesModalProps) {
  const { t } = useT();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Scrim */}
          <div
            onClick={onClose}
            className="fixed inset-0 bg-black/85 backdrop-blur-md"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="relative w-full max-w-[500px] max-h-[85vh] flex flex-col rounded-3xl border border-white/20 bg-[#0e1117]/95 shadow-[0_25px_70px_rgba(0,0,0,0.95)] backdrop-blur-2xl overflow-hidden z-10"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/[0.03]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-300">
                  <Coins size={18} />
                </div>
                <div>
                  <h2 className="font-roobert font-bold text-frost-white text-[17px] leading-tight">
                    Правила игры в Coinflip (Монетка)
                  </h2>
                  <span className="text-[11px] text-whisper-gray font-roobert">
                    Орёл или Решка · 2 режима игры · RTP 97%
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full border border-white/15 bg-white/[0.06] flex items-center justify-center text-whisper-gray hover:text-white hover:border-white/30 active:scale-95 transition-all touch-manipulation cursor-pointer"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 font-roobert text-frost-white/90 text-[13px] leading-relaxed custom-scrollbar">
              
              {/* 1. Суть */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-[14px]">
                  <span>🎯</span>
                  <span>Суть игры</span>
                </div>
                <p className="text-white/80 text-[12px]">
                  Выберите сторону монеты: <strong className="text-amber-300">Орёл</strong> или <strong className="text-amber-300">Решка</strong>. Шанс выпадения каждой стороны ровно 50%.
                </p>
              </div>

              {/* 2. Режимы игры */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-[14px]">
                  <span>🕹️</span>
                  <span>2 Режима игры</span>
                </div>

                <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-[13px] flex items-center gap-1.5">
                      ⚡ Быстрый режим
                    </span>
                    <span className="font-mono text-emerald-400 font-bold text-xs">Выплата 1.94x</span>
                  </div>
                  <p className="text-white/70 text-[12px]">
                    Один бросок монеты. Угадали сторону — моментальная выплата с коэффициентом <strong>1.94x</strong>. Ошибка — ставка сгорает.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-[13px] flex items-center gap-1.5">
                      🔥 Режим Серии (Streak)
                    </span>
                    <span className="font-mono text-amber-300 font-bold text-xs">Множитель растет</span>
                  </div>
                  <p className="text-white/70 text-[12px]">
                    Каждое верное угадывание подряд умножает текущий банк на <strong>1.94x</strong> (2 броска = ~3.76x, 3 броска = ~7.30x и т.д.). Вы можете нажать <strong>«Забрать»</strong> в любой момент! Один промах обнуляет накопленную серию.
                  </p>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 bg-white/[0.02] flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-6 py-2.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-black font-roobert font-bold text-[13px] hover:from-amber-300 hover:to-amber-400 active:scale-95 transition-all shadow-lg cursor-pointer touch-manipulation"
              >
                Понятно, к игре!
              </button>
            </div>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
