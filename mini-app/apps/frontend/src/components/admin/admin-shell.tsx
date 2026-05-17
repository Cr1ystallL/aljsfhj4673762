'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowDownToLine,
  ChevronLeft,
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
  Users,
  Wallet,
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
 * - Verifies the admin probe once. If it returns false, the entire UI
 *   collapses to a generic 404 — same as if the route didn't exist.
 * - Section nav supports drag-to-scroll on desktop (no visible
 *   scrollbar) and native horizontal scroll on touch devices.
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
  {
    id: 'games',
    label: 'Игры',
    Icon: Gamepad2,
    href: '/system/console/games',
  },
  {
    id: 'rtp',
    label: 'Авто-RTP',
    Icon: Sliders,
    href: '/system/console/rtp',
  },
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
];

/**
 * Heuristic "page title" derived from the active link. Avoids needing
 * each page to pass it explicitly — keeps the shell stateless.
 */
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

  useEffect(() => {
    let cancelled = false;
    void checkIsAdmin().then((ok) => {
      if (!cancelled) setAuthorised(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Drag-to-scroll on desktop. Touch devices get native scrolling.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    const down = (e: PointerEvent) => {
      // Only start drag with a primary mouse button on a non-touch device.
      if (e.pointerType !== 'mouse') return;
      isDown = true;
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
      el.classList.add('cursor-grabbing');
    };
    const up = () => {
      isDown = false;
      el.classList.remove('cursor-grabbing');
    };
    const move = (e: PointerEvent) => {
      if (!isDown) return;
      e.preventDefault();
      el.scrollLeft = scrollLeft - (e.pageX - el.offsetLeft - startX);
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

  // Wheel-to-horizontal scroll on desktop. Vertical wheel becomes
  // horizontal when the cursor is over the nav rail.
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

  // Auto-scroll the active link into view when path changes.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLAnchorElement>('a[data-active="true"]');
    if (active) {
      active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [pathname]);

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

        {/* Section nav — sticky so scrolling the page doesn't lose it,
            drag-to-scroll on desktop, wheel-to-scroll. */}
        <nav
          ref={navRef}
          className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 cursor-grab select-none touch-pan-x"
          style={{ scrollSnapType: 'none' }}
        >
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + '/');
            return (
              <Link
                key={l.id}
                href={l.href}
                data-active={active}
                prefetch
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
