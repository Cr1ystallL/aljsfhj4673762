'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { soundManager } from '@/lib/sound/sound-manager';

interface MacvSlotBigWinModalProps {
  winAmount: number | null;
  onClose: () => void;
}

// 60fps cubic rolling number hook with instant-complete capability
function useAnimatedNumber(targetValue: number, duration = 3000) {
  const [displayValue, setDisplayValue] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    if (!targetValue || targetValue <= 0) {
      setDisplayValue(0);
      setIsFinished(true);
      return;
    }

    setIsFinished(false);
    const startValue = 0;
    const diff = targetValue - startValue;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // easeOutExpo for dramatic big win tension
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplayValue(startValue + diff * ease);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayValue(targetValue);
        setIsFinished(true);
      }
    };

    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [targetValue, duration]);

  const complete = () => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    setDisplayValue(targetValue);
    setIsFinished(true);
  };

  return { displayValue, isFinished, complete };
}

export function MacvSlotBigWinModal({
  winAmount,
  onClose,
}: MacvSlotBigWinModalProps) {
  const isOpen = winAmount !== null && winAmount > 0;
  // Dramatic, slow rolling counter over 3.0s
  const { displayValue: animatedWin, isFinished, complete } = useAnimatedNumber(winAmount || 0, 3000);

  useEffect(() => {
    if (isOpen) {
      soundManager.play('game.win', { volume: 1.0 });
      if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.HapticFeedback) {
        (window as any).Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      }

      // Auto-dismiss 2.5s after number rolling finishes (total 5.5s) if user doesn't click
      const autoDismissTimer = setTimeout(() => {
        onClose();
      }, 5500);

      return () => clearTimeout(autoDismissTimer);
    }
  }, [isOpen, onClose]);

  // Generate 18 particles of animated flying coins with randomized trajectories
  const coins = useMemo(() => {
    return Array.from({ length: 18 }).map((_, i) => {
      const angle = (i / 18) * 360;
      const rad = (angle * Math.PI) / 180;
      const distance = 160 + (i % 5) * 45;
      const targetX = Math.cos(rad) * distance * 1.3;
      const targetY = -120 - Math.sin(rad) * distance * 0.9;
      return {
        id: i,
        size: 32 + (i % 4) * 10,
        x: targetX,
        y: targetY,
        delay: (i % 6) * 0.08,
        duration: 1.4 + (i % 3) * 0.3,
        rotation: 360 + (i % 4) * 180,
      };
    });
  }, []);

  const handleClick = () => {
    if (!isFinished) {
      // 1-е нажатие: моментально заканчивает анимацию цифр
      complete();
    } else {
      // 2-е нажатие: закрывает окно
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        onClick={handleClick}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md cursor-pointer select-none animate-in fade-in duration-300"
      >
        {/* Banner + Coins Container */}
        <div className="relative w-full max-w-[560px] sm:max-w-[640px] flex items-center justify-center">
          {/* Flying Spinning Coins from behind the banner */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            {coins.map((c) => (
              <motion.div
                key={c.id}
                initial={{ x: 0, y: -40, opacity: 0, scale: 0.2, rotate: 0 }}
                animate={{
                  x: [0, c.x * 0.6, c.x],
                  y: [-40, c.y, c.y + 180],
                  opacity: [0, 1, 1, 0],
                  scale: [0.3, 1.2, 0.8],
                  rotate: [0, c.rotation],
                }}
                transition={{
                  repeat: Infinity,
                  duration: c.duration,
                  delay: c.delay,
                  ease: 'easeOut',
                }}
                className="absolute"
                style={{ width: c.size, height: c.size }}
              >
                <Image
                  src="/MacvSlot/coinbutton.webp"
                  alt="Coin"
                  fill
                  unoptimized
                  className="object-contain drop-shadow-[0_4px_10px_rgba(251,191,36,0.8)]"
                />
              </motion.div>
            ))}
          </div>

          {/* Pulsing BIG WIN Banner */}
          <motion.div
            initial={{ scale: 0.65, opacity: 0, y: 30 }}
            animate={{
              scale: [0.97, 1.03, 0.97],
              opacity: 1,
              y: 0,
            }}
            transition={{
              scale: {
                repeat: Infinity,
                duration: 1.8,
                ease: 'easeInOut',
              },
              opacity: { duration: 0.25 },
              y: { type: 'spring', damping: 20, stiffness: 300 },
            }}
            className="relative z-10 w-full aspect-[650/450] max-h-[70vh] flex items-center justify-center drop-shadow-[0_20px_50px_rgba(0,0,0,0.95)]"
          >
            {/* The Big Win Hardware Banner Art */}
            <Image
              src="/MacvSlot/bigwin.webp"
              alt="BIG WIN"
              fill
              priority
              unoptimized
              className="object-contain"
            />

            {/* Exactly positioned over the dark red oval plaque at the bottom of bigwin.webp */}
            <div className="absolute inset-x-0 bottom-[9.5%] h-[20%] flex items-center justify-center px-8 sm:px-12 pointer-events-none">
              <span
                className="font-brand font-black text-3xl sm:text-5xl md:text-6xl text-yellow-300 tracking-tight leading-none text-center"
                style={{
                  textShadow:
                    '0 2px 0 #b45309, 0 4px 0 #991b1b, 0 7px 0 #7f1d1d, 0 10px 0 #450a0a, 0 14px 18px rgba(0,0,0,0.95)',
                }}
              >
                {animatedWin.toFixed(2)} zł
              </span>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}
