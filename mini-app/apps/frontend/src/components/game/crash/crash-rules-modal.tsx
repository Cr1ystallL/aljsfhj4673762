'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * Crash Rules Modal — Monopo Saigon Style
 *
 * Triggered from the "Как играть" pill in the top bar. Shows a small
 * code-rendered crash illustration (no external image) and the short
 * Russian rules description.
 */

interface CrashRulesModalProps {
  open: boolean;
  onClose: () => void;
}

function CrashIllustration() {
  // Simple SVG that mirrors the in-game curve aesthetic with brand gradient.
  return (
    <svg
      viewBox="0 0 320 160"
      className="w-full h-auto"
      preserveAspectRatio="none"
      role="img"
      aria-label="Crash"
    >
      <defs>
        <linearGradient id="crash-curve" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgb(160, 224, 171)" />
          <stop offset="55%" stopColor="rgb(255, 172, 46)" />
          <stop offset="100%" stopColor="rgb(165, 45, 37)" />
        </linearGradient>
        <linearGradient id="crash-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(160, 224, 171, 0.25)" />
          <stop offset="100%" stopColor="rgba(160, 224, 171, 0)" />
        </linearGradient>
      </defs>

      {/* Stage backdrop */}
      <rect
        x="0"
        y="0"
        width="320"
        height="160"
        fill="rgba(255, 255, 255, 0.02)"
        rx="10"
      />

      {/* Curve fill */}
      <path
        d="M 14 142 C 80 138, 130 130, 170 100 S 250 40, 304 16 L 304 142 Z"
        fill="url(#crash-fill)"
      />

      {/* Curve stroke */}
      <path
        d="M 14 142 C 80 138, 130 130, 170 100 S 250 40, 304 16"
        stroke="url(#crash-curve)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Leading dot */}
      <circle cx="304" cy="16" r="4.5" fill="white" />
      <circle
        cx="304"
        cy="16"
        r="4.5"
        fill="none"
        stroke="rgba(160, 224, 171, 0.55)"
      />

      {/* Multiplier label */}
      <text
        x="160"
        y="80"
        textAnchor="middle"
        fontFamily="Roobert, system-ui, sans-serif"
        fontWeight="300"
        fontSize="34"
        fill="rgba(255, 255, 255, 0.92)"
      >
        2.74x
      </text>
    </svg>
  );
}

export function CrashRulesModal({ open, onClose }: CrashRulesModalProps) {
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
          {/* Scrim */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute inset-0 bg-midnight-canvas/85 backdrop-blur-sm"
          />

          {/* Card */}
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
              Как играть в Crash
            </h2>

            <div className="mt-4 rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
              <CrashIllustration />
            </div>

            <p className="mt-4 font-roobert text-[14px] text-frost-white/85 leading-snug">
              В Crash надо предугадать до какой высоты дойдёт кривая перед тем
              как произойдёт Краш. Чем дольше остаёшься в игре, тем больше
              потенциальный выигрыш.
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
