'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import type { VipRankId } from '@casino/shared';

interface VipBadgeProps {
  rankId?: VipRankId | string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showGlow?: boolean;
}

const SIZE_MAP = {
  xs: { box: 'w-6 h-6', img: 24 },
  sm: { box: 'w-8 h-8', img: 32 },
  md: { box: 'w-12 h-12', img: 48 },
  lg: { box: 'w-16 h-16', img: 64 },
  xl: { box: 'w-24 h-24', img: 96 },
};

const RANK_IMAGE_MAP: Record<string, string> = {
  none: '/Rangs/no_rang.png',
  bronze: '/Rangs/Bronze.png',
  silver: '/Rangs/Silver.png',
  gold: '/Rangs/Gold.png',
  platinum: '/Rangs/Platinum.png',
  diamond: '/Rangs/Diamond.png',
};

export function VipBadge({
  rankId = 'none',
  size = 'md',
  className,
  showGlow = false,
}: VipBadgeProps) {
  const normId = String(rankId || 'none').toLowerCase();
  const src = RANK_IMAGE_MAP[normId] || RANK_IMAGE_MAP.none;
  const isNoRang = normId === 'none';
  const { box, img } = SIZE_MAP[size] || SIZE_MAP.md;

  return (
    <div className={cn('relative inline-flex items-center justify-center select-none shrink-0', box, className)}>
      {showGlow && (
        <div
          aria-hidden
          className={cn(
            'absolute inset-0 rounded-full blur-md opacity-40 pointer-events-none -z-10',
            normId === 'bronze' && 'bg-amber-700/60',
            normId === 'silver' && 'bg-slate-300/50',
            normId === 'gold' && 'bg-amber-400/60',
            normId === 'platinum' && 'bg-purple-500/60',
            normId === 'diamond' && 'bg-cyan-400/70',
            normId === 'none' && 'bg-white/20'
          )}
        />
      )}
      <div className={cn('relative w-full h-full flex items-center justify-center', isNoRang && 'scale-[0.82]')}>
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
