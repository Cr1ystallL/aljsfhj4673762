'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
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
  ShieldAlert,
  ExternalLink,
  Search,
  Shield,
  Trophy,
  Gift,
  X,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  UserCheck,
  ArrowRight,
  Info,
} from 'lucide-react';
import { resolveGameKey, gameLabel } from '@/components/ui/game-icon';
import { HelpButton } from '@/components/admin/help-button';
import { cn } from '@/lib/utils';
import { WorldGeoMap } from './WorldGeoMap';

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
  geoStats?: import('./WorldGeoMap').CountryGeoData[];
  users: { total: number; new24h: number; new7d: number };
  balances: {
    totalLiability: number;
    totalDemo: number;
    accounts: number;
    demoAccounts: number;
    real?: {
      amount: number;
      accounts: number;
      immediateAmount: number;
      immediateAccounts: number;
    };
    potential?: {
      amount: number;
      accounts: number;
      breakdown: {
        noDepositAccounts: number;
        noDepositAmount: number;
        needDepositAccounts: number;
        needDepositAmount: number;
        needWagerAccounts: number;
        needWagerAmount: number;
        blockedAccounts: number;
        blockedAmount: number;
      };
      economics: {
        requiredDeposits: number;
        requiredTurnover: number;
        expectedWagerProfit: number;
        netCasinoProfit: number;
        profitMultiplier: number;
      };
    };
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
  depositsTotal?: number;
  withdrawalsTotal?: number;
  activityGraph: Array<{ hour: string; count: number }>;
  newUsersGraph: Array<{ hour: string; count: number }>;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dormantModalOpen, setDormantModalOpen] = useState(false);
  const [liabilitiesModalOpen, setLiabilitiesModalOpen] = useState(false);

  const reloadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/_x/stats', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        setError('not-found');
        return;
      }
      const json = (await res.json()) as AdminStats;
      setData(json);
      setError(null);
    } catch {
      setError('not-found');
    }
  }, []);

  useEffect(() => {
    void reloadStats();
    const id = setInterval(() => void reloadStats(), 15_000);
    return () => clearInterval(id);
  }, [reloadStats]);

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
            <LiabilitiesKpi
              balances={data.balances}
              onOpenAnalysis={() => setLiabilitiesModalOpen(true)}
              onOpenReset={() => setDormantModalOpen(true)}
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
              value={`${data.casinoProfit > 0 ? '+' : ''}${formatPln(data.casinoProfit)} zł`}
              hint={
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <span className="text-[#a0e0ab] font-medium">
                    Деп: +{formatPln(Math.abs(data.depositsTotal ?? 0))} zł
                  </span>
                  <span className="text-white/20">·</span>
                  <span className="text-[#ff8a76] font-medium">
                    Выв: -{formatPln(Math.abs(data.withdrawalsTotal ?? 0))} zł
                  </span>
                </span>
              }
              accent={data.casinoProfit >= 0 ? 'good' : 'warn'}
              help={{
                title: 'Профит казино',
                body: (
                  <>
                    <p>
                      Чистая прибыль проекта. Рассчитывается как сумма всех депозитов минус сумма всех выводов.
                    </p>
                    <div className="mt-2.5 space-y-1.5 font-roobert text-[11.5px]">
                      <div className="text-[#a0e0ab] flex justify-between">
                        <span>Депозиты:</span>
                        <span className="tabular-nums font-medium">+{formatPln(Math.abs(data.depositsTotal ?? 0))} zł</span>
                      </div>
                      <div className="text-[#ff8a76] flex justify-between">
                        <span>Выводы:</span>
                        <span className="tabular-nums font-medium">-{formatPln(Math.abs(data.withdrawalsTotal ?? 0))} zł</span>
                      </div>
                      <div className="border-t border-white/10 pt-1.5 mt-1.5 flex justify-between font-medium">
                        <span>Итоговый профит:</span>
                        <span className={`tabular-nums ${data.casinoProfit >= 0 ? 'text-[#a0e0ab]' : 'text-[#ff8a76]'}`}>
                          {data.casinoProfit > 0 ? '+' : ''}{formatPln(data.casinoProfit)} zł
                        </span>
                      </div>
                    </div>
                  </>
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
          {/* World Geo Map analytics section */}
          <WorldGeoMap serverGeoStats={data.geoStats} />

          {/* Biggest win */}
          {data.biggestWin && (
            <section className="relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.03] backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
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
                  .filter((g) => resolveGameKey(g.gameType) !== 'unknown')
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

      <ResetDormantBalancesModal
        isOpen={dormantModalOpen}
        onClose={() => setDormantModalOpen(false)}
        onSuccess={reloadStats}
      />
      {data && (
        <LiabilitiesDetailModal
          isOpen={liabilitiesModalOpen}
          onClose={() => setLiabilitiesModalOpen(false)}
          onOpenReset={() => {
            setLiabilitiesModalOpen(false);
            setDormantModalOpen(true);
          }}
          balances={data.balances}
        />
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

function LiabilitiesKpi({
  balances,
  onOpenAnalysis,
  onOpenReset,
}: {
  balances: AdminStats['balances'];
  onOpenAnalysis: () => void;
  onOpenReset: () => void;
}) {
  const real = balances.real;
  const readyAmount = real?.amount ?? real?.immediateAmount ?? balances.totalLiability;
  const readyAccounts = real?.accounts ?? real?.immediateAccounts ?? balances.accounts;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[24px] border border-white/10 bg-white/[0.03] backdrop-blur-3xl p-5 flex flex-col justify-between gap-2 shadow-[0_8px_32px_rgba(0,0,0,0.12)] relative overflow-hidden"
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-frost-white/65">
          <Wallet size={14} strokeWidth={1.6} />
          <span className="font-roobert text-[10.5px] uppercase tracking-[0.05em] text-whisper-gray">
            Обязательства
          </span>
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenAnalysis}
            className="px-2 py-0.5 rounded-pill bg-white/5 hover:bg-white/10 text-frost-white/85 border border-white/10 text-[10px] font-roobert font-medium transition-all flex items-center gap-1 active:scale-95"
            title="Открыть детальный анализ обязательств и экономики"
          >
            <TrendingUp size={10} className="text-[#a0e0ab]" />
            Анализ
          </button>
          <button
            type="button"
            onClick={onOpenReset}
            className="px-2 py-0.5 rounded-pill bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[10px] font-roobert font-medium transition-all active:scale-95"
            title="Обнулить балансы неактивных (>30 дней) и заблокированных игроков"
          >
            Очистить
          </button>
          <HelpButton title="Обязательства (к выводу)" size={12}>
            <p>
              Сумма реальных балансов игроков, которые выполнили все условия для вывода (депозит от 100 zł за последние 30 дней, 100% отыгрыш вейджера, нет блокировок, баланс от 50 zł) и могут вывести деньги прямо сейчас без ограничений.
            </p>
          </HelpButton>
        </div>
      </div>

      <div
        className="font-roobert text-[22px] font-light leading-none tabular-nums tracking-[-0.02em] text-frost-white cursor-pointer hover:text-emerald-300 transition-colors"
        onClick={onOpenAnalysis}
        title="Нажмите для подробного финансового отчета"
      >
        {formatPln(readyAmount)} zł
      </div>

      <div className="flex items-center justify-between gap-1 font-roobert text-[11px] text-whisper-gray tabular-nums">
        <span>
          {readyAccounts} {readyAccounts === 1 ? 'счёт готов' : readyAccounts >= 2 && readyAccounts <= 4 ? 'счёта готовы' : 'счетов готовы'} к выводу
        </span>
        <button
          type="button"
          onClick={onOpenAnalysis}
          className="text-[10.5px] text-[#a0e0ab] hover:underline flex items-center gap-0.5"
        >
          детали &rarr;
        </button>
      </div>
    </motion.div>
  );
}

function LiabilitiesDetailModal({
  isOpen,
  onClose,
  onOpenReset,
  balances,
}: {
  isOpen: boolean;
  onClose: () => void;
  onOpenReset: () => void;
  balances: AdminStats['balances'];
}) {
  if (!isOpen) return null;

  const real = balances.real;
  const potential = balances.potential;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-[#0d1117] p-6 sm:p-7 shadow-2xl relative my-auto max-h-[92vh] overflow-y-auto"
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-pill bg-white/5 hover:bg-white/10 flex items-center justify-center text-whisper-gray hover:text-frost-white transition-colors z-10"
        >
          <X size={16} />
        </button>

        {/* Шапка модального окна */}
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-12 h-12 rounded-pill bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shrink-0">
            <Wallet size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-roobert text-[18px] text-frost-white font-medium">
                Аналитика обязательств платформы
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#a0e0ab]/10 text-[#a0e0ab] border border-[#a0e0ab]/25">
                SMART AUDIT
              </span>
            </div>
            <p className="font-roobert text-[12.5px] text-whisper-gray mt-0.5">
              Разделение балансов на гарантированные к выводу и условные (бонусные/неотыгранные)
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* Сравнительные карточки: Реальные vs Потенциальные */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Реальные */}
            <div className="p-4 rounded-[20px] bg-emerald-500/[0.04] border border-emerald-500/25 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-roobert text-[11px] uppercase tracking-wider text-emerald-400 font-medium">
                    Реальные обязательства
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-medium">
                    К выводу
                  </span>
                </div>
                <div className="mt-2 font-roobert text-[24px] font-medium text-frost-white tabular-nums">
                  {formatPln(real?.amount ?? balances.totalLiability)} zł
                </div>
                <div className="text-[11.5px] font-roobert text-whisper-gray mt-0.5 tabular-nums">
                  {real?.accounts ?? 0} счетов готовы к выводу прямо сейчас
                </div>
              </div>

              <div className="space-y-1 text-[11px] font-roobert text-frost-white/70 pt-2 border-t border-emerald-500/15">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                  <span>Депозит ≥ 100 zł и свежее 30 дней</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                  <span>Вейджер полностью отыгран (100%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                  <span>Аккаунт не имеет блокировок</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                  <span>Баланс ≥ 50 zł (минимум для заявки)</span>
                </div>
              </div>
            </div>

            {/* Потенциальные */}
            <div className="p-4 rounded-[20px] bg-amber-500/[0.04] border border-amber-500/25 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-roobert text-[11px] uppercase tracking-wider text-amber-300 font-medium">
                    Потенциальные балансы
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-medium">
                    Условные
                  </span>
                </div>
                <div className="mt-2 font-roobert text-[24px] font-medium text-amber-300 tabular-nums">
                  {formatPln(potential?.amount ?? 0)} zł
                </div>
                <div className="text-[11.5px] font-roobert text-whisper-gray mt-0.5 tabular-nums">
                  {potential?.accounts ?? 0} счетов требуют действий для вывода
                </div>
              </div>

              {potential?.breakdown && (
                <div className="space-y-1 text-[11px] font-roobert text-whisper-gray pt-2 border-t border-amber-500/15">
                  <div className="flex items-center justify-between">
                    <span>Без депозита (бонусы):</span>
                    <strong className="text-frost-white tabular-nums">
                      {potential.breakdown.noDepositAccounts} сч. ({formatPln(potential.breakdown.noDepositAmount)} zł)
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Не отыгран вейджер:</span>
                    <strong className="text-frost-white tabular-nums">
                      {potential.breakdown.needWagerAccounts} сч. ({formatPln(potential.breakdown.needWagerAmount)} zł)
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Заблокированы / бан:</span>
                    <strong className="text-rose-400 tabular-nums">
                      {potential.breakdown.blockedAccounts} сч. ({formatPln(potential.breakdown.blockedAmount)} zł)
                    </strong>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Главный блок экономики: Сколько мы заработаем */}
          {potential?.economics && (
            <div className="p-5 rounded-[22px] bg-gradient-to-br from-[#a0e0ab]/10 via-emerald-500/[0.04] to-transparent border border-[#a0e0ab]/30">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="font-roobert text-[11px] uppercase tracking-wider text-[#a0e0ab] font-semibold flex items-center gap-1.5">
                    <TrendingUp size={13} />
                    Сколько заработает казино при выводе
                  </div>
                  <div className="mt-1 font-roobert text-[26px] sm:text-[28px] font-light text-frost-white leading-tight tabular-nums flex items-baseline gap-2 flex-wrap">
                    <span className="text-[#a0e0ab] font-medium">
                      +{formatPln(potential.economics.netCasinoProfit)} zł
                    </span>
                    <span className="text-whisper-gray text-[13px] font-normal">чистой прибыли</span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-pill bg-[#a0e0ab]/15 border border-[#a0e0ab]/30 text-[#a0e0ab] text-[11px] font-medium tabular-nums shrink-0">
                  x{potential.economics.profitMultiplier} ROI
                </span>
              </div>

              {/* Пошаговый расчет */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[12px] font-roobert">
                <div className="p-3 rounded-[14px] bg-white/[0.03] border border-white/5">
                  <div className="text-whisper-gray text-[11px]">1. Входящие депозиты:</div>
                  <div className="text-emerald-400 font-medium text-[15px] mt-0.5 tabular-nums">
                    +{formatPln(potential.economics.requiredDeposits)} zł
                  </div>
                  <div className="text-[10.5px] text-whisper-gray/70 mt-1">
                    Игроки обязаны пополнить счет минимум до 100 zł для открытия вывода
                  </div>
                </div>

                <div className="p-3 rounded-[14px] bg-white/[0.03] border border-white/5">
                  <div className="text-whisper-gray text-[11px]">2. Обязательный оборот ставок:</div>
                  <div className="text-frost-white font-medium text-[15px] mt-0.5 tabular-nums">
                    {formatPln(potential.economics.requiredTurnover)} zł
                  </div>
                  <div className="text-[10.5px] text-whisper-gray/70 mt-1">
                    Остаток вейджера + 2x на каждый новый депозит
                  </div>
                </div>

                <div className="p-3 rounded-[14px] bg-white/[0.03] border border-white/5">
                  <div className="text-whisper-gray text-[11px]">3. Маржа казино (~5% House Edge):</div>
                  <div className="text-emerald-400 font-medium text-[15px] mt-0.5 tabular-nums">
                    +{formatPln(potential.economics.expectedWagerProfit)} zł
                  </div>
                  <div className="text-[10.5px] text-whisper-gray/70 mt-1">
                    Гарантированный профит с открутки обязательного вейджера
                  </div>
                </div>

                <div className="p-3 rounded-[14px] bg-white/[0.03] border border-white/5">
                  <div className="text-whisper-gray text-[11px]">4. Выплаты балансов игрокам:</div>
                  <div className="text-rose-400 font-medium text-[15px] mt-0.5 tabular-nums">
                    -{formatPln(potential.amount)} zł
                  </div>
                  <div className="text-[10.5px] text-whisper-gray/70 mt-1">
                    Сумма условных балансов, подлежащая выплате после выполнения правил
                  </div>
                </div>
              </div>

              <div className="mt-3.5 p-3 rounded-[12px] bg-black/30 border border-white/5 text-[11.5px] font-roobert text-whisper-gray">
                💡 <strong className="text-frost-white">Вывод:</strong> Бонусные и условные обязательства выгодны казино. Чтобы вывести <span className="text-amber-300 font-medium">{formatPln(potential.amount)} zł</span>, игроки должны внести <span className="text-emerald-400 font-medium">+{formatPln(potential.economics.requiredDeposits)} zł</span> реальных депозитов и прокрутить ставок на <span className="text-frost-white font-medium">{formatPln(potential.economics.requiredTurnover)} zł</span>!
              </div>
            </div>
          )}

          {/* Подвал с кнопками */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={onOpenReset}
              className="px-4 py-2.5 rounded-pill bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 font-roobert text-[12.5px] font-medium transition-all active:scale-95"
            >
              Очистить спящие обязательства (&gt;30 дней)
            </button>
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-pill bg-white/10 hover:bg-white/15 text-frost-white font-roobert text-[12.5px] transition-colors"
            >
              Закрыть
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  accent,
  help,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: React.ReactNode;
  accent?: 'good' | 'warn';
  help?: { title: string; body: React.ReactNode };
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[24px] border border-white/10 bg-white/[0.03] backdrop-blur-3xl p-5 flex flex-col gap-2 shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-frost-white/65">
          {icon}
          <span className="font-roobert text-[10.5px] uppercase tracking-[0.05em] text-whisper-gray">
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
      {(hint || action) && (
        <div className="flex items-center justify-between gap-1 font-roobert text-[11px] text-whisper-gray tabular-nums">
          <span>{hint}</span>
          {action}
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
      <div className="rounded-[24px] border border-white/10 bg-white/[0.03] backdrop-blur-3xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <span className="font-roobert text-[10.5px] uppercase tracking-[0.05em] text-whisper-gray">
            Динамика уникальных игроков
          </span>
        </div>
        <div className="px-5 py-4">
          <ActivityChart points={filteredGraph} />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Reset Dormant Balances Modal                                               */
/* -------------------------------------------------------------------------- */

interface DormantPreviewData {
  ok: boolean;
  count: number;
  totalAmount: number;
  blockedCount: number;
  inactiveCount: number;
  sample: Array<{
    userId: string;
    telegramId: number;
    name: string;
    amount: number;
    isBlocked: boolean;
  }>;
}

function ResetDormantBalancesModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [data, setData] = useState<DormantPreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    resetCount: number;
    resetSum: number;
  } | null>(null);

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/_x/balances/dormant-preview', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error(`Ошибка загрузки данных (${res.status})`);
      }
      const j = (await res.json()) as DormantPreviewData;
      setData(j);
    } catch (err: any) {
      setError(err?.message || 'Не удалось получить предпросмотр неактивных счетов');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSuccessResult(null);
      setError(null);
      void fetchPreview();
    }
  }, [isOpen, fetchPreview]);

  const handleReset = async () => {
    setResetting(true);
    setError(null);
    try {
      const res = await fetch('/api/_x/balances/reset-dormant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        throw new Error(j.error || 'Ошибка при списании балансов');
      }
      setSuccessResult({
        resetCount: j.resetCount,
        resetSum: j.resetSum,
      });
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Ошибка списания балансов');
    } finally {
      setResetting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg rounded-[24px] border border-white/10 bg-[#0d1117] p-6 shadow-2xl relative overflow-hidden"
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-whisper-gray hover:text-frost-white transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-pill bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400">
            <ShieldAlert size={20} />
          </div>
          <div>
            <h3 className="font-roobert text-[16px] text-frost-white font-medium">
              Очистка спящих обязательств
            </h3>
            <p className="font-roobert text-[12px] text-whisper-gray">
              Обнуление балансов заблокированных и неактивных &gt;30д игроков
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <RefreshCw size={24} className="animate-spin text-whisper-gray" />
            <span className="font-roobert text-[13px] text-whisper-gray">
              Анализ счетов в базе данных...
            </span>
          </div>
        ) : successResult ? (
          <div className="py-6 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-pill bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
              <CheckCircle2 size={28} />
            </div>
            <div className="font-roobert text-[16px] text-frost-white font-medium">
              Балансы успешно списаны
            </div>
            <p className="font-roobert text-[13px] text-whisper-gray max-w-sm">
              Обнулено {successResult.resetCount} счетов на сумму{' '}
              <span className="text-frost-white font-semibold tabular-nums">
                {formatPln(successResult.resetSum)} zł
              </span>
              . Обязательства казино уменьшены.
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-6 py-2.5 rounded-pill bg-white/10 hover:bg-white/15 text-frost-white font-roobert text-[13px] transition-colors"
            >
              Закрыть
            </button>
          </div>
        ) : error ? (
          <div className="py-6 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-pill bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400">
              <AlertTriangle size={28} />
            </div>
            <div className="font-roobert text-[14px] text-rose-300 font-medium">
              {error}
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => void fetchPreview()}
                className="px-4 py-2 rounded-pill bg-white/10 hover:bg-white/15 text-frost-white font-roobert text-[12px]"
              >
                Повторить
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-pill bg-white/5 hover:bg-white/10 text-whisper-gray font-roobert text-[12px]"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : data ? (
          <div>
            {data.count === 0 ? (
              <div className="py-8 text-center">
                <div className="w-10 h-10 rounded-pill bg-emerald-500/10 border border-emerald-500/25 mx-auto flex items-center justify-center text-emerald-400 mb-3">
                  <CheckCircle2 size={20} />
                </div>
                <div className="font-roobert text-[14px] text-frost-white font-medium">
                  Нет неактивных счетов
                </div>
                <p className="font-roobert text-[12px] text-whisper-gray mt-1">
                  Все счета с балансом принадлежат активным пользователям или администраторам.
                </p>
                <button
                  onClick={onClose}
                  className="mt-5 px-5 py-2 rounded-pill bg-white/10 hover:bg-white/15 text-frost-white font-roobert text-[13px]"
                >
                  Понятно
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3.5 rounded-[16px] bg-white/[0.03] border border-white/10">
                    <div className="font-roobert text-[11px] uppercase tracking-wider text-whisper-gray">
                      К списанию
                    </div>
                    <div className="mt-1 font-roobert text-[20px] font-medium text-rose-400 tabular-nums">
                      {formatPln(data.totalAmount)} zł
                    </div>
                  </div>
                  <div className="p-3.5 rounded-[16px] bg-white/[0.03] border border-white/10">
                    <div className="font-roobert text-[11px] uppercase tracking-wider text-whisper-gray">
                      Счетов
                    </div>
                    <div className="mt-1 font-roobert text-[20px] font-medium text-frost-white tabular-nums">
                      {data.count}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[12px] font-roobert text-whisper-gray">
                  <span className="px-2.5 py-1 rounded-pill bg-white/[0.04] border border-white/10">
                    Неактивны &gt;30д:{' '}
                    <strong className="text-frost-white">{data.inactiveCount}</strong>
                  </span>
                  <span className="px-2.5 py-1 rounded-pill bg-white/[0.04] border border-white/10">
                    Заблокированы:{' '}
                    <strong className="text-rose-400">{data.blockedCount}</strong>
                  </span>
                </div>

                {data.sample && data.sample.length > 0 && (
                  <div className="rounded-[16px] border border-white/10 bg-black/30 p-3 max-h-48 overflow-y-auto space-y-2">
                    <div className="font-roobert text-[11px] uppercase tracking-wider text-whisper-gray px-1">
                      Примеры счетов:
                    </div>
                    {data.sample.map((s) => (
                      <div
                        key={s.userId}
                        className="flex items-center justify-between text-[12px] font-roobert px-2 py-1.5 rounded-lg bg-white/[0.02]"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-frost-white truncate font-medium">{s.name}</span>
                          <span className="text-whisper-gray text-[10.5px]">#{s.telegramId}</span>
                          {s.isBlocked ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">
                              Бан
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                              &gt;30д
                            </span>
                          )}
                        </div>
                        <span className="text-rose-300 font-semibold tabular-nums shrink-0 ml-2">
                          {formatPln(s.amount)} zł
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-3 rounded-[14px] bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-[11.5px] font-roobert text-rose-200">
                  <AlertTriangle size={16} className="shrink-0 text-rose-400 mt-0.5" />
                  <div>
                    Балансы будут сброшены до 0.00 zł с записью аудита в транзакции.
                    Администраторы защищены от списания.
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    onClick={onClose}
                    disabled={resetting}
                    className="px-4 py-2.5 rounded-pill bg-white/5 hover:bg-white/10 text-whisper-gray font-roobert text-[12.5px] transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={() => void handleReset()}
                    disabled={resetting}
                    className="px-5 py-2.5 rounded-pill bg-rose-600 hover:bg-rose-500 text-white font-roobert text-[12.5px] font-medium shadow-lg shadow-rose-900/30 flex items-center gap-2 transition-all active:scale-[0.98]"
                  >
                    {resetting ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        Списание...
                      </>
                    ) : (
                      <>Обнулить {formatPln(data.totalAmount)} zł</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Live presence widget (Redesigned & Enriched)                                */
/* -------------------------------------------------------------------------- */

interface PresenceUser {
  userId: string;
  name: string;
  username: string | null;
  photoUrl: string | null;
  telegramId: number | null;
  pathname: string;
  ts: number;
  balance?: number;
  vipLevel?: number;
  isAdmin?: boolean;
  isBlocked?: boolean;
}

interface PresenceResponse {
  ok: true;
  count: number;
  users: PresenceUser[];
  pages: Array<{ pathname: string; count: number }>;
}

function LivePresence() {
  const [data, setData] = useState<PresenceResponse | null>(null);
  const [open, setOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | 'players' | 'admins'>('all');

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
      // Тихо игнорируем ошибку сети — следующий тик повторит
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 5_000);
    return () => clearInterval(id);
  }, [load]);

  const topPages = useMemo(() => (data?.pages ?? []).slice(0, 4), [data]);

  const onlineBalanceTotal = useMemo(() => {
    if (!data?.users) return 0;
    return data.users.reduce((acc, u) => acc + (u.balance || 0), 0);
  }, [data]);

  const filteredUsers = useMemo(() => {
    if (!data?.users) return [];
    let list = data.users;

    if (filterRole === 'players') {
      list = list.filter((u) => !u.isAdmin);
    } else if (filterRole === 'admins') {
      list = list.filter((u) => Boolean(u.isAdmin));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((u) => {
        const n = u.name.toLowerCase();
        const un = (u.username ?? '').toLowerCase();
        const tg = u.telegramId ? String(u.telegramId) : '';
        const meta = getPageMeta(u.pathname);
        return (
          n.includes(q) ||
          un.includes(q) ||
          tg.includes(q) ||
          meta.title.toLowerCase().includes(q)
        );
      });
    }

    return list;
  }, [data, filterRole, searchQuery]);

  const counts = useMemo(() => {
    const total = data?.users.length ?? 0;
    const admins = data?.users.filter((u) => u.isAdmin).length ?? 0;
    const players = total - admins;
    return { total, admins, players };
  }, [data]);

  return (
    <section className="rounded-[24px] border border-white/10 bg-white/[0.03] backdrop-blur-3xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.12)] transition-all">
      {/* Шапка виджета с быстрой сводкой */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-5 py-4 flex items-center justify-between gap-3 active:scale-[0.99] transition-transform select-none"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="relative inline-flex items-center justify-center w-10 h-10 rounded-pill border border-[#a0e0ab]/40 bg-[#a0e0ab]/10 text-[#a0e0ab] shrink-0">
            <Radio size={16} strokeWidth={2} />
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#a0e0ab] animate-ping opacity-75"
            />
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#a0e0ab]"
            />
          </div>
          <div className="min-w-0 text-left">
            <div className="flex items-center gap-2">
              <span className="font-roobert text-[11px] uppercase tracking-[0.06em] text-whisper-gray font-medium">
                Сейчас в мини-аппе
              </span>
              <span className="inline-flex items-center px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-medium border border-emerald-500/20">
                LIVE
              </span>
            </div>
            <div className="mt-0.5 flex items-baseline gap-2.5 flex-wrap">
              <span className="font-roobert text-frost-white text-[22px] font-light leading-none tabular-nums tracking-[-0.02em]">
                {data ? data.count : '—'}
              </span>
              <span className="text-whisper-gray text-[12px] font-roobert">
                {data ? `игрок${plural(data.count)} онлайн` : 'подключение…'}
              </span>
              {data && data.count > 0 && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[11.5px] font-roobert text-[#a0e0ab] tabular-nums px-2 py-0.5 rounded-full bg-[#a0e0ab]/10 border border-[#a0e0ab]/20">
                  <Coins size={12} className="shrink-0 text-[#a0e0ab]" />
                  Баланс онлайн: {formatPln(onlineBalanceTotal)} zł
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {topPages.length > 0 && (
            <div className="hidden md:flex items-center gap-1.5">
              {topPages.map((p) => {
                const meta = getPageMeta(p.pathname);
                const IconComponent = meta.icon;
                return (
                  <span
                    key={p.pathname}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill border text-[11px] font-roobert',
                      meta.colorClass
                    )}
                    title={p.pathname}
                  >
                    <IconComponent size={12} className="shrink-0 opacity-80" />
                    <span>{meta.title}</span>
                    <span className="tabular-nums font-semibold opacity-90">{p.count}</span>
                  </span>
                );
              })}
            </div>
          )}
          <div className="w-8 h-8 rounded-pill bg-white/5 border border-white/10 flex items-center justify-center text-frost-white/70">
            <ChevronDown
              size={15}
              strokeWidth={2}
              className={cn(
                'transition-transform duration-200',
                open && 'rotate-180 text-frost-white'
              )}
            />
          </div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="presence-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
            className="overflow-hidden border-t border-white/10"
          >
            {/* Панель фильтрации и поиска */}
            <div className="px-5 py-3 bg-white/[0.015] border-b border-white/5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-0.5 rounded-pill bg-white/5 border border-white/10 self-start">
                <button
                  onClick={() => setFilterRole('all')}
                  className={cn(
                    'px-3 py-1 rounded-pill text-[11.5px] font-roobert transition-colors',
                    filterRole === 'all'
                      ? 'bg-white/15 text-frost-white font-medium shadow-sm'
                      : 'text-whisper-gray hover:text-frost-white'
                  )}
                >
                  Все ({counts.total})
                </button>
                <button
                  onClick={() => setFilterRole('players')}
                  className={cn(
                    'px-3 py-1 rounded-pill text-[11.5px] font-roobert transition-colors',
                    filterRole === 'players'
                      ? 'bg-white/15 text-frost-white font-medium shadow-sm'
                      : 'text-whisper-gray hover:text-frost-white'
                  )}
                >
                  Игроки ({counts.players})
                </button>
                <button
                  onClick={() => setFilterRole('admins')}
                  className={cn(
                    'px-3 py-1 rounded-pill text-[11.5px] font-roobert transition-colors',
                    filterRole === 'admins'
                      ? 'bg-white/15 text-frost-white font-medium shadow-sm'
                      : 'text-whisper-gray hover:text-frost-white'
                  )}
                >
                  Админы ({counts.admins})
                </button>
              </div>

              <div className="relative flex-1 sm:max-w-xs">
                <Search
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-whisper-gray pointer-events-none"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск по имени, @нику, ID…"
                  className="w-full pl-8 pr-3 py-1.5 rounded-pill bg-white/5 border border-white/10 text-frost-white text-[11.5px] font-roobert placeholder:text-whisper-gray/50 focus:outline-none focus:border-white/20 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-whisper-gray hover:text-frost-white"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Список карточек пользователей */}
            {!data || data.users.length === 0 ? (
              <div className="px-5 py-10 text-center font-roobert text-[12.5px] text-whisper-gray flex flex-col items-center gap-2">
                <div className="w-9 h-9 rounded-pill bg-white/5 border border-white/10 flex items-center justify-center text-whisper-gray/60">
                  <Users size={16} />
                </div>
                <span>Прямо сейчас в мини-аппе нет активных пользователей.</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="px-5 py-8 text-center font-roobert text-[12.5px] text-whisper-gray">
                По запросу «{searchQuery}» никто не найден.
              </div>
            ) : (
              <div className="divide-y divide-white/5 max-h-[460px] overflow-y-auto">
                {filteredUsers.map((u) => {
                  const meta = getPageMeta(u.pathname);
                  const IconComponent = meta.icon;

                  return (
                    <div
                      key={u.userId}
                      className="px-5 py-3 hover:bg-white/[0.025] transition-colors flex items-center justify-between gap-3"
                    >
                      {/* Левая колонка: Аватар + Пользователь */}
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Аватар с индикатором онлайна */}
                        <div className="relative shrink-0 select-none" aria-hidden="true">
                          {u.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={u.photoUrl}
                              alt=""
                              referrerPolicy="no-referrer"
                              draggable={false}
                              className="w-10 h-10 rounded-pill border border-white/15 object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-pill border border-white/15 bg-gradient-to-br from-white/10 to-white/[0.02] flex items-center justify-center text-frost-white font-roobert font-medium text-[15px]">
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          {/* Пульсирующая зеленая точка онлайна */}
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0d1117]" />
                        </div>

                        {/* Инфо игрока */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-roobert text-[13.5px] font-medium text-frost-white truncate">
                              {u.name}
                            </span>

                            {/* Роли и бейджи */}
                            {u.isAdmin && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                <Shield size={9} />
                                Админ
                              </span>
                            )}
                            {u.isBlocked && (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                Бан
                              </span>
                            )}
                            {typeof u.vipLevel === 'number' && u.vipLevel > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                VIP {u.vipLevel}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-0.5 text-[11px] font-roobert text-whisper-gray truncate">
                            {u.telegramId && (
                              <span className="tabular-nums">#{u.telegramId}</span>
                            )}
                            {u.username && (
                              <span className="text-frost-white/70 truncate">
                                @{u.username}
                              </span>
                            )}
                            {/* Баланс игрока прямо в строке */}
                            <span className="text-[#a0e0ab] font-medium tabular-nums flex items-center gap-1">
                              • {formatPln(u.balance ?? 0)} zł
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Правая колонка: Экран + Время + Быстрый переход в профиль */}
                      <div className="flex items-center gap-2.5 shrink-0">
                        <div className="text-right">
                          <div
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-pill border text-[10.5px] font-roobert',
                              meta.colorClass
                            )}
                            title={u.pathname}
                          >
                            <IconComponent size={11} className="shrink-0" />
                            <span className="truncate max-w-[130px] sm:max-w-[180px]">
                              {meta.title}
                            </span>
                          </div>
                          <div className="font-roobert text-[10px] text-whisper-gray tabular-nums mt-0.5">
                            {ageLabel(u.ts)}
                          </div>
                        </div>

                        {/* Кнопка быстрого перехода в карточку игрока в админке */}
                        <Link
                          href={`/system/console/users/${u.userId}`}
                          className="w-8 h-8 rounded-pill bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-whisper-gray hover:text-frost-white transition-colors"
                          title="Открыть карточку пользователя"
                        >
                          <ExternalLink size={13} />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Подвал виджета */}
            <div className="px-5 py-2.5 bg-white/[0.02] border-t border-white/5 flex items-center justify-between text-[11px] font-roobert text-whisper-gray">
              <span>Автообновление каждые 5 сек</span>
              <span className="tabular-nums">
                Показано: {filteredUsers.length} из {data?.users.length ?? 0}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/**
 * Превращает путь в структурированные метаданные экрана для красивого отображения.
 */
function getPageMeta(pathname: string): {
  title: string;
  category: 'game' | 'sport' | 'bonus' | 'finance' | 'admin' | 'general';
  icon: any;
  colorClass: string;
} {
  const p = (pathname || '').toLowerCase();

  if (p === '/' || p === '') {
    return {
      title: 'Главная',
      category: 'general',
      icon: Sparkles,
      colorClass: 'bg-white/5 text-frost-white border-white/10',
    };
  }
  if (p.startsWith('/game/crash')) {
    return {
      title: 'MacvJet',
      category: 'game',
      icon: Zap,
      colorClass: 'bg-purple-500/15 text-purple-300 border-purple-500/25',
    };
  }
  if (p.startsWith('/game/mines')) {
    return {
      title: 'Mines',
      category: 'game',
      icon: Coins,
      colorClass: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
    };
  }
  if (p.startsWith('/game/wheel')) {
    return {
      title: 'Wheel',
      category: 'game',
      icon: Sparkles,
      colorClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    };
  }
  if (p.startsWith('/game/coinflip')) {
    return {
      title: 'Coinflip',
      category: 'game',
      icon: Coins,
      colorClass: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
    };
  }
  if (p.startsWith('/game/')) {
    const slug = p.split('/')[2] ?? 'игра';
    return {
      title: `Игра · ${slug}`,
      category: 'game',
      icon: Activity,
      colorClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
    };
  }
  if (p.startsWith('/sports') || p.startsWith('/sport')) {
    return {
      title: p.includes('live') ? 'Спорт · Live' : 'Спорт · Линия',
      category: 'sport',
      icon: Trophy,
      colorClass: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
    };
  }
  if (p.startsWith('/balance') || p.startsWith('/deposit') || p.startsWith('/withdraw')) {
    return {
      title: 'Касса / Кошелёк',
      category: 'finance',
      icon: Wallet,
      colorClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    };
  }
  if (p.startsWith('/bonuses') || p.startsWith('/tournaments')) {
    return {
      title: p.startsWith('/tournaments') ? 'Турниры' : 'Бонусы',
      category: 'bonus',
      icon: Gift,
      colorClass: 'bg-rose-500/15 text-rose-300 border-rose-500/25',
    };
  }
  if (p.startsWith('/system/console')) {
    let sub = 'Сводка';
    if (p.includes('/users')) sub = 'Игроки';
    else if (p.includes('/deposits')) sub = 'Депозиты';
    else if (p.includes('/withdrawals')) sub = 'Выводы';
    else if (p.includes('/bonuses')) sub = 'Бонусы';
    else if (p.includes('/games')) sub = 'Игры';
    else if (p.includes('/security')) sub = 'Безопасность';
    else if (p.includes('/audit')) sub = 'Аудит';
    return {
      title: `Админка · ${sub}`,
      category: 'admin',
      icon: Shield,
      colorClass: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
    };
  }
  if (p.startsWith('/profile')) {
    return {
      title: 'Профиль',
      category: 'general',
      icon: Users,
      colorClass: 'bg-white/5 text-frost-white border-white/10',
    };
  }
  if (p.startsWith('/partner')) {
    return {
      title: 'Партнёрка',
      category: 'general',
      icon: Users,
      colorClass: 'bg-white/5 text-frost-white border-white/10',
    };
  }

  return {
    title: pathname,
    category: 'general',
    icon: Activity,
    colorClass: 'bg-white/5 text-whisper-gray border-white/10',
  };
}

function ageLabel(ts: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 5) return 'только что';
  if (sec < 60) return `${sec}с назад`;
  const min = Math.floor(sec / 60);
  return `${min}м назад`;
}

function plural(n: number): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return 'ов';
  if (b > 1 && b < 5) return 'а';
  if (b === 1) return '';
  return 'ов';
}

