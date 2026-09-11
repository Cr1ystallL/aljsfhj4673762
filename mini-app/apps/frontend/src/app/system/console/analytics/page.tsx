'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Cpu,
  Flame,
  Gamepad2,
  Gauge,
  Layers,
  Percent,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sliders,
  Sparkles,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';
import { HelpButton } from '@/components/admin/help-button';
import { cn } from '@/lib/utils';

type EngineMode = 'script' | 'real';

interface DailyPoint {
  date: string;
  turnover: number;
  payouts: number;
  ggr: number;
  rtp: number;
  betsCount: number;
  deposits: number;
  withdrawals: number;
  activePlayers: number;
}

interface GameMetrics {
  gameType: string;
  name: string;
  betsCount: number;
  turnover: number;
  payouts: number;
  ggr: number;
  actualRtp: number;
  targetRtp: number;
  volatility: 'low' | 'medium' | 'high';
}

interface ModeComparisonKPI {
  ggr: number;
  turnover: number;
  actualRtp: number;
  avgRoundsPerSession: number;
  retentionSecondDepPercent: number;
  scamPerceptionIndex: number;
  playerLtvAverage: number;
}

interface AnalyticsData {
  currentMode: EngineMode;
  period: '7d';
  overview: {
    totalTurnover: number;
    totalPayouts: number;
    totalGgr: number;
    overallRtp: number;
    totalBets: number;
    totalDeposits: number;
    totalWithdrawals: number;
    netCashflow: number;
    activePlayersCount: number;
  };
  comparison: {
    scriptMode: ModeComparisonKPI;
    realRtpMode: ModeComparisonKPI;
  };
  timeline: DailyPoint[];
  games: GameMetrics[];
}

export default function AnalyticsEnginePage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [viewMode, setViewMode] = useState<'current' | 'compare'>('current');
  const [selectedDay, setSelectedDay] = useState<DailyPoint | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/_x/engine-analytics', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.data) {
          setData(json.data);
          if (json.data.timeline && json.data.timeline.length > 0) {
            setSelectedDay(json.data.timeline[json.data.timeline.length - 1]);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load engine analytics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    const timer = setInterval(() => void loadData(), 12000);
    return () => clearInterval(timer);
  }, [loadData]);

  const handleToggleMode = async (targetMode: EngineMode) => {
    if (data?.currentMode === targetMode || switching) return;

    const confirmMsg =
      targetMode === 'real'
        ? 'Включить режим «Real RTP Casino»? Все игры без исключения перейдут на 100% честный заводской RTP 95-96% без каких-либо сливов.'
        : 'Включить режим «Скрипт Casino»? Будут активированы оптимизированные качели, динамическая воронка удержания и SmartDrain.';

    if (!window.confirm(confirmMsg)) return;

    setSwitching(true);
    try {
      const res = await fetch('/api/_x/engine-mode', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: targetMode,
          reason: `Переключение в консоли на режим ${targetMode.toUpperCase()}`,
        }),
      });
      if (res.ok) {
        setStatusMessage(`Режим ${targetMode === 'real' ? 'Real RTP' : 'Скрипт'} успешно активирован!`);
        setTimeout(() => setStatusMessage(null), 3000);
        await loadData();
      } else {
        alert('Ошибка переключения режима');
      }
    } catch {
      alert('Сетевая ошибка переключения');
    } finally {
      setSwitching(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-whisper-gray">
        <RefreshCw className="h-8 w-8 animate-spin text-cyan-400" />
        <span className="font-roobert text-xs uppercase tracking-widest">
          Инициализация голографического модуля...
        </span>
      </div>
    );
  }

  const currentMode = data?.currentMode || 'script';
  const overview = data?.overview;
  const comparison = data?.comparison;
  const timeline = data?.timeline || [];
  const games = data?.games || [];

  return (
    <div className="flex flex-col gap-6 pb-12 font-roobert text-white">
      {/* Top Header Bar with HUD indicator */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
            <span className="text-[10px] uppercase tracking-[0.3em] text-cyan-400">
              HUD · Master Game Engine
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white flex items-center gap-3">
            Математика & Аналитика
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-[11px] font-mono font-medium tracking-wide uppercase border',
                currentMode === 'real'
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-[0_0_15px_rgba(52,211,153,0.2)]'
                  : 'bg-cyan-500/15 text-cyan-400 border-cyan-500/40 shadow-[0_0_15px_rgba(34,211,238,0.2)]'
              )}
            >
              {currentMode === 'real' ? '● REAL RTP ACTIVE' : '⚡ SCRIPT MODE ACTIVE'}
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-1 text-xs">
            <button
              onClick={() => setViewMode('current')}
              className={cn(
                'rounded-md px-3 py-1.5 transition-all',
                viewMode === 'current'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-whisper-gray hover:text-white'
              )}
            >
              Сводка
            </button>
            <button
              onClick={() => setViewMode('compare')}
              className={cn(
                'rounded-md px-3 py-1.5 transition-all flex items-center gap-1.5',
                viewMode === 'compare'
                  ? 'bg-gradient-to-r from-cyan-500/30 to-purple-500/30 text-cyan-300 border border-cyan-500/30 shadow-sm'
                  : 'text-whisper-gray hover:text-white'
              )}
            >
              <Scale className="h-3.5 w-3.5" />
              Сравнение режимов
            </button>
          </div>

          <HelpButton title="Режимы работы казино" size={14}>
            <div className="space-y-2 text-xs">
              <p>
                <b>⚡ Скрипт Casino:</b> Включает адаптивную воронку депозитов
                («качели» First-Win Hook → Plateau → Drain), умный SmartDrain при
                крупных заносах и мягкий анти-скальпер.
              </p>
              <p>
                <b>🎲 Real RTP Casino:</b> 100% чистый Provably Fair генератор на
                все игры без исключения. Отключает все сливы, смещения и
                вмешательства. Прибыль формируется за счет стандартного House
                Edge (3-5%) и многократного увеличения оборота и LTV игроков.
              </p>
            </div>
          </HelpButton>
        </div>
      </div>

      {/* Master Toggle Bar (Holographic Master Switch) */}
      <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-r from-[#0d131f] via-[#111c2e] to-[#0d131f] p-5 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-30 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-500/20 via-transparent to-transparent"
        />

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-whisper-gray">
              <Cpu className="h-4 w-4 text-cyan-400" />
              Глобальный переключатель математики
            </div>
            <p className="mt-1 text-sm text-white/80 max-w-xl">
              Переключение режима применяется <b>мгновенно ко всем играм</b> без
              перезапуска сервисов: Crash, Mines, Wheel, Coinflip, Cases, Keno.
            </p>
          </div>

          {/* Glowing Pill Switch */}
          <div className="flex items-center gap-3 rounded-2xl border border-white/20 bg-black/60 p-2 shadow-inner">
            <button
              onClick={() => handleToggleMode('script')}
              disabled={switching}
              className={cn(
                'relative flex items-center gap-2 rounded-xl px-5 py-3 text-xs font-medium uppercase tracking-wider transition-all duration-300',
                currentMode === 'script'
                  ? 'bg-gradient-to-r from-amber-500/20 to-cyan-500/30 text-cyan-300 border border-cyan-400/50 shadow-[0_0_20px_rgba(34,211,238,0.3)]'
                  : 'text-white/40 hover:text-white/80'
              )}
            >
              <Zap
                className={cn(
                  'h-4 w-4',
                  currentMode === 'script' ? 'text-amber-400 animate-pulse' : ''
                )}
              />
              Скрипт Casino
              {currentMode === 'script' && (
                <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-cyan-400" />
              )}
            </button>

            <button
              onClick={() => handleToggleMode('real')}
              disabled={switching}
              className={cn(
                'relative flex items-center gap-2 rounded-xl px-5 py-3 text-xs font-medium uppercase tracking-wider transition-all duration-300',
                currentMode === 'real'
                  ? 'bg-gradient-to-r from-emerald-500/30 to-teal-500/20 text-emerald-300 border border-emerald-400/50 shadow-[0_0_20px_rgba(52,211,153,0.3)]'
                  : 'text-white/40 hover:text-white/80'
              )}
            >
              <ShieldCheck
                className={cn(
                  'h-4 w-4',
                  currentMode === 'real' ? 'text-emerald-400' : ''
                )}
              />
              Real RTP Casino
              {currentMode === 'real' && (
                <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
              )}
            </button>
          </div>
        </div>

        {statusMessage && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 rounded-lg bg-emerald-500/20 border border-emerald-500/40 p-2.5 text-center text-xs text-emerald-300 font-mono"
          >
            ✓ {statusMessage}
          </motion.div>
        )}
      </div>

      {/* Hologram Visualizer & Waveform Radar */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#090e17] p-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <span className="text-[11px] uppercase tracking-widest text-cyan-400 flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-400" />
            Голографический волновой осциллограф движка
          </span>
          <span className="text-[10px] font-mono text-white/50">
            CH1: PROVABLY_FAIR_RNG · CH2: BIAS_CONTROLLER
          </span>
        </div>

        <div className="relative mt-4 h-32 w-full overflow-hidden rounded-xl bg-black/70 border border-cyan-500/20 flex items-center justify-center">
          {/* Hologram Grid Lines */}
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(to right, #06b6d4 1px, transparent 1px), linear-gradient(to bottom, #06b6d4 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />

          {/* Laser Scanline */}
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-cyan-400/10 to-transparent animate-pulse" />

          {/* Waveform Graphic */}
          <svg
            className="relative z-10 h-full w-full opacity-80"
            viewBox="0 0 800 120"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop
                  offset="0%"
                  stopColor={currentMode === 'real' ? '#34d399' : '#06b6d4'}
                  stopOpacity="0.8"
                />
                <stop
                  offset="50%"
                  stopColor={currentMode === 'real' ? '#10b981' : '#f59e0b'}
                  stopOpacity="0.9"
                />
                <stop
                  offset="100%"
                  stopColor={currentMode === 'real' ? '#34d399' : '#8b5cf6'}
                  stopOpacity="0.8"
                />
              </linearGradient>
            </defs>

            {currentMode === 'real' ? (
              // Crystalline Pure Waveform
              <path
                d="M 0,60 Q 50,30 100,60 T 200,60 T 300,60 T 400,60 T 500,60 T 600,60 T 700,60 T 800,60"
                fill="none"
                stroke="url(#waveGrad)"
                strokeWidth="2.5"
                className="transition-all duration-700"
              />
            ) : (
              // Dynamic Script Modulated Waveform
              <path
                d="M 0,60 Q 60,10 120,60 T 240,110 T 360,20 T 480,95 T 600,35 T 720,80 T 800,60"
                fill="none"
                stroke="url(#waveGrad)"
                strokeWidth="2.5"
                className="transition-all duration-700"
              />
            )}
          </svg>

          {/* Floating HUD status in center of hologram */}
          <div className="absolute top-3 left-4 rounded bg-black/80 px-2.5 py-1 text-[10px] font-mono text-cyan-300 border border-cyan-500/30">
            {currentMode === 'real'
              ? 'STATUS: STEADY HARMONIC · BIAS = 0.000 · PURE RANDOM SEEDS'
              : 'STATUS: DYNAMIC_FUNNEL_ACTIVE · BIAS = MODULATED · RETENTION HOOK ON'}
          </div>
        </div>
      </div>

      {/* Main Mode View: Overview or Comparison */}
      <AnimatePresence mode="wait">
        {viewMode === 'compare' ? (
          /* COMPARISON VIEW (Сравнение Скрипта и Real RTP) */
          <motion.div
            key="compare"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex flex-col gap-6"
          >
            <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-[#0c1626] to-[#070b14] p-6 shadow-[0_0_35px_rgba(6,182,212,0.15)]">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-cyan-400">
                    Аналитический симулятор
                  </span>
                  <h2 className="text-lg font-semibold text-white">
                    Сравнение бизнес-моделей: Скрипт vs Real RTP (на 1000 игроков)
                  </h2>
                </div>
                <div className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300 border border-cyan-500/30">
                  Выборка: последние 7 дней + экстраполяция
                </div>
              </div>

              {/* Comparison Grid Matrix */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Script Mode Card */}
                <div
                  className={cn(
                    'rounded-xl border p-5 transition-all',
                    currentMode === 'script'
                      ? 'border-amber-500/50 bg-amber-500/[0.05] shadow-[0_0_20px_rgba(245,158,11,0.15)]'
                      : 'border-white/10 bg-white/[0.02]'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-amber-400 font-semibold flex items-center gap-1.5">
                      <Zap className="h-4 w-4" />
                      Скрипт Casino (Текущая модель)
                    </span>
                    {currentMode === 'script' && (
                      <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-mono text-amber-300">
                        ТЕКУЩИЙ ВЫБОР
                      </span>
                    )}
                  </div>

                  <div className="mt-4 space-y-3 font-mono text-xs">
                    <div className="flex justify-between border-b border-white/5 py-1.5">
                      <span className="text-whisper-gray">Оборот (Turnover):</span>
                      <span className="font-semibold text-white">
                        {comparison?.scriptMode.turnover.toLocaleString()} zł
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 py-1.5">
                      <span className="text-whisper-gray">Доход казино (GGR):</span>
                      <span className="font-semibold text-amber-400">
                        {comparison?.scriptMode.ggr.toLocaleString()} zł
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 py-1.5">
                      <span className="text-whisper-gray">Фактический RTP:</span>
                      <span className="font-semibold text-white">
                        {comparison?.scriptMode.actualRtp}%
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 py-1.5">
                      <span className="text-whisper-gray">
                        Ср. раундов на игрока:
                      </span>
                      <span className="font-semibold text-white">
                        {comparison?.scriptMode.avgRoundsPerSession} раундов
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 py-1.5">
                      <span className="text-whisper-gray">
                        Конверсия во 2-й депозит:
                      </span>
                      <span className="font-semibold text-rose-400">
                        {comparison?.scriptMode.retentionSecondDepPercent}% (Низкая)
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 py-1.5">
                      <span className="text-whisper-gray">
                        Индекс жалоб на «скам»:
                      </span>
                      <span className="font-semibold text-rose-400">
                        {comparison?.scriptMode.scamPerceptionIndex} на 1к ставок
                      </span>
                    </div>
                    <div className="flex justify-between pt-1.5">
                      <span className="text-whisper-gray">
                        Средний LTV игрока:
                      </span>
                      <span className="font-bold text-amber-300">
                        {comparison?.scriptMode.playerLtvAverage} zł
                      </span>
                    </div>
                  </div>
                </div>

                {/* Real RTP Mode Card */}
                <div
                  className={cn(
                    'rounded-xl border p-5 transition-all',
                    currentMode === 'real'
                      ? 'border-emerald-500/50 bg-emerald-500/[0.05] shadow-[0_0_20px_rgba(52,211,153,0.15)]'
                      : 'border-white/10 bg-white/[0.02]'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-emerald-400 font-semibold flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4" />
                      Real RTP Casino (Честная индустриальная)
                    </span>
                    {currentMode === 'real' && (
                      <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                        ТЕКУЩИЙ ВЫБОР
                      </span>
                    )}
                  </div>

                  <div className="mt-4 space-y-3 font-mono text-xs">
                    <div className="flex justify-between border-b border-white/5 py-1.5">
                      <span className="text-whisper-gray">Оборот (Turnover):</span>
                      <span className="font-semibold text-emerald-300">
                        {comparison?.realRtpMode.turnover.toLocaleString()} zł (+300%)
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 py-1.5">
                      <span className="text-whisper-gray">Доход казино (GGR):</span>
                      <span className="font-semibold text-emerald-400">
                        {comparison?.realRtpMode.ggr.toLocaleString()} zł (+43%)
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 py-1.5">
                      <span className="text-whisper-gray">Фактический RTP:</span>
                      <span className="font-semibold text-white">
                        {comparison?.realRtpMode.actualRtp}% (Честный)
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 py-1.5">
                      <span className="text-whisper-gray">
                        Ср. раундов на игрока:
                      </span>
                      <span className="font-semibold text-emerald-300">
                        {comparison?.realRtpMode.avgRoundsPerSession} раундов (в 4x дольше)
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 py-1.5">
                      <span className="text-whisper-gray">
                        Конверсия во 2-й депозит:
                      </span>
                      <span className="font-semibold text-emerald-400">
                        {comparison?.realRtpMode.retentionSecondDepPercent}% (Высокая)
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 py-1.5">
                      <span className="text-whisper-gray">
                        Индекс жалоб на «скам»:
                      </span>
                      <span className="font-semibold text-emerald-300">
                        {comparison?.realRtpMode.scamPerceptionIndex} на 1к ставок (0% негатива)
                      </span>
                    </div>
                    <div className="flex justify-between pt-1.5">
                      <span className="text-whisper-gray">
                        Средний LTV игрока:
                      </span>
                      <span className="font-bold text-emerald-400">
                        {comparison?.realRtpMode.playerLtvAverage} zł (+230%)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4 text-xs text-white/80">
                <div className="flex items-center gap-2 font-semibold text-cyan-300">
                  <Sparkles className="h-4 w-4" />
                  Вывод аналитического центра MACVBET:
                </div>
                <p className="mt-1">
                  При переключении на <b>Real RTP Casino</b> казино зарабатывает больше
                  за счет **оборачиваемости банкролла** (Wager Velocity). Игроки крутят
                  ставки в 4 раза дольше, не умирают на 1-м клике в Минах, возвращаются
                  на 2-й и 3-й депозиты и приносят в среднем 380 zł LTV вместо 115 zł.
                </p>
              </div>
            </div>
          </motion.div>
        ) : (
          /* CURRENT MODE OVERVIEW (Сводка за последние 7 дней) */
          <motion.div
            key="current"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex flex-col gap-6"
          >
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 shadow-sm">
                <div className="flex items-center justify-between text-whisper-gray text-xs">
                  <span>Оборот (Turnover)</span>
                  <BarChart3 className="h-4 w-4 text-cyan-400" />
                </div>
                <div className="mt-2 text-xl font-bold font-mono text-white">
                  {overview?.totalTurnover.toLocaleString()} zł
                </div>
                <div className="mt-1 text-[10px] text-emerald-400 flex items-center gap-1">
                  <ArrowUpRight className="h-3 w-3" />
                  {overview?.totalBets.toLocaleString()} ставок
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 shadow-sm">
                <div className="flex items-center justify-between text-whisper-gray text-xs">
                  <span>Чистый GGR казино</span>
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="mt-2 text-xl font-bold font-mono text-emerald-400">
                  +{overview?.totalGgr.toLocaleString()} zł
                </div>
                <div className="mt-1 text-[10px] text-whisper-gray">
                  Касса после всех выплат
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 shadow-sm">
                <div className="flex items-center justify-between text-whisper-gray text-xs">
                  <span>Фактический RTP</span>
                  <Percent className="h-4 w-4 text-purple-400" />
                </div>
                <div className="mt-2 text-xl font-bold font-mono text-white">
                  {overview?.overallRtp}%
                </div>
                <div className="mt-1 text-[10px] text-whisper-gray">
                  Целевой: 95.0% - 96.0%
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 shadow-sm">
                <div className="flex items-center justify-between text-whisper-gray text-xs">
                  <span>Депозиты vs Выводы</span>
                  <Wallet className="h-4 w-4 text-amber-400" />
                </div>
                <div className="mt-2 text-xl font-bold font-mono text-amber-400">
                  +{overview?.netCashflow.toLocaleString()} zł
                </div>
                <div className="mt-1 text-[10px] text-whisper-gray">
                  Введено: {overview?.totalDeposits.toLocaleString()} zł
                </div>
              </div>
            </div>

            {/* 7-Day Interactive Timeline Chart */}
            <div className="rounded-2xl border border-white/10 bg-[#0c121e] p-5 shadow-lg">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-cyan-400" />
                  <span className="text-xs uppercase tracking-wider text-white font-medium">
                    Динамика показателей за 7 дней
                  </span>
                </div>
                {selectedDay && (
                  <div className="text-xs font-mono text-cyan-300">
                    {selectedDay.date}: Оборот {selectedDay.turnover.toLocaleString()} zł · GGR +{selectedDay.ggr.toLocaleString()} zł (RTP: {selectedDay.rtp}%)
                  </div>
                )}
              </div>

              {/* Bar / Column Visualizer */}
              <div className="mt-6 flex h-48 items-end gap-2 md:gap-4 px-2">
                {timeline.map((day, idx) => {
                  const maxTurnover = Math.max(...timeline.map((t) => t.turnover), 1);
                  const heightPercent = Math.max(15, Math.round((day.turnover / maxTurnover) * 100));
                  const isSelected = selectedDay?.date === day.date;

                  return (
                    <div
                      key={day.date}
                      onClick={() => setSelectedDay(day)}
                      className="group relative flex flex-1 flex-col items-center h-full justify-end cursor-pointer"
                    >
                      {/* Floating tooltip on hover */}
                      <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded bg-black/90 px-2 py-1 text-[10px] font-mono text-cyan-300 border border-cyan-500/30 whitespace-nowrap z-20">
                        {day.turnover.toLocaleString()} zł
                      </div>

                      {/* Bar Fill */}
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className={cn(
                          'w-full rounded-t-lg transition-all duration-300',
                          isSelected
                            ? 'bg-gradient-to-t from-cyan-600 to-cyan-300 shadow-[0_0_15px_#22d3ee]'
                            : 'bg-gradient-to-t from-white/10 to-white/25 hover:from-cyan-800 hover:to-cyan-400'
                        )}
                      />

                      {/* Day Label */}
                      <span className="mt-2 text-[10px] font-mono text-whisper-gray group-hover:text-white">
                        {day.date.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Game-by-Game Breakdown Grid */}
            <div className="rounded-2xl border border-white/10 bg-[#0c121e] p-5 shadow-lg">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="text-xs uppercase tracking-wider text-white font-medium flex items-center gap-2">
                  <Gamepad2 className="h-4 w-4 text-cyan-400" />
                  Разбивка по играм казино
                </span>
                <span className="text-[11px] font-mono text-whisper-gray">
                  Всего игр: {games.length}
                </span>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-white/10 text-[10px] text-whisper-gray uppercase">
                      <th className="pb-2.5">Игра</th>
                      <th className="pb-2.5">Ставок</th>
                      <th className="pb-2.5">Оборот</th>
                      <th className="pb-2.5">Выплаты</th>
                      <th className="pb-2.5">Доход (GGR)</th>
                      <th className="pb-2.5">Фактический RTP</th>
                      <th className="pb-2.5">Целевой RTP</th>
                      <th className="pb-2.5">Волатильность</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {games.map((g) => {
                      const isRtpGood = g.actualRtp <= g.targetRtp + 2;
                      return (
                        <tr key={g.gameType} className="hover:bg-white/[0.02]">
                          <td className="py-3 font-sans font-semibold text-white">
                            {g.name}
                          </td>
                          <td className="py-3 text-whisper-gray">
                            {g.betsCount.toLocaleString()}
                          </td>
                          <td className="py-3 text-white">
                            {g.turnover.toLocaleString()} zł
                          </td>
                          <td className="py-3 text-white">
                            {g.payouts.toLocaleString()} zł
                          </td>
                          <td className="py-3 text-emerald-400 font-semibold">
                            +{g.ggr.toLocaleString()} zł
                          </td>
                          <td className="py-3 font-semibold">
                            <span
                              className={cn(
                                'rounded px-2 py-0.5',
                                isRtpGood
                                  ? 'bg-emerald-500/15 text-emerald-400'
                                  : 'bg-amber-500/15 text-amber-400'
                              )}
                            >
                              {g.actualRtp}%
                            </span>
                          </td>
                          <td className="py-3 text-whisper-gray">
                            {g.targetRtp}%
                          </td>
                          <td className="py-3 uppercase text-[10px]">
                            <span
                              className={cn(
                                'rounded px-1.5 py-0.5',
                                g.volatility === 'high'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : g.volatility === 'medium'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-cyan-500/20 text-cyan-300'
                              )}
                            >
                              {g.volatility}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
