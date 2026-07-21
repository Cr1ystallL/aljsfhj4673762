'use client';

import { motion } from 'framer-motion';
import { Menu, Sparkles, User, Users } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { BrandMark } from '@/components/ui/brand-mark';

interface BottomNavigationProps {
  onMenuClick: () => void;
  onPlayClick: () => void;
  onProfileClick: () => void;
  onBonusesClick: () => void;
  onPartnerClick: () => void;
  forceHidden?: boolean;
}

/**
 * Bottom Navigation — Redesigned V5
 *
 *   - Wider & slimmer dock layout (max-w-[460px], py-1.5).
 *   - Removed center button outer glow.
 *   - Pure yellow SVG icon activation for selected section tabs.
 */
export const BottomNavigation = memo(function BottomNavigation({
  onMenuClick,
  onPlayClick,
  onProfileClick,
  onBonusesClick,
  onPartnerClick,
  forceHidden = false,
}: BottomNavigationProps) {
  const pathname = usePathname();

  const isHomeActive = pathname === '/';
  const isProfileActive = pathname?.startsWith('/profile') ?? false;
  const isBonusesActive = pathname?.startsWith('/bonuses') ?? false;
  const isPartnerActive = pathname?.startsWith('/partner') ?? false;

  if (forceHidden) return null;

  return (
    <div className="fixed bottom-2.5 inset-x-0 z-40 pointer-events-none flex justify-center px-3">
      <motion.nav
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        className="pointer-events-auto w-full max-w-[460px] sm:max-w-[500px] rounded-full border border-white/15 bg-midnight-canvas/90 backdrop-blur-2xl px-4 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.6)] flex items-center justify-between gap-1 relative"
      >
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

        {/* Center Primary Action — Sleek Liquid Glass Logo Button without outer glow */}
        <button
          onClick={onPlayClick}
          aria-label="Главная"
          className="relative -top-3 flex flex-col items-center justify-center group active:scale-[0.92] transition-transform duration-200 z-10 shrink-0"
        >
          {/* Liquid Glass Container (No heavy background glow) */}
          <div
            className={cn(
              'relative w-14 h-14 rounded-full border border-white/30 bg-gradient-to-b from-amber-400/25 via-amber-500/15 to-black/80 backdrop-blur-2xl flex items-center justify-center overflow-hidden transition-all duration-200 shadow-md',
              isHomeActive && 'border-amber-400 ring-1 ring-amber-400/50'
            )}
          >
            {/* Top Specular Reflection Shine */}
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(100% 100% at 50% 0%, rgba(255, 255, 255, 0.40) 0%, transparent 60%)',
              }}
            />

            {/* Brand Logo */}
            <div className="relative z-10 scale-105">
              <BrandMark size={30} />
            </div>
          </div>
          <span className="mt-0.5 font-roobert text-[10px] font-bold text-amber-300 tracking-tight">
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
      className="relative flex-1 py-0.5 flex flex-col items-center justify-center gap-0.5 rounded-full transition-all active:scale-[0.92] duration-200"
    >
      {/* SVG Icon ONLY turns yellow when active */}
      <div
        className={cn(
          'flex items-center justify-center transition-colors duration-200',
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
