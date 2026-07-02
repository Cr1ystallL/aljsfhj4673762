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
  Handshake,
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
    id: 'partners',
    label: 'Партнеры',
    Icon: Handshake,
    href: '/system/console/partners',
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
  useEffect(() => {
    let cancelled = false;
    void checkIsAdmin().then((ok) => {
      if (!cancelled) setAuthorised(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white flex flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-[60px] md:w-64 shrink-0 border-r border-white/10 flex flex-col h-screen sticky top-0 bg-midnight-canvas z-20">
        <header className="h-16 flex items-center justify-center md:justify-start md:px-4 border-b border-white/5 shrink-0">
          <button
            onClick={() => router.push('/profile')}
            aria-label="К профилю"
            className="w-10 h-10 md:w-11 md:h-11 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 hover:bg-white/[0.08]"
          >
            <ChevronLeft size={20} strokeWidth={1.8} />
          </button>
        </header>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide py-4 px-2 flex flex-col gap-1.5">
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
                  'flex items-center justify-center md:justify-start md:gap-3 p-2 md:px-3 md:py-2.5 rounded-lg border transition-colors',
                  active
                    ? 'border-white/30 bg-white/[0.06] text-frost-white'
                    : 'border-transparent text-frost-white/65 hover:text-frost-white hover:bg-white/[0.03]'
                )}
                title={l.label}
              >
                <l.Icon size={20} strokeWidth={1.7} className="shrink-0" />
                <span className="font-roobert text-[13px] hidden md:block truncate">
                  {l.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center px-4 md:px-8 border-b border-white/5 shrink-0">
          <div className="inline-flex items-center gap-2 min-w-0">
            <Shield size={16} strokeWidth={1.7} />
            <span className="font-roobert text-[15px] uppercase tracking-[0.2em] text-whisper-gray truncate">
              {titleFromPath(pathname)}
            </span>
          </div>
        </header>

        <div className="flex-1 p-4 md:p-8 pb-32 overflow-x-auto">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            {children}
          </motion.div>
        </div>
      </div>
    </main>
  );
}
