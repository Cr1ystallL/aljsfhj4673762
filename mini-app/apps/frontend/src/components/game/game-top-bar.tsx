'use client';

import { Trophy, HelpCircle, Wallet, type LucideIcon, ChevronLeft, Bell, Search, X } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { BrandLockup } from '@/components/ui/brand-mark';
import { useAuthStore } from '@/store/auth-store';
import { useBalanceStore } from '@/store/balance-store';
import { useBalance } from '@/hooks/use-balance';
import { PAGE_WIDTH, type PageWidth } from '@/components/layout/page-width';
import { useT } from '@/i18n/use-t';

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
  width?: PageWidth;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
}

export function GameTopBar({
  title,
  Icon,
  iconRotate = 0,
  onHowToPlay,
  hideBalance = false,
  balance,
  currency,
  extraAction,
  width = 'reading',
  searchValue,
  onSearchChange,
  searchPlaceholder,
}: GameTopBarProps) {
  const router = useRouter();
  const { t, localeTag } = useT();
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
    if (balance === undefined) {
      void fetchBalance();
    }
  }, [fetchBalance, balance]);

  const balanceAmount =
    balance !== undefined
      ? balance
      : activeTournamentBalance
      ? activeTournamentBalance.balance
      : balanceStore?.amount ?? 0;

  const currencySymbol = currency
    ? currency
    : activeTournamentBalance
    ? '🏆'
    : 'zł';

  const initials = (user?.firstName?.charAt(0) ?? 'U').toUpperCase();
  const showPillWrapper = !hideBalance || !isProfilePage;

  return (
    <header className="lg:hidden sticky top-0 z-50 w-full bg-[#09090b]/95 backdrop-blur-md border-b border-amber-500/15 shadow-[0_12px_40px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(212,175,55,0.08)]">
      <div
        className={`mx-auto w-full px-3.5 py-2.5 flex items-center justify-between gap-3 ${PAGE_WIDTH[width]}`}
      >
        {/* Left Cluster: Brand / Back button & Page Title */}
        <div className="flex items-center gap-2.5 min-w-0">
          {!isHome ? (
            <button
              type="button"
              onClick={() => router.push('/')}
              aria-label={t('nav.backToMenu')}
              className="p-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-whisper-gray hover:text-frost-white hover:bg-white/[0.08] active:scale-[0.95] transition-all flex items-center justify-center shrink-0"
            >
              <ChevronLeft size={20} strokeWidth={2.2} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.push('/')}
              aria-label={t('nav.home')}
              className="p-1 rounded-xl transition-all hover:scale-105 hover:bg-white/5 active:scale-95 shrink-0 lg:hidden"
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
            <span className="font-roobert text-frost-white text-[16px] sm:text-[17px] font-semibold tracking-[-0.02em] truncate">
              {title}
            </span>
          </div>
        </div>

        {/* Center: Search input on Desktop */}
        {onSearchChange ? (
          <div className="hidden lg:flex items-center flex-1 max-w-md mx-4 relative">
            <Search className="w-4 h-4 text-amber-400/70 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchValue ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder ?? 'Поиск игр, провайдеров...'}
              className="w-full h-9 pl-9 pr-8 rounded-xl border border-amber-500/20 bg-black/40 text-[13px] text-frost-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400/50 focus:bg-black/60 transition-all shadow-inner"
            />
            {searchValue && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 text-zinc-400 hover:text-white p-0.5"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ) : (
          <div className="hidden lg:flex flex-1" />
        )}

        {/* Right Cluster: Notifications, Balance Pill with (+), Avatar */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Notification bell on desktop */}
          <button
            type="button"
            onClick={() => router.push('/bonuses')}
            className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full border border-amber-500/20 bg-white/[0.03] text-zinc-300 hover:text-amber-300 hover:bg-amber-500/10 transition-all relative"
            title="Бонусы и уведомления"
          >
            <Bell size={15} strokeWidth={2} />
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 absolute top-1.5 right-1.5 animate-pulse" />
          </button>

          {showPillWrapper && (
            <div className="flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full border border-amber-500/25 bg-[#121217] shadow-[0_4px_20px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)]">
              {!hideBalance && (
                <button
                  onClick={() => router.push('/balance')}
                  aria-label={t('nav.wallet')}
                  className="group flex items-center gap-2 hover:opacity-90 transition-all active:scale-[0.96] mr-0.5"
                >
                  <div className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                    <Wallet size={12} strokeWidth={2.2} />
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="font-roobert font-bold text-frost-white text-[13px] sm:text-[14px] tabular-nums tracking-tight">
                      {balanceAmount.toLocaleString(localeTag, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="font-roobert text-amber-300 text-[11px] font-bold tracking-wider uppercase">
                      {currencySymbol === '🏆' ? (
                        <Trophy size={11} strokeWidth={2.5} />
                      ) : (
                        currencySymbol
                      )}
                    </span>
                  </div>
                </button>
              )}

              {/* Deposit (+) button */}
              {!hideBalance && (
                <button
                  type="button"
                  onClick={() => router.push('/balance')}
                  aria-label="Пополнить"
                  className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-black font-extrabold text-[12px] leading-none flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-md cursor-pointer"
                  title="Пополнить баланс"
                >
                  +
                </button>
              )}

              {/* Profile Avatar Button (Hidden on /profile page) */}
              {!isProfilePage && (
                <button
                  onClick={() => router.push('/profile')}
                  aria-label={t('nav.profile')}
                  className="relative w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden border border-amber-500/35 hover:border-amber-400/60 transition-all active:scale-[0.95] flex items-center justify-center shrink-0 shadow-md bg-amber-500/10 ring-1 ring-amber-400/20"
                >
                  {user?.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.photoUrl}
                      alt={user.firstName || t('nav.profile')}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      draggable={false}
                    />
                  ) : (
                    <span className="font-roobert font-bold text-[12px] text-amber-300">
                      {initials}
                    </span>
                  )}
                </button>
              )}
            </div>
          )}

          {onHowToPlay && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onHowToPlay();
              }}
              aria-label={t('common.howToPlay')}
              className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-amber-500/25 bg-white/[0.08] text-amber-400 hover:text-amber-300 hover:bg-white/[0.15] hover:border-amber-400/50 active:scale-90 transition-all shrink-0 cursor-pointer touch-manipulation z-20 shadow-md"
              title="Правила игры"
            >
              <HelpCircle size={16} strokeWidth={2.2} />
            </button>
          )}

          {extraAction}
        </div>
      </div>
    </header>
  );
}
