'use client';

import { Trophy, HelpCircle, Wallet, type LucideIcon } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
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
 *             "How to play" → opens the rules modal.
 *
 * The brand lockup, balance pill and avatar make the games feel like
 * part of one app rather than a series of standalone screens — every
 * game inherits the home identity strip for free.
 */
interface GameTopBarProps {
  title: string;
  Icon?: LucideIcon;
  iconRotate?: number;
  onHowToPlay?: () => void;
  hideBalance?: boolean;
  // Fallbacks for games still passing these
  balance?: number;
  currency?: string;
  serverSeedHash?: string;
}

export function GameTopBar({
  title,
  Icon,
  iconRotate = 0,
  onHowToPlay,
  hideBalance = false,
}: GameTopBarProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const balanceStore = useBalanceStore((s) => s.balance);
  const tournamentBalances = useBalanceStore((s) => s.tournamentBalances);
  const { fetchBalance } = useBalance();
  const pathname = usePathname();
  
  const gameType = pathname?.split('/').pop() || '';
  const activeTournamentBalance = tournamentBalances.find(t => t.gameType === gameType);

  // Pull a fresh balance whenever the bar mounts so the pill is never
  // stale even if a previous WS push was missed.
  useEffect(() => {
    void fetchBalance();
  }, [fetchBalance]);

  const balanceAmount = activeTournamentBalance ? activeTournamentBalance.balance : (balanceStore?.amount ?? 0);
  const initials = (user?.firstName?.charAt(0) ?? 'U').toUpperCase();

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-black/40 backdrop-blur-xl shadow-lg relative z-40">
      {/* Left cluster: brand → home, title, glyph */}
      <div className="flex items-center gap-4 min-w-0">
        <button
          type="button"
          onClick={() => router.push('/')}
          aria-label="Главная"
          className="p-1 rounded-xl transition-all hover:scale-105 hover:bg-white/5 active:scale-95"
        >
          <BrandLockup size={40} />
        </button>
        <div className="flex items-center gap-2.5 min-w-0 pl-2 border-l border-white/10">
          {Icon && (
            <Icon
              size={18}
              className="text-white/60 shrink-0"
              strokeWidth={2}
              style={iconRotate ? { transform: `rotate(${iconRotate}deg)` } : undefined}
            />
          )}
          <span className="font-roobert text-white text-lg font-semibold tracking-wide truncate">
            {title}
          </span>
        </div>
      </div>

      {/* Right cluster: balance + avatar combined, rules */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-2 pl-3 pr-1 py-1 rounded-full border border-white/10 bg-white/5 shadow-inner">
          {!hideBalance && (
            <button
              onClick={() => router.push('/balance')}
              aria-label="Кошелёк"
              className="group flex items-center gap-2 hover:opacity-80 transition-all active:scale-95 mr-1"
            >
              <Wallet size={16} className="text-white/80" strokeWidth={2} />
              <div className="flex items-baseline gap-1">
                <span className="font-roobert font-bold text-white text-base tabular-nums tracking-tight">
                  {balanceAmount.toLocaleString('ru-RU', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="font-roobert text-white/40 text-[12px] uppercase font-bold tracking-wider">
                  {activeTournamentBalance ? <Trophy size={11} strokeWidth={2.5} /> : 'zł'}
                </span>
              </div>
            </button>
          )}

          <button
            onClick={() => router.push('/profile')}
            aria-label="Профиль"
            className="relative w-9 h-9 rounded-full overflow-hidden border-2 border-white/10 hover:border-white/30 transition-all active:scale-95 flex items-center justify-center shrink-0"
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
              <span className="font-roobert font-bold text-sm text-white/80">
                {initials}
              </span>
            )}
          </button>
        </div>

        {onHowToPlay && (
          <button
            onClick={onHowToPlay}
            aria-label="Как играть"
            className="flex items-center justify-center w-9 h-9 rounded-full border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all active:scale-95 shrink-0"
          >
            <HelpCircle size={16} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}
