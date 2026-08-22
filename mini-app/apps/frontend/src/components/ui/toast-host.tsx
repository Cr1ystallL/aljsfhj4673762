'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Sparkles,
  Trophy,
  XCircle,
  X,
  Zap,
} from 'lucide-react';
import { useEffect } from 'react';
import { useToastStore, type ToastKind } from '@/store/toast-store';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/use-t';

/**
 * ToastHost — Redesigned High-End Notification System.
 *
 * Visual Features:
 *   - Glassmorphic backdrop-blur-2xl with top hairline highlight
 *   - Ambient radial light aura matching status type (emerald, amber, rose, sky, gold)
 *   - Springy Framer Motion transitions (entry from top, pop out)
 *   - Animated bottom progress line matching TTL duration
 *   - Tap-to-dismiss & close button
 */

const DEFAULT_TTL: Record<ToastKind, number> = {
  info: 3500,
  success: 3500,
  warn: 4500,
  error: 5500,
  bigwin: 7000,
};

interface KindConfig {
  border: string;
  bg: string;
  shadow: string;
  iconBg: string;
  iconColor: string;
  titleColor: string;
  progressBg: string;
  icon: typeof Info;
}

const KIND_CONFIG: Record<ToastKind, KindConfig> = {
  info: {
    border: 'border-sky-500/35',
    bg: 'bg-gradient-to-r from-[#0b1a29]/95 via-[#08131f]/95 to-[#050c14]/95',
    shadow: 'shadow-[0_12px_36px_-8px_rgba(14,165,233,0.35)]',
    iconBg: 'bg-sky-500/20 border-sky-500/40 shadow-[0_0_15px_rgba(14,165,233,0.4)]',
    iconColor: 'text-sky-400',
    titleColor: 'text-sky-400',
    progressBg: 'bg-gradient-to-r from-sky-400 to-cyan-300',
    icon: Info,
  },
  success: {
    border: 'border-emerald-500/40',
    bg: 'bg-gradient-to-r from-[#0c2217]/95 via-[#091a11]/95 to-[#06110b]/95',
    shadow: 'shadow-[0_12px_36px_-8px_rgba(16,185,129,0.35)]',
    iconBg: 'bg-emerald-500/20 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.4)]',
    iconColor: 'text-emerald-400',
    titleColor: 'text-emerald-400',
    progressBg: 'bg-gradient-to-r from-emerald-400 to-teal-300',
    icon: CheckCircle2,
  },
  warn: {
    border: 'border-amber-500/40',
    bg: 'bg-gradient-to-r from-[#261b0c]/95 via-[#1d1409]/95 to-[#130c05]/95',
    shadow: 'shadow-[0_12px_36px_-8px_rgba(245,158,11,0.35)]',
    iconBg: 'bg-amber-500/20 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.4)]',
    iconColor: 'text-amber-400',
    titleColor: 'text-amber-400',
    progressBg: 'bg-gradient-to-r from-amber-400 to-yellow-300',
    icon: AlertTriangle,
  },
  error: {
    border: 'border-rose-500/40',
    bg: 'bg-gradient-to-r from-[#280d11]/95 via-[#1e0a0d]/95 to-[#120608]/95',
    shadow: 'shadow-[0_12px_36px_-8px_rgba(244,63,94,0.35)]',
    iconBg: 'bg-rose-500/20 border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.4)]',
    iconColor: 'text-rose-400',
    titleColor: 'text-rose-400',
    progressBg: 'bg-gradient-to-r from-rose-500 to-pink-400',
    icon: XCircle,
  },
  bigwin: {
    border: 'border-amber-400/60',
    bg: 'bg-gradient-to-r from-[#382008]/95 via-[#271606]/95 to-[#160b03]/95',
    shadow: 'shadow-[0_16px_48px_-8px_rgba(255,172,46,0.5)]',
    iconBg: 'bg-amber-400/25 border-amber-400/50 shadow-[0_0_20px_rgba(255,172,46,0.6)]',
    iconColor: 'text-amber-300',
    titleColor: 'text-amber-300',
    progressBg: 'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500',
    icon: Trophy,
  },
};

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const { t: tr } = useT();

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    for (const t of toasts) {
      const ttl = t.ttl ?? DEFAULT_TTL[t.kind];
      timers.push(setTimeout(() => dismiss(t.id), ttl));
    }
    return () => {
      for (const id of timers) clearTimeout(id);
    };
  }, [toasts, dismiss]);

  return (
    <div
      className="fixed top-2 inset-x-0 z-[999] pointer-events-none flex flex-col items-center gap-2.5 px-4 pt-safe"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => {
          const cfg = KIND_CONFIG[t.kind];
          const Icon = cfg.icon;
          const isBig = t.kind === 'bigwin';
          const ttl = t.ttl ?? DEFAULT_TTL[t.kind];

          return (
            <motion.div
              key={t.id}
              onClick={() => dismiss(t.id)}
              initial={{ opacity: 0, y: -24, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              className={cn(
                'pointer-events-auto w-full max-w-[440px] rounded-2xl border text-left cursor-pointer select-none',
                'flex items-center gap-3.5 px-4 py-3.5 relative overflow-hidden backdrop-blur-2xl',
                'before:absolute before:inset-x-0 before:top-0 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-white/25 before:to-transparent',
                'active:scale-[0.98] transition-transform duration-150',
                cfg.border,
                cfg.bg,
                cfg.shadow
              )}
            >
              {/* Radial ambient glow behind icon */}
              <div
                aria-hidden
                className="absolute -left-6 -top-6 w-24 h-24 rounded-full pointer-events-none blur-[24px] opacity-60"
                style={{
                  background:
                    t.kind === 'success'
                      ? 'radial-gradient(circle, rgba(16,185,129,0.5) 0%, transparent 70%)'
                      : t.kind === 'warn'
                      ? 'radial-gradient(circle, rgba(245,158,11,0.5) 0%, transparent 70%)'
                      : t.kind === 'error'
                      ? 'radial-gradient(circle, rgba(244,63,94,0.5) 0%, transparent 70%)'
                      : t.kind === 'bigwin'
                      ? 'radial-gradient(circle, rgba(255,172,46,0.6) 0%, transparent 70%)'
                      : 'radial-gradient(circle, rgba(14,165,233,0.5) 0%, transparent 70%)',
                }}
              />

              {/* Icon Container */}
              <div
                className={cn(
                  'shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center relative',
                  cfg.iconBg
                )}
              >
                {isBig ? (
                  <div className="relative">
                    <Trophy size={20} className={cfg.iconColor} strokeWidth={2} />
                    <Sparkles
                      size={11}
                      strokeWidth={2.4}
                      className="absolute -top-1.5 -right-1.5 text-amber-200 animate-pulse"
                    />
                  </div>
                ) : (
                  <Icon size={19} className={cfg.iconColor} strokeWidth={2.2} />
                )}
              </div>

              {/* Message Content */}
              <div className="flex-1 min-w-0 relative">
                <div
                  className={cn(
                    'font-roobert font-bold uppercase tracking-[0.16em] text-[11px] flex items-center gap-1.5',
                    cfg.titleColor
                  )}
                >
                  <span>
                    {t.title ??
                      tr(
                        t.kind === 'info'
                          ? 'toast.info'
                          : t.kind === 'success'
                            ? 'toast.success'
                            : t.kind === 'warn'
                              ? 'toast.warn'
                              : t.kind === 'error'
                                ? 'toast.error'
                                : 'toast.bigwin'
                      )}
                  </span>
                  {isBig && <Zap size={11} className="text-amber-300 fill-amber-300 animate-bounce" />}
                </div>
                <div
                  className={cn(
                    'mt-0.5 font-roobert leading-snug font-medium text-frost-white/95',
                    isBig ? 'text-[14px]' : 'text-[13px]'
                  )}
                >
                  {t.message}
                </div>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss(t.id);
                }}
                className="shrink-0 w-7 h-7 rounded-lg border border-white/10 bg-white/[0.06] hover:bg-white/15 active:scale-90 transition-all flex items-center justify-center text-white/50 hover:text-white"
              >
                <X size={13} strokeWidth={2.2} />
              </button>

              {/* Bottom TTL Progress Bar */}
              <motion.div
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: ttl / 1000, ease: 'linear' }}
                className={cn('absolute bottom-0 inset-x-0 h-[2px] origin-left', cfg.progressBg)}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
