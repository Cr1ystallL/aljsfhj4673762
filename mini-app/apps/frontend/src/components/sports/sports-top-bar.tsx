'use client';

import { ChevronLeft, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { SoccerBallIcon } from '@/components/ui/soccer-ball-icon';
import { useBalanceStore } from '@/store/balance-store';
import { useBalance } from '@/hooks/use-balance';
import { useAuthStore } from '@/store/auth-store';
import { PAGE_WIDTH } from '@/components/layout/page-width';
import { useT } from '@/i18n/use-t';

export function SportsTopBar({ backHref = '/' }: { backHref?: string }) {
  const router = useRouter();
  const { t, localeTag } = useT();
  const { user } = useAuthStore();
  const balanceStore = useBalanceStore((s) => s.balance);
  const { fetchBalance } = useBalance();

  useEffect(() => {
    void fetchBalance();
  }, [fetchBalance]);

  const balanceAmount = balanceStore?.amount ?? 0;
  const initials = (user?.firstName?.charAt(0) ?? 'U').toUpperCase();

  return (
    <header className="sticky top-0 z-40 w-full bg-midnight-canvas/95 backdrop-blur-md border-b border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.07)]">
      <div
        className={`mx-auto w-full px-3.5 py-2.5 flex items-center justify-between gap-2 ${PAGE_WIDTH.reading}`}
      >
        {/* Left: Back button & Title */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => router.push(backHref)}
            aria-label={backHref === '/sport' ? t('sports.backToLine') : t('nav.backToMenu')}
            className="p-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-whisper-gray hover:text-frost-white hover:bg-white/[0.08] active:scale-[0.95] transition-all flex items-center justify-center shrink-0"
          >
            <ChevronLeft size={20} strokeWidth={2.2} />
          </button>

          <div className="flex items-center gap-2 min-w-0 pl-1">
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <SoccerBallIcon size={16} strokeWidth={2.2} />
            </div>
            <span className="font-roobert text-frost-white text-[17px] font-bold tracking-[-0.02em] truncate">
              {t('sports.title')}
            </span>
          </div>
        </div>

        {/* Right: Balance Pill & User Avatar */}
        <div className="flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full border border-white/15 bg-[#14171c] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <button
            onClick={() => router.push('/balance')}
            aria-label={t('nav.wallet')}
            className="group flex items-center gap-2 hover:opacity-90 transition-all active:scale-[0.96] mr-0.5"
          >
            <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
              <Wallet size={13} strokeWidth={2.2} />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-roobert font-bold text-frost-white text-[14px] sm:text-[15px] tabular-nums tracking-tight">
                {balanceAmount.toLocaleString(localeTag, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="font-roobert text-amber-300 text-[11px] font-bold tracking-wider uppercase">
                zł
              </span>
            </div>
          </button>

          {/* Profile Avatar Button */}
          <button
            onClick={() => router.push('/profile')}
            aria-label={t('nav.profile')}
            className="relative w-8 h-8 rounded-full overflow-hidden border border-white/20 hover:border-white/40 transition-all active:scale-[0.95] flex items-center justify-center shrink-0 shadow-md bg-white/10"
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
              <span className="font-roobert font-bold text-[13px] text-frost-white">
                {initials}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
