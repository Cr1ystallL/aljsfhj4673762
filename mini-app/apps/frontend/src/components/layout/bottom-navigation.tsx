'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Gamepad2, Menu, Sparkles, User, Users } from 'lucide-react';
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
 * Bottom Navigation — Apple Design & Taste Skill Premium Dock
 *
 * Floating glassmorphism bar over safe area. Key features:
 *   - Glassmorphism backdrop-blur-2xl with midnight canvas tint.
 *   - Elevated center Play button with glowing gradient halo.
 *   - Tactile active:scale-[0.92] response on all items.
 *   - Active indicator dots & neon glow highlights.
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
    <div className="fixed bottom-3 inset-x-0 z-40 pointer-events-none flex justify-center px-4">
      <motion.nav
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        className="pointer-events-auto w-full max-w-[420px] rounded-full border border-white/15 bg-midnight-canvas/85 backdrop-blur-2xl px-3 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.6)] flex items-center justify-between gap-1"
      >
        {/* Menu Drawer trigger */}
        <NavItem
          active={false}
          onClick={onMenuClick}
          label="Меню"
          icon={<Menu size={20} className="stroke-[1.8]" />}
        />

        {/* Bonuses */}
        <NavItem
          active={isBonusesActive}
          onClick={onBonusesClick}
          label="Бонусы"
          icon={<Sparkles size={20} className="stroke-[1.8]" />}
        />

        {/* Center Primary Action — Play / Home */}
        <button
          onClick={onPlayClick}
          aria-label="Главная"
          className="relative -top-2 flex flex-col items-center justify-center group active:scale-[0.92] transition-transform duration-200"
        >
          <div
            className={cn(
              'w-12 h-12 rounded-full border border-amber-400/40 bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 flex items-center justify-center text-black shadow-[0_0_20px_rgba(245,158,11,0.4)] transition-all duration-300',
              isHomeActive && 'ring-2 ring-amber-300 ring-offset-2 ring-offset-midnight-canvas shadow-[0_0_28px_rgba(245,158,11,0.7)]'
            )}
          >
            <Gamepad2 size={24} className="stroke-[2.2] text-black" />
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
          icon={<Users size={20} className="stroke-[1.8]" />}
        />

        {/* Profile */}
        <NavItem
          active={isProfileActive}
          onClick={onProfileClick}
          label="Профиль"
          icon={<User size={20} className="stroke-[1.8]" />}
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
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex-1 py-1.5 flex flex-col items-center justify-center gap-0.5 rounded-full transition-all active:scale-[0.92] duration-200',
        active ? 'text-frost-white font-medium' : 'text-whisper-gray/70 hover:text-frost-white/90'
      )}
    >
      <div className="relative">
        {icon}
        {active && (
          <motion.span
            layoutId="nav-dot"
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,1)]"
          />
        )}
      </div>
      <span className="font-roobert text-[10px] tracking-tight truncate max-w-[64px]">
        {label}
      </span>
    </button>
  );
}
