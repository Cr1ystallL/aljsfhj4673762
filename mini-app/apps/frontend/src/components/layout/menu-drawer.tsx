'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpRight,
  Bell,
  Bot,
  Dices,
  Gem,
  Headphones,
  Landmark,
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

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onGameSelect: (game: string) => void;
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

interface SectionItem {
  id: string;
  label: string;
  caption: string;
  icon: LucideIcon | (() => React.ReactElement);
  /** External: route via TG WebApp openLink. Internal: router.push. */
  external?: boolean;
  href: string;
}

const inAppGames: Array<{ id: GameKey; caption: string }> = [
  { id: 'crash', caption: 'Полёт до краха' },
  { id: 'mines', caption: 'Поле 5×5' },
  { id: 'plinko', caption: 'Шар сквозь штифты' },
  { id: 'coinflip', caption: 'Орёл или решка' },
];

const BOT_USERNAME =
  process.env.NEXT_PUBLIC_BOT_USERNAME?.replace(/^@/, '') || 'macvbet_bot';

/** Bot games — name, caption, command. */
const botGames: Array<{ id: string; label: string; caption: string; command: string }> = [
  { id: 'cube', label: 'Кубики', caption: 'Кости в чате', command: 'cube' },
  { id: 'bowl', label: 'Боулинг', caption: 'Сбей кегли', command: 'bowl' },
  { id: 'darts', label: 'Дартс', caption: 'Попади в цель', command: 'darts' },
  { id: 'basket', label: 'Баскетбол', caption: 'Заброс кольца', command: 'basket' },
  { id: 'foot', label: 'Футбол', caption: 'Удар по воротам', command: 'foot' },
  { id: 'knb', label: 'КНБ', caption: 'Камень-ножницы-бумага', command: 'knb' },
  { id: 'spider', label: 'Spider', caption: 'Пасьянс на удачу', command: 'spider' },
];

const menuItems: SectionItem[] = [
  {
    id: 'balance',
    label: 'Управление балансом',
    caption: 'Пополнение и вывод',
    icon: Wallet,
    href: '/balance',
  },
  {
    id: 'bonuses',
    label: 'Бонусы',
    caption: 'Промокоды и подарки',
    icon: Sparkles,
    href: '/bonuses',
  },
  {
    id: 'support',
    label: 'Поддержка',
    caption: 'Связаться с командой',
    icon: Headphones,
    href: `https://t.me/${BOT_USERNAME}?start=support`,
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

export function MenuDrawer({ isOpen, onClose, onGameSelect }: MenuDrawerProps) {
  const router = useRouter();

  const goInternal = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Scrim */}
          <motion.button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="fixed inset-0 z-40 bg-midnight-canvas/85 backdrop-blur-sm"
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
          >
            <div
              className="relative h-full overflow-hidden border-r border-white/10 backdrop-blur-2xl flex flex-col"
              style={{ background: 'rgba(0, 0, 0, 0.86)' }}
            >
              {/* Atmospheric orbs — static, killed on mobile via CSS */}
              <div
                className="mobile-no-blur pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, rgba(160, 224, 171, 0.20) 0%, transparent 70%)',
                  filter: 'blur(50px)',
                }}
                aria-hidden
              />
              <div
                className="mobile-no-blur pointer-events-none absolute -bottom-32 -right-20 w-80 h-80 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, rgba(255, 172, 46, 0.18) 0%, rgba(165, 45, 37, 0.10) 50%, transparent 80%)',
                  filter: 'blur(60px)',
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
                  {inAppGames.map((game, i) => (
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
                      caption={game.caption}
                      trailing={<ArrowUpRight size={16} strokeWidth={1.5} />}
                      divider={i < inAppGames.length - 1}
                    />
                  ))}
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
                        <span className="text-frost-white/85">
                          {g.id === 'cube' ? (
                            <Dices size={22} strokeWidth={1.5} />
                          ) : g.id === 'spider' ? (
                            <Gem size={22} strokeWidth={1.5} />
                          ) : (
                            <Bot size={22} strokeWidth={1.5} />
                          )}
                        </span>
                      }
                      label={g.label}
                      caption={g.caption}
                      trailing={<Send size={14} strokeWidth={1.6} />}
                      divider={i < botGames.length - 1}
                    />
                  ))}
                </div>

                <Divider />

                <SectionLabel>Меню</SectionLabel>
                <div className="px-3">
                  {menuItems.map((item, i) => {
                    const Icon = typeof item.icon === 'function' && 'displayName' in item.icon
                      ? (item.icon as LucideIcon)
                      : (item.icon as LucideIcon);
                    return (
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
                          <Icon
                            size={22}
                            strokeWidth={1.5}
                            className="text-frost-white/85"
                          />
                        }
                        label={item.label}
                        caption={item.caption}
                        trailing={
                          item.external ? (
                            <Send size={14} strokeWidth={1.6} />
                          ) : (
                            <ArrowUpRight size={16} strokeWidth={1.5} />
                          )
                        }
                        divider={i < menuItems.length - 1}
                      />
                    );
                  })}
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
                      openExternal(`https://t.me/${BOT_USERNAME}`);
                    }}
                    className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-pill border border-white/15 bg-white/[0.04] text-frost-white/85 hover:text-frost-white hover:border-white/25 transition-colors"
                  >
                    <Bell size={14} strokeWidth={1.7} />
                    <span className="font-roobert text-[12px] uppercase tracking-[0.22em]">
                      Ссылки на ресурсы
                    </span>
                  </button>
                  <button
                    onClick={() => goInternal('/legal/privacy')}
                    className="inline-flex items-center justify-center gap-2 w-full py-2 text-whisper-gray hover:text-frost-white transition-colors"
                  >
                    <Shield size={12} strokeWidth={1.7} />
                    <span className="font-roobert text-[10px] uppercase tracking-[0.22em]">
                      Политика конфиденциальности
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
  caption,
  trailing,
  onClick,
  delay = 0,
  divider = true,
}: {
  icon: React.ReactNode;
  label: string;
  caption: string;
  trailing?: React.ReactNode;
  onClick: () => void;
  delay?: number;
  divider?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: delay * 0.03, duration: 0.28 }}
    >
      <button
        onClick={onClick}
        className="group w-full text-left rounded-card px-3 py-3 flex items-center gap-4 hover:bg-white/[0.04] transition-colors"
      >
        <span className="w-9 h-9 flex items-center justify-center shrink-0">
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-roobert text-[16px] leading-tight text-frost-white">
            {label}
          </div>
          <div className="mt-1 font-roobert text-[11px] tracking-[0.04em] text-whisper-gray">
            {caption}
          </div>
        </div>
        {trailing && (
          <span className="text-frost-white/45 group-hover:text-frost-white/85 transition-colors">
            {trailing}
          </span>
        )}
      </button>
      {divider && <div className="mx-3 h-px bg-white/[0.06]" />}
    </motion.div>
  );
}

// Suppress Landmark / Bell unused-import warnings — they're staged for
// future expansion of the Меню section but not all referenced yet.
void Landmark;
