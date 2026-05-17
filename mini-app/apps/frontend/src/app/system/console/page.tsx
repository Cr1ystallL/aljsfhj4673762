'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Coins, Sparkles, TrendingUp, Users, Wallet } from 'lucide-react';
import { resolveGameKey, gameLabel } from '@/components/ui/game-icon';
import { HelpButton } from '@/components/admin/help-button';

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
          <section className="grid grid-cols-2 gap-3">
            <Kpi
              icon={<Users size={14} strokeWidth={1.6} />}
              label="Игроки"
              value={data.users.total.toLocaleString('ru-RU')}
              hint={`+${data.users.new24h} за 24ч · +${data.users.new7d} за неделю`}
              help={{
                title: 'Игроки',
                body: (
                  <>
                    <p>
                      Общее количество зарегистрированных пользователей —
                      все, кто хоть раз открыл мини-приложение и прошёл
                      Telegram-аутентификацию.
                    </p>
                    <p>
                      Подсказка снизу показывает прирост за 24 часа и
                      неделю — это маркер активности привлечения и
                      возвращающихся игроков.
                    </p>
                  </>
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
              hint={`RTP ${(data.bets.rtp * 100).toFixed(2)}%`}
              accent={data.bets.ggr >= 0 ? 'good' : 'warn'}
              help={{
                title: 'GGR и RTP',
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
                    <p>
                      <strong>RTP</strong> — Return To Player, процент
                      выплат от ставок (=выплаты ÷ ставки). Целевое
                      значение по нашей конфигурации ~99%, на длинной
                      дистанции ровно столько и должно быть.
                    </p>
                  </>
                ),
              }}
            />
          </section>

          {/* Timeline */}
          <section className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <span className="font-roobert text-[10px] uppercase tracking-[0.28em] text-whisper-gray">
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
                          className="w-14 h-14 rounded-pill border border-white/10 object-cover"
                          draggable={false}
                        />
                      ) : (
                        <span className="w-14 h-14 rounded-pill border border-white/10 bg-white/[0.04] flex items-center justify-center text-[18px] font-roobert">
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
      className="rounded-card border border-white/10 bg-white/[0.03] px-4 py-3.5 flex flex-col gap-1.5"
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
