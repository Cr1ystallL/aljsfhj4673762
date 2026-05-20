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
} from 'lucide-react';
import { useEffect } from 'react';
import { useToastStore, type ToastKind } from '@/store/toast-store';
import { cn } from '@/lib/utils';

/**
 * ToastHost — viewport-anchored notification stack.
 *
 * Renders the current `toast-store` queue as a column of cards at the
 * top of the screen. Each card autodismisses after its TTL; the host
 * mounts a single timer per toast id and clears it when the toast
 * leaves the queue (either via TTL or manual dismiss).
 *
 * Visual:
 *   - Position: fixed, top, centred, respects iOS safe-area inset.
 *   - Per-kind tint and icon.
 *   - Slide-in from above + fade, exit fade-out.
 *   - Tap-to-dismiss on the whole card.
 *
 * Mounted once near the top of the React tree (in `Providers`).
 */

const DEFAULT_TTL: Record<ToastKind, number> = {
  info: 3500,
  success: 3500,
  warn: 4500,
  error: 5500,
  bigwin: 7000,
};

const KIND_TINT: Record<
  ToastKind,
  { border: string; tint: string; icon: typeof Info; iconColor: string; title: string }
> = {
  info: {
    border: 'border-white/20',
    tint: 'rgba(20,20,20,0.96)',
    icon: Info,
    iconColor: 'text-frost-white/80',
    title: 'Сообщение',
  },
  success: {
    border: 'border-[#a0e0ab]/45',
    tint: 'rgba(20,30,22,0.96)',
    icon: CheckCircle2,
    iconColor: 'text-[#a0e0ab]',
    title: 'Готово',
  },
  warn: {
    border: 'border-[#ffac2e]/45',
    tint: 'rgba(30,24,16,0.96)',
    icon: AlertTriangle,
    iconColor: 'text-[#ffac2e]',
    title: 'Внимание',
  },
  error: {
    border: 'border-[#ff8a76]/45',
    tint: 'rgba(36,18,16,0.96)',
    icon: XCircle,
    iconColor: 'text-[#ff8a76]',
    title: 'Ошибка',
  },
  bigwin: {
    border: 'border-white/30',
    tint: 'linear-gradient(120deg, rgba(36,72,48,0.96) 0%, rgba(60,40,18,0.96) 50%, rgba(70,22,18,0.96) 100%)',
    icon: Trophy,
    iconColor: 'text-[#ffac2e]',
    title: 'МаcvBetнулся',
  },
};

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  // Spawn one TTL timer per toast.
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
      className="fixed top-0 inset-x-0 z-[300] pt-safe pointer-events-none flex flex-col items-center gap-2 px-3 pt-2"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence>
        {toasts.map((t) => {
          const cfg = KIND_TINT[t.kind];
          const Icon = cfg.icon;
          const isBig = t.kind === 'bigwin';
          return (
            <motion.button
              key={t.id}
              type="button"
              onClick={() => dismiss(t.id)}
              initial={{ opacity: 0, y: -16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className={cn(
                'pointer-events-auto w-full max-w-[460px] rounded-card border text-left',
                'flex items-start gap-3 px-4 py-3 active:scale-[0.99] transition-transform relative overflow-hidden',
                cfg.border,
                isBig && 'shadow-[0_18px_50px_-10px_rgba(255,172,46,0.55)]'
              )}
              style={{
                background: cfg.tint,
                boxShadow: isBig
                  ? '0 18px 50px -10px rgba(255,172,46,0.45), inset 0 1px 0 rgba(255,255,255,0.10)'
                  : '0 12px 30px -10px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
                willChange: 'transform, opacity',
              }}
            >
              {isBig && (
                <span
                  aria-hidden
                  className="absolute inset-0 opacity-50 pointer-events-none"
                  style={{
                    background:
                      'radial-gradient(120% 110% at 100% 0%, rgba(255, 172, 46, 0.45) 0%, transparent 70%)',
                  }}
                />
              )}
              <span
                className={cn(
                  'shrink-0 mt-0.5 inline-flex items-center justify-center relative',
                  cfg.iconColor
                )}
              >
                {isBig ? (
                  <span className="relative">
                    <Trophy size={20} strokeWidth={1.8} />
                    <Sparkles
                      size={10}
                      strokeWidth={2}
                      className="absolute -top-1 -right-1 text-frost-white/85 animate-pulse"
                    />
                  </span>
                ) : (
                  <Icon size={16} strokeWidth={1.8} />
                )}
              </span>
              <div className="flex-1 min-w-0 relative">
                <div
                  className={cn(
                    'font-roobert uppercase tracking-[0.22em]',
                    isBig
                      ? 'text-[12px] text-[#ffac2e]'
                      : 'text-[10px] text-whisper-gray'
                  )}
                >
                  {t.title ?? cfg.title}
                </div>
                <div
                  className={cn(
                    'mt-0.5 font-roobert leading-snug',
                    isBig
                      ? 'text-[15px] text-frost-white font-medium'
                      : 'text-[13px] text-frost-white'
                  )}
                >
                  {t.message}
                </div>
              </div>
              <span className="shrink-0 text-frost-white/55 mt-0.5 relative">
                <X size={14} strokeWidth={1.7} />
              </span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
