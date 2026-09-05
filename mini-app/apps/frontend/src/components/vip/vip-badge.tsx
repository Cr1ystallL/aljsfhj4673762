'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { VipRankId } from '@/lib/vip';

interface VipBadgeProps {
  rankId?: VipRankId | string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showGlow?: boolean;
}

const SIZE_MAP = {
  xs: { box: 'w-6 h-6', img: 24, aura: 'w-9 h-9' },
  sm: { box: 'w-8 h-8', img: 32, aura: 'w-14 h-14' },
  md: { box: 'w-12 h-12', img: 48, aura: 'w-20 h-20' },
  lg: { box: 'w-16 h-16', img: 64, aura: 'w-28 h-28' },
  xl: { box: 'w-24 h-24', img: 96, aura: 'w-36 h-36' },
};

const RANK_IMAGE_MAP: Record<string, string> = {
  none: '/Rangs/no_rang.png',
  bronze: '/Rangs/Bronze.png',
  silver: '/Rangs/Silver.png',
  gold: '/Rangs/Gold.png',
  platinum: '/Rangs/Platinum.png',
  diamond: '/Rangs/Diamond.png',
};

const AURA_STYLES: Record<string, {
  gradient: string;
  shadow: string;
  border?: string;
  isDiamond?: boolean;
}> = {
  // 1 ур — бронзовый (#cd7f32)
  bronze: {
    gradient: 'radial-gradient(circle, rgba(205,127,50,0.85) 0%, rgba(180,83,9,0.45) 48%, transparent 72%)',
    shadow: '0 0 25px rgba(205,127,50,0.7), inset 0 0 15px rgba(205,127,50,0.3)',
    border: 'rgba(205,127,50,0.5)',
  },
  // 2 ур — серебрянный (#c0c0c0)
  silver: {
    gradient: 'radial-gradient(circle, rgba(226,232,240,0.9) 0%, rgba(192,192,192,0.5) 48%, transparent 72%)',
    shadow: '0 0 25px rgba(192,192,192,0.7), inset 0 0 15px rgba(226,232,240,0.3)',
    border: 'rgba(226,232,240,0.6)',
  },
  // 3 ур — золотой (#ffd700)
  gold: {
    gradient: 'radial-gradient(circle, rgba(255,215,0,0.95) 0%, rgba(245,158,11,0.55) 50%, transparent 72%)',
    shadow: '0 0 32px rgba(255,215,0,0.8), inset 0 0 20px rgba(245,158,11,0.4)',
    border: 'rgba(255,215,0,0.7)',
  },
  // 4 ур — фиолетовый (#a855f7)
  platinum: {
    gradient: 'radial-gradient(circle, rgba(168,85,247,0.95) 0%, rgba(147,51,234,0.55) 50%, transparent 72%)',
    shadow: '0 0 32px rgba(168,85,247,0.8), inset 0 0 20px rgba(147,51,234,0.4)',
    border: 'rgba(168,85,247,0.65)',
  },
  // 5 ур — алмазно фиолетовый (#c084fc + #38bdf8)
  diamond: {
    gradient: 'radial-gradient(circle, rgba(192,132,252,0.95) 0%, rgba(56,189,248,0.75) 40%, rgba(147,51,234,0.45) 65%, transparent 80%)',
    shadow: '0 0 36px rgba(192,132,252,0.85), 0 0 22px rgba(56,189,248,0.7)',
    border: 'rgba(192,132,252,0.8)',
    isDiamond: true,
  },
  none: {
    gradient: 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%)',
    shadow: '0 0 15px rgba(255,255,255,0.15)',
  },
};

export function normalizeRankId(rankId?: VipRankId | string | number): string {
  if (rankId === undefined || rankId === null) return 'none';
  const str = String(rankId).toLowerCase().trim();
  if (str === '0' || str === 'none' || str === 'no_rank') return 'none';
  if (str === '1' || str === 'bronze') return 'bronze';
  if (str === '2' || str === 'silver') return 'silver';
  if (str === '3' || str === 'gold') return 'gold';
  if (str === '4' || str === 'platinum') return 'platinum';
  if (str === '5' || str === 'diamond') return 'diamond';
  return str in RANK_IMAGE_MAP ? str : 'none';
}

export function RankPulsingAura({
  rankId = 'none',
  size = 'md',
  className = '',
}: {
  rankId?: string | number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const normId = normalizeRankId(rankId);
  const aura = AURA_STYLES[normId] || AURA_STYLES.none;
  const { aura: sizeClass } = SIZE_MAP[size] || SIZE_MAP.md;

  if (normId === 'none') return null;

  return (
    <div className={cn('absolute inset-0 flex items-center justify-center pointer-events-none -z-10', className)}>
      {/* Outer pulsating radial aura */}
      <motion.div
        animate={{
          scale: [0.95, 1.25, 0.95],
          opacity: [0.45, 0.9, 0.45],
        }}
        transition={{
          duration: 2.6,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className={cn('absolute rounded-full blur-xl', sizeClass)}
        style={{ background: aura.gradient }}
      />

      {/* Secondary breathing core halo */}
      <motion.div
        animate={{
          scale: [1.12, 0.92, 1.12],
          opacity: [0.35, 0.75, 0.35],
        }}
        transition={{
          duration: 3.2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className={cn('absolute rounded-full blur-md', sizeClass)}
        style={{
          boxShadow: aura.shadow,
          border: aura.border ? `1px solid ${aura.border}` : undefined,
        }}
      />

      {/* Level 5 Diamond-Purple celestial rotating shine */}
      {aura.isDiamond && (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
          className={cn('absolute rounded-full opacity-55 blur-lg', sizeClass)}
          style={{
            background:
              'conic-gradient(from 0deg, rgba(192,132,252,0.8), rgba(56,189,248,0.85), rgba(168,85,247,0.7), rgba(192,132,252,0.8))',
          }}
        />
      )}
    </div>
  );
}

export function VipBadge({
  rankId = 'none',
  size = 'md',
  className,
  showGlow = false,
}: VipBadgeProps) {
  const normId = normalizeRankId(rankId);
  const src = RANK_IMAGE_MAP[normId] || RANK_IMAGE_MAP.none;
  const isNoRang = normId === 'none';
  const { box, img } = SIZE_MAP[size] || SIZE_MAP.md;

  return (
    <div className={cn('relative inline-flex items-center justify-center select-none shrink-0', box, className)}>
      {showGlow && <RankPulsingAura rankId={normId} size={size} />}
      <div className={cn('relative w-full h-full flex items-center justify-center z-10', isNoRang && 'scale-[0.82]')}>
        <Image
          src={src}
          alt={normId}
          width={img}
          height={img}
          className="w-full h-full object-contain pointer-events-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]"
          priority={size === 'lg' || size === 'xl'}
        />
      </div>
    </div>
  );
}
