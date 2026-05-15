'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface CoinflipRulesModalProps {
  open: boolean;
  onClose: () => void;
}

export function CoinflipRulesModal({ open, onClose }: CoinflipRulesModalProps) {
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
              className="absolute top-3 right-3 w-8 h-8 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 hover:text-frost-white hover:border-white/25 transition-colors"
              aria-label="Close"
            >
              <X size={14} strokeWidth={2} />
            </button>

            <h2 className="font-roobert text-frost-white text-[22px] font-normal leading-tight pr-8">
              Как играть в Coinflip
            </h2>

            <div className="mt-4 space-y-3">
              <p className="font-roobert text-[14px] text-frost-white/85 leading-snug">
                Сделайте ставку, выберите режим и сторону монеты. Если
                угадали — выигрываете.
              </p>

              <div className="rounded-card border border-white/10 bg-white/[0.04] p-3">
                <p className="font-roobert text-[12px] uppercase tracking-[0.18em] text-whisper-gray">
                  Быстрая игра
                </p>
                <p className="mt-1 font-roobert text-[13px] text-frost-white/85">
                  Один бросок, выплата 1.94×. Если ошиблись — ставка
                  сгорает.
                </p>
              </div>

              <div className="rounded-card border border-white/10 bg-white/[0.04] p-3">
                <p className="font-roobert text-[12px] uppercase tracking-[0.18em] text-whisper-gray">
                  С умножением
                </p>
                <p className="mt-1 font-roobert text-[13px] text-frost-white/85">
                  Каждый успешный угад умножает банк ~1.94×. Можно
                  забрать выигрыш в любой момент. Один промах — и весь
                  банк сгорает.
                </p>
              </div>
            </div>

            <p className="mt-3 font-roobert text-[11px] text-whisper-gray leading-snug">
              RTP 97% на каждый бросок. Результат проверяемый —
              хеш сервера показывается до раунда.
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
