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
              className="absolute top-3 right-3 w-11 h-11 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 hover:text-frost-white hover:border-white/25 active:scale-95 transition-all"
              aria-label="Close"
            >
              <X size={18} strokeWidth={1.8} />
            </button>

            <h2 className="font-roobert text-frost-white text-[22px] font-normal leading-tight pr-8">
              How to play Coinflip
            </h2>

            <div className="mt-4 space-y-3">
              <p className="font-roobert text-[14px] text-frost-white/85 leading-snug">
                Place a bet, pick a mode, choose heads or tails. Guess
                right — you win.
              </p>

              <div className="rounded-card border border-white/10 bg-white/[0.04] p-3">
                <p className="font-roobert text-[12px] uppercase tracking-[0.18em] text-whisper-gray">
                  Quick
                </p>
                <p className="mt-1 font-roobert text-[13px] text-frost-white/85">
                  One toss, payout 1.94×. Wrong call — stake is lost.
                </p>
              </div>

              <div className="rounded-card border border-white/10 bg-white/[0.04] p-3">
                <p className="font-roobert text-[12px] uppercase tracking-[0.18em] text-whisper-gray">
                  Multiply
                </p>
                <p className="mt-1 font-roobert text-[13px] text-frost-white/85">
                  Each correct call multiplies the bank by ~1.94×. Cash
                  out any time. One miss and the whole bank is lost.
                </p>
              </div>
            </div>

            <p className="mt-3 font-roobert text-[11px] text-whisper-gray leading-snug">
              RTP 97% per toss. Provably fair — server hash shown
              before the round.
            </p>

            <div className="mt-5 flex justify-end">
              <button
                onClick={onClose}
                className="inline-flex items-center px-5 py-2 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px] uppercase tracking-[0.2em] hover:bg-frost-white/90 transition-colors"
              >
                Got it
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
