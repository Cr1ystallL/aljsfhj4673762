'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  X,
  Gift,
  Zap,
  Users,
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
  Filter,
  Sparkles,
  BarChart3,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';
import { HelpButton } from '@/components/admin/help-button';

interface Broadcast {
  id: string;
  status: 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'failed' | string;
  text: string;
  parseMode: string;
  mediaUrl: string | null;
  audience: unknown;
  scheduledAt: number | null;
  totalTargets: number;
  delivered: number;
  failed: number;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  errorMessage: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Запланирована',
  sending: 'В процессе отправки',
  sent: 'Отправлена',
  cancelled: 'Отменена',
  failed: 'Ошибка',
};

const STATUS_TINT: Record<string, string> = {
  scheduled: 'border-amber-400/40 bg-amber-400/10 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.15)]',
  sending: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.15)]',
  sent: 'border-white/15 bg-white/[0.04] text-frost-white/90',
  cancelled: 'border-white/15 bg-white/[0.03] text-whisper-gray',
  failed: 'border-rose-500/40 bg-rose-500/10 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.15)]',
};

export default function BroadcastsListPage() {
  const router = useRouter();
  const [data, setData] = useState<Broadcast[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'scheduled' | 'sent' | 'failed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Quick Re-engagement states
  const [inactive3dCount, setInactive3dCount] = useState<number | null>(null);
  const [loadingInactive, setLoadingInactive] = useState<boolean>(true);
  const [reengageBusy, setReengageBusy] = useState<boolean>(false);
  const [reengageResult, setReengageResult] = useState<{ code: string; totalTargets: number } | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/_x/broadcasts?limit=80', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        setData([]);
        return;
      }
      const j = await res.json();
      setData(j.broadcasts ?? []);
    } catch {
      setData([]);
    }
  }, []);

  const loadReengageStats = useCallback(async () => {
    setLoadingInactive(true);
    try {
      const res = await fetch('/api/_x/broadcasts/reengage-stats', { credentials: 'include' });
      if (res.ok) {
        const j = await res.json();
        setInactive3dCount(j.inactive3dCount ?? 0);
      }
    } catch {
      setInactive3dCount(0);
    } finally {
      setLoadingInactive(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    void loadReengageStats();
    const id = setInterval(reload, 5_000);
    return () => clearInterval(id);
  }, [reload, loadReengageStats]);

  const handleQuickReengage = async () => {
    if (!inactive3dCount || inactive3dCount === 0) {
      alert('Нет неактивных пользователей (>3 дней)');
      return;
    }

    if (!confirm(`Отправить удерживающую рассылку с бонусом 10 PLN для ${inactive3dCount} пользователей (>3 дней неактивности)?`)) {
      return;
    }

    setReengageBusy(true);
    try {
      const res = await fetch('/api/_x/broadcasts/quick-reengage', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 10, wagerMultiplier: 15 }),
      });

      if (!res.ok) {
        alert('Не удалось запустить удержание');
      } else {
        const j = await res.json();
        setReengageResult({ code: j.code, totalTargets: j.totalTargets });
        await reload();
        await loadReengageStats();
      }
    } catch {
      alert('Ошибка при запуске рассылки');
    } finally {
      setReengageBusy(false);
    }
  };

  const cancel = async (id: string) => {
    const reason = prompt('Причина отмены (минимум 3 символа):');
    if (!reason || reason.trim().length < 3) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/_x/broadcasts/${id}/cancel`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        alert('Не удалось отменить');
      } else {
        await reload();
      }
    } finally {
      setBusy(null);
    }
  };

  // Summary Metrics
  const statsSummary = useMemo(() => {
    if (!data) return { total: 0, delivered: 0, failed: 0, successRate: 0, activeCount: 0 };
    const total = data.length;
    const delivered = data.reduce((acc, b) => acc + (b.delivered || 0), 0);
    const failed = data.reduce((acc, b) => acc + (b.failed || 0), 0);
    const totalTargets = data.reduce((acc, b) => acc + (b.totalTargets || 0), 0);
    const successRate = totalTargets > 0 ? Math.round((delivered / totalTargets) * 100) : 100;
    const activeCount = data.filter((b) => b.status === 'scheduled' || b.status === 'sending').length;
    return { total, delivered, failed, successRate, activeCount };
  }, [data]);

  // Filtered List
  const filteredData = useMemo(() => {
    if (!data) return [];
    return data.filter((b) => {
      if (filterTab === 'scheduled' && b.status !== 'scheduled' && b.status !== 'sending') return false;
      if (filterTab === 'sent' && b.status !== 'sent') return false;
      if (filterTab === 'failed' && b.status !== 'failed') return false;
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase();
        return b.text.toLowerCase().includes(q) || b.id.toLowerCase().includes(q);
      }
      return true;
    });
  }, [data, filterTab, searchQuery]);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-10">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="font-roobert text-[11px] uppercase tracking-[0.2em] text-whisper-gray">
            Управление кампейными
          </div>
          <div className="font-roobert text-[22px] font-light text-frost-white flex items-center gap-2">
            <span>Рассылки & Удержание аудитории</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20 font-mono">
              {data?.length ?? 0} компаний
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/system/console/broadcasts/new')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-200 text-black font-semibold text-[13px] shadow-[0_0_20px_rgba(255,172,46,0.25)] transition-all transform hover:scale-[1.02]"
          >
            <Plus size={16} strokeWidth={2.2} />
            Создать рассылку
          </button>

          <HelpButton title="Система рассылок и удержания">
            <p>
              Рассылки отправляются со скоростью <strong>25 сообщений / сек</strong> (безопасно для лимитов Telegram Bot API).
            </p>
            <p>
              Модуль <strong>быстрого удержания (Re-engagement)</strong> автоматически находит игроков, не заходивших более 3 дней, генерирует подарочный промокод на 10 PLN с вейджером 15х (который зашит в базе, но не пишется в сообщении) и запускает рассылку за 1 клик.
            </p>
          </HelpButton>
        </div>
      </div>

      {/* Hero Re-Engagement Module Card */}
      <section className="relative overflow-hidden rounded-[24px] border border-amber-400/30 bg-gradient-to-r from-amber-500/10 via-black/60 to-black/80 backdrop-blur-3xl p-6 shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-400/10 blur-[100px] pointer-events-none rounded-full" />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-start gap-4 max-w-2xl">
            <div className="w-12 h-12 rounded-2xl border border-amber-400/40 bg-amber-400/15 flex items-center justify-center text-amber-400 shrink-0 shadow-[0_0_20px_rgba(255,172,46,0.2)]">
              <Gift size={24} strokeWidth={1.8} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-roobert text-[11px] uppercase tracking-[0.2em] text-amber-400 font-bold">
                  Модуль быстрого удержания (Re-Engagement)
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-400/20 text-amber-300 font-mono">
                  1-Click Auto Bonus
                </span>
              </div>
              <h2 className="font-roobert text-[18px] font-medium text-white mt-1">
                Вернуть спящих игроков (Не заходили &gt; 3 дней)
              </h2>
              <p className="font-roobert text-[12.5px] text-whisper-gray mt-1 leading-relaxed">
                Автоматический отбор неактивных клиентов. Позволяет в один клик сгенерировать подарок <b>10 PLN</b> (с вейджером 15х) и сразу запустить рассылку в Telegram!
              </p>
            </div>
          </div>

          {/* Action Trigger Block */}
          <div className="flex items-center gap-4 bg-white/[0.03] border border-white/10 p-3.5 rounded-2xl backdrop-blur-xl">
            <div className="text-right">
              <div className="font-roobert text-[10.5px] uppercase tracking-[0.1em] text-whisper-gray">
                Неактивны &gt; 3 дней
              </div>
              <div className="font-roobert text-[22px] font-bold text-amber-400 tabular-nums flex items-center justify-end gap-1.5">
                {loadingInactive ? (
                  <span className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>{inactive3dCount?.toLocaleString('ru-RU') ?? 0} чел.</span>
                )}
              </div>
            </div>

            <button
              onClick={handleQuickReengage}
              disabled={reengageBusy || !inactive3dCount || inactive3dCount === 0}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-200 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-[13px] shadow-[0_0_25px_rgba(255,172,46,0.3)] transition-all transform hover:scale-[1.03]"
            >
              {reengageBusy ? (
                <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <Zap size={16} fill="currentColor" />
              )}
              <span>Отправить подарок 10 PLN</span>
            </button>
          </div>
        </div>

        {/* Quick Result Toast */}
        <AnimatePresence>
          {reengageResult && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center justify-between text-xs font-roobert"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>
                  Удерживающая рассылка запущена для <b>{reengageResult.totalTargets}</b> пользователей! Промокод: <code>{reengageResult.code}</code> (10 PLN, вейджер 15x зашит в базе).
                </span>
              </div>
              <button onClick={() => setReengageResult(null)} className="text-emerald-300 hover:text-white">
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Analytics KPI Tiles */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
          <div className="flex items-center justify-between text-whisper-gray mb-1">
            <span className="font-roobert text-[10.5px] uppercase tracking-[0.08em]">Всего компаний</span>
            <BarChart3 size={14} />
          </div>
          <div className="font-roobert text-[20px] font-light text-white tabular-nums">
            {statsSummary.total}
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
          <div className="flex items-center justify-between text-whisper-gray mb-1">
            <span className="font-roobert text-[10.5px] uppercase tracking-[0.08em]">Доставлено</span>
            <Send size={14} className="text-emerald-400" />
          </div>
          <div className="font-roobert text-[20px] font-light text-emerald-400 tabular-nums">
            {statsSummary.delivered.toLocaleString('ru-RU')}
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
          <div className="flex items-center justify-between text-whisper-gray mb-1">
            <span className="font-roobert text-[10.5px] uppercase tracking-[0.08em]">Успешность</span>
            <TrendingUp size={14} className="text-cyan-400" />
          </div>
          <div className="font-roobert text-[20px] font-light text-cyan-400 tabular-nums">
            {statsSummary.successRate}%
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
          <div className="flex items-center justify-between text-whisper-gray mb-1">
            <span className="font-roobert text-[10.5px] uppercase tracking-[0.08em]">Активные сейчас</span>
            <Clock size={14} className="text-amber-400" />
          </div>
          <div className="font-roobert text-[20px] font-light text-amber-400 tabular-nums">
            {statsSummary.activeCount}
          </div>
        </div>
      </section>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <div className="flex items-center gap-1 p-1 rounded-full bg-white/[0.04] border border-white/10">
          {(
            [
              { id: 'all', label: 'Все компании' },
              { id: 'scheduled', label: 'Запланированы / Отправляются' },
              { id: 'sent', label: 'Завершенные' },
              { id: 'failed', label: 'С ошибками' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id)}
              className={`px-3.5 py-1.5 rounded-full text-[11.5px] font-medium font-roobert transition-all ${
                filterTab === tab.id
                  ? 'bg-amber-400 text-black font-semibold shadow-md'
                  : 'text-whisper-gray hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-whisper-gray" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по тексту или ID..."
            className="w-full pl-9 pr-4 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-[12px] text-white placeholder-whisper-gray focus:outline-none focus:border-amber-400/50 font-roobert"
          />
        </div>
      </div>

      {/* Broadcast Cards Grid / List */}
      {data === null ? (
        <div className="rounded-card border border-white/10 bg-white/[0.03] py-16 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border border-white/20 border-t-amber-400 animate-spin" />
        </div>
      ) : filteredData.length === 0 ? (
        <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-12 text-center font-roobert text-[13px] text-whisper-gray">
          Рассылок не найдено.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredData.map((b) => {
            const progress =
              b.totalTargets > 0
                ? Math.round(((b.delivered + b.failed) / b.totalTargets) * 100)
                : 0;

            return (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl hover:border-white/20 transition-all shadow-[0_4px_20px_rgba(0,0,0,0.2)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2.5 py-0.5 rounded-full border font-roobert text-[10.5px] uppercase tracking-[0.12em] font-semibold ${
                        STATUS_TINT[b.status] ?? 'border-white/15 bg-white/[0.04] text-whisper-gray'
                      }`}
                    >
                      {STATUS_LABEL[b.status] ?? b.status}
                    </span>
                    <span className="font-roobert text-[11.5px] text-whisper-gray tabular-nums">
                      {new Date(b.createdAt).toLocaleString('ru-RU')}
                    </span>
                  </div>

                  {(b.status === 'scheduled' || b.status === 'sending') && (
                    <button
                      onClick={() => cancel(b.id)}
                      disabled={busy === b.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 disabled:opacity-50 transition-colors font-roobert text-[11px]"
                    >
                      <X size={12} />
                      Отменить
                    </button>
                  )}
                </div>

                {/* Broadcast Message Text */}
                <div className="mt-3 font-roobert text-[13.5px] text-white/95 leading-relaxed bg-black/30 p-3 rounded-xl border border-white/5 font-mono">
                  {b.text}
                </div>

                {/* Delivery Progress & Stats */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] font-roobert text-whisper-gray">
                  <div className="flex items-center gap-4">
                    <span>
                      Аудитория: <b className="text-white">{b.totalTargets.toLocaleString('ru-RU')}</b>
                    </span>
                    <span>
                      Доставлено: <b className="text-emerald-400">{b.delivered.toLocaleString('ru-RU')}</b>
                    </span>
                    {b.failed > 0 && (
                      <span className="text-rose-400">
                        Ошибок: <b>{b.failed.toLocaleString('ru-RU')}</b>
                      </span>
                    )}
                  </div>

                  <span className="font-mono text-amber-400 font-bold">{progress}% отправлено</span>
                </div>

                {/* Progress bar */}
                {b.totalTargets > 0 && (
                  <div className="mt-2 h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 rounded-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}

                {b.errorMessage && (
                  <div className="mt-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300 font-roobert">
                    <b>Ошибка:</b> {b.errorMessage}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
