'use client';

import { motion } from 'framer-motion';
import { Menu, Play, User } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface BottomNavigationProps {
  onMenuClick: () => void;
  onPlayClick: () => void;
  onProfileClick: () => void;
}

/**
 * Bottom Navigation — Monopo Saigon Style
 *
 * Frosted-glass bar floating just above the safe-area inset. Three pills:
 *
 *   - Menu  (left)   → opens the games drawer.
 *   - Play  (center) → goes to the featured game; raised slightly so it
 *     reads as the primary action without resorting to rainbow gradients.
 *   - Account (right) → profile screen.
 *
 * No emoji, no neon accents. The center button uses a deep-ocean accent
 * gradient only on its inner sphere; the surrounding chrome stays
 * monochrome — matches the "atmospheric, restrained" tone of the brand.
 */
export function BottomNavigation({
  onMenuClick,
  onPlayClick,
  onProfileClick,
}: BottomNavigationProps) {
  const pathname = usePathname();
  const isPlayActive = pathname?.startsWith('/game') ?? false;
  const isProfileActive = pathname?.startsWith('/profile') ?? false;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pb-safe pointer-events-none">
      <div className="relative mx-3 mb-3 pointer-events-auto">
        <div
          className="relative rounded-card border border-white/10 backdrop-blur-2xl"
          style={{ background: 'rgba(0, 0, 0, 0.55)' }}
        >
          <div className="relative grid grid-cols-3 items-center px-2 py-2">
            <NavItem
              icon={<Menu size={18} strokeWidth={1.7} />}
              label="Меню"
              onClick={onMenuClick}
            />

            {/* Center action — raised pill */}
            <div className="flex items-start justify-center">
              <motion.button
                onClick={onPlayClick}
                aria-label="Играть"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className="-mt-7 relative"
              >
                <span
                  className="absolute inset-0 rounded-pill blur-xl opacity-50"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(160, 224, 171, 0.45), rgba(255, 172, 46, 0.4) 55%, rgba(165, 45, 37, 0.35))',
                  }}
                />
                <span
                  className={cn(
                    'relative w-14 h-14 rounded-pill flex items-center justify-center border',
                    isPlayActive
                      ? 'bg-frost-white text-midnight-canvas border-frost-white'
                      : 'bg-white/[0.06] text-frost-white border-white/20'
                  )}
                >
                  <Play
                    size={20}
                    fill="currentColor"
                    strokeWidth={0}
                    className="ml-0.5"
                  />
                </span>
                <span className="block mt-1 text-center font-roobert text-[10px] uppercase tracking-[0.2em] text-frost-white/70">
                  Играть
                </span>
              </motion.button>
            </div>

            <NavItem
              icon={<User size={18} strokeWidth={1.7} />}
              label="Аккаунт"
              onClick={onProfileClick}
              active={isProfileActive}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function NavItem({
  icon,
  label,
  onClick,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      className={cn(
        'flex flex-col items-center gap-1 py-1 transition-colors',
        active ? 'text-frost-white' : 'text-frost-white/60 hover:text-frost-white'
      )}
    >
      {icon}
      <span className="font-roobert text-[10px] uppercase tracking-[0.18em]">
        {label}
      </span>
    </motion.button>
  );
}
