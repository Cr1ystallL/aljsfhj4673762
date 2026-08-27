'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useT } from '@/i18n/use-t';

/**
 * Crash Rules Modal — Monopo Saigon Style
 *
 * Triggered from the "How to play" pill in the top bar. Shows a small
 * code-rendered crash illustration (no external image) and the short
 * rules description.
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

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="relative w-full max-w-[500px] max-h-[85vh] flex flex-col rounded-3xl border border-white/20 bg-[#0e1117]/95 shadow-[0_25px_70px_rgba(0,0,0,0.95)] backdrop-blur-2xl overflow-hidden z-10"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/[0.03]">
              <div>
                <h2 className="font-roobert font-bold text-frost-white text-[17px] leading-tight">
                  Правила игры в MacvJet (Crash)
                </h2>
                <span className="text-[11px] text-whisper-gray font-roobert">
                  Растущий множитель · Мгновенный кэшаут · RTP 97%
                </span>
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
              
              <div className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden p-2">
                <CrashIllustration />
              </div>

              {/* 1. Суть */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-[14px]">
                  <span>🎯</span>
                  <span>Суть игры</span>
                </div>
                <p className="text-white/80 text-[12px]">
                  После старта раунда самолёт взлетает, а множитель начинает непрерывно расти от <strong className="text-white">1.00x</strong> до сотен или тысяч раз.
                </p>
              </div>

              {/* 2. Как играть */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-[14px]">
                  <span>🕹️</span>
                  <span>Как играть</span>
                </div>
                <div className="space-y-2 text-[12px]">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">1</span>
                    <span className="text-white/80">Сделайте ставку до старта раунда (пока идёт обратный отсчет).</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">2</span>
                    <span className="text-white/80">Следите за полетом: чем выше множитель, тем больше ваш выигрыш.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">3</span>
                    <span className="text-white/80">Успейте нажать <strong>«Забрать»</strong> ДО того, как самолёт улетит (Краш). Если не успели — ставка сгорает.</span>
                  </div>
                </div>
              </div>

              {/* 3. Авто-вывод */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-[14px]">
                  <span>⚡</span>
                  <span>Авто-вывод (Auto Cashout)</span>
                </div>
                <p className="text-white/80 text-[12px]">
                  Вы можете задать желаемый коэффициент (например, <strong>2.00x</strong>), и система автоматически зафиксирует выигрыш в момент достижения этой отметки.
                </p>
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
