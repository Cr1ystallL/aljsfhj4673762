'use client';

import { useEffect, useState, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSplashStore } from '@/store/splash-store';

export const SPLASH_TAGLINES: ReadonlyArray<string> = [
  'MacvBet',
];

export const TITLE_TAGLINES: ReadonlyArray<string> = [
  'MacvBet',
  'MacvBet — казино в Telegram',
  'MacvBet — честные игры',
  'MacvBet — прозрачные шансы',
  'MacvBet — Crash, Mines, Wheel',
  'MacvBet — играй красиво',
];

export function pickRandom<T>(pool: ReadonlyArray<T>): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

interface SplashScreenProps {
  ready: boolean;
}

const M_PATH =
  'M5050 8891 c-186 -60 -321 -200 -450 -465 -181 -372 -333 -968 -486 -1906 -20 -124 -38 -232 -41 -240 -3 -8 -22 35 -43 95 -129 377 -321 783 -495 1045 -195 294 -367 434 -585 477 -218 43 -440 -63 -585 -281 -268 -403 -405 -1125 -405 -2136 0 -955 176 -2298 335 -2549 93 -148 230 -221 389 -208 138 12 263 105 329 244 30 65 32 74 31 183 0 102 -7 144 -57 365 -125 557 -201 1068 -239 1615 -19 283 -16 1071 5 1340 39 478 93 772 144 788 31 9 115 -120 197 -305 236 -528 498 -1528 636 -2427 86 -566 99 -960 50 -1546 -26 -312 -20 -400 38 -515 35 -70 68 -110 136 -161 121 -92 292 -111 427 -46 122 58 216 182 245 324 13 62 13 102 -3 362 -24 399 -24 1277 0 1616 33 459 68 801 142 1392 112 891 214 1493 334 1971 60 234 86 309 109 305 42 -8 159 -453 256 -968 93 -495 211 -1393 271 -2055 94 -1040 92 -1452 -12 -2659 -14 -163 -15 -213 -5 -280 36 -247 222 -398 474 -384 69 4 100 12 153 36 85 41 175 129 214 212 50 106 56 167 41 449 -19 367 -6 665 51 1121 104 839 333 1741 594 2346 109 250 248 496 302 531 25 16 26 16 49 -10 72 -84 156 -523 196 -1017 17 -219 17 -987 0 -1220 -35 -467 -75 -835 -148 -1355 -43 -304 -46 -335 -35 -398 24 -142 112 -260 238 -320 62 -29 77 -32 163 -32 131 1 190 25 279 114 99 99 135 181 175 412 88 495 122 972 113 1569 -19 1153 -141 1925 -384 2416 -105 213 -230 350 -388 426 -224 107 -451 83 -681 -73 -221 -149 -470 -481 -674 -902 l-68 -139 -22 124 c-134 741 -300 1479 -410 1823 -172 536 -366 817 -618 895 -82 25 -205 26 -282 1z';

export function SplashScreen({ ready }: SplashScreenProps) {
  const [animationFinished, setAnimationFinished] = useState(false);
  const [visible, setVisible] = useState(true);
  const id = useId();
  const clipId = `splash-m-clip-${id.replace(/:/g, '')}`;
  const gradId = `splash-m-grad-${id.replace(/:/g, '')}`;
  const gradId2 = `splash-m-grad2-${id.replace(/:/g, '')}`;

  // Complete the full liquid filling animation cycle (2.2 seconds) before allowing dismissal
  useEffect(() => {
    const animTimer = setTimeout(() => {
      setAnimationFinished(true);
    }, 2200);
    return () => clearTimeout(animTimer);
  }, []);

  // When both the app data is ready AND the animation finished, smoothly exit
  useEffect(() => {
    if (ready && animationFinished) {
      const exitTimer = setTimeout(() => {
        setVisible(false);
        useSplashStore.getState().dismiss();
      }, 350);
      return () => clearTimeout(exitTimer);
    }
  }, [ready, animationFinished]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="splash-screen"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[9999] bg-[#000000] flex flex-col items-center justify-center select-none overflow-hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {/* Subtle Ambient Radial Glow */}
          <div
            aria-hidden
            className="absolute w-[360px] h-[360px] rounded-full pointer-events-none opacity-40 blur-[90px]"
            style={{
              background:
                'radial-gradient(circle, rgba(0, 245, 160, 0.25) 0%, rgba(255, 172, 46, 0.18) 45%, rgba(239, 68, 68, 0.12) 75%, transparent 100%)',
            }}
          />

          {/* Liquid Filling M Logo */}
          <div className="relative flex items-center justify-center">
            <svg
              viewBox="0 0 1024 1024"
              width={140}
              height={140}
              className="relative overflow-visible"
              aria-label="MacvBet Logo"
            >
              <defs>
                {/* Precise M Silhouette Clip */}
                <clipPath id={clipId}>
                  <g transform="translate(0,1024) scale(0.1,-0.1)">
                    <path d={M_PATH} />
                  </g>
                </clipPath>

                {/* Signature Brand Vibrant Liquid Gradient */}
                <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#a0e0ab" />
                  <stop offset="25%" stopColor="#00f5a0" />
                  <stop offset="55%" stopColor="#ffac2e" />
                  <stop offset="85%" stopColor="#ff4757" />
                  <stop offset="100%" stopColor="#a0e0ab" />
                </linearGradient>

                <linearGradient id={gradId2} x1="100%" y1="100%" x2="0%" y2="0%">
                  <stop offset="0%" stopColor="#00f5a0" />
                  <stop offset="50%" stopColor="#ffac2e" />
                  <stop offset="100%" stopColor="#ff4757" />
                </linearGradient>
              </defs>

              {/* 1. Base Unfilled M Silhouette (Glass Outline) */}
              <g transform="translate(0,1024) scale(0.1,-0.1)">
                <path
                  d={M_PATH}
                  fill="rgba(255, 255, 255, 0.05)"
                  stroke="rgba(255, 255, 255, 0.14)"
                  strokeWidth="12"
                />
              </g>

              {/* 2. Liquid Water Filling Container */}
              <g clipPath={`url(#${clipId})`}>
                {/* Secondary Water Wave Layer (Depth) */}
                <g className="splash-water-level-secondary">
                  <path
                    className="splash-water-wave-2"
                    d="M 0 0 C 300 45, 600 -45, 900 0 C 1200 45, 1500 -45, 1800 0 C 2100 45, 2400 -45, 2700 0 L 2700 1600 L 0 1600 Z"
                    fill={`url(#${gradId2})`}
                    opacity={0.55}
                  />
                </g>

                {/* Primary Water Wave Layer (Front) */}
                <g className="splash-water-level-primary">
                  <path
                    className="splash-water-wave-1"
                    d="M 0 0 C 280 -40, 560 40, 840 0 C 1120 -40, 1400 40, 1680 0 C 1960 -40, 2240 40, 2520 0 L 2520 1600 L 0 1600 Z"
                    fill={`url(#${gradId})`}
                  />
                </g>

                {/* Surface Liquid Shimmer Flash when filled */}
                <div className="splash-liquid-shimmer" />
              </g>
            </svg>
          </div>

          {/* Shimmering Brand Name "MacvBet" with shifting iridescent gradient */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5, ease: 'easeOut' }}
            className="relative mt-7 flex flex-col items-center"
          >
            <span className="splash-brand-text font-roobert font-extrabold text-[24px] sm:text-[28px] tracking-[0.22em] uppercase">
              MacvBet
            </span>
          </motion.div>

          {/* Inline Scoped Animations & Styles */}
          <style jsx>{`
            /* Liquid rise animation from bottom to top (0% -> 100% full fill) */
            .splash-water-level-primary {
              animation: liquidRise 2.1s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
            }

            .splash-water-level-secondary {
              animation: liquidRiseSecondary 2.1s cubic-bezier(0.2, 0.75, 0.3, 1) forwards;
            }

            /* Horizontal undulating water wave motion */
            .splash-water-wave-1 {
              animation: waveFlow 2s linear infinite;
            }

            .splash-water-wave-2 {
              animation: waveFlowReverse 2.6s linear infinite;
            }

            /* Shimmering Brand Text Gradient */
            .splash-brand-text {
              background: linear-gradient(
                90deg,
                #a0e0ab 0%,
                #00f5a0 20%,
                #ffac2e 40%,
                #ff4757 60%,
                #a0e0ab 80%,
                #00f5a0 100%
              );
              background-size: 300% auto;
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              animation: brandShimmer 3s ease-in-out infinite;
              filter: drop-shadow(0 0 16px rgba(0, 245, 160, 0.3));
            }

            @keyframes liquidRise {
              0% {
                transform: translateY(1050px);
              }
              100% {
                transform: translateY(-80px);
              }
            }

            @keyframes liquidRiseSecondary {
              0% {
                transform: translateY(1080px);
              }
              100% {
                transform: translateY(-90px);
              }
            }

            @keyframes waveFlow {
              0% {
                transform: translateX(0);
              }
              100% {
                transform: translateX(-840px);
              }
            }

            @keyframes waveFlowReverse {
              0% {
                transform: translateX(-900px);
              }
              100% {
                transform: translateX(0);
              }
            }

            @keyframes brandShimmer {
              0% {
                background-position: 0% 50%;
              }
              50% {
                background-position: 100% 50%;
              }
              100% {
                background-position: 0% 50%;
              }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
