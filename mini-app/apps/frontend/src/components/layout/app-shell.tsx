'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BottomNavigation } from './bottom-navigation';
import { MenuDrawer } from './menu-drawer';
import { useNavStore } from '@/store/nav-store';
import { useAuthStore } from '@/store/auth-store';
import { useT } from '@/i18n/use-t';
import { SportsBetaNotice } from '@/components/sports/sports-beta-notice';
import { ChevronRight, Menu } from 'lucide-react';

import { DesktopSidebar } from './desktop-sidebar';

const HIDEABLE_PREFIXES = ['/game/'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const setHideable = useNavStore((s) => s.setHideable);
  const isAuthenticated = !!useAuthStore((s) => s.token);
  const { t } = useT();

  useEffect(() => {
    const hideable = HIDEABLE_PREFIXES.some((p) => pathname.startsWith(p));
    setHideable(hideable);
  }, [pathname, setHideable]);

  const handleGameSelect = (gameId: string) => {
    router.push(`/game/${gameId}`);
  };

  const handlePlayClick = () => {
    router.push('/');
  };

  const handleProfileClick = () => {
    router.push('/profile');
  };

  const isConsole = pathname.startsWith('/system/console');

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col lg:flex-row">
      {!isConsole && <DesktopSidebar />}

      <div className="flex-1 flex flex-col min-w-0 min-h-screen relative">
        {/* Edge handle for mobile drawer */}
        {!isMenuOpen && !isConsole && (
          <button
            onClick={() => setIsMenuOpen(true)}
            aria-label={t('nav.openMenu')}
            className="fixed left-0 top-1/2 -translate-y-1/2 z-40 w-3.5 h-16 md:w-auto md:h-auto md:px-3 md:py-3.5 rounded-r-xl border border-l-0 border-amber-500/20 bg-[#0d0e12]/90 backdrop-blur-md flex items-center justify-center gap-1.5 text-whisper-gray/80 hover:text-frost-white hover:border-amber-500/40 active:scale-[0.95] transition-all shadow-lg lg:hidden"
          >
            <Menu size={14} strokeWidth={2.2} className="hidden md:block" />
            <span className="hidden md:block font-roobert text-[12px] font-medium">
              {t('nav.menu')}
            </span>
            <ChevronRight size={12} strokeWidth={2.5} className="md:hidden" />
          </button>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          {children}
        </div>

        <div className="lg:hidden">
          <BottomNavigation
            onMenuClick={() => setIsMenuOpen(true)}
            onPlayClick={handlePlayClick}
            onProfileClick={handleProfileClick}
            onBonusesClick={() => router.push('/bonuses')}
            onSportClick={() => router.push('/sport')}
            forceHidden={isMenuOpen || isConsole}
          />
        </div>
        {pathname.startsWith('/sport') && <SportsBetaNotice />}

        <MenuDrawer
          isOpen={isMenuOpen}
          onClose={() => setIsMenuOpen(false)}
          onGameSelect={handleGameSelect}
          isAuthenticated={isAuthenticated}
        />
      </div>
    </div>
  );
}
