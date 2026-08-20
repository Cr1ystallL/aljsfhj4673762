'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BottomNavigation } from './bottom-navigation';
import { MenuDrawer } from './menu-drawer';
import { useNavStore } from '@/store/nav-store';
import { useAuthStore } from '@/store/auth-store';
import { ChevronRight, Menu } from 'lucide-react';

const HIDEABLE_PREFIXES = ['/game/'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const setHideable = useNavStore((s) => s.setHideable);
  const isAuthenticated = !!useAuthStore((s) => s.token);

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
    <>
      {/* Edge handle for the drawer. A 14px sliver is a fine thumb target and a
          poor pointer target, so it grows and gains a label on desktop. It sits
          mid-height rather than in a corner: the page header is full-width and
          sticky at a higher layer, so anything near the top would end up
          underneath it. */}
      {!isMenuOpen && !isConsole && (
        <button
          onClick={() => setIsMenuOpen(true)}
          aria-label="Открыть боковое меню"
          className="fixed left-0 top-1/2 -translate-y-1/2 z-40 w-3.5 h-16 md:w-auto md:h-auto md:px-3 md:py-3.5 rounded-r-xl border border-l-0 border-white/20 bg-midnight-canvas/80 backdrop-blur-md flex items-center justify-center gap-1.5 text-whisper-gray/80 hover:text-frost-white hover:border-white/35 active:scale-[0.95] transition-all shadow-lg"
        >
          <Menu size={14} strokeWidth={2.2} className="hidden md:block" />
          <span className="hidden md:block font-roobert text-[12px] font-medium">
            Меню
          </span>
          <ChevronRight size={12} strokeWidth={2.5} className="md:hidden" />
        </button>
      )}

      {children}

      <BottomNavigation
        onMenuClick={() => setIsMenuOpen(true)}
        onPlayClick={handlePlayClick}
        onProfileClick={handleProfileClick}
        onBonusesClick={() => router.push('/bonuses')}
        onPartnerClick={() => router.push('/partner')}
        forceHidden={isMenuOpen || isConsole}
      />

      <MenuDrawer
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onGameSelect={handleGameSelect}
        isAuthenticated={isAuthenticated}
      />
    </>
  );
}
