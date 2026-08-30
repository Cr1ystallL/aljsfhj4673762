'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HelpButton } from '@/components/admin/help-button';
import { cn } from '@/lib/utils';

type Tab = 'line' | 'events' | 'bets' | 'access';

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
  userName: string;
  eventName: string;
  type: string;
  stake: number;
  odds: number;
  state: string;
  payout: number;
}

interface AccessUser {
  id: string;
  telegramId: number;
  username: string | null;
  name: string;
}

export default function SportsAdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('line');
  const [cfg, setCfg] = useState<SportsCfg | null>(null);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [bets, setBets] = useState<AdminBet[]>([]);
  const [accessUsers, setAccessUsers] = useState<AccessUser[]>([]);
  const [grantId, setGrantId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [g, e, b, a] = await Promise.all([
      fetch('/api/_x/games/sports', { credentials: 'include', cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/_x/sports/events', { credentials: 'include', cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/_x/sports/bets', { credentials: 'include', cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/_x/sports/access', { credentials: 'include', cache: 'no-store' }).then((r) => r.json()),
    ]);
    setCfg(g.config ?? null);
    setEvents(e.events ?? []);
    setBets(b.bets ?? []);
    setAccessUsers(Array.isArray(a.users) ? a.users : []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const enabled = new Set(
    Array.isArray(cfg?.extras?.enabledSports)
      ? (cfg?.extras?.enabledSports as string[])
      : SPORTS
  );

  const saveLine = async () => {
    if (reason.trim().length < 3) {
      alert('Причина обязательна');
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

  const act = async (id: string, path: string, body: Record<string, unknown>) => {
    const why = prompt('Причина') ?? '';
    if (why.trim().length < 3) return;
    await fetch(`/api/_x/sports/events/${encodeURIComponent(id)}/${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, reason: why.trim() }),
    });
    await load();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between px-1">
        <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
          Спорт
        </span>
        <HelpButton title="Категории спорта">
          <p>Линия — лимиты и виды спорта. События — снять, void, ручной расчёт. Ставки — журнал купонов. Доступ — выдать раздел ставок игроку без роли админа (в доке вместо партнёрки).</p>
        </HelpButton>
      </div>

      <div className="flex gap-1 p-1 rounded-2xl border border-white/10 bg-white/[0.03]">
        {(['line', 'events', 'bets', 'access'] as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex-1 py-2 rounded-xl font-roobert text-[12px] font-semibold',
              tab === id ? 'bg-[#1e222b] text-frost-white border border-white/15' : 'text-whisper-gray'
            )}
          >
            {id === 'line' ? 'Линия' : id === 'events' ? 'События' : id === 'bets' ? 'Ставки' : 'Доступ'}
          </button>
        ))}
      </div>

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
                  'px-3 py-1.5 rounded-full border font-roobert text-[12px]',
                  enabled.has(s)
                    ? 'bg-frost-white text-midnight-canvas border-white/40'
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
            placeholder="Причина изменения"
            className="bg-white/[0.04] border border-white/15 rounded-xl px-3 py-2 font-roobert text-[13px] text-frost-white"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveLine()}
            className="px-4 py-2 rounded-xl border border-white/15 bg-white/[0.06] text-frost-white font-roobert text-[12px] font-semibold"
          >
            Сохранить виды
          </button>
        </div>
      )}

      {tab === 'events' && (
        <div className="flex flex-col gap-2">
          {events.map((ev) => (
            <div key={ev.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-roobert text-[13px] font-semibold text-frost-white truncate">
                    {ev.team1.name} — {ev.team2.name}
                  </div>
                  <div className="font-roobert text-[11px] text-whisper-gray">
                    {ev.league} · {ev.sport} · {ev.status}
                    {ev.suspended ? ' · снято' : ''}
                  </div>
                </div>
                <span className="tabular-nums font-roobert text-[13px] text-frost-white">
                  {ev.team1.score ?? 0}:{ev.team2.score ?? 0}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="px-2.5 py-1 rounded-lg border border-white/10 text-[11px] text-frost-white"
                  onClick={() => void act(ev.id, 'suspend', { suspended: !ev.suspended })}
                >
                  {ev.suspended ? 'Вернуть' : 'Снять'}
                </button>
                <button
                  type="button"
                  className="px-2.5 py-1 rounded-lg border border-white/10 text-[11px] text-frost-white"
                  onClick={() => void act(ev.id, 'void', {})}
                >
                  Void
                </button>
                <button
                  type="button"
                  className="px-2.5 py-1 rounded-lg border border-white/10 text-[11px] text-frost-white"
                  onClick={() => {
                    const s1 = Number(prompt('Счёт хозяев', String(ev.team1.score ?? 0)));
                    const s2 = Number(prompt('Счёт гостей', String(ev.team2.score ?? 0)));
                    if (!Number.isFinite(s1) || !Number.isFinite(s2)) return;
                    void act(ev.id, 'settle', { score1: s1, score2: s2 });
                  }}
                >
                  Расчёт
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'access' && (
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-2">
            <div className="font-roobert text-[12px] text-whisper-gray">
              Игрок не становится админом. В нижнем меню у него «Ставки» вместо «Партнёрка».
            </div>
            <input
              value={grantId}
              onChange={(e) => setGrantId(e.target.value)}
              placeholder="Telegram ID"
              className="bg-white/[0.04] border border-white/15 rounded-xl px-3 py-2 font-roobert text-[13px] text-frost-white"
            />
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Причина"
              className="bg-white/[0.04] border border-white/15 rounded-xl px-3 py-2 font-roobert text-[13px] text-frost-white"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const telegramId = Number(grantId.trim());
                if (!Number.isFinite(telegramId) || telegramId <= 0) {
                  alert('Укажи Telegram ID');
                  return;
                }
                if (reason.trim().length < 3) {
                  alert('Причина обязательна');
                  return;
                }
                setBusy(true);
                void fetch('/api/_x/sports/access', {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                    telegramId,
                    enabled: true,
                    reason: reason.trim(),
                  }),
                })
                  .then(async (r) => {
                    if (!r.ok) {
                      const j = await r.json().catch(() => null);
                      alert(j?.error ?? 'Не удалось выдать доступ');
                      return;
                    }
                    setGrantId('');
                    setReason('');
                    await load();
                  })
                  .finally(() => setBusy(false));
              }}
              className="px-4 py-2 rounded-xl border border-white/15 bg-white/[0.06] text-frost-white font-roobert text-[12px] font-semibold"
            >
              Выдать доступ
            </button>
          </div>
          {accessUsers.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center font-roobert text-[12px] text-whisper-gray">
              Пока никому не выдано.
            </div>
          ) : (
            accessUsers.map((u) => (
              <div
                key={u.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 flex items-center justify-between gap-3"
              >
                <button
                  type="button"
                  onClick={() => router.push(`/system/console/users/${u.id}`)}
                  className="min-w-0 text-left"
                >
                  <div className="font-roobert text-[13px] text-frost-white truncate">{u.name}</div>
                  <div className="font-roobert text-[11px] text-whisper-gray tabular-nums">
                    #{u.telegramId}
                    {u.username ? ` · @${u.username}` : ''}
                  </div>
                </button>
                <button
                  type="button"
                  className="shrink-0 px-2.5 py-1 rounded-lg border border-white/10 text-[11px] text-frost-white"
                  onClick={() => {
                    const why = prompt('Причина отзыва') ?? '';
                    if (why.trim().length < 3) return;
                    void fetch('/api/_x/sports/access', {
                      method: 'POST',
                      credentials: 'include',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({
                        userId: u.id,
                        enabled: false,
                        reason: why.trim(),
                      }),
                    }).then(() => load());
                  }}
                >
                  Забрать
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'bets' && (
        <div className="flex flex-col gap-2">
          {bets.map((bet) => (
            <div key={bet.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 font-roobert text-[12px]">
              <div className="text-frost-white font-semibold">{bet.eventName}</div>
              <div className="text-whisper-gray">
                {bet.userName} · {bet.type} · {bet.stake} × {bet.odds.toFixed(2)} · {bet.state}
                {bet.payout > 0 ? ` · ${bet.payout}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
