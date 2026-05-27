'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, Menu, User } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { memo, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { BrandMark } from '@/components/ui/brand-mark';
import { useNavStore } from '@/store/nav-store';

/* ----------------------------------------------- swipe-down to dismiss */

/** Minimum vertical drag (px) before we collapse the bar. */
const SWIPE_DOWN_THRESHOLD = 36;
/** Maximum horizontal drift before we treat the gesture as a tap/scroll. */
const SWIPE_HORIZONTAL_TOLERANCE = 24;

/* ---------------------------------------------------------------- glyphs */

/**
 * Plain coin glyph for the Bonuses tab — simple stroked SVG, no
 * gradients, sparkles or animation. Matches the visual weight of the
 * other lucide icons in the bar.
 */
function CoinGlyph({ active }: { active: boolean }) {
  const stroke = active ? '#ffffff' : 'rgba(255,255,255,0.65)';
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none">
      <circle cx="12" cy="12" r="9" stroke={stroke} strokeWidth="1.7" />
      <circle cx="12" cy="12" r="5.5" stroke={stroke} strokeWidth="1.3" opacity="0.55" />
      <path
        d="M10 8.5v7M14 8.5v7"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Megaphone glyph for the Partner tab. Cleaner take than the lucide
 * default — the cone is drawn as a single arc-ended shape, the handle
 * is a small rounded square, and there are two outgoing sound waves.
 */
function MegaphoneGlyph({ active }: { active: boolean }) {
  const stroke = active ? '#ffffff' : 'rgba(255,255,255,0.65)';
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none">
      {/* Cone */}
      <path
        d="M 4 10 L 4 14 L 7 14 L 18 18 L 18 6 L 7 10 Z"
        fill={active ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)'}
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* Handle */}
      <rect x="3" y="11" width="2" height="2" rx="0.6" fill={stroke} opacity="0.7" />
      {/* Sound waves */}
      <path d="M 20 9 Q 22 12 20 15" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <path d="M 21.5 7 Q 24.5 12 21.5 17" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.7" />
    </svg>
  );
}

interface BottomNavigationProps {
  onMenuClick: () => void;
  onPlayClick: () => void;
  onProfileClick: () => void;
  onBonusesClick: () => void;
  onPartnerClick: () => void;
  /** Force the bar (and grip) hidden — used while the side drawer is open. */
  forceHidden?: boolean;
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
  onBonusesClick,
  onPartnerClick,
  forceHidden = false,
}: BottomNavigationProps) {
  const pathname = usePathname();
  const isProfileActive = pathname?.startsWith('/profile') ?? false;
  const isBonusesActive = pathname?.startsWith('/bonuses') ?? false;
  const isPartnerActive = pathname?.startsWith('/partner') ?? false;

  const collapsed = useNavStore((s) => s.collapsed);
  const setCollapsed = useNavStore((s) => s.setCollapsed);
  // Свайп вниз доступен на любой странице — раньше скрытие работало
  // только на hideable страницах (игры, бонусы), но модалки админки
  // тоже перекрывались баром, поэтому теперь сворачивание разрешено
  // везде и управляется единственным флагом `collapsed`.
  const isCollapsed = collapsed;
  const showGrip = collapsed && !forceHidden;
  const showBar = !collapsed && !forceHidden;

  // Track active vertical swipe-to-dismiss on the bar itself.
  const swipeRef = useRef<{ x: number; y: number; active: boolean } | null>(
    null
  );

  const onBarTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    swipeRef.current = { x: t.clientX, y: t.clientY, active: true };
  }, []);

  const onBarTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const start = swipeRef.current;
      if (!start || !start.active) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = Math.abs(t.clientX - start.x);
      const dy = t.clientY - start.y; // > 0 means moving down
      if (dx > SWIPE_HORIZONTAL_TOLERANCE) {
        // Horizontal drift — treat as a tap/scroll, not a swipe.
        start.active = false;
        return;
      }
      if (dy >= SWIPE_DOWN_THRESHOLD) {
        start.active = false;
        setCollapsed(true);
      }
    },
    [setCollapsed]
  );

  const onBarTouchEnd = useCallback(() => {
    swipeRef.current = null;
  }, []);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 pb-safe pointer-events-none"
      aria-hidden={isCollapsed || forceHidden}
    >
      {/* Grip handle — only on hideable pages, only when collapsed. */}
      <AnimatePresence>
        {showGrip && (
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
        {showBar && (
          <motion.div
            key="bar"
            initial={{ y: 96, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 96, opacity: 0 }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className="relative mx-3 mb-3 pointer-events-auto"
            style={{ willChange: 'transform' }}
            onTouchStart={onBarTouchStart}
            onTouchMove={onBarTouchMove}
            onTouchEnd={onBarTouchEnd}
            onTouchCancel={onBarTouchEnd}
          >
            <div
              className="relative rounded-card border border-white/10"
              style={{ background: 'rgba(0, 0, 0, 0.78)' }}
            >
              {/* Drag handle — ненавязчивая полоска-намёк, что бар */}
              {/* можно «свайпнуть вниз». Tap по ней тоже сворачивает */}
              {/* (быстрый способ убрать панель с экрана). */}
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label="Свернуть нижнюю панель"
                className="absolute top-1 left-1/2 -translate-x-1/2 inline-flex items-center justify-center w-12 h-3 group"
              >
                <span className="block w-9 h-[3px] rounded-full bg-frost-white/35 group-active:bg-frost-white/70 transition-colors" />
              </button>
              <div className="relative grid grid-cols-5 items-center px-2 py-1.5 pt-2.5">
                <NavItem
                  icon={<Menu size={18} strokeWidth={1.7} />}
                  label="Меню"
                  onClick={onMenuClick}
                />
                <NavItem
                  icon={<CoinGlyph active={isBonusesActive} />}
                  label="Бонусы"
                  onClick={onBonusesClick}
                  active={isBonusesActive}
                />

                {/* Center action — bigger raised pill (column 3 of 5) */}
                <div className="flex items-start justify-center -mt-px">
                  <button
                    onClick={onPlayClick}
                    aria-label="Играть"
                    className="-mt-9 relative active:scale-95 transition-transform"
                    style={{ willChange: 'transform' }}
                  >
                    <span
                      aria-hidden
                      className="hidden md:block absolute -inset-2 rounded-pill opacity-65"
                      style={{
                        background:
                          'linear-gradient(135deg, rgba(160, 224, 171, 0.55), rgba(255, 172, 46, 0.55) 55%, rgba(165, 45, 37, 0.50))',
                        filter: 'blur(20px)',
                      }}
                    />
                    <span
                      className="relative w-16 h-16 rounded-pill flex items-center justify-center border border-white/30 overflow-hidden"
                      style={{
                        background:
                          'linear-gradient(135deg, rgb(160, 224, 171) 0%, rgb(255, 172, 46) 55%, rgb(165, 45, 37) 100%)',
                        boxShadow: '0 8px 22px rgba(255, 172, 46, 0.35), inset 0 1px 0 rgba(255,255,255,0.40)',
                      }}
                    >
                      <span
                        aria-hidden
                        className="absolute inset-0 rounded-pill"
                        style={{
                          background:
                            'linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0) 55%)',
                        }}
                      />
                      <BrandMark
                        variant="dark"
                        size={48}
                        title="Играть"
                        className="relative"
                      />
                    </span>
                    <span className="block mt-1 text-center font-roobert text-[10px] uppercase tracking-[0.2em] text-frost-white/80">
                      Играть
                    </span>
                  </button>
                </div>

                <NavItem
                  icon={<MegaphoneGlyph active={isPartnerActive} />}
                  label="Партнёрка"
                  onClick={onPartnerClick}
                  active={isPartnerActive}
                />
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
