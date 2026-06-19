'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BottomNavigation } from './bottom-navigation';
import { MenuDrawer } from './menu-drawer';
import { useNavStore } from '@/store/nav-store';
import { useAuthStore } from '@/store/auth-store';

/**
 * App shell with persistent navigation.
 *
 * Wraps every page with the bottom nav and the games drawer. On
 * game / balance routes the nav becomes hideable so the page can claim
 * the full viewport; the home and profile screens always show it.
 *
 * Edge-swipe gesture: a horizontal drag that starts within the leftmost
 * 24px of the viewport and travels at least 60px to the right opens
 * the side drawer. The bottom navigation is force-hidden while the
 * drawer is open so the two surfaces don't overlap visually.
 */
const HIDEABLE_PREFIXES = ['/game/', '/balance', '/bonuses', '/partner'];

const EDGE_SWIPE_ZONE_PX = 24;
const EDGE_SWIPE_THRESHOLD_PX = 60;
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
      // Looks like a vertical scroll, abandon.
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

  return (
    <div className="relative mx-auto w-full max-w-[1920px] min-h-[100dvh] bg-midnight-canvas shadow-2xl sm:border-x sm:border-white/5 overflow-x-hidden">
      {children}

      <BottomNavigation
        onMenuClick={() => setIsMenuOpen(true)}
        onPlayClick={handlePlayClick}
        onProfileClick={handleProfileClick}
        onBonusesClick={() => router.push('/bonuses')}
        onPartnerClick={() => router.push('/partner')}
        forceHidden={isMenuOpen}
      />

      <MenuDrawer
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onGameSelect={handleGameSelect}
        isAuthenticated={isAuthenticated}
      />
    </div>
  );
}
