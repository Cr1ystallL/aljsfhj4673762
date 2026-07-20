'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ChevronDown,
  Clock,
  Coins,
  Radio,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { resolveGameKey, gameLabel } from '@/components/ui/game-icon';
import { HelpButton } from '@/components/admin/help-button';
import { cn } from '@/lib/utils';

/**
 * Admin → Dashboard.
 *
 * Read-only summary of the entire casino. Fed by `/api/_x/stats`.
 *
 * Layout:
 *   - 4 KPI tiles (each with `?` help): users, liability, turnover, GGR.
 *   - 14-day GGR timeline (inline SVG, no chart library).
 *   - Biggest single payout ever recorded.
 *   - Per-game breakdown (count, turnover, GGR).
 *   - Top 10 players by turnover.
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
  casinoProfit: number;
  activityGraph: Array<{ hour: string; count: number }>;
  newUsersGraph: Array<{ hour: string; count: number }>;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

  return (
    <>
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
        <div className="flex flex-col gap-5">
          {/* KPI grid */}
          <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Kpi
              icon={<Users size={14} strokeWidth={1.6} />}
              label="Игроки"
              value={data.users.total.toLocaleString('ru-RU')}
              hint={`+${data.users.new24h} за сутки`}
              help={{
                title: 'Аудитория',
                body: (
                  <p>
                    Общее число зарегистрированных игроков. Включает всех,
                    кто хоть раз авторизовался. `За сутки` — прирост
                    новых аккаунтов за последние 24 часа.
                  </p>
                ),
              }}
            />
            <Kpi
              icon={<Wallet size={14} strokeWidth={1.6} />}
              label="Обязательства"
              value={`${formatPln(data.balances.totalLiability)} zł`}
              hint={`${data.balances.accounts} счетов`}
              help={{
                title: 'Обязательства казино',
                body: (
                  <>
                    <p>
                      Сумма реальных балансов всех игроков. Это деньги,
                      которые казино потенциально <strong>должно</strong>{' '}
                      выплатить, если все игроки одновременно решат
                      вывести.
                    </p>
                    <p>
                      Чем больше число — тем больше депозитов осело на
                      счетах. Резкий рост может означать что игроки не
                      выводят выигрыши; резкое падение — много выводов
                      или серия больших проигрышей.
                    </p>
                  </>
                ),
              }}
            />
            <Kpi
              icon={<Coins size={14} strokeWidth={1.6} />}
              label="Оборот"
              value={`${formatPln(data.bets.totalWagered)} zł`}
              hint={`${data.bets.count.toLocaleString('ru-RU')} ставок`}
              help={{
                title: 'Оборот',
                body: (
                  <>
                    <p>
                      Сумма всех ставок за всё время — независимо от
                      того, выиграл игрок или проиграл. Это базовый
                      показатель «активности» казино.
                    </p>
                    <p>
                      Большой оборот при низком GGR = низкая маржа
                      (игроки часто выигрывают). Большой оборот при
                      высоком GGR = здоровая прибыль.
                    </p>
                  </>
                ),
              }}
            />
            <Kpi
              icon={<TrendingUp size={14} strokeWidth={1.6} />}
              label="GGR"
              value={`${formatPln(data.bets.ggr)} zł`}
              accent={data.bets.ggr >= 0 ? 'good' : 'warn'}
              help={{
                title: 'GGR',
                body: (
                  <>
                    <p>
                      <strong>GGR</strong> — Gross Gaming Revenue, или
                      «оборот минус выплаты». Если положительный — казино
                      в прибыли; если отрицательный — в этом периоде
                      казино платит больше чем получает (это нормально
                      на коротких отрезках при больших выигрышах одного
                      игрока).
                    </p>
                  </>
                ),
              }}
            />
            <Kpi
              icon={<Wallet size={14} strokeWidth={1.6} />}
              label="Профит"
              value={`${formatPln(data.casinoProfit)} zł`}
              hint={`Депозиты минус Выводы`}
              accent={data.casinoProfit >= 0 ? 'good' : 'warn'}
              help={{
                title: 'Профит казино',
                body: (
                  <p>
                    Это чистая прибыль проекта. Рассчитывается как:
                    Сумма всех депозитов минус сумма всех выводов.
                    Если значение положительное - проект в плюсе.
                  </p>
                ),
              }}
            />
          </section>

          {/* Live presence — компактная плитка под KPI: число игроков
              онлайн «прямо сейчас» + раскрывающийся список с тем, какую
              именно страницу/игру каждый смотрит. Данные тянет
              отдельно (`/api/_x/presence`) с автообновлением раз в 5с,
              поэтому не нужно дёргать тяжелый /_x/stats чаще. */}
          <LivePresence />

          {/* New beautiful online analytics section */}
          <OnlineAnalyticsSection graph={data.activityGraph} newUsersGraph={data.newUsersGraph} />
          {/* Timeline */}
          <section className="rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <span className="font-roobert text-[10.5px] uppercase tracking-[0.05em] text-whisper-gray">
                GGR · 14 дней
              </span>
              <div className="inline-flex items-center gap-2">
                <span className="font-roobert text-[11px] text-whisper-gray">
                  {data.timeline.length} точек
                </span>
                <HelpButton title="График GGR за 14 дней">
                  <p>
                    Каждый столбик — один день. Высота равна модулю
                    дневного GGR. Зелёно-оранжевые столбики вверх — день
                    в плюс для казино, красные вниз — в минус.
                  </p>
                  <p>
                    Тонкая горизонтальная линия посередине = ноль. Если
                    видите много красных подряд — стоит проверить
                    конкретные раунды и крупные выигрыши.
                  </p>
                </HelpButton>
              </div>
            </div>
            <div className="px-4 py-4">
              <TimelineChart points={data.timeline} />
            </div>
          </section>

          {/* Biggest win */}
          {data.biggestWin && (
            <section className="relative overflow-hidden rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-sm">
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
                  <div className="font-roobert text-[10.5px] uppercase tracking-[0.05em] text-whisper-gray">
                    Крупнейший выигрыш
                  </div>
                  <div className="font-roobert text-[20px] font-light text-frost-white tabular-nums tracking-[-0.02em]">
                    {formatPln(data.biggestWin.payout)} zł
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
              <HelpButton title="Разбивка по играм" size={12}>
                <p>
                  По каждой игре: количество ставок (count), оборот
                  (сумма всех ставок), GGR (оборот минус выплаты),
                  максимальный коэффициент.
                </p>
                <p>
                  Помогает понять какие игры приносят прибыль, какие —
                  слив. Если у игры GGR долго в минусе — проверьте RTP в
                  настройках игры (Фаза 2).
                </p>
              </HelpButton>
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
                          {formatPln(g.wagered)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-roobert text-[11px] uppercase tracking-[0.18em] text-whisper-gray">
                          GGR
                        </div>
                        <div
                          className={`font-roobert text-[14px] tabular-nums ${
                            g.ggr >= 0 ? 'text-frost-white' : 'text-[#ff8a76]'
                          }`}
                        >
                          {formatPln(g.ggr)}
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
                  <a
                    key={p.userId}
                    href={`/system/console/users/${p.userId}`}
                    className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors ${
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
                          className="w-10 h-10 rounded-pill border border-white/10 object-cover"
                          draggable={false}
                        />
                      ) : (
                        <span className="w-10 h-10 rounded-pill border border-white/10 bg-white/[0.04] flex items-center justify-center text-[14px] font-roobert">
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
                        {formatPln(p.wagered)} zł
                      </div>
                      <div
                        className={`font-roobert text-[10px] tabular-nums ${
                          p.ggr >= 0 ? 'text-whisper-gray' : 'text-[#ff8a76]'
                        }`}
                      >
                        GGR {formatPln(p.ggr)}
                      </div>
                    </div>
                  </a>
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
        </div>
      )}
    </>
  );
}

function formatPln(v: number): string {
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
  help,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent?: 'good' | 'warn';
  help?: { title: string; body: React.ReactNode };
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-xl px-4 py-3.5 flex flex-col gap-1.5 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-frost-white/65">
          {icon}
          <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
            {label}
          </span>
        </span>
        {help && (
          <HelpButton title={help.title} size={12}>
            {help.body}
          </HelpButton>
        )}
      </div>
      <div
        className={`font-roobert text-[22px] font-light leading-none tabular-nums tracking-[-0.02em] ${
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

function TimelineChart({ points }: { points: AdminStats['timeline'] }) {
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
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-32">
      <defs>
        <linearGradient id="gtl-pos" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgb(160, 224, 171)" stopOpacity="0.7" />
          <stop offset="100%" stopColor="rgb(255, 172, 46)" stopOpacity="0.4" />
        </linearGradient>
      </defs>
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
          <rect
            key={p.date}
            x={x}
            y={y}
            width={Math.max(1, barWidth - 2)}
            height={heightRaw}
            fill={positive ? 'url(#gtl-pos)' : 'rgba(165, 45, 37, 0.55)'}
            rx={1.5}
          />
        );
      })}
    </svg>
  );
}

type TimeFilter = '6h' | '24h' | '7d' | '30d';

function ActivityChart({ points }: { points: AdminStats['activityGraph'] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const w = 640;
  const h = 140;
  const padX = 0;
  const padY = 14;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const n = points.length;
  
  if (n === 0) {
    return <div className="h-40 flex items-center justify-center text-whisper-gray text-xs">Нет данных за выбранный период</div>;
  }

  const max = Math.max(...points.map((p) => p.count), 1);
  const stepX = n > 1 ? innerW / (n - 1) : innerW;

  const linePath = points.map((p, i) => {
    const x = padX + i * stepX;
    const heightRaw = (p.count / max) * innerH;
    const y = padY + innerH - heightRaw;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const areaPath = n > 1 ? `${linePath} L ${padX + (n - 1) * stepX} ${padY + innerH} L ${padX} ${padY + innerH} Z` : linePath;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const index = Math.round(percent * (n - 1));
    setHoverIndex(index);
  };

  const handleMouseLeave = () => setHoverIndex(null);

  // Helper for X axis labels
  const formatHour = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };
  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  };

  const hoveredPoint = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div className="relative">
      <div 
        className="relative w-full h-32 cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
          <defs>
            <linearGradient id="act-pos" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgb(168, 85, 247)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="rgb(99, 102, 241)" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <line
            x1={padX}
            x2={w - padX}
            y1={padY + innerH}
            y2={padY + innerH}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
          />
          {n > 1 && <path d={areaPath} fill="url(#act-pos)" />}
          <path d={linePath} fill="none" stroke="rgb(168, 85, 247)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* Hover overlay */ }
        {hoveredPoint && hoverIndex !== null && (
          <>
            <div 
              className="absolute top-0 bottom-0 w-px bg-white/30 pointer-events-none"
              style={{ left: `${(hoverIndex / Math.max(n - 1, 1)) * 100}%` }}
            />
            <div 
              className="absolute top-2 -translate-x-1/2 bg-black/80 backdrop-blur-md border border-white/10 rounded-md px-3 py-2 pointer-events-none shadow-xl z-10 flex flex-col items-center min-w-max"
              style={{ left: `${(hoverIndex / Math.max(n - 1, 1)) * 100}%` }}
            >
              <span className="text-[10px] uppercase tracking-wider text-whisper-gray mb-1">
                {formatDate(hoveredPoint.hour)} {formatHour(hoveredPoint.hour)}
              </span>
              <span className="text-sm font-bold text-white flex items-center gap-1.5">
                <Users size={12} className="text-purple-400" />
                {hoveredPoint.count} чел.
              </span>
            </div>
            <div 
              className="absolute w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.8)] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ 
                left: `${(hoverIndex / Math.max(n - 1, 1)) * 100}%`,
                top: `${(padY + innerH - (hoveredPoint.count / max) * innerH) / h * 100}%`
              }}
            />
          </>
        )}
      </div>
      
      {/* X Axis Labels */}
      <div className="flex justify-between items-center mt-2 text-[10px] text-white/40 px-1 select-none">
        {n > 0 && <span>{formatDate(points[0].hour)} {formatHour(points[0].hour)}</span>}
        {n > 2 && <span>{formatDate(points[Math.floor(n/2)].hour)} {formatHour(points[Math.floor(n/2)].hour)}</span>}
        {n > 1 && <span>{formatDate(points[n - 1].hour)} {formatHour(points[n - 1].hour)}</span>}
      </div>
    </div>
  );
}

function OnlineAnalyticsSection({ graph, newUsersGraph }: { graph: AdminStats['activityGraph'], newUsersGraph: AdminStats['newUsersGraph'] }) {
  const [filter, setFilter] = useState<TimeFilter>('24h');

  const filterPoints = (points: Array<{hour: string, count: number}>, period: TimeFilter) => {
    const hours = period === '6h' ? 6 : period === '24h' ? 24 : period === '7d' ? 168 : 720;
    return points.slice(-hours);
  };

  const filteredGraph = useMemo(() => filterPoints(graph, filter), [graph, filter]);
  const filteredNewUsers = useMemo(() => filterPoints(newUsersGraph, filter), [newUsersGraph, filter]);

  const maxOnline = Math.max(...filteredGraph.map(p => p.count), 0);
  const currentOnline = graph.length > 0 ? graph[graph.length - 1].count : 0;
  const totalNewUsers = filteredNewUsers.reduce((sum, p) => sum + p.count, 0);

  // Active time logic
  const timeBuckets = { 'Утро (06-12)': 0, 'День (12-18)': 0, 'Вечер (18-00)': 0, 'Ночь (00-06)': 0 };
  const timeCounts = { 'Утро (06-12)': 0, 'День (12-18)': 0, 'Вечер (18-00)': 0, 'Ночь (00-06)': 0 };
  
  filteredGraph.forEach(p => {
    const h = new Date(p.hour).getHours();
    let bucket: keyof typeof timeBuckets = 'Ночь (00-06)';
    if (h >= 6 && h < 12) bucket = 'Утро (06-12)';
    else if (h >= 12 && h < 18) bucket = 'День (12-18)';
    else if (h >= 18) bucket = 'Вечер (18-00)';
    
    timeBuckets[bucket] += p.count;
    timeCounts[bucket] += 1;
  });

  let bestTime = 'Неизвестно';
  let bestAvg = -1;
  for (const [bucket, total] of Object.entries(timeBuckets)) {
     const count = timeCounts[bucket as keyof typeof timeCounts];
     const avg = count > 0 ? total / count : 0;
     if (avg > bestAvg && count > 0) {
       bestAvg = avg;
       bestTime = bucket.split(' ')[0]; // Только слово "Утро", "День", "Вечер", "Ночь"
     }
  }

  return (
    <section className="mt-8 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold font-roobert text-white flex items-center gap-2">
          <Activity size={20} className="text-purple-400" />
          Аналитика онлайна
        </h2>
        <div className="flex bg-white/5 rounded-md p-1 border border-white/10">
          {(['6h', '24h', '7d', '30d'] as TimeFilter[]).map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                filter === t ? "bg-purple-500/20 text-purple-300" : "text-whisper-gray hover:text-white"
              )}
            >
              {t === '6h' ? '6 ч' : t === '24h' ? '24 ч' : t === '7d' ? '7 дн' : '30 дн'}
            </button>
          ))}
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi
          icon={<Zap size={14} strokeWidth={1.6} />}
          label="Сейчас онлайн"
          value={currentOnline.toLocaleString('ru-RU')}
          hint="Активные за последний час"
          help={{ title: 'Текущая активность', body: <p>Количество уникальных игроков в текущем часе.</p> }}
        />
        <Kpi
          icon={<TrendingUp size={14} strokeWidth={1.6} />}
          label="Пиковый онлайн"
          value={maxOnline.toLocaleString('ru-RU')}
          hint={filter === '6h' ? 'За последние 6ч' : filter === '24h' ? 'За сутки' : filter === '7d' ? 'За неделю' : 'За месяц'}
          help={{ title: 'Пик', body: <p>Самое активное время за выбранный период.</p> }}
        />
        <Kpi
          icon={<Clock size={14} strokeWidth={1.6} />}
          label="Активное время"
          value={bestTime}
          hint={filter === '6h' ? 'За последние 6ч' : filter === '24h' ? 'За сутки' : filter === '7d' ? 'За неделю' : 'За месяц'}
          help={{ title: 'Активное время', body: <p>Время суток, когда в среднем больше всего игроков онлайн.</p> }}
        />
        <Kpi
          icon={<Users size={14} strokeWidth={1.6} />}
          label="Новых игроков"
          value={totalNewUsers.toLocaleString('ru-RU')}
          hint={filter === '6h' ? 'За последние 6ч' : filter === '24h' ? 'За сутки' : filter === '7d' ? 'За неделю' : 'За месяц'}
          help={{ title: 'Новые игроки', body: <p>Общее число регистраций за выбранный период.</p> }}
        />
      </div>
      <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <span className="font-roobert text-[10px] uppercase tracking-[0.28em] text-whisper-gray">
            Динамика уникальных игроков
          </span>
        </div>
        <div className="px-4 py-4">
          <ActivityChart points={filteredGraph} />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Live presence widget                                                       */
/* -------------------------------------------------------------------------- */

interface PresenceUser {
  userId: string;
  name: string;
  username: string | null;
  photoUrl: string | null;
  telegramId: number | null;
  pathname: string;
  ts: number;
}

interface PresenceResponse {
  ok: true;
  count: number;
  users: PresenceUser[];
  pages: Array<{ pathname: string; count: number }>;
}

/**
 * Карточка «Сейчас в мини-аппе».
 *
 * Сворачивается/разворачивается тапом по шапке. В свёрнутом виде —
 * только большой счётчик и подсказка по топ-страницам. В раскрытом —
 * список игроков с аватарами и текущей страницей. Список ужат до 50
 * человек: больше — это уже не оперативная задача, а аналитика, и
 * для неё лучше отдельный отчёт.
 */
function LivePresence() {
  const [data, setData] = useState<PresenceResponse | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/_x/presence', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const j = (await res.json()) as PresenceResponse;
      setData(j);
    } catch {
      // тихо игнорируем — следующий тик всё перепроверит
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 5_000);
    return () => clearInterval(id);
  }, [load]);

  const top = useMemo(() => (data?.pages ?? []).slice(0, 3), [data]);
  const sorted = useMemo(
    () => (data?.users ?? []).slice(0, 50),
    [data]
  );

  return (
    <section className="rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-xl overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 active:scale-[0.98] transition-transform"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="relative inline-flex items-center justify-center w-9 h-9 rounded-pill border border-[#a0e0ab]/40 bg-[#a0e0ab]/10 text-[#a0e0ab] shrink-0">
            <Radio size={14} strokeWidth={1.7} />
            {/* живая зелёная точка-«пульс» — намёк, что данные real-time */}
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#a0e0ab] animate-pulse"
            />
          </span>
          <div className="min-w-0">
            <div className="font-roobert text-[10.5px] uppercase tracking-[0.05em] text-whisper-gray">
              Сейчас в мини-аппе
            </div>
            <div className="mt-0.5 font-roobert text-frost-white text-[20px] font-light leading-none tabular-nums tracking-[-0.02em]">
              {data ? data.count : '—'}
              {data && (
                <span className="ml-1.5 text-whisper-gray text-[11px] tabular-nums">
                  игрок{plural(data.count)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {top.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5">
              {top.map((p) => (
                <span
                  key={p.pathname}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill border border-white/10 bg-white/[0.03] font-roobert text-[10px] text-frost-white/85"
                  title={p.pathname}
                >
                  <span className="text-whisper-gray">
                    {prettyPath(p.pathname)}
                  </span>
                  <span className="tabular-nums text-frost-white">{p.count}</span>
                </span>
              ))}
            </div>
          )}
          <ChevronDown
            size={14}
            strokeWidth={1.8}
            className={cn(
              'text-frost-white/60 transition-transform',
              open && 'rotate-180'
            )}
          />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
            className="overflow-hidden"
          >
            {sorted.length === 0 ? (
              <div className="px-4 py-6 text-center font-roobert text-[12px] text-whisper-gray border-t border-white/10">
                Никто не в мини-аппе прямо сейчас.
              </div>
            ) : (
              <ul className="divide-y divide-white/5 border-t border-white/10">
                {sorted.map((u) => (
                  <li
                    key={u.userId}
                    className="px-4 py-2.5 grid grid-cols-[auto_1fr_auto] items-center gap-3"
                  >
                    {u.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={u.photoUrl}
                        alt={u.name}
                        referrerPolicy="no-referrer"
                        draggable={false}
                        className="w-16 h-16 rounded-pill border border-white/10 object-cover"
                      />
                    ) : (
                      <span className="w-16 h-16 rounded-pill border border-white/10 bg-white/[0.04] flex items-center justify-center font-roobert text-[24px]">
                        {u.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="font-roobert text-[13px] text-frost-white truncate">
                        {u.name}
                      </div>
                      <div className="font-roobert text-[10.5px] text-whisper-gray truncate tabular-nums">
                        {u.telegramId ? `#${u.telegramId}` : ''}
                        {u.username ? ` · @${u.username}` : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-roobert text-[11px] text-frost-white truncate max-w-[180px]">
                        {prettyPath(u.pathname)}
                      </div>
                      <div className="font-roobert text-[10px] text-whisper-gray tabular-nums">
                        {ageLabel(u.ts)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/**
 * Превращает технический pathname в человекочитаемое название экрана —
 * админу удобнее видеть «MacvJet» чем «/game/crash» в строке отчёта.
 * Маппинг расширяется по мере появления новых страниц.
 */
function prettyPath(p: string): string {
  if (p === '/' || p === '') return 'Главная';
  if (p === '/balance') return 'Кошелёк';
  if (p === '/profile') return 'Профиль';
  if (p === '/bonuses') return 'Бонусы';
  if (p === '/partner') return 'Партнёрка';
  if (p.startsWith('/game/')) {
    const slug = p.split('/')[2] ?? '';
    if (slug === 'crash') return 'Игра · MacvJet';
    if (slug === 'mines') return 'Игра · Mines';
    if (slug === 'plinko') return 'Игра · Plinko';
    if (slug === 'coinflip') return 'Игра · Coinflip';
    if (slug === 'wheel') return 'Игра · Wheel';
    if (slug === 'bridges') return 'Игра · Bridges';
    return `Игра · ${slug}`;
  }
  if (p === '/system/console') return 'Админка · Сводка';
  if (p === '/system/console/users') return 'Админка · Игроки';
  if (p === '/system/console/users/:id') return 'Админка · Карточка';
  if (p === '/system/console/deposits') return 'Админка · Депозиты';
  if (p === '/system/console/withdrawals') return 'Админка · Вывод';
  if (p === '/system/console/bonuses') return 'Админка · Бонусы';
  if (p === '/system/console/games') return 'Админка · Игры';
  if (p === '/system/console/audit') return 'Админка · Аудит';
  return p;
}

function ageLabel(ts: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 5) return 'только что';
  if (sec < 60) return `${sec}с назад`;
  const min = Math.floor(sec / 60);
  return `${min}м назад`;
}

function plural(n: number): string {
  // «1 игрок», «2 игрока», «5 игроков» — без полноценной библиотеки
  // склонения, но достаточно для одной цифры онлайна.
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return 'ов';
  if (b > 1 && b < 5) return 'а';
  if (b === 1) return '';
  return 'ов';
}
