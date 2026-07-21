'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Menu, Sparkles, User, Users } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { BrandMark } from '@/components/ui/brand-mark';
import { useNavStore } from '@/store/nav-store';

interface BottomNavigationProps {
  onMenuClick: () => void;
  onPlayClick: () => void;
  onProfileClick: () => void;
  onBonusesClick: () => void;
  onPartnerClick: () => void;
  forceHidden?: boolean;
}

/**
 * Bottom Navigation — Apple Design Ultra-Fast Spring (V8)
 *
 * Directives applied:
 *   1. Center Button: Zero background fill (bg-transparent), pure circle border (border border-white/35 rounded-full).
 *   2. Scope: Collapses ONLY on /game/ routes. Bonuses and Partner ALWAYS show the bar.
 *   3. Ultra-Fast Spring Animation: Applied Apple kill latency principle (stiffness: 550, damping: 32, mass: 0.4) for instant snappy transitions.
 */

const fastSpringTransition = {
  type: 'spring',
  stiffness: 550,
  damping: 32,
  mass: 0.4,
};

export const BottomNavigation = memo(function BottomNavigation({
  onMenuClick,
  onPlayClick,
  onProfileClick,
  onBonusesClick,
  onPartnerClick,
  forceHidden = false,
}: BottomNavigationProps) {
  const pathname = usePathname();
  const { collapsed, hideable, setCollapsed } = useNavStore();

  const isHomeActive = pathname === '/';
  const isProfileActive = pathname?.startsWith('/profile') ?? false;
  const isBonusesActive = pathname?.startsWith('/bonuses') ?? false;
  const isPartnerActive = pathname?.startsWith('/partner') ?? false;

  if (forceHidden) return null;

  return (
    <div className="fixed bottom-2.5 inset-x-0 z-40 pointer-events-none flex flex-col items-center justify-end px-3">
      <AnimatePresence mode="wait">
        {hideable && collapsed ? (
          /* Fast Pull Handle on /game/ routes */
          <motion.div
            key="pull-handle"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={fastSpringTransition}
            className="pointer-events-auto"
          >
            <button
              onClick={() => setCollapsed(false)}
              aria-label="Вытянуть панель навигации"
              className="group px-4 py-2 rounded-full border border-white/20 bg-midnight-canvas/90 backdrop-blur-2xl shadow-[0_8px_25px_rgba(0,0,0,0.7)] flex items-center gap-2 text-frost-white active:scale-95 transition-all"
            >
              <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-amber-300 group-hover:scale-110 transition-transform">
                <ChevronUp size={14} strokeWidth={2.5} />
              </div>
              <span className="font-roobert text-[11px] font-medium tracking-tight text-whisper-gray group-hover:text-frost-white transition-colors">
                Навигация
              </span>
            </button>
          </motion.div>
        ) : (
          /* Fast Bottom Dock Navigation */
          <motion.nav
            key="bottom-dock"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            transition={fastSpringTransition}
            className="pointer-events-auto w-full max-w-[460px] sm:max-w-[500px] rounded-full border border-white/15 bg-midnight-canvas/90 backdrop-blur-2xl px-4 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.7)] flex items-center justify-between gap-1 relative"
          >
            {/* Collapse button on /game/ pages */}
            {hideable && (
              <button
                onClick={() => setCollapsed(true)}
                aria-label="Свернуть панель"
                className="absolute -top-3 left-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full border border-white/20 bg-midnight-canvas text-whisper-gray hover:text-frost-white flex items-center justify-center active:scale-90 transition-all shadow-md z-20"
              >
                <ChevronDown size={14} strokeWidth={2.2} />
              </button>
            )}

            {/* Menu Drawer trigger */}
            <NavItem
              active={false}
              onClick={onMenuClick}
              label="Меню"
              icon={<Menu size={19} className="stroke-[2]" />}
            />

            {/* Bonuses */}
            <NavItem
              active={isBonusesActive}
              onClick={onBonusesClick}
              label="Бонусы"
              icon={<Sparkles size={19} className="stroke-[2]" />}
            />

            {/* Center Primary Action — Transparent Pure Circle Border Button */}
            <button
              onClick={onPlayClick}
              aria-label="Главная"
              className="relative -top-3 flex flex-col items-center justify-center group active:scale-[0.92] transition-transform duration-150 z-10 shrink-0"
            >
              {/* Pure Transparent Circle Border (No Background Fill) */}
              <div
                className={cn(
                  'relative w-14 h-14 rounded-full border border-white/35 bg-transparent backdrop-blur-md flex items-center justify-center transition-all duration-150 shadow-sm',
                  isHomeActive && 'border-amber-400 border-2'
                )}
              >
                {/* Brand Logo inside outline circle */}
                <div className="relative z-10 scale-105">
                  <BrandMark size={30} />
                </div>
              </div>
              <span className="mt-0.5 font-roobert text-[10px] font-bold text-frost-white tracking-tight opacity-90">
                Игры
              </span>
            </button>

            {/* Partner */}
            <NavItem
              active={isPartnerActive}
              onClick={onPartnerClick}
              label="Партнёрам"
              icon={<Users size={19} className="stroke-[2]" />}
            />

            {/* Profile */}
            <NavItem
              active={isProfileActive}
              onClick={onProfileClick}
              label="Профиль"
              icon={<User size={19} className="stroke-[2]" />}
            />
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
});

function NavItem({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactElement;
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex-1 py-0.5 flex flex-col items-center justify-center gap-0.5 rounded-full transition-all active:scale-[0.92] duration-150"
    >
      <div
        className={cn(
          'flex items-center justify-center transition-colors duration-150',
          active ? 'text-amber-400' : 'text-whisper-gray/70 hover:text-frost-white/90'
        )}
      >
        {icon}
      </div>
      <span
        className={cn(
          'font-roobert text-[10px] tracking-tight truncate max-w-[64px]',
          active ? 'text-amber-300 font-semibold' : 'text-whisper-gray/70'
        )}
      >
        {label}
      </span>
    </button>
  );
}
