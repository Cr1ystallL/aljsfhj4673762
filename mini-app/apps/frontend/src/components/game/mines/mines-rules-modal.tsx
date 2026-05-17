'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface MinesRulesModalProps {
  open: boolean;
  onClose: () => void;
}

export function MinesRulesModal({ open, onClose }: MinesRulesModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute inset-0 bg-midnight-canvas/85 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="relative w-full max-w-[420px] rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-2xl p-5"
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-11 h-11 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 hover:text-frost-white hover:border-white/25 active:scale-95 transition-all"
              aria-label="Close"
            >
              <X size={18} strokeWidth={1.8} />
            </button>

            <h2 className="font-roobert text-frost-white text-[22px] font-normal leading-tight pr-8">
              Как играть в Mines
            </h2>

            <p className="mt-4 font-roobert text-[14px] text-frost-white/85 leading-snug">
              Поле 5×5 — 25 клеток. Выберите количество мин и сделайте
              ставку. Открывайте безопасные клетки одну за другой —
              каждая увеличивает множитель. Можно забрать выигрыш в
              любой момент. Если откроете мину, ставка проигрывает.
            </p>

            <p className="mt-3 font-roobert text-[12px] text-whisper-gray leading-snug">
              Чем больше мин — тем выше потенциальный множитель за каждую
              открытую клетку. RTP 99%.
            </p>

            <div className="mt-5 flex justify-end">
              <button
                onClick={onClose}
                className="inline-flex items-center px-5 py-2 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px] uppercase tracking-[0.2em] hover:bg-frost-white/90 transition-colors"
              >
                Понятно
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
