'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Cpu,
  Gamepad2,
  Gauge,
  KeyRound,
  Megaphone,
  Network,
  ShieldAlert,
  ScrollText,
  Shield,
  Sliders,
  Sparkles,
  Users,
  Wallet,
  Database,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { checkIsAdmin } from '@/lib/admin-probe';
import { cn } from '@/lib/utils';

/**
 * AdminShell — wrapper for every page under `/system/console/*`.
 *
 * Lives in the parent `layout.tsx` so the nav rail isn't rerendered
 * (and scroll position isn't lost) when switching sections. Section
 * navigation uses <Link> for soft client-side transitions.
 *
 * Desktop horizontal scroll, three vectors so users always have a way
 * to reach off-screen tabs:
 *   1. Drag with the mouse anywhere on the nav (cursor: grab → grabbing).
 *      Movement is tracked; if the user dragged more than 6px, the next
 *      click is suppressed so the drag-then-release doesn't accidentally
 *      navigate away.
 *   2. Hover the nav and use the mouse wheel — vertical wheel translates
 *      to horizontal scroll.
 *   3. Two pill-shaped chevron buttons appear at the edges as soon as
 *      the nav overflows the viewport. They scroll one viewport-width
 *      worth on click. Hidden on touch devices because native swipe is
 *      already there.
 *
 * The active link still auto-scrolls into view on path change.
 */

interface AdminShellProps {
  children: React.ReactNode;
}

interface AdminLink {
  id: string;
  label: string;
  Icon: LucideIcon;
  href: string;
}

const links: AdminLink[] = [
  { id: 'dashboard', label: 'Сводка', Icon: Gauge, href: '/system/console' },
  { id: 'users', label: 'Игроки', Icon: Users, href: '/system/console/users' },
  { id: 'games', label: 'Игры', Icon: Gamepad2, href: '/system/console/games' },
  { id: 'rtp', label: 'Авто-RTP', Icon: Sliders, href: '/system/console/rtp' },
  {
    id: 'deposits',
    label: 'Депозиты',
    Icon: ArrowDownToLine,
    href: '/system/console/deposits',
  },
  {
    id: 'withdrawals',
    label: 'Выводы',
    Icon: Wallet,
    href: '/system/console/withdrawals',
  },
  {
    id: 'wallet',
    label: 'Кошелёк',
    Icon: CreditCard,
    href: '/system/console/wallet',
  },
  {
    id: 'bonuses',
    label: 'Бонусы',
    Icon: Sparkles,
    href: '/system/console/bonuses',
  },
  {
    id: 'broadcasts',
    label: 'Рассылки',
    Icon: Megaphone,
    href: '/system/console/broadcasts',
  },
  {
    id: 'alerts',
    label: 'Алерты',
    Icon: ShieldAlert,
    href: '/system/console/alerts',
  },
  {
    id: 'security',
    label: 'Безопасность',
    Icon: Shield,
    href: '/system/console/security',
  },
  {
    id: 'sessions',
    label: 'Сессии',
    Icon: Network,
    href: '/system/console/sessions',
  },
  {
    id: 'admins',
    label: 'Админы',
    Icon: KeyRound,
    href: '/system/console/admins',
  },
  {
    id: 'audit',
    label: 'Аудит',
    Icon: ScrollText,
    href: '/system/console/audit',
  },
  {
    id: 'system',
    label: 'Система',
    Icon: Cpu,
    href: '/system/console/system',
  },
  {
    id: 'dbops',
    label: 'Бэкапы БД',
    Icon: Database,
    href: '/system/console/db-ops',
  },
];

function titleFromPath(path: string): string {
  for (const l of links.slice().reverse()) {
    if (path === l.href || path.startsWith(l.href + '/')) return l.label;
  }
  return 'Админ';
}

export function AdminShell({ children }: AdminShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorised, setAuthorised] = useState<boolean | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const wasDraggingRef = useRef(false);

  // Edge fade / scroll-button visibility flags.
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // -------- Authorisation probe ----------------------------------------
  useEffect(() => {
    let cancelled = false;
    void checkIsAdmin().then((ok) => {
      if (!cancelled) setAuthorised(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // -------- Edge state recompute ---------------------------------------
  const recomputeEdges = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft < max - 1);
  }, []);

  useLayoutEffect(() => {
    recomputeEdges();
  }, [recomputeEdges]);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const onScroll = () => recomputeEdges();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => recomputeEdges());
    ro.observe(el);
    window.addEventListener('resize', recomputeEdges);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      window.removeEventListener('resize', recomputeEdges);
    };
  }, [recomputeEdges]);

  // -------- Drag-to-scroll ---------------------------------------------
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;

    let isDown = false;
    let startX = 0;
    let startScrollLeft = 0;
    let movedPx = 0;
    let dragPointerId: number | null = null;

    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      // Don't initiate drag from the chevron buttons — they live outside
      // the scrollable area, but be defensive.
      isDown = true;
      movedPx = 0;
      wasDraggingRef.current = false;
      startX = e.pageX;
      startScrollLeft = el.scrollLeft;
      dragPointerId = e.pointerId;
      el.classList.add('cursor-grabbing');
    };
    const move = (e: PointerEvent) => {
      if (!isDown) return;
      const dx = e.pageX - startX;
      movedPx = Math.max(movedPx, Math.abs(dx));
      if (movedPx > 6) {
        wasDraggingRef.current = true;
        // Capture so subsequent moves keep coming even if we slide off
        // a child element.
        if (dragPointerId !== null) {
          try {
            el.setPointerCapture(dragPointerId);
          } catch {
            // ignore
          }
        }
        e.preventDefault();
      }
      el.scrollLeft = startScrollLeft - dx;
    };
    const up = () => {
      isDown = false;
      el.classList.remove('cursor-grabbing');
      // Drop the captured pointer so subsequent clicks land normally.
      if (dragPointerId !== null) {
        try {
          el.releasePointerCapture(dragPointerId);
        } catch {
          // ignore
        }
        dragPointerId = null;
      }
      // Clear the drag flag a tick later so the synthesised click that
      // fires immediately after pointerup can see it as "true".
      setTimeout(() => {
        wasDraggingRef.current = false;
      }, 0);
    };

    el.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    el.addEventListener('pointermove', move);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      el.removeEventListener('pointermove', move);
    };
  }, []);

  // -------- Wheel-to-horizontal scroll ---------------------------------
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      el.scrollBy({ left: e.deltaY, behavior: 'auto' });
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // -------- Active link → centred --------------------------------------
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLAnchorElement>('a[data-active="true"]');
    if (active) {
      active.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [pathname]);

  // -------- Click suppression on drag ----------------------------------
  // Capture-phase listener so we can swallow the click before the <Link>
  // sees it.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      if (wasDraggingRef.current) {
        e.preventDefault();
        e.stopPropagation();
        wasDraggingRef.current = false;
      }
    };
    el.addEventListener('click', onClick, true);
    return () => el.removeEventListener('click', onClick, true);
  }, []);

  // -------- Render ----------------------------------------------------
  if (authorised === null) return null;
  if (authorised === false) {
    return (
      <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
        <div className="mx-auto max-w-[480px] px-4 pt-24 text-center">
          <h1 className="font-roobert text-[28px] text-frost-white">404</h1>
          <p className="mt-2 font-roobert text-[12px] text-whisper-gray">
            This page could not be found.
          </p>
        </div>
      </main>
    );
  }

  const scrollByPage = (dir: 1 | -1) => {
    const el = navRef.current;
    if (!el) return;
    const w = el.clientWidth * 0.8;
    el.scrollBy({ left: w * dir, behavior: 'smooth' });
  };

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[1080px] px-4 pt-4 pb-32 flex flex-col gap-5">
        {/* Header */}
        <header className="flex items-center justify-between">
          <button
            onClick={() => router.push('/profile')}
            aria-label="К профилю"
            className="w-11 h-11 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80"
          >
            <ChevronLeft size={20} strokeWidth={1.8} />
          </button>
          <div className="inline-flex items-center gap-2 min-w-0">
            <Shield size={14} strokeWidth={1.7} />
            <span className="font-roobert text-[14px] uppercase tracking-[0.28em] text-whisper-gray truncate">
              {titleFromPath(pathname)}
            </span>
          </div>
          <span className="w-11 h-11" />
        </header>

        {/* Section nav with edge buttons + fades */}
        <div className="relative">
          {/* Left chevron — desktop only (hover-capable devices). */}
          <button
            type="button"
            onClick={() => scrollByPage(-1)}
            aria-label="Прокрутить влево"
            className={cn(
              'hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 items-center justify-center rounded-pill border border-white/15 bg-midnight-canvas/95 text-frost-white/85 hover:text-frost-white hover:border-white/30 transition-opacity',
              canScrollLeft ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
          >
            <ChevronLeft size={16} strokeWidth={1.8} />
          </button>

          {/* Right chevron — desktop only. */}
          <button
            type="button"
            onClick={() => scrollByPage(1)}
            aria-label="Прокрутить вправо"
            className={cn(
              'hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 items-center justify-center rounded-pill border border-white/15 bg-midnight-canvas/95 text-frost-white/85 hover:text-frost-white hover:border-white/30 transition-opacity',
              canScrollRight ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
          >
            <ChevronRight size={16} strokeWidth={1.8} />
          </button>

          {/* Edge fade hints */}
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute left-0 top-0 bottom-0 w-10 z-[5] transition-opacity',
              canScrollLeft ? 'opacity-100' : 'opacity-0'
            )}
            style={{
              background:
                'linear-gradient(90deg, var(--color-midnight-canvas) 0%, transparent 100%)',
            }}
          />
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute right-0 top-0 bottom-0 w-10 z-[5] transition-opacity',
              canScrollRight ? 'opacity-100' : 'opacity-0'
            )}
            style={{
              background:
                'linear-gradient(-90deg, var(--color-midnight-canvas) 0%, transparent 100%)',
            }}
          />

          <nav
            ref={navRef}
            className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 cursor-grab select-none touch-pan-x"
            style={{ scrollSnapType: 'none' }}
          >
            {links.map((l) => {
              const active =
                pathname === l.href || pathname.startsWith(l.href + '/');
              return (
                <Link
                  key={l.id}
                  href={l.href}
                  data-active={active}
                  prefetch
                  draggable={false}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-pill border transition-colors',
                    active
                      ? 'border-white/30 bg-white/[0.06] text-frost-white'
                      : 'border-white/10 bg-white/[0.03] text-frost-white/65 hover:text-frost-white hover:border-white/20'
                  )}
                >
                  <l.Icon size={13} strokeWidth={1.7} />
                  <span className="font-roobert text-[12px]">{l.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          {children}
        </motion.div>
      </div>
    </main>
  );
}
