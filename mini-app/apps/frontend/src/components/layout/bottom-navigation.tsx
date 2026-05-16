'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, Menu, User } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BrandMark } from '@/components/ui/brand-mark';
import { useNavStore } from '@/store/nav-store';

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
 *   - Menu   (left)   → opens the games drawer.
 *   - Play   (center) → primary action, raised slightly and washed in
 *     the brand Deep Ocean Gradient.
 *   - Account (right) → profile screen.
 *
 * Auto-hide: on game / balance pages the nav can be collapsed. Users
 * see a small grip handle at the bottom that pulls the bar back up
 * (tap or swipe). The state is held in `useNavStore` so the page can
 * decide whether to hide.
 *
 * Drag-to-toggle: the handle and the nav itself respond to vertical
 * drags so the panel feels physical — same gesture you'd expect from
 * a mobile bottom sheet.
 */
export function BottomNavigation({
  onMenuClick,
  onPlayClick,
  onProfileClick,
}: BottomNavigationProps) {
  const pathname = usePathname();
  const isProfileActive = pathname?.startsWith('/profile') ?? false;

  const { hideable, collapsed, setCollapsed } = useNavStore();
  const isCollapsed = hideable && collapsed;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 pb-safe pointer-events-none"
      aria-hidden={isCollapsed}
    >
      {/* Grip handle — only on hideable pages, only when collapsed */}
      <AnimatePresence>
        {hideable && collapsed && (
          <motion.button
            key="handle"
            type="button"
            onClick={() => setCollapsed(false)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: -80, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y < -16) setCollapsed(false);
            }}
            aria-label="Показать меню"
            className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex flex-col items-center gap-1 px-4 py-1.5 rounded-pill border border-white/15 bg-black/60 backdrop-blur-md text-frost-white/85 hover:text-frost-white hover:border-white/25 transition-colors touch-none"
          >
            <ChevronUp size={14} strokeWidth={2} />
            <span className="block w-7 h-[3px] rounded-full bg-frost-white/45" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            key="bar"
            initial={{ y: 96, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 96, opacity: 0 }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            drag={hideable ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 80 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (hideable && info.offset.y > 24) setCollapsed(true);
            }}
            className="relative mx-3 mb-3 pointer-events-auto touch-none"
          >
            <div
              className="relative rounded-card border border-white/10 backdrop-blur-2xl"
              style={{ background: 'rgba(0, 0, 0, 0.55)' }}
            >
              <div className="relative grid grid-cols-3 items-center px-2 py-1.5">
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
                    {/* Soft brand halo */}
                    <span
                      className="absolute inset-0 rounded-pill blur-xl opacity-60"
                      style={{
                        background:
                          'linear-gradient(135deg, rgba(160, 224, 171, 0.55), rgba(255, 172, 46, 0.50) 55%, rgba(165, 45, 37, 0.45))',
                      }}
                    />
                    {/* Gradient pill — Deep Ocean as required by the brand */}
                    <span
                      className="relative w-14 h-14 rounded-pill flex items-center justify-center border border-white/25 overflow-hidden"
                      style={{
                        background:
                          'linear-gradient(135deg, rgb(160, 224, 171) 0%, rgb(255, 172, 46) 55%, rgb(165, 45, 37) 100%)',
                      }}
                    >
                      <span
                        aria-hidden
                        className="absolute inset-0 rounded-pill"
                        style={{
                          background:
                            'linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0) 55%)',
                        }}
                      />
                      <BrandMark
                        variant="dark"
                        size={44}
                        title="Играть"
                        className="relative"
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
          </motion.div>
        )}
      </AnimatePresence>
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
