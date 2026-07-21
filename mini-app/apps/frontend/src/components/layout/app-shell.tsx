'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BottomNavigation } from './bottom-navigation';
import { MenuDrawer } from './menu-drawer';
import { useNavStore } from '@/store/nav-store';
import { useAuthStore } from '@/store/auth-store';
import { ChevronRight } from 'lucide-react';

/**
 * App shell with persistent navigation & edge-swipe drawer trigger.
 *
 * Only actual game screens (/game/) allow the bottom nav to collapse.
 * Bonuses, Partner, Profile, Home always keep the bottom nav visible!
 */
const HIDEABLE_PREFIXES = ['/game/'];

const EDGE_SWIPE_ZONE_PX = 48;
const EDGE_SWIPE_THRESHOLD_PX = 50;
const EDGE_SWIPE_MAX_VERTICAL_PX = 60;

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

  /* ------------------------------------------------ edge-swipe gesture */
  const startRef = useRef<{ x: number; y: number; active: boolean } | null>(null);

  const onTouchStart = useCallback(
    (e: TouchEvent) => {
      if (isMenuOpen) return;
      const t = e.touches[0];
      if (!t) return;
      if (t.clientX <= EDGE_SWIPE_ZONE_PX) {
        startRef.current = { x: t.clientX, y: t.clientY, active: true };
      } else {
        startRef.current = null;
      }
    },
    [isMenuOpen]
  );

  const onTouchMove = useCallback((e: TouchEvent) => {
    const start = startRef.current;
    if (!start || !start.active) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = Math.abs(t.clientY - start.y);
    if (dy > EDGE_SWIPE_MAX_VERTICAL_PX) {
      start.active = false;
      return;
    }
    if (dx >= EDGE_SWIPE_THRESHOLD_PX) {
      start.active = false;
      setIsMenuOpen(true);
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    startRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [onTouchStart, onTouchMove, onTouchEnd]);

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
