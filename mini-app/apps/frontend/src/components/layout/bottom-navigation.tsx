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
 * Bottom Navigation — Apple Design Liquid Glass & Golden SVG Outline
 *
 * Features:
 *   - Enlarged center Brand Logo button with Liquid Glass effect:
 *       Multi-layered glassmorphism, top specular reflection shine,
 *       glowing refraction rim and deep gold/amber liquid background.
 *   - Active section SVG ONLY has a golden stroke & neon glow outline.
 *   - Tactile active:scale-[0.92] spring responses.
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
        className="pointer-events-auto w-full max-w-[430px] rounded-full border border-white/15 bg-midnight-canvas/85 backdrop-blur-2xl px-3 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.7)] flex items-center justify-between gap-1 relative"
      >
        {/* Menu Drawer trigger */}
        <NavItem
          active={false}
          onClick={onMenuClick}
          label="Меню"
          icon={<Menu size={20} className="stroke-[2]" />}
        />

        {/* Bonuses */}
        <NavItem
          active={isBonusesActive}
          onClick={onBonusesClick}
          label="Бонусы"
          icon={<Sparkles size={20} className="stroke-[2]" />}
        />

        {/* Center Primary Action — Enlarged Liquid Glass Logo Button */}
        <button
          onClick={onPlayClick}
          aria-label="Главная"
          className="relative -top-4 flex flex-col items-center justify-center group active:scale-[0.92] transition-transform duration-200 z-10 shrink-0"
        >
          {/* Liquid Glass Container */}
          <div
            className={cn(
              'relative w-16 h-16 rounded-full border border-white/40 bg-gradient-to-b from-amber-400/35 via-orange-500/25 to-black/70 backdrop-blur-2xl flex items-center justify-center shadow-[0_10px_32px_rgba(245,158,11,0.45),inset_0_1px_2px_rgba(255,255,255,0.7)] overflow-hidden transition-all duration-300',
              isHomeActive && 'border-amber-300 ring-2 ring-amber-400/80 ring-offset-2 ring-offset-midnight-canvas shadow-[0_0_36px_rgba(245,158,11,0.85)]'
            )}
          >
            {/* Top Specular Reflection Shine */}
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(100% 100% at 50% 0%, rgba(255, 255, 255, 0.45) 0%, transparent 60%)',
              }}
            />
            {/* Ambient inner glow */}
            <div
              aria-hidden
              className="absolute inset-0 opacity-60 mix-blend-screen pointer-events-none"
              style={{
                background:
                  'radial-gradient(80% 80% at 50% 50%, rgba(251, 191, 36, 0.4) 0%, transparent 80%)',
              }}
            />

            {/* Brand Logo */}
            <div className="relative z-10 scale-110 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
              <BrandMark size={32} />
            </div>
          </div>
          <span className="mt-0.5 font-roobert text-[10px] font-bold text-amber-300 tracking-tight drop-shadow-sm">
            Игры
          </span>
        </button>

        {/* Partner */}
        <NavItem
          active={isPartnerActive}
          onClick={onPartnerClick}
          label="Партнёрам"
          icon={<Users size={20} className="stroke-[2]" />}
        />

        {/* Profile */}
        <NavItem
          active={isProfileActive}
          onClick={onProfileClick}
          label="Профиль"
          icon={<User size={20} className="stroke-[2]" />}
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
      className="relative flex-1 py-1 flex flex-col items-center justify-center gap-1 rounded-full transition-all active:scale-[0.92] duration-200"
    >
      {/* SVG Icon ONLY gets Golden Stroke & Golden Ring Outline when Active */}
      <div
        className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200',
          active
            ? 'border border-amber-400/50 bg-amber-400/15 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.4)] stroke-[#fbbf24]'
            : 'text-whisper-gray/70 hover:text-frost-white/90 border border-transparent'
        )}
        style={
          active
            ? {
                filter: 'drop-shadow(0 0 6px rgba(251, 191, 36, 0.85))',
              }
            : undefined
        }
      >
        {icon}
      </div>
      <span
        className={cn(
          'font-roobert text-[10px] tracking-tight truncate max-w-[64px]',
          active ? 'text-frost-white font-semibold' : 'text-whisper-gray/70'
        )}
      >
        {label}
      </span>
    </button>
  );
}
