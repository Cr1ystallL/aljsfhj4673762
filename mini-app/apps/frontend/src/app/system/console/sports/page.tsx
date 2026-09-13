'use client';

import { useCallback, useEffect, useState } from 'react';
import { HelpButton } from '@/components/admin/help-button';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  BarChart3,
  Check,
  Clock,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react';

type Tab = 'line' | 'events' | 'bets' | 'risks';

const SPORTS = ['football', 'tennis', 'hockey', 'basketball', 'mma', 'cybersport'] as const;

interface SportsCfg {
  paused?: boolean;
  hidden?: boolean;
  minBet?: number;
  maxBet?: number;
  extras?: Record<string, unknown>;
}

interface AdminEvent {
  id: string;
  league: string;
  status: string;
  suspended?: boolean;
  team1: { name: string; score?: number };
  team2: { name: string; score?: number };
  sport: string;
}

interface AdminBet {
  id: string;
  userId: string;
  userName: string;
  eventName: string;
  type: string;
  stake: number;
  odds: number;
  state: string;
  payout: number;
  placedAt: string;
}

interface OutcomeExposure {
  outcomeKey: string;
  label: string;
  betsCount: number;
  stake: number;
  liability: number;
}

interface EventRisk {
  eventId: string;
  sport: string;
  league: string;
  team1: string;
  team2: string;
  status: string;
  totalBets: number;
  totalStake: number;
  outcomes: Record<string, OutcomeExposure>;
  maxLiability: number;
  netExposure: number;
}

interface SportsRisksResponse {
  globalActiveStake: number;
  globalMaxLiability: number;
  activeEventsCount: number;
  events: EventRisk[];
}

export default function SportsAdminPage() {
  const [tab, setTab] = useState<Tab>('risks');
  const [cfg, setCfg] = useState<SportsCfg | null>(null);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [bets, setBets] = useState<AdminBet[]>([]);
  const [risks, setRisks] = useState<SportsRisksResponse | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  // Settle Modal State
  const [settleEvent, setSettleEvent] = useState<AdminEvent | null>(null);
  const [settleScore1, setSettleScore1] = useState('0');
  const [settleScore2, setSettleScore2] = useState('0');
  const [settleReason, setSettleReason] = useState('Ручной расчет матча');

  // Void Modal State (Event or Bet)
  const [voidTarget, setVoidTarget] = useState<{ type: 'event' | 'bet'; id: string; title: string } | null>(null);
  const [voidReason, setVoidReason] = useState('Отмена события / возврат ставки');

  const load = useCallback(async () => {
    try {
      const [g, e, b, r] = await Promise.all([
        fetch('/api/_x/games/sports', { credentials: 'include', cache: 'no-store' }).then((res) => res.json()).catch(() => ({})),
        fetch('/api/_x/sports/events', { credentials: 'include', cache: 'no-store' }).then((res) => res.json()).catch(() => ({})),
        fetch('/api/_x/sports/bets', { credentials: 'include', cache: 'no-store' }).then((res) => res.json()).catch(() => ({})),
        fetch('/api/_x/sports/risks', { credentials: 'include', cache: 'no-store' }).then((res) => res.json()).catch(() => null),
      ]);
      setCfg(g.config ?? null);
      setEvents(e.events ?? []);
      setBets(b.bets ?? []);
      if (r && r.ok) {
        setRisks(r);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const enabled = new Set(
    Array.isArray(cfg?.extras?.enabledSports)
      ? (cfg?.extras?.enabledSports as string[])
      : SPORTS
  );

  const saveLine = async () => {
    if (reason.trim().length < 3) {
      alert('Причина обязательна (минимум 3 символа)');
      return;
    }
    setBusy(true);
    try {
      await fetch('/api/_x/games/sports', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ extras: cfg?.extras ?? {}, reason: reason.trim() }),
      });
      setReason('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleSuspend = async (ev: AdminEvent) => {
    const why = prompt('Причина приостановки / возобновления') ?? '';
    if (why.trim().length < 3) return;
    await fetch(`/api/_x/sports/events/${encodeURIComponent(ev.id)}/suspend`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ suspended: !ev.suspended, reason: why.trim() }),
    });
    await load();
  };

  const handleConfirmSettle = async () => {
    if (!settleEvent) return;
    const s1 = Number(settleScore1);
    const s2 = Number(settleScore2);
    if (!Number.isFinite(s1) || !Number.isFinite(s2)) {
      alert('Укажите корректный счет');
      return;
    }
    if (!settleReason || settleReason.trim().length < 3) {
      alert('Укажите причину расчета (минимум 3 символа)');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/_x/sports/events/${encodeURIComponent(settleEvent.id)}/settle`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ score1: s1, score2: s2, reason: settleReason.trim() }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j.error || 'Ошибка расчета');
        return;
      }
      setSettleEvent(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmVoid = async () => {
    if (!voidTarget) return;
    if (!voidReason || voidReason.trim().length < 3) {
      alert('Укажите причину отмены (минимум 3 символа)');
      return;
    }
    setBusy(true);
    try {
      const endpoint =
        voidTarget.type === 'event'
          ? `/api/_x/sports/events/${encodeURIComponent(voidTarget.id)}/void`
          : `/api/_x/sports/bets/${encodeURIComponent(voidTarget.id)}/void`;

      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: voidReason.trim() }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j.error || 'Ошибка отмены');
        return;
      }
      setVoidTarget(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
            Букмекерский пульт
          </span>
          <button
            onClick={() => void load()}
            className="p-1 rounded-pill hover:bg-white/5 text-whisper-gray hover:text-frost-white transition-colors"
          >
            <RefreshCw size={12} />
          </button>
        </div>
        <HelpButton title="Управление спортом">
          <p>
            <b>Риски</b>: перекосы ставок, максимальные потенциальные выплаты платформы и открытые риски по матчам.
            <br />
            <b>События</b>: ручной ввод счета и расчет (Settle), отмена и возврат матча (Void).
            <br />
            <b>Ставки</b>: журнал купонов и точечная отмена зависших/ошибочных ставок.
          </p>
        </HelpButton>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-2xl border border-white/10 bg-white/[0.03]">
        {(['risks', 'events', 'bets', 'line'] as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex-1 py-2 rounded-xl font-roobert text-[12px] font-semibold transition-all',
              tab === id
                ? 'bg-[#1e222b] text-frost-white border border-white/15 shadow-sm'
                : 'text-whisper-gray hover:text-frost-white'
            )}
          >
            {id === 'risks' ? 'Риски' : id === 'events' ? 'События' : id === 'bets' ? 'Ставки' : 'Линия'}
          </button>
        ))}
      </div>

      {/* RISKS & LIABILITIES TAB */}
      {tab === 'risks' && (
        <div className="flex flex-col gap-4">
          {/* KPI Tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-1">
              <div className="text-[11px] font-roobert text-whisper-gray uppercase tracking-wider">
                Активный оборот
              </div>
              <div className="text-[20px] font-roobert text-frost-white font-medium tabular-nums">
                {risks?.globalActiveStake?.toLocaleString('ru-RU') ?? '0'} zł
              </div>
              <div className="text-[10px] text-whisper-gray">
                В {risks?.activeEventsCount ?? 0} матчах
              </div>
            </div>

            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4 flex flex-col gap-1">
              <div className="text-[11px] font-roobert text-amber-300/80 uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle size={12} />
                Макс. обязательство
              </div>
              <div className="text-[20px] font-roobert text-amber-300 font-medium tabular-nums">
                {risks?.globalMaxLiability?.toLocaleString('ru-RU') ?? '0'} zł
              </div>
              <div className="text-[10px] text-whisper-gray">
                При наихудшем сценарии
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-1">
              <div className="text-[11px] font-roobert text-whisper-gray uppercase tracking-wider">
                Экспозиция риска
              </div>
              <div
                className={cn(
                  'text-[20px] font-roobert font-medium tabular-nums',
                  (risks?.globalMaxLiability ?? 0) - (risks?.globalActiveStake ?? 0) > 5000
                    ? 'text-rose-400'
                    : 'text-emerald-400'
                )}
              >
                {Math.max(0, (risks?.globalMaxLiability ?? 0) - (risks?.globalActiveStake ?? 0)).toLocaleString('ru-RU')} zł
              </div>
              <div className="text-[10px] text-whisper-gray">
                Потенциальный минус кассы
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-1">
              <div className="text-[11px] font-roobert text-whisper-gray uppercase tracking-wider">
                Мониторинг
              </div>
              <div className="text-[14px] font-roobert text-emerald-400 font-medium flex items-center gap-1.5 pt-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Watchdog
              </div>
              <div className="text-[10px] text-whisper-gray">
                Лимит экспрессов: 35.00
              </div>
            </div>
          </div>

          {/* Events Risk Table */}
          {risks?.events && risks.events.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="text-[13px] font-roobert text-frost-white/80 font-medium px-1">
                События с наибольшим риском перекоса
              </div>
              {risks.events.map((ev) => {
                const total = ev.totalStake || 1;
                const p1Share = Math.round(((ev.outcomes['1']?.stake || 0) / total) * 100);
                const xShare = Math.round(((ev.outcomes['X']?.stake || 0) / total) * 100);
                const p2Share = Math.round(((ev.outcomes['2']?.stake || 0) / total) * 100);

                return (
                  <div
                    key={ev.eventId}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                      <div>
                        <div className="font-roobert text-[14px] font-semibold text-frost-white">
                          {ev.team1} — {ev.team2}
                        </div>
                        <div className="font-roobert text-[11px] text-whisper-gray mt-0.5">
                          {ev.sport.toUpperCase()} · {ev.league} · Ставок: {ev.totalBets}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <div className="text-[10px] text-whisper-gray">Оборот матча</div>
                          <div className="font-roobert text-[13px] text-frost-white font-medium">
                            {ev.totalStake.toLocaleString('ru-RU')} zł
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-whisper-gray">Макс. выплата</div>
                          <div className="font-roobert text-[13px] text-amber-300 font-medium">
                            {ev.maxLiability.toLocaleString('ru-RU')} zł
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-whisper-gray">Риск конторы</div>
                          <div
                            className={cn(
                              'font-roobert text-[13px] font-medium',
                              ev.netExposure > 1000 ? 'text-rose-400' : 'text-emerald-400'
                            )}
                          >
                            {ev.netExposure > 0 ? `-${ev.netExposure.toLocaleString('ru-RU')}` : '0'} zł
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Outcome Distribution Bar */}
                    <div className="flex flex-col gap-1.5 pt-1">
                      <div className="flex items-center justify-between text-[11px] font-roobert text-whisper-gray">
                        <span>П1 ({p1Share}% · {ev.outcomes['1']?.liability ?? 0} zł)</span>
                        <span>Х ({xShare}% · {ev.outcomes['X']?.liability ?? 0} zł)</span>
                        <span>П2 ({p2Share}% · {ev.outcomes['2']?.liability ?? 0} zł)</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden bg-white/10 flex">
                        <div style={{ width: `${p1Share}%` }} className="bg-sky-400" />
                        <div style={{ width: `${xShare}%` }} className="bg-amber-400" />
                        <div style={{ width: `${p2Share}%` }} className="bg-rose-400" />
                      </div>
                    </div>

                    {/* Fast Action Buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => {
                          setSettleEvent({
                            id: ev.eventId,
                            league: ev.league,
                            status: ev.status,
                            team1: { name: ev.team1 },
                            team2: { name: ev.team2 },
                            sport: ev.sport,
                          });
                          setSettleScore1('0');
                          setSettleScore2('0');
                        }}
                        className="px-3 py-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-roobert text-[11px] font-medium transition-colors"
                      >
                        Рассчитать счет
                      </button>
                      <button
                        onClick={() =>
                          setVoidTarget({
                            type: 'event',
                            id: ev.eventId,
                            title: `${ev.team1} — ${ev.team2}`,
                          })
                        }
                        className="px-3 py-1 rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-roobert text-[11px] font-medium transition-colors"
                      >
                        Снять матч (Void)
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center text-[12px] text-whisper-gray">
              В данный момент нет матчей с активными открытыми ставками.
            </div>
          )}
        </div>
      )}

      {/* EVENTS TAB */}
      {tab === 'events' && (
        <div className="flex flex-col gap-2">
          {events.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center text-[12px] text-whisper-gray">
              Нет активных событий.
            </div>
          ) : (
            events.map((ev) => (
              <div key={ev.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-roobert text-[14px] font-semibold text-frost-white truncate">
                      {ev.team1.name} — {ev.team2.name}
                    </div>
                    <div className="font-roobert text-[11px] text-whisper-gray mt-0.5">
                      {ev.league} · {ev.sport} · {ev.status}
                      {ev.suspended ? ' · (прием приостановлен)' : ''}
                    </div>
                  </div>
                  <span className="tabular-nums font-roobert text-[14px] font-bold text-frost-white bg-white/5 px-2 py-0.5 rounded-lg border border-white/10">
                    {ev.team1.score ?? 0} : {ev.team2.score ?? 0}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="px-3 py-1 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-[11px] font-roobert text-frost-white transition-colors"
                    onClick={() => void handleSuspend(ev)}
                  >
                    {ev.suspended ? 'Возобновить' : 'Приостановить'}
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-[11px] font-roobert text-emerald-300 transition-colors"
                    onClick={() => {
                      setSettleEvent(ev);
                      setSettleScore1(String(ev.team1.score ?? 0));
                      setSettleScore2(String(ev.team2.score ?? 0));
                    }}
                  >
                    Ручной расчет
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1 rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-[11px] font-roobert text-rose-300 transition-colors"
                    onClick={() =>
                      setVoidTarget({
                        type: 'event',
                        id: ev.id,
                        title: `${ev.team1.name} — ${ev.team2.name}`,
                      })
                    }
                  >
                    Отменить (Void)
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* BETS TAB */}
      {tab === 'bets' && (
        <div className="flex flex-col gap-2">
          {bets.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center text-[12px] text-whisper-gray">
              Журнал ставок пуст.
            </div>
          ) : (
            bets.map((bet) => (
              <div
                key={bet.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 font-roobert text-[12px]"
              >
                <div className="min-w-0">
                  <div className="text-frost-white font-semibold text-[13px]">{bet.eventName}</div>
                  <div className="text-whisper-gray mt-0.5">
                    Игрок: <span className="text-frost-white/80">{bet.userName}</span> · Тип: {bet.type} · Ставка: {bet.stake} zł × {bet.odds.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-whisper-gray/70 mt-0.5">
                    Статус: <span className="uppercase text-frost-white font-mono">{bet.state}</span>
                    {bet.payout > 0 && ` · Выплата: +${bet.payout} zł`}
                  </div>
                </div>

                {bet.state === 'pending' && (
                  <button
                    type="button"
                    onClick={() =>
                      setVoidTarget({
                        type: 'bet',
                        id: bet.id,
                        title: `Купон #${bet.id.slice(-6)} (${bet.stake} zł)`,
                      })
                    }
                    className="self-end md:self-center px-3 py-1 rounded-pill border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 text-[11px] font-medium transition-colors"
                  >
                    Аннулировать (Void)
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* LINE CONFIG TAB */}
      {tab === 'line' && cfg && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3">
          <div className="font-roobert text-[12px] text-whisper-gray">Виды спорта на линии</div>
          <div className="flex flex-wrap gap-1.5">
            {SPORTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  const next = new Set(enabled);
                  if (next.has(s)) next.delete(s);
                  else next.add(s);
                  setCfg((c) =>
                    c
                      ? { ...c, extras: { ...(c.extras ?? {}), enabledSports: [...next] } }
                      : c
                  );
                }}
                className={cn(
                  'px-3 py-1.5 rounded-full border font-roobert text-[12px] transition-colors',
                  enabled.has(s)
                    ? 'bg-frost-white text-midnight-canvas border-white/40 font-medium'
                    : 'bg-white/[0.04] text-whisper-gray border-white/10'
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Причина изменения настроек линии"
            className="bg-white/[0.04] border border-white/15 rounded-xl px-3 py-2 font-roobert text-[13px] text-frost-white"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveLine()}
            className="px-4 py-2 rounded-xl border border-white/15 bg-white/[0.06] hover:bg-white/[0.1] text-frost-white font-roobert text-[12px] font-semibold transition-colors w-fit"
          >
            Сохранить виды
          </button>
        </div>
      )}

      {/* Settle Modal */}
      {settleEvent && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121214] border border-white/15 rounded-card max-w-md w-full p-5 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-roobert text-emerald-400 font-medium flex items-center gap-2">
                <Check size={18} />
                Ручной расчет матча
              </div>
              <button onClick={() => setSettleEvent(null)} className="text-whisper-gray hover:text-frost-white">
                <X size={18} />
              </button>
            </div>

            <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3 text-[13px] font-roobert text-frost-white">
              {settleEvent.team1.name} — {settleEvent.team2.name}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] text-whisper-gray">Голы: {settleEvent.team1.name}</label>
                <input
                  type="number"
                  min="0"
                  value={settleScore1}
                  onChange={(e) => setSettleScore1(e.target.value)}
                  className="bg-white/[0.05] border border-white/15 rounded-lg px-3 py-2 text-[14px] text-frost-white focus:outline-none focus:border-emerald-500/60"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] text-whisper-gray">Голы: {settleEvent.team2.name}</label>
                <input
                  type="number"
                  min="0"
                  value={settleScore2}
                  onChange={(e) => setSettleScore2(e.target.value)}
                  className="bg-white/[0.05] border border-white/15 rounded-lg px-3 py-2 text-[14px] text-frost-white focus:outline-none focus:border-emerald-500/60"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] text-whisper-gray">Обоснование (аудит)</label>
              <input
                type="text"
                value={settleReason}
                onChange={(e) => setSettleReason(e.target.value)}
                className="bg-white/[0.05] border border-white/15 rounded-lg px-3 py-2 text-[13px] text-frost-white focus:outline-none focus:border-emerald-500/60"
              />
            </div>

            <p className="text-[11px] text-whisper-gray">
              Все исходы и купоны (ординары и экспрессы) будут рассчитаны немедленно в соответствии с введенным счетом.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSettleEvent(null)}
                className="px-4 py-2 rounded-pill border border-white/10 text-[13px] text-whisper-gray hover:bg-white/5 font-roobert"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmSettle}
                className="px-4 py-2 rounded-pill bg-emerald-500 hover:bg-emerald-600 text-black font-roobert text-[13px] font-semibold flex items-center gap-2"
              >
                {busy && <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />}
                Рассчитать событие
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Modal */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121214] border border-white/15 rounded-card max-w-md w-full p-5 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-roobert text-rose-400 font-medium flex items-center gap-2">
                <AlertTriangle size={18} />
                {voidTarget.type === 'event' ? 'Отмена события (Void)' : 'Отмена ставки (Void)'}
              </div>
              <button onClick={() => setVoidTarget(null)} className="text-whisper-gray hover:text-frost-white">
                <X size={18} />
              </button>
            </div>

            <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3 text-[13px] font-roobert text-frost-white">
              {voidTarget.title}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] text-whisper-gray">Причина отмены (аудит)</label>
              <input
                type="text"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Матч прерван / перенесен / техническая ошибка"
                className="bg-white/[0.05] border border-white/15 rounded-lg px-3 py-2 text-[13px] text-frost-white focus:outline-none focus:border-rose-500/60"
              />
            </div>

            <p className="text-[11px] text-whisper-gray">
              {voidTarget.type === 'event'
                ? 'Все нерассчитанные ставки на этот матч будут возвращены игрокам с коэффициентом 1.00 (деньги вернутся на баланс).'
                : 'Сумма этой ставки будет немедленно возвращена игроку на баланс через откат транзакции.'}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                className="px-4 py-2 rounded-pill border border-white/10 text-[13px] text-whisper-gray hover:bg-white/5 font-roobert"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmVoid}
                className="px-4 py-2 rounded-pill bg-rose-500 hover:bg-rose-600 text-white font-roobert text-[13px] font-semibold flex items-center gap-2"
              >
                {busy && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Подтвердить возврат
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
