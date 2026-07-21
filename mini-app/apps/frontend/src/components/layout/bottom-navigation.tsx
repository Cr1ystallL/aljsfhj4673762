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
 * Bottom Navigation — Pure Colorless Glass & Auto-Collapse Grip Handle (V6)
 *
 * Features:
 *   - Center Logo Button: Colorless transparent pure glass (bg-white/[0.08], backdrop-blur-2xl, border-white/30, top specular shine).
 *   - Auto-hide on game routes: Collapses on game screens to save viewport space.
 *   - Grip Handle: Frosted glass grip pill at the bottom allowed users to pull/tap to reveal navigation anytime on game pages.
 *   - Active section SVG turns yellow (text-amber-400).
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
  const { collapsed, hideable, toggle, setCollapsed } = useNavStore();

  const isHomeActive = pathname === '/';
  const isProfileActive = pathname?.startsWith('/profile') ?? false;
  const isBonusesActive = pathname?.startsWith('/bonuses') ?? false;
  const isPartnerActive = pathname?.startsWith('/partner') ?? false;

  if (forceHidden) return null;

  // If page allows hideable nav (e.g. game pages) and nav is currently collapsed:
  // Render the bottom Grip Pull Handle!
  if (hideable && collapsed) {
    return (
      <div className="fixed bottom-3 inset-x-0 z-40 pointer-events-none flex justify-center px-4">
        <motion.button
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          onClick={() => setCollapsed(false)}
          aria-label="Вытянуть панель навигации"
          className="pointer-events-auto group px-4 py-2 rounded-full border border-white/20 bg-midnight-canvas/90 backdrop-blur-2xl shadow-[0_8px_25px_rgba(0,0,0,0.7)] flex items-center gap-2 text-frost-white active:scale-95 transition-all"
        >
          <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-amber-300 group-hover:scale-110 transition-transform">
            <ChevronUp size={14} strokeWidth={2.5} />
          </div>
          <span className="font-roobert text-[11px] font-medium tracking-tight text-whisper-gray group-hover:text-frost-white transition-colors">
            Навигация
          </span>
        </motion.button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-2.5 inset-x-0 z-40 pointer-events-none flex flex-col items-center justify-end px-3">
      <motion.nav
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        className="pointer-events-auto w-full max-w-[460px] sm:max-w-[500px] rounded-full border border-white/15 bg-midnight-canvas/90 backdrop-blur-2xl px-4 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.7)] flex items-center justify-between gap-1 relative"
      >
        {/* Collapse toggle button if on hideable page */}
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

        {/* Center Primary Action — Colorless Clear Glass Button */}
        <button
          onClick={onPlayClick}
          aria-label="Главная"
          className="relative -top-3 flex flex-col items-center justify-center group active:scale-[0.92] transition-transform duration-200 z-10 shrink-0"
        >
          {/* Pure Colorless Transparent Glass Container */}
          <div
            className={cn(
              'relative w-14 h-14 rounded-full border border-white/30 bg-white/[0.08] backdrop-blur-2xl flex items-center justify-center overflow-hidden transition-all duration-200 shadow-[0_8px_24px_rgba(0,0,0,0.5),inset_0_1px_2px_rgba(255,255,255,0.6)]',
              isHomeActive && 'border-white/60 bg-white/[0.14] ring-1 ring-white/40'
            )}
          >
            {/* Top Specular Reflection Line (Pure Glass effect) */}
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(100% 100% at 50% 0%, rgba(255, 255, 255, 0.50) 0%, transparent 60%)',
              }}
            />

            {/* Brand Logo inside pure glass */}
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
