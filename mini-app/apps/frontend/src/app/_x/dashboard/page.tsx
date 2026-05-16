'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  Shield,
  Users,
  Wallet,
  Coins,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { checkIsAdmin } from '@/lib/admin-probe';
import { resolveGameKey, gameLabel } from '@/components/ui/game-icon';

/**
 * Admin Dashboard — covert.
 *
 * The page is gated client-side by an early `checkIsAdmin()` probe and
 * server-side by every endpoint it consumes (the `/api/_x/...` routes
 * return 404 for non-admins). If a non-admin somehow lands here — e.g.
 * by guessing the URL — they see a flat 404 placeholder rather than any
 * hint that admin functionality exists.
 *
 * Layout:
 *   - Top bar: title + back arrow.
 *   - KPI tiles: users, GGR, total liability, biggest win.
 *   - Timeline chart: 14-day GGR (SVG, no library).
 *   - Per-game table: count, wagered, paid out, GGR, max mult.
 *   - Top players: top 10 by total wagered.
 */

interface AdminStats {
  generatedAt: number;
  users: { total: number; new24h: number; new7d: number };
  balances: {
    totalLiability: number;
    totalDemo: number;
    accounts: number;
    demoAccounts: number;
  };
  bets: {
    count: number;
    totalWagered: number;
    totalPaidOut: number;
    ggr: number;
    rtp: number;
  };
  perGame: Array<{
    gameType: string;
    count: number;
    wagered: number;
    paidOut: number;
    ggr: number;
    maxMultiplier: number;
  }>;
  topPlayers: Array<{
    userId: string;
    name: string;
    photoUrl: string | null;
    telegramId: number | null;
    bets: number;
    wagered: number;
    paidOut: number;
    ggr: number;
  }>;
  timeline: Array<{
    date: string;
    bets: number;
    wagered: number;
    paidOut: number;
    ggr: number;
  }>;
  biggestWin: {
    payout: number;
    multiplier: number;
    gameType: string;
    placedAt: number;
    name: string;
  } | null;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [authorised, setAuthorised] = useState<boolean | null>(null);
  const [data, setData] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Gate the entire page behind the probe. While the probe is in flight
  // we render nothing — visiting non-admins see the same blank as a 404.
  useEffect(() => {
    let cancelled = false;
    void checkIsAdmin().then((ok) => {
      if (cancelled) return;
      setAuthorised(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authorised !== true) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/_x/stats', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) {
          if (!cancelled) setError('not-found');
          return;
        }
        const json = (await res.json()) as AdminStats;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError('not-found');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authorised]);

  // Render nothing for non-admins — same outward effect as a 404.
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
      <div className="mx-auto w-full max-w-[640px] px-4 pt-4 pb-32 flex flex-col gap-5">
        {/* Top bar */}
        <header className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            aria-label="Назад"
            className="w-10 h-10 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80"
          >
            <ChevronLeft size={18} strokeWidth={1.8} />
          </button>
          <div className="inline-flex items-center gap-2">
            <Shield size={14} strokeWidth={1.7} />
            <span className="font-roobert text-[14px] uppercase tracking-[0.28em] text-whisper-gray">
              Админ
            </span>
          </div>
          <span className="w-10 h-10" />
        </header>

        {error && (
          <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-4 text-center font-roobert text-[12px] text-whisper-gray">
            Не удалось загрузить статистику.
          </div>
        )}

        {!data && !error && (
          <div className="rounded-card border border-white/10 bg-white/[0.03] py-16 flex items-center justify-center">
            <div className="w-7 h-7 rounded-full border border-white/20 border-t-frost-white animate-spin" />
          </div>
        )}

        {data && (
          <>
            {/* KPI grid */}
            <section className="grid grid-cols-2 gap-3">
              <Kpi
                icon={<Users size={14} strokeWidth={1.6} />}
                label="Игроки"
                value={data.users.total.toLocaleString('ru-RU')}
                hint={`+${data.users.new24h} за 24ч · +${data.users.new7d} за неделю`}
              />
              <Kpi
                icon={<Wallet size={14} strokeWidth={1.6} />}
                label="Обязательства"
                value={`${formatRub(data.balances.totalLiability)} ₽`}
                hint={`${data.balances.accounts} счетов`}
              />
              <Kpi
                icon={<Coins size={14} strokeWidth={1.6} />}
                label="Оборот"
                value={`${formatRub(data.bets.totalWagered)} ₽`}
                hint={`${data.bets.count.toLocaleString('ru-RU')} ставок`}
              />
              <Kpi
                icon={<TrendingUp size={14} strokeWidth={1.6} />}
                label="GGR"
                value={`${formatRub(data.bets.ggr)} ₽`}
                hint={`RTP ${(data.bets.rtp * 100).toFixed(2)}%`}
                accent={data.bets.ggr >= 0 ? 'good' : 'warn'}
              />
            </section>

            {/* Timeline */}
            <section className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <span className="font-roobert text-[10px] uppercase tracking-[0.28em] text-whisper-gray">
                  GGR · 14 дней
                </span>
                <span className="font-roobert text-[11px] text-whisper-gray">
                  {data.timeline.length} точек
                </span>
              </div>
              <div className="px-4 py-4">
                <TimelineChart points={data.timeline} />
              </div>
            </section>

            {/* Biggest win */}
            {data.biggestWin && (
              <section className="relative overflow-hidden rounded-card border border-white/10 bg-white/[0.03]">
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-50"
                  style={{
                    background:
                      'radial-gradient(120% 110% at 80% 110%, rgba(255, 172, 46, 0.20) 0%, rgba(160, 224, 171, 0.10) 50%, transparent 80%)',
                  }}
                />
                <div className="relative px-5 py-4 flex items-center gap-4">
                  <span className="w-10 h-10 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center">
                    <Sparkles size={16} strokeWidth={1.6} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-roobert text-[10px] uppercase tracking-[0.28em] text-whisper-gray">
                      Крупнейший выигрыш
                    </div>
                    <div className="font-roobert text-[20px] font-light text-frost-white tabular-nums">
                      {formatRub(data.biggestWin.payout)} ₽
                      <span className="ml-2 text-whisper-gray text-[14px]">
                        x{data.biggestWin.multiplier.toFixed(2)}
                      </span>
                    </div>
                    <div className="font-roobert text-[11px] text-whisper-gray truncate">
                      {data.biggestWin.name} ·{' '}
                      {gameLabel(resolveGameKey(data.biggestWin.gameType))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Per-game */}
            <section>
              <div className="flex items-baseline justify-between px-1 mb-2">
                <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
                  Игры
                </span>
              </div>
              <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
                {data.perGame.length === 0 ? (
                  <div className="px-5 py-6 text-center font-roobert text-[12px] text-whisper-gray">
                    Нет данных.
                  </div>
                ) : (
                  data.perGame
                    .slice()
                    .sort((a, b) => b.wagered - a.wagered)
                    .map((g, i) => (
                      <div
                        key={g.gameType}
                        className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3 ${
                          i > 0 ? 'border-t border-white/5' : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-roobert text-[14px] text-frost-white">
                            {gameLabel(resolveGameKey(g.gameType))}
                          </div>
                          <div className="font-roobert text-[11px] text-whisper-gray tabular-nums">
                            {g.count.toLocaleString('ru-RU')} ставок · max
                            x{g.maxMultiplier.toFixed(2)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-roobert text-[11px] uppercase tracking-[0.18em] text-whisper-gray">
                            Оборот
                          </div>
                          <div className="font-roobert text-[14px] tabular-nums">
                            {formatRub(g.wagered)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-roobert text-[11px] uppercase tracking-[0.18em] text-whisper-gray">
                            GGR
                          </div>
                          <div
                            className={`font-roobert text-[14px] tabular-nums ${
                              g.ggr >= 0
                                ? 'text-frost-white'
                                : 'text-[#ff8a76]'
                            }`}
                          >
                            {formatRub(g.ggr)}
                          </div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </section>

            {/* Top players */}
            <section>
              <div className="flex items-baseline justify-between px-1 mb-2">
                <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
                  Топ игроков
                </span>
                <span className="font-roobert text-[11px] text-whisper-gray">
                  по обороту
                </span>
              </div>
              <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
                {data.topPlayers.length === 0 ? (
                  <div className="px-5 py-6 text-center font-roobert text-[12px] text-whisper-gray">
                    Нет данных.
                  </div>
                ) : (
                  data.topPlayers.map((p, i) => (
                    <div
                      key={p.userId}
                      className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 ${
                        i > 0 ? 'border-t border-white/5' : ''
                      }`}
                    >
                      <span className="w-6 text-right font-roobert text-[12px] text-whisper-gray tabular-nums">
                        {i + 1}
                      </span>
                      <div className="flex items-center gap-3 min-w-0">
                        {p.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.photoUrl}
                            alt={p.name}
                            referrerPolicy="no-referrer"
                            className="w-8 h-8 rounded-pill border border-white/10 object-cover"
                            draggable={false}
                          />
                        ) : (
                          <span className="w-8 h-8 rounded-pill border border-white/10 bg-white/[0.04] flex items-center justify-center text-[12px] font-roobert">
                            {p.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0">
                          <div className="font-roobert text-[13px] text-frost-white truncate">
                            {p.name}
                          </div>
                          <div className="font-roobert text-[10px] text-whisper-gray tabular-nums">
                            {p.bets.toLocaleString('ru-RU')} ставок
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-roobert text-[13px] tabular-nums text-frost-white">
                          {formatRub(p.wagered)} ₽
                        </div>
                        <div
                          className={`font-roobert text-[10px] tabular-nums ${
                            p.ggr >= 0 ? 'text-whisper-gray' : 'text-[#ff8a76]'
                          }`}
                        >
                          GGR {formatRub(p.ggr)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <div className="text-center font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
              обновлено{' '}
              {new Date(data.generatedAt).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function formatRub(v: number): string {
  return v.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function Kpi({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent?: 'good' | 'warn';
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-card border border-white/10 bg-white/[0.03] px-4 py-3.5 flex flex-col gap-1.5"
    >
      <span className="inline-flex items-center gap-1.5 text-frost-white/65">
        {icon}
        <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
          {label}
        </span>
      </span>
      <div
        className={`font-roobert text-[22px] font-light leading-none tabular-nums ${
          accent === 'warn'
            ? 'text-[#ff8a76]'
            : accent === 'good'
            ? 'text-frost-white'
            : 'text-frost-white'
        }`}
      >
        {value}
      </div>
      {hint && (
        <div className="font-roobert text-[11px] text-whisper-gray tabular-nums">
          {hint}
        </div>
      )}
    </motion.div>
  );
}

/**
 * Lightweight inline timeline chart. Avoids a chart library so the
 * admin bundle stays small. Renders a 14-bar GGR series on a tinted
 * baseline; bars below 0 paint red, above 0 paint frost-white over a
 * Deep-Ocean tint.
 */
function TimelineChart({
  points,
}: {
  points: AdminStats['timeline'];
}) {
  const w = 640;
  const h = 140;
  const padX = 8;
  const padY = 14;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const n = points.length;
  if (n === 0) return null;

  const max = Math.max(...points.map((p) => Math.abs(p.ggr)), 1);
  const barWidth = innerW / n;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full h-32"
    >
      <defs>
        <linearGradient id="gtl-pos" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgb(160, 224, 171)" stopOpacity="0.7" />
          <stop offset="100%" stopColor="rgb(255, 172, 46)" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      {/* Zero baseline */}
      <line
        x1={padX}
        x2={w - padX}
        y1={padY + innerH / 2}
        y2={padY + innerH / 2}
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
      />
      {points.map((p, i) => {
        const x = padX + i * barWidth + 1;
        const half = innerH / 2;
        const value = p.ggr;
        const heightRaw = (Math.abs(value) / max) * half;
        const y = value >= 0 ? padY + half - heightRaw : padY + half;
        const positive = value >= 0;
        return (
          <g key={p.date}>
            <rect
              x={x}
              y={y}
              width={Math.max(1, barWidth - 2)}
              height={heightRaw}
              fill={positive ? 'url(#gtl-pos)' : 'rgba(165, 45, 37, 0.55)'}
              rx={1.5}
            />
          </g>
        );
      })}
    </svg>
  );
}
