'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, Menu, User } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { memo } from 'react';
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
 * Frosted bar floating above the safe-area inset. Three pills:
 *   - Menu   (left)   → opens the games drawer.
 *   - Play   (center) → primary action, raised slightly and washed in
 *     the brand Deep Ocean Gradient.
 *   - Account (right) → profile screen.
 *
 * Auto-hide: on game / balance pages the nav can be collapsed via the
 * grip handle. Tap toggles it back. We deliberately removed the drag
 * gesture from the previous revision because framer-motion's pointer
 * tracking on the bar itself caused noticeable input latency on
 * Telegram WebView when scrolling page content (every touchmove
 * propagated through the drag handler).
 *
 * Memoised — stable parent props means this component only re-renders
 * when collapse state actually changes.
 */
export const BottomNavigation = memo(function BottomNavigation({
  onMenuClick,
  onPlayClick,
  onProfileClick,
}: BottomNavigationProps) {
  const pathname = usePathname();
  const isProfileActive = pathname?.startsWith('/profile') ?? false;

  const hideable = useNavStore((s) => s.hideable);
  const collapsed = useNavStore((s) => s.collapsed);
  const setCollapsed = useNavStore((s) => s.setCollapsed);
  const isCollapsed = hideable && collapsed;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 pb-safe pointer-events-none"
      aria-hidden={isCollapsed}
    >
      {/* Grip handle — only on hideable pages, only when collapsed. */}
      <AnimatePresence>
        {hideable && collapsed && (
          <motion.div
            key="handle-wrap"
            className="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          >
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Показать меню"
              className="pointer-events-auto inline-flex flex-col items-center gap-1 px-5 py-2 rounded-pill border border-white/15 bg-black/70 text-frost-white/85 active:scale-95 transition-transform"
            >
              <ChevronUp size={14} strokeWidth={2} />
              <span className="block w-7 h-[3px] rounded-full bg-frost-white/45" />
            </button>
          </motion.div>
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
            className="relative mx-3 mb-3 pointer-events-auto"
            style={{ willChange: 'transform' }}
          >
            <div
              className="relative rounded-card border border-white/10"
              style={{ background: 'rgba(0, 0, 0, 0.78)' }}
            >
              <div className="relative grid grid-cols-3 items-center px-2 py-1.5">
                <NavItem
                  icon={<Menu size={18} strokeWidth={1.7} />}
                  label="Меню"
                  onClick={onMenuClick}
                />

                {/* Center action — raised pill */}
                <div className="flex items-start justify-center">
                  <button
                    onClick={onPlayClick}
                    aria-label="Играть"
                    className="-mt-7 relative active:scale-95 transition-transform"
                    style={{ willChange: 'transform' }}
                  >
                    {/* Soft brand halo (kept on desktop, suppressed on
                        mobile via the `mobile-no-blur` rule). */}
                    <span
                      aria-hidden
                      className="mobile-no-blur absolute inset-0 rounded-pill opacity-60"
                      style={{
                        background:
                          'linear-gradient(135deg, rgba(160, 224, 171, 0.55), rgba(255, 172, 46, 0.50) 55%, rgba(165, 45, 37, 0.45))',
                        filter: 'blur(16px)',
                      }}
                    />
                    {/* Gradient pill — brand Deep Ocean. */}
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
                  </button>
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
});

const NavItem = memo(function NavItem({
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
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1 py-1 transition-colors active:scale-95',
        active ? 'text-frost-white' : 'text-frost-white/60'
      )}
    >
      {icon}
      <span className="font-roobert text-[10px] uppercase tracking-[0.18em]">
        {label}
      </span>
    </button>
  );
});
