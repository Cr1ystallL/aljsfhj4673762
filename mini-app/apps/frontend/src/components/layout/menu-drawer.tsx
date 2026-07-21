'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  ChevronRight,
  Flame,
  Gamepad2,
  Headphones,
  Layers,
  Sparkles,
  User,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { GameIcon, type GameKey } from '@/components/ui/game-icon';
import { BrandLockup, BrandWordmark } from '@/components/ui/brand-mark';
import { useAuthStore } from '@/store/auth-store';
import { useBalanceStore } from '@/store/balance-store';

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onGameSelect: (game: string) => void;
  isAuthenticated?: boolean;
}

/**
 * Menu Drawer — Apple Design & Taste-Skill Sidebar
 *
 * Slide-over drawer with gesture dismissal support.
 * Structure:
 *   - User Quick Profile Pill (Avatar, Username, Balance).
 *   - Games List Grid with badges.
 *   - Quick Navigation Links.
 *   - Footer Brand Lockup & Support link.
 */

const IN_APP_GAMES: Array<{ id: GameKey; name: string; badge?: string }> = [
  { id: 'crash', name: 'MacvJet', badge: 'TOP' },
  { id: 'mines', name: 'Mines', badge: 'HOT' },
  { id: 'hilo', name: 'Hi-Lo' },
  { id: 'plinko', name: 'Plinko', badge: 'TOP' },
  { id: 'coinflip', name: 'Coinflip' },
  { id: 'blackjack', name: 'Blackjack', badge: 'PRO' },
  { id: 'wheel', name: 'Wheel' },
  { id: 'bridges', name: 'Bridges' },
  { id: 'cases', name: 'Case', badge: 'BONUS' },
  { id: 'keno', name: 'Keno', badge: 'LOTTO' },
  { id: 'chicken-road', name: 'MacvRoad', badge: 'NEW' },
];

export function MenuDrawer({
  isOpen,
  onClose,
  onGameSelect,
  isAuthenticated = false,
}: MenuDrawerProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const balanceStore = useBalanceStore((s) => s.balance);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const initials = (user?.firstName?.charAt(0) ?? 'U').toUpperCase();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          />

          {/* Drawer panel */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            drag="x"
            dragConstraints={{ left: -300, right: 0 }}
            dragElastic={0.1}
            onDragEnd={(_, info) => {
              if (info.offset.x < -80 || info.velocity.x < -300) {
                onClose();
              }
            }}
            className="relative z-10 w-[85%] max-w-[340px] h-full bg-midnight-canvas/95 backdrop-blur-2xl border-r border-white/10 flex flex-col justify-between overflow-y-auto shadow-2xl no-scrollbar"
          >
            {/* Top Header */}
            <div className="p-5 border-b border-white/10 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <BrandWordmark size={32} />
                <button
                  onClick={onClose}
                  aria-label="Закрыть меню"
                  className="w-9 h-9 rounded-full border border-white/10 bg-white/[0.04] text-whisper-gray hover:text-frost-white flex items-center justify-center active:scale-95 transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {/* User Quick Profile Card */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-full border border-white/20 bg-white/10 flex items-center justify-center shrink-0">
                    {user?.photoUrl ? (
                      <img
                        src={user.photoUrl}
                        alt=""
                        className="w-full h-full object-cover rounded-full"
                      />
                    ) : (
                      <span className="font-roobert font-bold text-[14px] text-frost-white">
                        {initials}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-roobert font-medium text-[14px] text-frost-white truncate">
                      {user?.firstName || 'Игрок'}
                    </div>
                    <div className="font-roobert text-[11px] text-amber-300 font-semibold">
                      {(balanceStore?.amount ?? 0).toLocaleString('ru-RU')} zł
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    router.push('/profile');
                  }}
                  className="p-1.5 rounded-xl border border-white/10 bg-white/[0.05] text-whisper-gray hover:text-frost-white shrink-0"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Navigation Content */}
            <div className="p-5 flex flex-col gap-6 flex-1">
              {/* Games grid */}
              <div className="flex flex-col gap-2.5">
                <div className="font-roobert text-[10px] uppercase tracking-[0.3em] text-whisper-gray">
                  Игры Mini App
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {IN_APP_GAMES.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => {
                        onClose();
                        router.push(`/game/${g.id}`);
                      }}
                      className="p-2.5 rounded-xl border border-white/10 bg-white/[0.03] hover:border-white/20 active:scale-[0.96] transition-all flex items-center gap-2 text-left"
                    >
                      <span className="w-7 h-7 rounded-lg border border-white/10 bg-black/40 flex items-center justify-center text-frost-white shrink-0">
                        <GameIcon game={g.id} size={15} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-roobert text-[12px] font-medium text-frost-white truncate">
                          {g.name}
                        </div>
                        {g.badge && (
                          <div className="text-[8px] font-bold text-amber-400 uppercase tracking-wider">
                            {g.badge}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Menu Links */}
              <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                <div className="font-roobert text-[10px] uppercase tracking-[0.3em] text-whisper-gray">
                  Разделы
                </div>
                <DrawerLink
                  icon={<Wallet size={16} />}
                  label="Управление балансом"
                  onClick={() => {
                    onClose();
                    router.push('/balance');
                  }}
                />
                <DrawerLink
                  icon={<Sparkles size={16} className="text-amber-400" />}
                  label="Бонусы и конкурсы"
                  onClick={() => {
                    onClose();
                    router.push('/bonuses');
                  }}
                />
                <DrawerLink
                  icon={<Headphones size={16} className="text-cyan-400" />}
                  label="Служба поддержки"
                  onClick={() => {
                    onClose();
                    window.open('https://t.me/MacvBetSupport', '_blank');
                  }}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-white/10 flex flex-col items-center gap-3 bg-black/20">
              <BrandLockup size={48} />
              <div className="font-roobert text-[10px] text-whisper-gray/60">
                MACVBET © 2026. All rights reserved.
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function DrawerLink({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="p-3 rounded-xl border border-white/10 bg-white/[0.03] hover:border-white/20 active:scale-[0.97] transition-all flex items-center justify-between text-frost-white font-roobert text-[13px]"
    >
      <div className="flex items-center gap-2.5">
        {icon}
        <span>{label}</span>
      </div>
      <ArrowRight size={14} className="text-whisper-gray" />
    </button>
  );
}
