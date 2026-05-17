'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowDownToLine,
  ChevronLeft,
  CreditCard,
  Gamepad2,
  Gauge,
  KeyRound,
  Network,
  ShieldAlert,
  ScrollText,
  Shield,
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
 * - Verifies the admin probe once. If it returns false, the entire UI
 *   collapses to a generic 404 — same as if the route didn't exist.
 * - Renders a left navigation rail on tablet+ and a horizontal scroller
 *   on mobile. Tapping a section scrolls / pushes to it.
 * - The page itself is rendered as `children` inside the content well.
 */
interface AdminShellProps {
  /** Title in the page header. */
  title: string;
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
];

export function AdminShell({ title, children }: AdminShellProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '/system/console';
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
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[1080px] px-4 pt-4 pb-32 flex flex-col gap-5">
        {/* Header */}
        <header className="flex items-center justify-between">
          <button
            onClick={() => router.push('/profile')}
            aria-label="К профилю"
            className="w-10 h-10 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80"
          >
            <ChevronLeft size={18} strokeWidth={1.8} />
          </button>
          <div className="inline-flex items-center gap-2 min-w-0">
            <Shield size={14} strokeWidth={1.7} />
            <span className="font-roobert text-[14px] uppercase tracking-[0.28em] text-whisper-gray truncate">
              {title}
            </span>
          </div>
          <span className="w-10 h-10" />
        </header>

        {/* Section nav */}
        <nav className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + '/');
            return (
              <button
                key={l.id}
                onClick={() => router.push(l.href)}
                className={cn(
                  'shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill border transition-colors',
                  active
                    ? 'border-white/30 bg-white/[0.06] text-frost-white'
                    : 'border-white/10 bg-white/[0.03] text-frost-white/65 hover:text-frost-white hover:border-white/20'
                )}
              >
                <l.Icon size={13} strokeWidth={1.7} />
                <span className="font-roobert text-[12px]">{l.label}</span>
              </button>
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
