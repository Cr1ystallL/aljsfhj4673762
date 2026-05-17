'use client';

import { HelpCircle, Wallet, type LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { BrandLockup } from '@/components/ui/brand-mark';
import { useAuthStore } from '@/store/auth-store';
import { useBalanceStore } from '@/store/balance-store';
import { useBalance } from '@/hooks/use-balance';

/**
 * Game Top Bar — Monopo Saigon Style
 *
 * Shared header used across every game screen. Composition:
 *
 *   - Left:   BrandLockup → tap returns to the home screen.
 *             Game title + glyph next to it.
 *   - Right:  Balance pill → tap opens the wallet.
 *             Avatar pill   → tap opens the profile.
 *             "Как играть"  → opens the rules modal.
 *
 * The brand lockup, balance pill and avatar make the games feel like
 * part of one app rather than a series of standalone screens — every
 * game inherits the home identity strip for free.
 */
interface GameTopBarProps {
  title: string;
  Icon: LucideIcon;
  iconRotate?: number;
  onHowToPlay?: () => void;
}

export function GameTopBar({
  title,
  Icon,
  iconRotate = 0,
  onHowToPlay,
}: GameTopBarProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const balance = useBalanceStore((s) => s.balance);
  const { fetchBalance } = useBalance();

  // Pull a fresh balance whenever the bar mounts so the pill is never
  // stale even if a previous WS push was missed.
  useEffect(() => {
    void fetchBalance();
  }, [fetchBalance]);

  const balanceAmount = balance?.amount ?? 0;
  const initials = (user?.firstName?.charAt(0) ?? 'U').toUpperCase();

  return (
    <div className="flex items-center justify-between gap-2 px-1">
      {/* Left cluster: brand → home, title, glyph */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={() => router.push('/')}
          aria-label="На главную"
          className="rounded-card transition-opacity hover:opacity-80"
        >
          <BrandLockup size={48} />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-roobert text-frost-white text-[22px] font-normal leading-none truncate">
            {title}
          </span>
          <Icon
            size={16}
            className="text-frost-white/85 shrink-0"
            strokeWidth={1.6}
            style={iconRotate ? { transform: `rotate(${iconRotate}deg)` } : undefined}
          />
        </div>
      </div>

      {/* Right cluster: balance → wallet, avatar → profile, rules */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => router.push('/balance')}
          aria-label="Кошелёк"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-pill border border-white/15 bg-white/[0.04] hover:border-white/25 transition-colors"
        >
          <Wallet size={12} className="text-frost-white/70" strokeWidth={1.8} />
          <span className="font-roobert text-frost-white text-[12px] tabular-nums leading-none">
            {balanceAmount.toLocaleString('ru-RU', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}
          </span>
          <span className="font-roobert text-whisper-gray text-[10px] leading-none">
            ₽
          </span>
        </button>

        <button
          onClick={() => router.push('/profile')}
          aria-label="Профиль"
          className="relative w-9 h-9 rounded-pill overflow-hidden border border-white/15 bg-white/[0.04] hover:border-white/25 transition-colors flex items-center justify-center"
        >
          {user?.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photoUrl}
              alt={user.firstName || 'Профиль'}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              draggable={false}
            />
          ) : (
            <span className="font-roobert text-[13px] text-frost-white">
              {initials}
            </span>
          )}
        </button>

        {onHowToPlay && (
          <button
            onClick={onHowToPlay}
            aria-label="Как играть"
            className="inline-flex items-center justify-center w-9 h-9 rounded-pill border border-white/15 bg-white/[0.04] text-frost-white/80 hover:text-frost-white hover:border-white/25 transition-colors"
          >
            <HelpCircle size={14} strokeWidth={1.7} />
          </button>
        )}
      </div>
    </div>
  );
}
