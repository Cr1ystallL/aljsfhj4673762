'use client';

import React from 'react';
import { VipBadge } from '@/components/vip/vip-badge';
import { VIP_RANKS } from '@/lib/vip';

interface UserAvatarProps {
  photoUrl?: string | null;
  name?: string | null;
  vipLevel?: number | null;
  rankId?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showBadge?: boolean;
  className?: string;
}

const SIZE_MAP = {
  xs: { container: 'w-6 h-6', text: 'text-[9px]', badgeSize: 'xs' as const },
  sm: { container: 'w-8 h-8', text: 'text-[11px]', badgeSize: 'xs' as const },
  md: { container: 'w-10 h-10', text: 'text-xs', badgeSize: 'sm' as const },
  lg: { container: 'w-12 h-12', text: 'text-sm', badgeSize: 'sm' as const },
  xl: { container: 'w-16 h-16', text: 'text-base', badgeSize: 'md' as const },
};

export function UserAvatar({
  photoUrl,
  name,
  vipLevel = 0,
  rankId,
  size = 'md',
  showBadge = true,
  className = '',
}: UserAvatarProps) {
  const currentLevel = vipLevel ?? 0;
  const effectiveRank = rankId
    ? VIP_RANKS.find((r) => r.id === rankId) || VIP_RANKS[0]
    : VIP_RANKS.find((r) => r.level === currentLevel) || VIP_RANKS[0];

  const initial = (name?.trim()?.charAt(0) || 'U').toUpperCase();
  const config = SIZE_MAP[size] || SIZE_MAP.md;

  return (
    <div className={`relative shrink-0 select-none ${config.container} ${className}`}>
      {/* Avatar circular frame */}
      <div
        className={`w-full h-full rounded-full border overflow-hidden flex items-center justify-center shadow-md bg-[#12141a] transition-transform ${
          currentLevel >= 4
            ? 'border-cyan-400/50 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
            : currentLevel >= 2
            ? 'border-amber-400/40 shadow-[0_0_8px_rgba(245,158,11,0.2)]'
            : 'border-white/15'
        }`}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={name || 'User'}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <span className={`font-roobert font-extrabold text-frost-white ${config.text}`}>
            {initial}
          </span>
        )}
      </div>

      {/* Mini VIP Badge attached at bottom-right corner */}
      {showBadge && (
        <div className="absolute -bottom-1 -right-1 z-10 scale-90 pointer-events-none drop-shadow-md">
          <VipBadge rankId={effectiveRank.id} size={config.badgeSize} />
        </div>
      )}
    </div>
  );
}
