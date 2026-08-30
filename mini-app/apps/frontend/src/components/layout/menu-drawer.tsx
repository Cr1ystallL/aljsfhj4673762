'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Crown,
  Flame,
  Gamepad2,
  Gem,
  Gift,
  Headphones,
  Layers,
  Sparkles,
  Trophy,
  User,
  Users,
  Wallet,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { GameIcon, type GameKey } from '@/components/ui/game-icon';
import { SoccerBallIcon } from '@/components/ui/soccer-ball-icon';
import { BrandLockup, BrandWordmark } from '@/components/ui/brand-mark';
import { StreakFlameBadge } from '@/components/ui/streak-flame-badge';
import { useWinStreak } from '@/hooks/use-win-streak';
import { useAuthStore } from '@/store/auth-store';
import { useBalanceStore } from '@/store/balance-store';
import { useT } from '@/i18n/use-t';

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onGameSelect: (game: string) => void;
  isAuthenticated?: boolean;
}

interface InAppGame {
  id: GameKey;
  name: string;
  bg: string;
  badge?: { label: string; color: string; Icon: LucideIcon };
}

const ALL_IN_APP_GAMES: InAppGame[] = [
  { id: 'crash', name: 'MacvJet', bg: '/tiles/macvjet.webp', badge: { label: 'TOP', color: 'red', Icon: Flame } },
  { id: 'hilo', name: 'Hi-Lo', bg: '/tiles/hilo.webp', badge: { label: 'FAST', color: 'cyan', Icon: Zap } },
  { id: 'mines', name: 'Mines', bg: '/tiles/mines.webp', badge: { label: 'HOT', color: 'gold', Icon: Sparkles } },
  { id: 'coinflip', name: 'Coinflip', bg: '/tiles/coinflip.webp', badge: { label: '50/50', color: 'cyan', Icon: Gem } },
  { id: 'blackjack', name: 'Blackjack', bg: '/tiles/bj.webp', badge: { label: 'PRO', color: 'gold', Icon: Crown } },
  { id: 'macvpot', name: 'MacvPot', bg: '/tiles/macvpot.webp', badge: { label: 'JACKPOT', color: 'purple', Icon: Trophy } },
  { id: 'wheel', name: 'Wheel', bg: '/tiles/wheel.webp', badge: { label: 'x50', color: 'gold', Icon: Zap } },
  { id: 'cases', name: 'Case', bg: '/tiles/case.webp', badge: { label: 'BONUS', color: 'green', Icon: Gift } },
  { id: 'keno', name: 'Keno', bg: '/tiles/keno.webp', badge: { label: 'LOTTO', color: 'purple', Icon: Layers } },
];

export function MenuDrawer({
  isOpen,
  onClose,
  onGameSelect,
  isAuthenticated = false,
}: MenuDrawerProps) {
  const router = useRouter();
  const { t, localeTag } = useT();
  const { user } = useAuthStore();
  const { streak } = useWinStreak();
  const balanceStore = useBalanceStore((s) => s.balance);

  const [availability, setAvailability] = useState<{
    isAdmin: boolean;
    hidden: Record<string, boolean>;
  } | null>(null);

  // Fetch Admin hidden games availability
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/games/availability', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const hidden: Record<string, boolean> = {};
        if (Array.isArray(json.games)) {
          for (const g of json.games) {
            if (g?.gameType) hidden[g.gameType] = !!g.hidden;
          }
        }
        setAvailability({ isAdmin: !!json.isAdmin, hidden });
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Filter out hidden games for non-admin users
  const visibleGames = useMemo(() => {
    const hidden = availability?.hidden ?? {};
    const isAdmin = availability?.isAdmin ?? false;
    return ALL_IN_APP_GAMES.filter((g) => {
      if (hidden[g.id] && !isAdmin) return false;
      return true;
    });
  }, [availability]);

  // Close on Escape key
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
            className="fixed inset-0 bg-black/80"
          />

          {/* Drawer panel */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="relative z-10 w-[88%] max-w-[350px] h-full bg-midnight-canvas border-r border-white/10 flex flex-col justify-between overflow-y-auto shadow-2xl no-scrollbar"
          >
            {/* Top Header */}
            <div className="p-4 border-b border-white/10 flex flex-col gap-3.5">
              <div className="flex items-center justify-between">
                <BrandWordmark size={32} />
                <button
                  onClick={onClose}
                  aria-label={t('nav.closeMenu')}
                  className="w-9 h-9 rounded-full border border-white/10 bg-white/[0.04] text-whisper-gray hover:text-frost-white flex items-center justify-center active:scale-95 transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {/* User Quick Profile Card */}
              <div className="rounded-2xl border border-white/15 bg-gradient-to-r from-white/[0.05] via-white/[0.03] to-white/[0.05] p-3 flex items-center justify-between gap-3 shadow-inner">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-full border border-amber-400/40 bg-amber-400/10 flex items-center justify-center shrink-0">
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
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-roobert font-medium text-[14px] text-frost-white truncate">
                        {user?.firstName || t('profile.player')}
                      </span>
                      {streak >= 2 && <StreakFlameBadge streak={streak} size="sm" />}
                    </div>
                    <div className="font-roobert text-[11px] text-amber-300 font-bold tracking-tight">
                      {(balanceStore?.amount ?? 0).toLocaleString(localeTag)} zł
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    router.push('/profile');
                  }}
                  className="p-1.5 rounded-xl border border-white/10 bg-white/[0.06] text-whisper-gray hover:text-frost-white shrink-0 active:scale-95 transition-transform"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="p-4 flex flex-col gap-6 flex-1">
              {/* Games Grid following 2 - 1 - 2 - 1 pattern with photo backgrounds */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="font-roobert text-[10px] uppercase tracking-[0.3em] text-whisper-gray">
                    {t('nav.gamesMiniApp')}
                  </span>
                  <span className="font-roobert text-[10px] text-whisper-gray">
                    {visibleGames.length}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {visibleGames.map((g) => {
                    const BadgeIcon = g.badge?.Icon;

                    return (
                      <button
                        key={g.id}
                        onClick={() => {
                          onClose();
                          router.push(`/game/${g.id}`);
                        }}
                        className="group relative overflow-hidden rounded-2xl border border-white/10 bg-midnight-canvas text-left active:scale-[0.96] hover:border-amber-400/40 transition-all duration-200 shadow-md aspect-[16/11] flex flex-col justify-between p-2.5"
                      >
                        {/* Background photo artwork */}
                        {g.bg && (
                          <div
                            aria-hidden
                            className="absolute inset-0 opacity-55 group-hover:opacity-75 transition-opacity duration-300"
                            style={{
                              backgroundImage: `url(${g.bg})`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              backgroundRepeat: 'no-repeat',
                            }}
                          />
                        )}

                        {/* Vignette */}
                        <div
                          aria-hidden
                          className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-black/25"
                        />

                        {/* Card Top: Icon & Badge */}
                        <div className="relative z-10 flex items-start justify-between gap-1">
                          <span className="w-8 h-8 rounded-xl border border-white/20 bg-black/60 backdrop-blur-md flex items-center justify-center text-frost-white shrink-0 shadow-md group-hover:scale-105 transition-transform">
                            <GameIcon game={g.id} size={18} strokeWidth={2} />
                          </span>

                          {g.badge && (
                            <span className="px-1.5 py-0.5 rounded-full text-[8px] font-roobert font-bold uppercase tracking-wider backdrop-blur-md border border-amber-400/30 bg-black/60 text-amber-300 flex items-center gap-0.5">
                              {BadgeIcon && <BadgeIcon size={8} className="shrink-0" />}
                              <span>{g.badge.label}</span>
                            </span>
                          )}
                        </div>

                        {/* Card Bottom: Name & Play */}
                        <div className="relative z-10">
                          <div className="font-roobert text-[13px] font-bold text-frost-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] group-hover:text-amber-200 transition-colors">
                            {g.name}
                          </div>
                          <div className="text-[9px] font-roobert text-whisper-gray/80 uppercase tracking-wider">
                            {t('common.play')}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Completely Redesigned "Разделы" (Sections) Section */}
              <div className="flex flex-col gap-2.5 pt-3 border-t border-white/10">
                <div className="font-roobert text-[10px] uppercase tracking-[0.3em] text-whisper-gray">
                  {t('nav.sections')}
                </div>

                <div className="flex flex-col gap-2">
                  <SectionCard
                    icon={<SoccerBallIcon size={18} className="text-frost-white" />}
                    title={t('nav.sportsTitle')}
                    description={t('nav.sportsDesc')}
                    onClick={() => {
                      onClose();
                      router.push('/sport');
                    }}
                  />
                  <SectionCard
                    icon={<Users size={18} className="text-frost-white" />}
                    title={t('nav.partnerTitle')}
                    description={t('nav.partnerDesc')}
                    onClick={() => {
                      onClose();
                      router.push('/partner');
                    }}
                  />
                  <SectionCard
                    icon={<Wallet size={18} className="text-emerald-400" />}
                    title={t('nav.walletTitle')}
                    description={t('nav.walletDesc')}
                    onClick={() => {
                      onClose();
                      router.push('/balance');
                    }}
                  />
                  <SectionCard
                    icon={<Sparkles size={18} className="text-amber-400" />}
                    title={t('nav.bonusesTitle')}
                    description={t('nav.bonusesDesc')}
                    onClick={() => {
                      onClose();
                      router.push('/bonuses');
                    }}
                  />
                  <SectionCard
                    icon={<BookOpen size={18} className="text-sky-400" />}
                    title={t('nav.faqTitle')}
                    description={t('nav.faqDesc')}
                    onClick={() => {
                      onClose();
                      router.push('/info');
                    }}
                  />
                  <SectionCard
                    icon={<Headphones size={18} className="text-cyan-400" />}
                    title={t('nav.supportTitle')}
                    description={t('nav.supportDesc')}
                    onClick={() => {
                      onClose();
                      window.open('https://t.me/MacvBetSupport', '_blank');
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-white/10 flex flex-col items-center gap-2 bg-black/30">
              <BrandLockup size={44} />
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

function SectionCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="p-3 rounded-2xl border border-white/10 bg-white/[0.03] hover:border-white/20 active:scale-[0.97] transition-all flex items-center justify-between gap-3 text-left group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-9 h-9 rounded-xl border border-white/15 bg-white/[0.05] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="font-roobert text-[13px] font-semibold text-frost-white group-hover:text-amber-200 transition-colors">
            {title}
          </div>
          <div className="font-roobert text-[10px] text-whisper-gray truncate">
            {description}
          </div>
        </div>
      </div>
      <ChevronRight size={16} className="text-whisper-gray shrink-0 group-hover:text-frost-white transition-colors" />
    </button>
  );
}
