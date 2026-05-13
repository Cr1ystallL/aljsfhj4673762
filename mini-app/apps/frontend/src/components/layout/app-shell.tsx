'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BottomNavigation } from './bottom-navigation';
import { MenuDrawer } from './menu-drawer';

/**
 * App shell with persistent navigation
 * Wraps all pages with bottom nav and menu drawer
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const handleGameSelect = (gameId: string) => {
    router.push(`/game/${gameId}`);
  };

  const handlePlayClick = () => {
    // Navigate to featured game or game selection
    router.push('/');
  };

  const handleProfileClick = () => {
    router.push('/profile');
  };

  return (
    <>
      {children}
      
      <BottomNavigation
        onMenuClick={() => setIsMenuOpen(true)}
        onPlayClick={handlePlayClick}
        onProfileClick={handleProfileClick}
      />
      
      <MenuDrawer
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onGameSelect={handleGameSelect}
      />
    </>
  );
}
