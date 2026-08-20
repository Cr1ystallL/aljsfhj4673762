'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrandMark } from '@/components/ui/brand-mark';

/**
 * Splash Screen — first-paint surface.
 *
 * Sits on top of the app while the WebApp boots: Telegram bridge
 * handshake, auth, balance, etc. Disappears 2 seconds AFTER the
 * `onReady` signal fires so the user always gets a moment with the
 * brand mark + tagline rather than an instant flash.
 *
 * A random line is picked once per mount; the pool itself is exported
 * so the layout can also pick a random title for the document.
 *
 * COPY CONSTRAINT — do not loosen without a legal review.
 * These strings are the most visible text in the product: the splash
 * covers the whole screen on boot and the title shows in the Telegram
 * header. Gambling promotion rules and Telegram's own policy leave no
 * room for substance, addiction or treatment metaphors, for profanity,
 * or for urging someone to bet. Keep the tone about the product —
 * provably fair draws, the game list, the interface.
 */

export const SPLASH_TAGLINES: ReadonlyArray<string> = [
  'MacvBet — играй красиво.',
  'Честная математика в каждом раунде.',
  'Provably fair: проверь любой раунд.',
  'Классика казино в Telegram.',
  'Твоя игра, твой темп.',
  'Прозрачные шансы, открытая проверка.',
  'Спокойный интерфейс, честный результат.',
];

export const TITLE_TAGLINES: ReadonlyArray<string> = [
  'MacvBet',
  'MacvBet — казино в Telegram',
  'MacvBet — provably fair игры',
  'MacvBet — прозрачные шансы',
  'MacvBet — Crash, Mines, Plinko',
  'MacvBet — играй красиво',
];

export function pickRandom<T>(pool: ReadonlyArray<T>): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

interface SplashScreenProps {
  /** Becomes true once the host app says it has finished its first
   *  data load. The splash stays for an extra hold-time on top of
   *  this so the brand moment doesn't blink past. */
  ready: boolean;
}

const POST_READY_HOLD_MS = 2000;
const MIN_TOTAL_MS = 1200;

export function SplashScreen({ ready }: SplashScreenProps) {
  const [visible, setVisible] = useState(true);
  // Lock the chosen tagline once on mount so it doesn't shuffle if
  // the component re-renders during boot.
  const tagline = useMemo(() => pickRandom(SPLASH_TAGLINES), []);
  const mountedAt = useMemo(() => Date.now(), []);

  useEffect(() => {
    if (!ready) return;
    const elapsed = Date.now() - mountedAt;
    const remainingMin = Math.max(0, MIN_TOTAL_MS - elapsed);
    const wait = Math.max(POST_READY_HOLD_MS, remainingMin);
    const id = setTimeout(() => setVisible(false), wait);
    return () => clearTimeout(id);
  }, [ready, mountedAt]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="fixed inset-0 z-[1000] bg-midnight-canvas flex flex-col items-center justify-center"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {/* Atmospheric backdrop — same Deep Ocean wash as the rest */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-50 pointer-events-none"
            style={{
              background:
                'radial-gradient(120% 100% at 50% 100%, rgba(165, 45, 37, 0.32) 0%, rgba(255, 172, 46, 0.18) 35%, rgba(160, 224, 171, 0.12) 65%, transparent 85%)',
            }}
          />
          {/* Brand mark — gentle pulse + subtle rotation */}
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: [0.92, 1, 0.96, 1], opacity: 1 }}
            transition={{ duration: 2.6, ease: 'easeInOut', repeat: Infinity }}
            className="relative"
          >
            <span
              aria-hidden
              className="absolute -inset-6 rounded-full opacity-65 pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle, rgba(255,172,46,0.45) 0%, transparent 70%)',
                filter: 'blur(28px)',
              }}
            />
            <BrandMark variant="white" size={132} title="MacvBet" className="relative" />
          </motion.div>

          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.5, ease: 'easeOut' }}
            className="relative mt-8 px-6 text-center font-roobert text-frost-white text-[16px] sm:text-[18px] leading-snug max-w-[320px]"
          >
            {tagline}
          </motion.div>

          <motion.div
            className="absolute bottom-10 inset-x-0 flex justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-frost-white/80 animate-pulse" />
              <span
                className="w-1.5 h-1.5 rounded-full bg-frost-white/60 animate-pulse"
                style={{ animationDelay: '0.2s' }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-frost-white/40 animate-pulse"
                style={{ animationDelay: '0.4s' }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
