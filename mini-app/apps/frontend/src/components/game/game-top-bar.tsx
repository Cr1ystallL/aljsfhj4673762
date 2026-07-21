'use client';

import { Trophy, HelpCircle, Wallet, type LucideIcon, ChevronLeft } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { BrandLockup } from '@/components/ui/brand-mark';
import { useAuthStore } from '@/store/auth-store';
import { useBalanceStore } from '@/store/balance-store';
import { useBalance } from '@/hooks/use-balance';

/**
 * Game Top Bar — Apple Design & Taste-Skill Premium Header (V10)
 *
 * Updates:
 *   - Clean layout fix: Outer border pill is hidden when on /profile page with hidden balance, avoiding empty border markup.
 */

interface GameTopBarProps {
  title: string;
  Icon?: LucideIcon;
  iconRotate?: number;
  onHowToPlay?: () => void;
  hideBalance?: boolean;
  balance?: number;
  currency?: string;
  serverSeedHash?: string;
  extraAction?: React.ReactNode;
}

export function GameTopBar({
  title,
  Icon,
  iconRotate = 0,
  onHowToPlay,
  hideBalance = false,
  extraAction,
}: GameTopBarProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const balanceStore = useBalanceStore((s) => s.balance);
  const tournamentBalances = useBalanceStore((s) => s.tournamentBalances);
  const { fetchBalance } = useBalance();
  const pathname = usePathname();

  const isHome = pathname === '/';
  const isProfilePage = pathname?.startsWith('/profile') ?? false;
  const gameType = pathname?.split('/').pop() || '';
  const activeTournamentBalance = tournamentBalances.find(
    (t) => t.gameType === gameType
  );

  useEffect(() => {
    void fetchBalance();
  }, [fetchBalance]);

  const balanceAmount = activeTournamentBalance
    ? activeTournamentBalance.balance
    : balanceStore?.amount ?? 0;
  const initials = (user?.firstName?.charAt(0) ?? 'U').toUpperCase();

  const showPillWrapper = !hideBalance || !isProfilePage;

  return (
    <header className="sticky top-0 z-50 w-full bg-midnight-canvas/80 backdrop-blur-2xl border-b border-white/10 shadow-2xl transition-all">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-3.5 py-2.5 flex items-center justify-between gap-2">
        {/* Left Cluster: Brand / Back button & Page Title */}
        <div className="flex items-center gap-2.5 min-w-0">
          {!isHome ? (
            <button
              type="button"
              onClick={() => router.push('/')}
              aria-label="Назад в меню"
              className="p-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-whisper-gray hover:text-frost-white hover:bg-white/[0.08] active:scale-[0.95] transition-all flex items-center justify-center shrink-0"
            >
              <ChevronLeft size={20} strokeWidth={2.2} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.push('/')}
              aria-label="Главная"
              className="p-1 rounded-xl transition-all hover:scale-105 hover:bg-white/5 active:scale-95 shrink-0"
            >
              <BrandLockup size={38} />
            </button>
          )}

          <div className="flex items-center gap-2 min-w-0 pl-1">
            {Icon && (
              <Icon
                size={17}
                className="text-amber-400 shrink-0"
                strokeWidth={2}
                style={iconRotate ? { transform: `rotate(${iconRotate}deg)` } : undefined}
              />
            )}
            <span className="font-roobert text-frost-white text-[16px] sm:text-[17px] font-semibold tracking-wide truncate">
              {title}
            </span>
          </div>
        </div>

        {/* Right Cluster: Combined Balance Pill & Avatar */}
        <div className="flex items-center gap-2 shrink-0">
          {showPillWrapper && (
            <div className="flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full border border-white/15 bg-gradient-to-r from-white/[0.06] via-white/[0.04] to-white/[0.06] shadow-inner backdrop-blur-md">
              {!hideBalance && (
                <button
                  onClick={() => router.push('/balance')}
                  aria-label="Кошелёк"
                  className="group flex items-center gap-2 hover:opacity-90 transition-all active:scale-[0.96] mr-0.5"
                >
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                    <Wallet size={13} strokeWidth={2.2} />
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="font-roobert font-bold text-frost-white text-[14px] sm:text-[15px] tabular-nums tracking-tight">
                      {balanceAmount.toLocaleString('ru-RU', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="font-roobert text-amber-300 text-[11px] font-bold tracking-wider uppercase">
                      {activeTournamentBalance ? (
                        <Trophy size={11} strokeWidth={2.5} />
                      ) : (
                        'zł'
                      )}
                    </span>
                  </div>
                </button>
              )}

              {/* Profile Avatar Button (Hidden on /profile page) */}
              {!isProfilePage && (
                <button
                  onClick={() => router.push('/profile')}
                  aria-label="Профиль"
                  className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden border border-white/20 hover:border-white/40 transition-all active:scale-[0.95] flex items-center justify-center shrink-0 shadow-md bg-white/10"
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
                    <span className="font-roobert font-bold text-[15px] text-frost-white">
                      {initials}
                    </span>
                  )}
                </button>
              )}
            </div>
          )}

          {onHowToPlay && (
            <button
              onClick={onHowToPlay}
              aria-label="Как играть"
              className="flex items-center justify-center w-9 h-9 rounded-full border border-white/10 bg-white/[0.04] text-whisper-gray hover:text-frost-white hover:bg-white/[0.08] hover:border-white/20 transition-all active:scale-[0.95] shrink-0"
            >
              <HelpCircle size={16} strokeWidth={2} />
            </button>
          )}

          {extraAction}
        </div>
      </div>
    </header>
  );
}
