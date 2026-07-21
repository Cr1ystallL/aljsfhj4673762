'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BottomNavigation } from './bottom-navigation';
import { MenuDrawer } from './menu-drawer';
import { useNavStore } from '@/store/nav-store';
import { useAuthStore } from '@/store/auth-store';
import { ChevronRight } from 'lucide-react';

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
      {/* Side Pull Tab for Mobile Phones (Left edge gesture handle) */}
      {!isMenuOpen && !isConsole && (
        <button
          onClick={() => setIsMenuOpen(true)}
          aria-label="Открыть боковое меню"
          className="fixed left-0 top-1/2 -translate-y-1/2 z-40 w-3.5 h-16 rounded-r-xl border border-l-0 border-white/20 bg-midnight-canvas/80 backdrop-blur-md flex items-center justify-center text-whisper-gray/80 hover:text-frost-white active:scale-[0.95] transition-all shadow-lg"
        >
          <ChevronRight size={12} strokeWidth={2.5} />
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
