'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpRight,
  Bell,
  Headphones,
  Send,
  Shield,
  Sparkles,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { GameIcon, gameLabel, type GameKey } from '@/components/ui/game-icon';
import { BrandLockup, BrandWordmark } from '@/components/ui/brand-mark';
import {
  BasketballIcon,
  BowlingIcon,
  DartsIcon,
  DiceCubeIcon,
  FootballIcon,
  RpsIcon,
  SpiderIcon,
} from '@/components/ui/bot-game-icons';

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onGameSelect: (game: string) => void;
  isAuthenticated?: boolean;
}

/**
 * Menu Drawer — Monopo Saigon Style
 *
 * Atmospheric panel that slides in from the left. Composition:
 *
 *   - HEADER       → BrandWordmark + close pill.
 *   - SECTION      → "Игры" — in-app games (open mini-app routes).
 *   - SECTION      → "Игры в боте" — open Telegram with the matching
 *                    bot command. Triggered through the WebApp openLink
 *                    API so we leave the mini-app in the same tab.
 *   - SECTION      → "Меню" — wallet, bonuses, support.
 *   - FOOTER       → BrandLockup centred.
 *   - FOOTER LINKS → Resource links + privacy policy.
 *
 * No emoji, no rainbow accents. Hairline dividers, generous padding.
 * Atmospheric orbs are static on mobile (see `mobile-no-blur` rule in
 * globals.css) so the panel scrolls without GPU stutter.
 */

const inAppGames: Array<{ id: GameKey }> = [
  { id: 'crash' },
  { id: 'mines' },
  { id: 'cards' },
  { id: 'plinko' },
  { id: 'coinflip' },
  { id: 'wheel' },
  { id: 'bridges' },
  { id: 'cases' },
];

const BOT_USERNAME =
  process.env.NEXT_PUBLIC_BOT_USERNAME?.replace(/^@/, '') || 'macvbet_bot';

/** Bot games — name, command, custom icon. */
const botGames: Array<{
  id: string;
  label: string;
  command: string;
  Icon: LucideIcon;
}> = [
  { id: 'cube', label: 'Кубики', command: 'cube', Icon: DiceCubeIcon },
  { id: 'bowl', label: 'Боулинг', command: 'bowl', Icon: BowlingIcon },
  { id: 'darts', label: 'Дартс', command: 'darts', Icon: DartsIcon },
  { id: 'basket', label: 'Баскетбол', command: 'basket', Icon: BasketballIcon },
  { id: 'foot', label: 'Футбол', command: 'foot', Icon: FootballIcon },
  { id: 'knb', label: 'КНБ', command: 'knb', Icon: RpsIcon },
  { id: 'spider', label: 'Spider', command: 'spider', Icon: SpiderIcon },
];

const menuItems: Array<{
  id: string;
  label: string;
  Icon: LucideIcon;
  href: string;
  external?: boolean;
}> = [
  { id: 'balance', label: 'Управление балансом', Icon: Wallet, href: '/balance' },
  { id: 'bonuses', label: 'Бонусы', Icon: Sparkles, href: '/bonuses' },
  {
    id: 'support',
    label: 'Поддержка',
    Icon: Headphones,
    href: 'https://t.me/MacvBetSupport',
    external: true,
  },
];

/**
 * Open a URL through the Telegram WebApp openLink API when running
 * inside Telegram, otherwise fall back to a plain window.open. Keeps
 * the mini-app session intact rather than navigating the WebView.
 */
function openExternal(url: string) {
  if (typeof window === 'undefined') return;
  const tg = (window as unknown as { Telegram?: { WebApp?: { openTelegramLink?: (u: string) => void; openLink?: (u: string) => void } } }).Telegram?.WebApp;
  if (tg) {
    if (url.startsWith('https://t.me/') || url.startsWith('tg://')) {
      tg.openTelegramLink?.(url) ?? tg.openLink?.(url);
    } else {
      tg.openLink?.(url);
    }
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function MenuDrawer({ isOpen, onClose, onGameSelect, isAuthenticated = true }: MenuDrawerProps) {
  const router = useRouter();
  const [availability, setAvailability] = useState<{
    isAdmin: boolean;
    hidden: Record<string, boolean>;
  } | null>(null);
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false);

  const goInternal = (href: string) => {
    onClose();
    router.push(href);
  };

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) {
      setAvailabilityLoaded(true);
      return;
    }

    void (async () => {
      try {
        const res = await fetch('/api/games/availability', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const hidden: Record<string, boolean> = {};
        if (Array.isArray(json.games)) {
          for (const g of json.games) {
            if (g?.gameType) hidden[g.gameType] = !!g.hidden;
          }
        }
        setAvailability({ isAdmin: !!json.isAdmin, hidden });
      } catch {
        // ignore — fallback below keeps drawer functional
      } finally {
        if (!cancelled) setAvailabilityLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const visibleGames = useMemo(() => {
    if (!availabilityLoaded) return [] as typeof inAppGames;
    const hiddenFallback: Partial<Record<GameKey, boolean>> = isAuthenticated ? {} : { cards: true };
    const hidden: Partial<Record<GameKey, boolean>> = availability?.hidden ?? {};
    const isAdmin = availability?.isAdmin ?? false;
    return inAppGames.filter((g) => {
      if ((hidden[g.id] ?? hiddenFallback[g.id]) && !isAdmin) return false;
      return true;
    });
  }, [availability, availabilityLoaded, isAuthenticated]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Scrim */}
          <motion.button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="fixed inset-0 z-40 bg-midnight-canvas/85"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Drawer */}
          <motion.aside
            className="fixed left-0 top-0 bottom-0 z-50 w-[340px] max-w-[88vw] pt-safe pb-safe"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            style={{ willChange: 'transform' }}
          >
            <div
              className="relative h-full overflow-hidden border-r border-white/10 flex flex-col"
              style={{ background: 'rgba(0, 0, 0, 0.92)' }}
            >
              {/* Atmospheric orbs — pure CSS gradients, no filter:blur on
                  mobile. Looks identical, costs zero per frame. */}
              <div
                className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, rgba(160, 224, 171, 0.18) 0%, transparent 70%)',
                }}
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -bottom-32 -right-20 w-80 h-80 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, rgba(255, 172, 46, 0.16) 0%, rgba(165, 45, 37, 0.08) 50%, transparent 80%)',
                }}
                aria-hidden
              />

              {/* Header */}
              <div className="relative flex items-center justify-between px-6 pt-6 pb-5">
                <BrandWordmark size={56} />
                <button
                  onClick={onClose}
                  aria-label="Закрыть"
                  className="w-11 h-11 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 hover:text-frost-white hover:border-white/25 transition-colors"
                >
                  <X size={18} strokeWidth={1.8} />
                </button>
              </div>

              <div className="relative h-px mx-6 bg-white/10" />

              {/* Scrollable content */}
              <div className="relative flex-1 overflow-y-auto scrollbar-hide">
                <SectionLabel>Игры</SectionLabel>
                <div className="px-3">
                  {!availabilityLoaded ? (
                    <div className="px-3 pb-2 text-sm text-whisper-gray">Загружаем список игр…</div>
                  ) : visibleGames.length === 0 ? (
                    <div className="px-3 pb-2 text-sm text-whisper-gray">Нет доступных игр</div>
                  ) : (
                    visibleGames.map((game, i) => (
                      <Row
                        key={game.id}
                        delay={i}
                        onClick={() => {
                          onGameSelect(game.id);
                          onClose();
                        }}
                        icon={
                          <GameIcon
                            game={game.id}
                            size={22}
                            strokeWidth={1.5}
                            className="text-frost-white/85"
                          />
                        }
                        label={gameLabel(game.id)}
                        trailing={<ArrowUpRight size={16} strokeWidth={1.5} />}
                        divider={i < visibleGames.length - 1}
                      />
                    ))
                  )}
                </div>

                <Divider />

                <SectionLabel>Игры в боте</SectionLabel>
                <div className="px-3">
                  {botGames.map((g, i) => (
                    <Row
                      key={g.id}
                      delay={i}
                      onClick={() => {
                        onClose();
                        openExternal(`https://t.me/${BOT_USERNAME}?start=${g.command}`);
                      }}
                      icon={
                        <g.Icon
                          size={22}
                          strokeWidth={1.5}
                          className="text-frost-white/85"
                        />
                      }
                      label={g.label}
                      trailing={<Send size={14} strokeWidth={1.6} />}
                      divider={i < botGames.length - 1}
                    />
                  ))}
                </div>

                <Divider />

                <SectionLabel>Меню</SectionLabel>
                <div className="px-3">
                  {menuItems.map((item, i) => (
                    <Row
                      key={item.id}
                      delay={i}
                      onClick={() => {
                        if (item.external) {
                          onClose();
                          openExternal(item.href);
                        } else {
                          goInternal(item.href);
                        }
                      }}
                      icon={
                        <item.Icon
                          size={22}
                          strokeWidth={1.5}
                          className="text-frost-white/85"
                        />
                      }
                      label={item.label}
                      trailing={
                        item.external ? (
                          <Send size={14} strokeWidth={1.6} />
                        ) : (
                          <ArrowUpRight size={16} strokeWidth={1.5} />
                        )
                      }
                      divider={i < menuItems.length - 1}
                    />
                  ))}
                </div>

                <Divider />

                {/* Centred brand lockup */}
                <div className="relative px-6 py-7 flex items-center justify-center">
                  <BrandLockup size={72} />
                </div>

                {/* Resource / legal links */}
                <div className="relative px-6 pb-6 flex flex-col gap-2.5">
                  <button
                    onClick={() => {
                      onClose();
                      goInternal('/info');
                    }}
                    className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-pill border border-white/15 bg-white/[0.04] text-frost-white/85 hover:text-frost-white hover:border-white/25 transition-colors"
                  >
                    <Shield size={14} strokeWidth={1.7} />
                    <span className="font-roobert text-[12px] uppercase tracking-[0.22em]">
                      Информация и Правила
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative px-6 pt-5 pb-3">
      <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
        {children}
      </span>
    </div>
  );
}

function Divider() {
  return <div className="relative h-px mx-6 my-2 bg-white/10" />;
}

function Row({
  icon,
  label,
  trailing,
  onClick,
  divider = true,
}: {
  icon: React.ReactNode;
  label: string;
  trailing?: React.ReactNode;
  onClick: () => void;
  delay?: number;
  divider?: boolean;
}) {
  return (
    <>
      <button
        onClick={onClick}
        className="group w-full text-left rounded-card px-3 py-3.5 flex items-center gap-4 active:bg-white/[0.06] transition-colors"
      >
        <span className="w-9 h-9 flex items-center justify-center shrink-0">
          {icon}
        </span>
        <span className="flex-1 min-w-0 font-roobert text-[16px] leading-tight text-frost-white truncate">
          {label}
        </span>
        {trailing && (
          <span className="text-frost-white/45 group-hover:text-frost-white/85 transition-colors">
            {trailing}
          </span>
        )}
      </button>
      {divider && <div className="mx-3 h-px bg-white/[0.06]" />}
    </>
  );
}
