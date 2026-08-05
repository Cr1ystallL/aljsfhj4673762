'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Ticket,
  Trophy,
  Calendar,
  X,
  Shuffle,
  CheckCircle,
  Ban,
  Power,
  Gift,
  Settings as SettingsIcon,
  Wallet as WalletIcon,
  Repeat,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { gameLabel, type GameKey } from '@/components/ui/game-icon';

/**
 * Admin → Bonuses
 *
 * Three management surfaces:
 *   - Promo codes: list, create, toggle active, see redemptions card.
 *   - Contests: list, create, open card, draw winners, replace, ban.
 *   - Lucky Wheel: status panel (configuration is wired to the env
 *     for now — daily cap 10, cooldown 20m, sectors 0.05..1.00 zł;
 *     spin volume + recent ticker shown for diagnostics).
 *
 * Mutations require a `reason` (3+ chars) — same posture as the rest
 * of the admin panel.
 */

type Tab = 'promo' | 'deposits' | 'contests' | 'tournaments';

interface DepositBonusAdminRow {
  id: string;
  title: string;
  description: string | null;
  bannerUrl: string | null;
  type: 'percent' | 'fixed';
  bonusValue: number;
  minDeposit: number;
  wagerMultiplier: number;
  active: boolean;
  createdAt: number;
  activationsCount: number;
  usedCount: number;
}

const GAME_OPTIONS: Array<{ value: GameKey; label: string }> = (
  ['crash', 'mines', 'plinko', 'coinflip', 'wheel', 'bridges', 'blackjack'] as const
).map((key) => ({ value: key, label: gameLabel(key) }));

interface PromoRow {
  id: string;
  code: string;
  amount: number;
  currency: string;
  maxRedemptions: number | null;
  perUserLimit: number;
  expiresAt: number | null;
  active: boolean;
  note: string | null;
  rules?: unknown;
  createdAt: number;
  redemptions: number;
  paidOut: number;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'завершено';
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d} д ${h} ч`;
  if (h > 0) return `${h} ч ${m} м ${s} с`;
  return `${m} м ${s} с`;
}

function LiveTimer({ startsAt }: { startsAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const int = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(int);
  }, []);

  if (now >= startsAt) return null;
  return (
    <div className="text-[11px] text-[#ffac2e]">
      До начала: {formatRemaining(startsAt - now)}
    </div>
  );
}

/* ============================================================== Tournaments (admin) */

interface TournamentRow {
  id: string;
  title: string;
  description: string | null;
  bannerUrl: string | null;
  gameType: string;
  prizePool: number;
  prizeMode: 'percent' | 'fixed';
  winnersCount: number;
  fixedPrize: number | null;
  wagerMultiplier: number;
  startBalance: number;
  entryFee: number;
  startAtGmt1: number;
  durationHours: number;
  startsAt: number;
  endsAt: number;
  cycleState?: string;
  repeatType: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

function TournamentsTab() {
  const router = useRouter();
  const [list, setList] = useState<TournamentRow[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/_x/tournaments', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const json = await res.json();
      setList((json.tournaments ?? []) as TournamentRow[]);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const formatDate = useCallback((ts?: number) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('ru-RU', {
      timeZone: 'Europe/Warsaw',
      hour12: false,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-roobert text-[14px] text-frost-white">Турниры</span>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px]"
        >
          <Plus size={12} strokeWidth={1.8} />
          Создать
        </button>
      </div>

      {list === null ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty text="Турниров пока нет" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {list.map((t) => (
            <button
              key={t.id}
              onClick={() => router.push(`/system/console/bonuses/tournaments/${t.id}`)}
              className="rounded-card border border-white/10 bg-white/[0.03] px-4 py-3 text-left flex flex-col gap-2 hover:bg-white/[0.06] transition-colors w-full"
            >
              <div className="flex w-full items-center justify-between text-[11px] text-whisper-gray">
                <span className="inline-flex items-center gap-1 uppercase tracking-[0.18em]">
                  <Trophy size={12} strokeWidth={1.7} /> {t.gameType}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-pill border border-white/15 bg-white/[0.04]',
                    t.cycleState === 'ended' && 'text-[#ffb199] border-[#ffb199]/50',
                    t.cycleState === 'waiting' && 'text-[#ffac2e] border-[#ffac2e]/50'
                  )}
                >
                  {t.cycleState === 'ended' ? 'Завершён' : t.cycleState === 'waiting' ? 'Ожидание' : t.active ? 'Активен' : 'Выключен'}
                </span>
              </div>
              <div className="font-roobert text-[15px] text-frost-white truncate">{t.title}</div>
              <div className="text-[11px] text-whisper-gray line-clamp-2 min-h-[28px]">{t.description || '—'}</div>
              <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-whisper-gray tabular-nums">
                <span>
                  {t.prizeMode === 'percent'
                    ? `Пул ${t.prizePool.toFixed(0)} zł`
                    : `Фикс ${t.fixedPrize?.toFixed(0) ?? 0} zł`}
                </span>
                <span>Победителей {t.winnersCount}</span>
                <span>Старт {t.startBalance.toFixed(0)} TM</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-whisper-gray tabular-nums">
                <span>Начало: {formatDate(t.startsAt)}</span>
                <span>Конец: {formatDate(t.endsAt)}</span>
              </div>
              <LiveTimer startsAt={t.startsAt} />
              <div className="grid grid-cols-2 gap-2 text-[11px] text-whisper-gray tabular-nums">
                <span>Тип: {t.entryFee > 0 ? 'С взносом' : 'Бесплатный'}</span>
                <span>Длительность: {t.durationHours} ч.</span>
                <span>Повтор: {t.repeatType === 'once' ? 'Единоразовый' : 'Ежедневный'}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {createOpen && (
          <TournamentCreateModal
            onClose={() => setCreateOpen(false)}
            onCreated={() => {
              setCreateOpen(false);
              void reload();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function TournamentCreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [gameType, setGameType] = useState('wheel');
  const [prizePool, setPrizePool] = useState(500);
  const [prizeMode, setPrizeMode] = useState<'percent' | 'fixed'>('percent');
  const [winnersCount, setWinnersCount] = useState(10);
  const [fixedPrize, setFixedPrize] = useState(50);
  const [wagerMultiplier, setWagerMultiplier] = useState(0);
  const [startBalance, setStartBalance] = useState(200);
  const [feeType, setFeeType] = useState<'free' | 'fee'>('free');
  const [entryFee, setEntryFee] = useState(0);
  const [rebuyFee, setRebuyFee] = useState(0);
  const [startAt, setStartAt] = useState(() => isoLocalNow());
  const [durationHours, setDurationHours] = useState(10);
  const [repeatType, setRepeatType] = useState<'daily' | 'once'>('daily');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setBusy(true);
    try {
      const res = await fetch('/api/_x/upload', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      if (res.ok) {
        const json = await res.json();
        if (json.url) setBannerUrl(json.url);
      } else {
        const json = await res.json().catch(() => ({}));
        setErr(json.error || 'Ошибка загрузки файла');
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!title.trim()) {
      setErr('Название обязательно');
      return;
    }
    if (!gameType.trim()) {
      setErr('Игра обязательна');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/_x/tournaments', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          bannerUrl: bannerUrl.trim() || null,
          gameType: gameType.trim(),
          prizePool: prizeMode === 'fixed' ? Number(winnersCount) * Number(fixedPrize) : Number(prizePool),
          prizeMode,
          winnersCount: Number(winnersCount),
          fixedPrize: prizeMode === 'fixed' ? Number(fixedPrize) : null,
          wagerMultiplier: Number(wagerMultiplier),
          startBalance: Number(startBalance),
          entryFee: feeType === 'fee' ? Number(entryFee) : 0,
          rebuyFee: feeType === 'fee' ? Number(rebuyFee) : 0,
          startAtGmt1: new Date(startAt).getTime(),
          durationHours: Number(durationHours),
          repeatType,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json.error || 'Ошибка');
        return;
      }
      onCreated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Новый турнир" wide>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Название" colSpan={2}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
          />
        </Field>
        <Field label="Описание" colSpan={2}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/15 rounded-card px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
          />
        </Field>
        <Field label="Баннер (Файл или ссылка)" colSpan={2}>
          <div className="flex gap-2">
            <input
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
              className="flex-1 bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
              placeholder="https://... или /uploads/..."
            />
            <label className="cursor-pointer inline-flex items-center justify-center px-4 rounded-pill bg-white/[0.1] hover:bg-white/[0.15] border border-white/15 text-frost-white font-roobert text-[13px] transition-colors shrink-0">
              Загрузить файл
              <input type="file" className="hidden" accept="image/*" onChange={handleUpload} />
            </label>
          </div>
        </Field>
        <Field label="Игра">
          <select
            value={gameType}
            onChange={(e) => setGameType(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
          >
            {GAME_OPTIONS.map((g) => (
              <option key={g.value} value={g.value} className="bg-midnight-canvas text-frost-white">
                {g.label}
              </option>
            ))}
          </select>
        </Field>
        {prizeMode === 'percent' && (
          <Field label="Призовой пул (zł)">
            <NumInput value={prizePool} onChange={setPrizePool} step={10} />
          </Field>
        )}
        <Field label="Режим призов">
          <select
            value={prizeMode}
            onChange={(e) => setPrizeMode(e.target.value as 'percent' | 'fixed')}
            className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
          >
            <option value="percent">Проценты (топ-10)</option>
            <option value="fixed">Фикс всем</option>
          </select>
        </Field>
        <Field label="Победителей">
          <NumInput value={winnersCount} onChange={setWinnersCount} step={1} />
        </Field>
        {prizeMode === 'fixed' && (
          <>
            <Field label="Сумма приза каждому" colSpan={2}>
              <NumInput value={fixedPrize} onChange={setFixedPrize} step={10} />
            </Field>
            <Field label="Призовой пул" colSpan={2}>
              <div className="px-3 py-2 rounded-pill border border-white/15 bg-white/[0.04] font-roobert text-[12px] text-frost-white/85">
                {(Number(winnersCount) * Number(fixedPrize || 0)).toFixed(2)} zł
              </div>
            </Field>
          </>
        )}
        <Field label="Вейджер (множитель отыгрыша, 0 = без вейджера)">
          <NumInput value={wagerMultiplier} onChange={setWagerMultiplier} step={1} />
        </Field>
        <Field label="Стартовый турнирный баланс">
          <NumInput value={startBalance} onChange={setStartBalance} step={10} />
        </Field>
        <Field label="Тип участия">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFeeType('free')}
              className={cn(
                'px-3 py-2 rounded-pill border text-[12px] font-roobert',
                feeType === 'free'
                  ? 'bg-frost-white text-midnight-canvas border-frost-white'
                  : 'bg-white/[0.04] border-white/15 text-frost-white'
              )}
            >
              Бесплатно
            </button>
            <button
              type="button"
              onClick={() => setFeeType('fee')}
              className={cn(
                'px-3 py-2 rounded-pill border text-[12px] font-roobert',
                feeType === 'fee'
                  ? 'bg-frost-white text-midnight-canvas border-frost-white'
                  : 'bg-white/[0.04] border-white/15 text-frost-white'
              )}
            >
              С взносом
            </button>
          </div>
        </Field>
        <Field label="Повтор">
          <select
            value={repeatType}
            onChange={(e) => setRepeatType(e.target.value as 'daily' | 'once')}
            className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
          >
            <option value="daily" className="bg-midnight-canvas text-frost-white">Ежедневный</option>
            <option value="once" className="bg-midnight-canvas text-frost-white">Единоразовый</option>
          </select>
        </Field>
        {feeType === 'fee' && (
          <>
            <Field label="Взнос (real)">
              <NumInput value={entryFee} onChange={setEntryFee} step={10} />
            </Field>
            <Field label="Rebuy Fee (real)">
              <NumInput value={rebuyFee} onChange={setRebuyFee} step={10} />
            </Field>
          </>
        )}
        <Field label="Старт (GMT+1)" colSpan={2}>
          {repeatType === 'daily' ? (
            <input
              type="time"
              value={startAt.includes('T') ? startAt.split('T')[1] : startAt}
              onChange={(e) => {
                const today = new Date().toISOString().split('T')[0];
                setStartAt(`${today}T${e.target.value}`);
              }}
              className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
            />
          ) : (
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
            />
          )}
        </Field>
        <Field label="Длительность (часы)">
          <NumInput value={durationHours} onChange={setDurationHours} step={1} />
        </Field>
      </div>

      {err && <div className="font-roobert text-[12px] text-[#ff8a76]">{err}</div>}
      <div className="flex items-center justify-end gap-2 pt-3">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-pill border border-white/15 bg-white/[0.04] font-roobert text-[12px] text-frost-white/85"
        >
          Отмена
        </button>
        <button
          onClick={submit}
          disabled={busy}
          className="px-4 py-2 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px] disabled:opacity-50"
        >
          {busy ? 'Сохранение…' : 'Создать'}
        </button>
      </div>
    </Modal>
  );
}

interface ContestRow {
  id: string;
  title: string;
  visibility: 'public' | 'private' | 'global' | string;
  prizePool: number;
  winnersCount: number;
  startsAt: number;
  endsAt: number;
  state: string;
  participants: number;
  createdAt: number;
  bannerUrl?: string | null;
}

export default function AdminBonusesPage() {
  const [tab, setTab] = useState<Tab>('promo');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 px-1">
        <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
          Раздел
        </span>
        <div className="flex items-center gap-1 ml-auto">
          {(
            [
              { id: 'promo' as const, label: 'Промокоды' },
              { id: 'deposits' as const, label: 'Депозитные бонусы' },
              { id: 'contests' as const, label: 'Конкурсы' },
              { id: 'tournaments' as const, label: 'Турниры' },
            ]
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'px-3 py-1.5 rounded-pill border font-roobert text-[12px] transition-colors',
                tab === t.id
                  ? 'bg-frost-white text-midnight-canvas border-frost-white'
                  : 'border-white/15 bg-white/[0.04] text-frost-white/85 hover:border-white/25'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'promo' && <PromoTab />}
      {tab === 'deposits' && <DepositBonusesAdminSection />}
      {tab === 'contests' && <ContestsTab />}
      {tab === 'tournaments' && <TournamentsTab />}
    </div>
  );
}

/* ============================================================== Promo */

function PromoTab() {
  const [list, setList] = useState<PromoRow[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/_x/bonuses/promos', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const json = await res.json();
      setList(json.promos as PromoRow[]);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const removePromo = async (id: string) => {
    const reason = prompt('Причина удаления промокода:');
    if (!reason || reason.trim().length < 3) return;
    if (!confirm('Удалить промокод? История активаций тоже исчезнет.')) return;
    await fetch(`/api/_x/bonuses/promos/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    setContextMenu(null);
    void reload();
  };

  const toggleActiveQuick = async (id: string, next: boolean) => {
    const reason = prompt(next ? 'Включить промокод. Причина:' : 'Выключить промокод. Причина:');
    if (!reason || reason.trim().length < 3) return;
    await fetch(`/api/_x/bonuses/promos/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: next, reason: reason.trim() }),
    });
    setContextMenu(null);
    void reload();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-roobert text-[14px] text-frost-white">
          Промокоды
        </span>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px]"
        >
          <Plus size={12} strokeWidth={1.8} />
          Создать
        </button>
      </div>

      {list === null ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty text="Промокодов пока нет" />
      ) : (
        <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
          {list.map((p, i) => (
            <PromoRow
              key={p.id}
              row={p}
              first={i === 0}
              onOpen={() => setOpenId(p.id)}
              onContext={(x, y) => setContextMenu({ id: p.id, x, y })}
            />
          ))}
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: 'Открыть',
              onClick: () => {
                setOpenId(contextMenu.id);
                setContextMenu(null);
              },
            },
            {
              label:
                list?.find((p) => p.id === contextMenu.id)?.active === false
                  ? 'Включить'
                  : 'Выключить',
              onClick: () =>
                toggleActiveQuick(
                  contextMenu.id,
                  list?.find((p) => p.id === contextMenu.id)?.active === false
                ),
            },
            {
              label: 'Удалить',
              danger: true,
              onClick: () => removePromo(contextMenu.id),
            },
          ]}
        />
      )}

      <AnimatePresence>
        {createOpen && (
          <PromoCreateModal
            onClose={() => setCreateOpen(false)}
            onCreated={() => {
              setCreateOpen(false);
              void reload();
            }}
          />
        )}
        {openId && (
          <PromoDetailModal
            id={openId}
            onClose={() => setOpenId(null)}
            onChanged={() => void reload()}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PromoRow({
  row: p,
  first,
  onOpen,
  onContext,
}: {
  row: PromoRow;
  first: boolean;
  onOpen: () => void;
  onContext: (x: number, y: number) => void;
}) {
  const longPressRef = useRef<{ timeout: number | null; fired: boolean }>({
    timeout: null,
    fired: false,
  });

  const startLongPress = (x: number, y: number) => {
    longPressRef.current.fired = false;
    longPressRef.current.timeout = window.setTimeout(() => {
      longPressRef.current.fired = true;
      onContext(x, y);
    }, 480);
  };
  const cancelLongPress = () => {
    if (longPressRef.current.timeout) {
      window.clearTimeout(longPressRef.current.timeout);
      longPressRef.current.timeout = null;
    }
  };
  return (
    <button
      onClick={() => {
        if (longPressRef.current.fired) return;
        onOpen();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContext(e.clientX, e.clientY);
      }}
      onPointerDown={(e) => startLongPress(e.clientX, e.clientY)}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerCancel={cancelLongPress}
      className={cn(
        'w-full grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04] transition-colors',
        !first && 'border-t border-white/5'
      )}
    >
      <span
        className={cn(
          'inline-flex items-center justify-center w-9 h-9 rounded-pill border',
          p.active
            ? 'border-[#a0e0ab]/40 bg-[#a0e0ab]/10'
            : 'border-white/15 bg-white/[0.04]'
        )}
      >
        <Ticket size={14} strokeWidth={1.7} />
      </span>
      <div className="min-w-0">
        <div className="font-roobert text-[14px] text-frost-white tracking-[0.16em] tabular-nums">
          {p.code}
        </div>
        <div className="font-roobert text-[11px] text-whisper-gray">
          {p.currency === 'FREE_CASES' ? `${p.amount} вращений` : `${p.amount.toFixed(2)} ${p.currency}`} · {p.redemptions} активаций
          {p.maxRedemptions !== null && ` / ${p.maxRedemptions}`} ·{' '}
          {p.active ? 'активен' : 'выключен'}
        </div>
      </div>
      <span className="font-roobert text-[12px] text-frost-white/85 tabular-nums">
        {p.currency === 'FREE_CASES' ? `${p.paidOut} сп` : `${p.paidOut.toFixed(0)} ${p.currency}`}
      </span>
    </button>
  );
}

function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: Array<{ label: string; onClick: () => void; danger?: boolean }>;
  onClose: () => void;
}) {
  // Clamp inside the viewport.
  const left = Math.min(x, typeof window !== 'undefined' ? window.innerWidth - 200 : x);
  const top = Math.min(y, typeof window !== 'undefined' ? window.innerHeight - 180 : y);
  return (
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className="absolute rounded-card border border-white/15 bg-midnight-canvas shadow-2xl py-1 min-w-[180px]"
        style={{ left, top }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((it, i) => (
          <button
            key={i}
            onClick={() => {
              it.onClick();
            }}
            className={cn(
              'w-full px-3 py-2 text-left font-roobert text-[12px] hover:bg-white/[0.06] transition-colors',
              it.danger ? 'text-[#ff8a76]' : 'text-frost-white/90'
            )}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PromoCreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [rewardType, setRewardType] = useState<'money' | 'free_cases'>('money');
  const [caseId, setCaseId] = useState('case_1');
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState(10);
  const [maxRedemptions, setMaxRedemptions] = useState<number>(-1);
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [wagerMultiplier, setWagerMultiplier] = useState(0);
  const [withRules, setWithRules] = useState(false);
  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const CASE_OPTIONS = [
    { id: 'case_1', name: 'Обычный', color: '#9e9e9e' },
    { id: 'case_2', name: 'Необычный', color: '#4caf50' },
    { id: 'case_3', name: 'Редкий', color: '#2196f3' },
    { id: 'case_4', name: 'Эпический', color: '#9c27b0' },
    { id: 'case_5', name: 'Мифический', color: '#e91e63' },
    { id: 'case_6', name: 'Легендарный', color: '#ffb300' },
    { id: 'case_7', name: 'Macvbet', color: '#f44336' },
  ];

  const submit = async () => {
    if (reason.trim().length < 3) {
      setErr('Причина обязательна');
      return;
    }
    if (!code.trim() || amount <= 0) {
      setErr('Код и сумма обязательны');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const baseRules = withRules
        ? rules.map(serializeRule).filter((r): r is object => !!r)
        : [];
      
      let finalRules = baseRules;
      if (rewardType === 'money' && wagerMultiplier > 0) {
          finalRules = [...baseRules, { type: 'wager', multiplier: wagerMultiplier }];
      } else if (rewardType === 'free_cases') {
          finalRules = [...baseRules, { type: 'free_cases_reward', caseId, wager: wagerMultiplier }];
      }
      
      const res = await fetch('/api/_x/bonuses/promos', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          amount: Number(amount),
          currency: rewardType === 'free_cases' ? 'FREE_CASES' : 'PLN',
          maxRedemptions: maxRedemptions < 0 ? null : Number(maxRedemptions),
          perUserLimit: 1,
          expiresAt: expiresAt ? new Date(expiresAt).getTime() : null,
          rules: finalRules,
          reason: reason.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json.error || 'Ошибка');
        return;
      }
      onCreated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Новый промокод">
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="Тип награды" colSpan={2}>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRewardType('money')}
              className={cn(
                'px-3 py-2 flex-1 rounded-pill border text-[12px] font-roobert transition-colors',
                rewardType === 'money'
                  ? 'bg-frost-white text-midnight-canvas border-frost-white'
                  : 'bg-white/[0.04] border-white/15 text-frost-white/80'
              )}
            >
              Деньги (PLN)
            </button>
            <button
              type="button"
              onClick={() => setRewardType('free_cases')}
              className={cn(
                'px-3 py-2 flex-1 rounded-pill border text-[12px] font-roobert transition-colors',
                rewardType === 'free_cases'
                  ? 'bg-frost-white text-midnight-canvas border-frost-white'
                  : 'bg-white/[0.04] border-white/15 text-frost-white/80'
              )}
            >
              Бесплатные кейсы
            </button>
          </div>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Код" colSpan={2}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="WELCOME10"
            className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white tracking-[0.18em] focus:outline-none focus:border-white/30"
          />
        </Field>
        
        {rewardType === 'free_cases' && (
          <Field label="Выберите кейс" colSpan={2}>
             <select
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
             >
                {CASE_OPTIONS.map((c) => (
                   <option key={c.id} value={c.id} className="bg-midnight-canvas text-frost-white">
                      {c.name}
                   </option>
                ))}
             </select>
             <div className="mt-2 flex items-center gap-3 px-2">
                {CASE_OPTIONS.map(c => c.id === caseId && (
                   <div key={c.id} className="flex items-center gap-3 bg-white/[0.02] border border-white/5 rounded-card p-2 w-full">
                       <div className="relative w-12 h-12 flex-shrink-0">
                           <div className="absolute inset-0 opacity-20 blur-md rounded-full" style={{ background: c.color }} />
                           {/* eslint-disable-next-line @next/next/no-img-element */}
                           <img src={`/images/cases/${c.id}.png`} alt={c.name} className="absolute inset-0 w-full h-full object-contain" />
                       </div>
                       <span className="font-roobert text-[13px] text-frost-white">Кейс: {c.name}</span>
                   </div>
                ))}
             </div>
          </Field>
        )}

        <Field label={rewardType === 'money' ? 'Сумма (zł)' : 'Количество вращений'}>
          <NumInput value={amount} step={1} onChange={setAmount} />
        </Field>
        <Field label="Кол-во активаций (отриц = ∞)">
          <NumInput value={maxRedemptions} step={1} onChange={setMaxRedemptions} />
        </Field>
        <Field label="Истекает" colSpan={2}>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[13px] tabular-nums text-frost-white focus:outline-none focus:border-white/30"
          />
        </Field>
      </div>

      <WagerPicker value={wagerMultiplier} onChange={setWagerMultiplier} />

      <label className="inline-flex items-center gap-2 px-1 cursor-pointer">
        <input
          type="checkbox"
          checked={withRules}
          onChange={(e) => setWithRules(e.target.checked)}
          className="accent-frost-white"
        />
        <span className="font-roobert text-[12px] text-frost-white/85">
          Условия активации
        </span>
      </label>

      {withRules && <RulesEditor rules={rules} onChange={setRules} />}

      <ReasonField reason={reason} onChange={setReason} />
      {err && (
        <div className="font-roobert text-[12px] text-[#ff8a76]">{err}</div>
      )}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-pill border border-white/15 bg-white/[0.04] font-roobert text-[12px] text-frost-white/85"
        >
          Отмена
        </button>
        <button
          onClick={submit}
          disabled={busy}
          className="px-4 py-2 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px] disabled:opacity-50"
        >
          {busy ? 'Сохранение…' : 'Создать'}
        </button>
      </div>
    </Modal>
  );
}

function PromoDetailModal({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<{
    promo: PromoRow;
    redemptions: Array<{
      id: string;
      userId: string;
      name: string;
      amount: number;
      createdAt: number;
    }>;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/_x/bonuses/promos/${id}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return;
    const j = await res.json();
    setData(j);
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggleActive = async (next: boolean) => {
    const reason = prompt('Причина изменения:');
    if (!reason || reason.trim().length < 3) return;
    setBusy(true);
    try {
      await fetch(`/api/_x/bonuses/promos/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: next, reason: reason.trim() }),
      });
      await reload();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={data ? `Промокод ${data.promo.code}` : 'Загрузка…'}>
      {!data ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Сумма" value={data.promo.currency === 'FREE_CASES' ? `${data.promo.amount} вращений` : `${data.promo.amount.toFixed(2)} ${data.promo.currency}`} />
            <Stat
              label="Активаций"
              value={`${data.redemptions.length}${
                data.promo.maxRedemptions !== null ? ` / ${data.promo.maxRedemptions}` : ''
              }`}
            />
            <Stat
              label="Истекает"
              value={
                data.promo.expiresAt
                  ? new Date(data.promo.expiresAt).toLocaleString('ru-RU')
                  : 'не истекает'
              }
            />
            <Stat label="Создан" value={new Date(data.promo.createdAt).toLocaleString('ru-RU')} />
          </div>
          {data.promo.note && (
            <div className="rounded-card border border-white/10 bg-white/[0.03] px-4 py-3 font-roobert text-[12px] text-whisper-gray">
              {data.promo.note}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
              Активаций
            </span>
            <button
              onClick={() => toggleActive(!data.promo.active)}
              disabled={busy}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill border font-roobert text-[12px] transition-colors',
                data.promo.active
                  ? 'border-[#ff8a76]/40 bg-[#ff8a76]/10 text-frost-white'
                  : 'border-[#a0e0ab]/40 bg-[#a0e0ab]/10 text-frost-white'
              )}
            >
              <Power size={12} strokeWidth={1.8} />
              {data.promo.active ? 'Выключить' : 'Включить'}
            </button>
          </div>

          <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden max-h-72 overflow-y-auto">
            {data.redemptions.length === 0 ? (
              <div className="px-4 py-6 text-center font-roobert text-[12px] text-whisper-gray">
                Никто пока не активировал
              </div>
            ) : (
              data.redemptions.map((r, i) => (
                <div
                  key={r.id}
                  className={cn(
                    'grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2',
                    i > 0 && 'border-t border-white/5'
                  )}
                >
                  <div className="font-roobert text-[12px] text-frost-white truncate">
                    {r.name}
                  </div>
                  <div className="font-roobert text-[11px] tabular-nums text-frost-white/85">
                    +{data.promo.currency === 'FREE_CASES' ? r.amount : r.amount.toFixed(2)} {data.promo.currency === 'FREE_CASES' ? 'сп.' : ''}
                  </div>
                  <div className="font-roobert text-[10px] tabular-nums text-whisper-gray">
                    {new Date(r.createdAt).toLocaleString('ru-RU')}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

/* ============================================================== Contests */

function ContestsTab() {
  const [list, setList] = useState<ContestRow[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/_x/bonuses/contests', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const json = await res.json();
      setList(json.contests as ContestRow[]);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const removeContest = async (id: string) => {
    const reason = prompt('Причина удаления конкурса:');
    if (!reason || reason.trim().length < 3) return;
    if (!confirm('Удалить конкурс? Список участников исчезнет.')) return;
    await fetch(`/api/_x/bonuses/contests/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    setContextMenu(null);
    void reload();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-roobert text-[14px] text-frost-white">Конкурсы</span>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px]"
        >
          <Plus size={12} strokeWidth={1.8} />
          Создать
        </button>
      </div>

      {list === null ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty text="Конкурсов пока нет" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {list.map((c) => (
            <ContestRowCard
              key={c.id}
              contest={c}
              onOpen={() => setOpenId(c.id)}
              onContext={(x, y) => setContextMenu({ id: c.id, x, y })}
            />
          ))}
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: 'Открыть',
              onClick: () => {
                setOpenId(contextMenu.id);
                setContextMenu(null);
              },
            },
            {
              label: 'Редактировать',
              onClick: () => {
                setEditId(contextMenu.id);
                setContextMenu(null);
              },
            },
            {
              label: 'Удалить',
              danger: true,
              onClick: () => removeContest(contextMenu.id),
            },
          ]}
        />
      )}

      <AnimatePresence>
        {createOpen && (
          <ContestCreateModal
            onClose={() => setCreateOpen(false)}
            onCreated={() => {
              setCreateOpen(false);
              void reload();
            }}
          />
        )}
        {openId && (
          <ContestDetailModal
            id={openId}
            onClose={() => setOpenId(null)}
            onChanged={() => void reload()}
          />
        )}
        {editId && (
          <ContestEditModal
            id={editId}
            onClose={() => setEditId(null)}
            onSaved={() => {
              setEditId(null);
              void reload();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ContestRowCard({
  contest: c,
  onOpen,
  onContext,
}: {
  contest: ContestRow;
  onOpen: () => void;
  onContext: (x: number, y: number) => void;
}) {
  const longPressRef = useRef<{ timeout: number | null; fired: boolean }>({
    timeout: null,
    fired: false,
  });
  const start = (x: number, y: number) => {
    longPressRef.current.fired = false;
    longPressRef.current.timeout = window.setTimeout(() => {
      longPressRef.current.fired = true;
      onContext(x, y);
    }, 480);
  };
  const cancel = () => {
    if (longPressRef.current.timeout) {
      window.clearTimeout(longPressRef.current.timeout);
      longPressRef.current.timeout = null;
    }
  };

  return (
    <button
      onClick={() => {
        if (longPressRef.current.fired) return;
        onOpen();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContext(e.clientX, e.clientY);
      }}
      onPointerDown={(e) => start(e.clientX, e.clientY)}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      className="rounded-card border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors px-4 py-3 text-left flex flex-col gap-2"
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
          <Trophy size={11} strokeWidth={1.7} />
          {c.visibility === 'public'
            ? 'Публичный'
            : c.visibility === 'private'
              ? 'Приватный'
              : 'Глобальный'}
        </span>
        <StateBadge state={c.state} />
      </div>
      <div className="font-roobert text-[15px] text-frost-white truncate">
        {c.title}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Mini label="Пул" value={`${c.prizePool.toFixed(0)} zł`} />
        <Mini label="Победителей" value={String(c.winnersCount)} />
        <Mini label="Участников" value={String(c.participants)} />
      </div>
      <div className="font-roobert text-[11px] text-whisper-gray tabular-nums">
        {new Date(c.startsAt).toLocaleDateString('ru-RU')} →{' '}
        {new Date(c.endsAt).toLocaleDateString('ru-RU')}
      </div>
    </button>
  );
}

function ContestCreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private' | 'global'>('public');
  const [bannerUrl, setBannerUrl] = useState('');
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [prizePool, setPrizePool] = useState(2000);
  const [autoPayout, setAutoPayout] = useState(true);
  const [winnersCount, setWinnersCount] = useState(20);
  const [splitEqual, setSplitEqual] = useState(true);
  const [customShares, setCustomShares] = useState('100, 50, 30, 20');
  // Время до старта в минутах. Используется одно из двух: либо явная дата
  // `startsAt`, либо относительный таймер (минуты от текущего момента).
  // Чипы 1/3/5/10/15/60 закрывают типичные сценарии "стартануть скоро".
  const [startInMinutes, setStartInMinutes] = useState<number>(5);
  const [useExplicitStart, setUseExplicitStart] = useState(false);
  const [startsAt, setStartsAt] = useState(() => isoLocalNow());
  // Длительность конкурса в днях. По умолчанию неделя.
  const [durationDays, setDurationDays] = useState<number>(7);
  const [winnerWager, setWinnerWager] = useState<number>(0);
  // Требования к депозитам — упрощённый вид правила deposit_window.
  // Чтобы пользователь не возился с JSON-конструктором правил, тут
  // три поля + переключатель «требовать минимальный депозит».
  const [requireDeposit, setRequireDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState<number>(10);
  const [depositPeriodMonths, setDepositPeriodMonths] = useState<number>(12);
  const [depositCount, setDepositCount] = useState<number>(1);
  const [depositMin, setDepositMin] = useState<number>(10);
  const [extraRules, setExtraRules] = useState<RuleDraft[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (reason.trim().length < 3) {
      setErr('Причина обязательна');
      return;
    }
    if (!title.trim()) {
      setErr('Название обязательно');
      return;
    }
    if (!Number.isFinite(prizePool) || prizePool <= 0) {
      setErr('Призовой фонд должен быть больше 0');
      return;
    }
    if (winnersCount < 1) {
      setErr('Победителей должно быть минимум 1');
      return;
    }
    let prizeShares: unknown = 'equal';
    if (!splitEqual) {
      const parsed = customShares
        .split(',')
        .map((s) => parseFloat(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (parsed.length === 0) {
        setErr('Список призов по местам пуст');
        return;
      }
      prizeShares = parsed.map((amount, i) => ({ place: i + 1, amount }));
    }
    // Собираем правила: deposit_window (если включён) + произвольные.
    const builtRules: object[] = [];
    if (requireDeposit && depositAmount > 0) {
      const days = Math.max(1, Math.round(depositPeriodMonths * 30));
      // amount всегда >= depositMin: пользователь подсознательно ждёт,
      // что "минимум 10 zł" применяется к каждому депозиту, но у нас в
      // правиле только сумма за период. Для прозрачности отправляем
      // обе цифры (`min` сохранится в JSON, бэк-валидатор её игнорирует).
      builtRules.push({
        type: 'deposit_window',
        amount: Math.max(depositAmount, depositMin),
        days,
        count: depositCount,
        min: depositMin,
      });
    }
    for (const r of extraRules) {
      const ser = serializeRule(r);
      if (ser) builtRules.push(ser);
    }

    const startsAtMs = useExplicitStart
      ? new Date(startsAt).getTime()
      : Date.now() + Math.max(1, startInMinutes) * 60 * 1000;
    const endsAtMs = startsAtMs + Math.max(1, durationDays) * 24 * 60 * 60 * 1000;
    if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs)) {
      setErr('Не удалось рассчитать время старта/окончания');
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/_x/bonuses/contests', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          visibility,
          bannerUrl: bannerUrl.trim() || null,
          prizePool: Number(prizePool),
          winnersCount: Number(winnersCount),
          prizeShares,
          winnerWager,
          rules: builtRules,
          // autoPayout складываем в meta-поле описания, бэк его сейчас
          // не различает, но мы оставим маркер в описании, чтобы оператор
          // видел режим выплаты в карточке.
          startsAt: startsAtMs,
          endsAt: endsAtMs,
          reason: reason.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json.error || 'Ошибка');
        return;
      }
      onCreated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Новый конкурс" wide>
      {/* Шапка — название/описание/баннер/видимость идут одной плотной
          группой, как в скриншоте: видно всё, но без визуального шума. */}
      <SectionCard
        icon={<Trophy size={14} strokeWidth={1.7} />}
        title="Основное"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Название" colSpan={2}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: «Турнир выходного дня»"
              className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
            />
          </Field>
          <Field label="Описание" colSpan={2}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-white/[0.04] border border-white/15 rounded-card px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30 resize-none"
            />
          </Field>
          <Field label="Фото-фон" colSpan={2}>
            <input
              type="file"
              accept="image/*"
              disabled={uploadingBanner}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploadingBanner(true);
                setErr(null);
                try {
                  const formData = new FormData();
                  formData.append('file', file);
                  const res = await fetch('/api/_x/upload', {
                    method: 'POST',
                    body: formData,
                  });
                  const json = await res.json();
                  if (json.ok && json.url) setBannerUrl(json.url);
                  else setErr(json.error || 'Ошибка загрузки');
                } catch {
                  setErr('Ошибка загрузки');
                } finally {
                  setUploadingBanner(false);
                }
              }}
              className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[12px] text-frost-white focus:outline-none focus:border-white/30 file:mr-4 file:py-1 file:px-3 file:rounded-pill file:border-0 file:text-[12px] file:font-medium file:bg-white/10 file:text-white hover:file:bg-white/20"
            />
            {uploadingBanner && <div className="text-[12px] text-white/50 mt-1">Загрузка...</div>}
            {bannerUrl.trim() && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bannerUrl.trim()}
                alt="Preview"
                className="mt-2 w-full h-32 object-cover rounded-card border border-white/10"
                referrerPolicy="no-referrer"
              />
            )}
          </Field>
          <Field label="Видимость" colSpan={2}>
            <select
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as 'public' | 'private' | 'global')
              }
              className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
            >
              <option value="public">Публичный</option>
              <option value="private">Приватный</option>
              <option value="global">Глобальный (авто-участие)</option>
            </select>
          </Field>
        </div>
      </SectionCard>

      {/* Призовой фонд: сумма + автоначисление + распределение. */}
      <SectionCard
        icon={<Gift size={14} strokeWidth={1.7} />}
        title="Призовой фонд"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Сумма (zł)" colSpan={2}>
            <NumInput value={prizePool} step={50} min={1} onChange={setPrizePool} />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[100, 500, 1000, 2000, 5000].map((v) => (
                <Chip
                  key={v}
                  active={prizePool === v}
                  onClick={() => setPrizePool(v)}
                  label={`${v} zł`}
                />
              ))}
            </div>
          </Field>
          <Field label="Количество победителей" colSpan={2}>
            <NumInput value={winnersCount} step={1} min={1} onChange={setWinnersCount} />
          </Field>
        </div>
        <Toggle
          checked={autoPayout}
          onChange={setAutoPayout}
          label="Автоматическое начисление призов"
          hint="Победители получают приз сразу после розыгрыша."
        />
        <Toggle
          checked={splitEqual}
          onChange={setSplitEqual}
          label="Разделить фонд поровну между победителями"
          hint={
            splitEqual
              ? `Каждому ≈ ${(prizePool / Math.max(1, winnersCount)).toFixed(2)} zł`
              : 'Можно задать разные суммы по местам'
          }
        />
        <div className="mt-3">
          <WagerPicker value={winnerWager} onChange={setWinnerWager} />
        </div>
        {!splitEqual && (
          <Field label="Призы по местам (через запятую)" colSpan={2}>
            <input
              value={customShares}
              onChange={(e) => setCustomShares(e.target.value)}
              placeholder="500, 300, 100, 50, 30..."
              className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[13px] tabular-nums text-frost-white focus:outline-none focus:border-white/30"
            />
          </Field>
        )}
      </SectionCard>

      {/* Настройки времени — чипы быстрого старта + явная дата. */}
      <SectionCard
        icon={<SettingsIcon size={14} strokeWidth={1.7} />}
        title="Настройки"
      >
        <Field label="Время до начала розыгрыша" colSpan={2}>
          <div className="flex flex-wrap gap-1.5">
            {[1, 3, 5, 10, 15, 60].map((m) => (
              <Chip
                key={m}
                active={!useExplicitStart && startInMinutes === m}
                onClick={() => {
                  setUseExplicitStart(false);
                  setStartInMinutes(m);
                }}
                label={`${m} мин`}
              />
            ))}
            <Chip
              active={useExplicitStart}
              onClick={() => setUseExplicitStart(true)}
              label="Точная дата"
            />
          </div>
          {useExplicitStart && (
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-2 w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
            />
          )}
        </Field>
        <Field label="Длительность конкурса (дней)" colSpan={2}>
          <NumInput
            value={durationDays}
            step={1}
            min={1}
            onChange={setDurationDays}
          />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[1, 3, 7, 14, 30].map((d) => (
              <Chip
                key={d}
                active={durationDays === d}
                onClick={() => setDurationDays(d)}
                label={`${d} дн`}
              />
            ))}
          </div>
        </Field>
      </SectionCard>

      {/* Требования к депозитам — упрощённая обёртка над deposit_window. */}
      <SectionCard
        icon={<WalletIcon size={14} strokeWidth={1.7} />}
        title="Требования к депозитам"
        right={
          <Toggle
            inline
            checked={requireDeposit}
            onChange={setRequireDeposit}
            label="Включить"
          />
        }
      >
        {requireDeposit ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Сумма депозита (zł)">
              <NumInput
                value={depositAmount}
                step={5}
                min={0}
                onChange={setDepositAmount}
              />
            </Field>
            <Field label="Период (месяцев)">
              <select
                value={depositPeriodMonths}
                onChange={(e) =>
                  setDepositPeriodMonths(Number(e.target.value))
                }
                className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[13px] tabular-nums text-frost-white focus:outline-none focus:border-white/30"
              >
                {[1, 3, 6, 12, 24].map((m) => (
                  <option key={m} value={m}>
                    за {m} мес
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Количество депозитов">
              <NumInput
                value={depositCount}
                step={1}
                min={1}
                onChange={setDepositCount}
              />
            </Field>
            <Field label="Минимальный депозит (zł)">
              <NumInput
                value={depositMin}
                step={1}
                min={0}
                onChange={setDepositMin}
              />
            </Field>
          </div>
        ) : (
          <p className="font-roobert text-[11px] text-whisper-gray">
            Без требований к депозитам — участвует любой пользователь, который
            соответствует другим условиям.
          </p>
        )}
      </SectionCard>

      <RulesEditor rules={extraRules} onChange={setExtraRules} />

      <ReasonField reason={reason} onChange={setReason} />
      {err && <div className="font-roobert text-[12px] text-[#ff8a76]">{err}</div>}
      <div className="flex items-center justify-between gap-2 pt-2">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-pill border border-white/15 bg-white/[0.04] font-roobert text-[12px] text-frost-white/85"
        >
          Отмена
        </button>
        <button
          onClick={submit}
          disabled={busy}
          className="px-5 py-2 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px] disabled:opacity-50"
        >
          {busy ? 'Создание…' : 'Создать'}
        </button>
      </div>
    </Modal>
  );
}

function SectionCard({
  icon,
  title,
  right,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] px-4 py-3 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-pill border border-white/15 bg-white/[0.04] text-frost-white/85">
          {icon}
        </span>
        <span className="font-roobert text-[13px] text-frost-white">{title}</span>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-pill border font-roobert text-[11px] tabular-nums transition-colors',
        active
          ? 'bg-frost-white text-midnight-canvas border-frost-white'
          : 'border-white/15 bg-white/[0.04] text-frost-white/85 hover:border-white/25'
      )}
    >
      {label}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
  inline,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  inline?: boolean;
}) {
  if (inline) {
    return (
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          'inline-flex items-center gap-2 px-2 py-1 rounded-pill border font-roobert text-[11px] transition-colors',
          checked
            ? 'border-[#a0e0ab]/45 bg-[#a0e0ab]/10 text-frost-white'
            : 'border-white/15 bg-white/[0.04] text-frost-white/85'
        )}
      >
        <span
          className={cn(
            'inline-block w-7 h-3.5 rounded-pill relative transition-colors',
            checked ? 'bg-[#a0e0ab]/60' : 'bg-white/15'
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 w-2.5 h-2.5 rounded-full bg-frost-white transition-all',
              checked ? 'left-3.5' : 'left-0.5'
            )}
          />
        </span>
        {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-start gap-3 text-left rounded-card border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] transition-colors px-3 py-2"
    >
      <span
        className={cn(
          'mt-0.5 inline-block w-9 h-5 rounded-pill relative transition-colors shrink-0',
          checked ? 'bg-[#a0e0ab]/60' : 'bg-white/15'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 w-4 h-4 rounded-full bg-frost-white transition-all',
            checked ? 'left-4.5' : 'left-0.5'
          )}
          style={{ left: checked ? '1.125rem' : '0.125rem' }}
        />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-roobert text-[12.5px] text-frost-white">
          {label}
        </span>
        {hint && (
          <span className="mt-0.5 block font-roobert text-[10.5px] text-whisper-gray">
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}

interface RuleDraft {
  type:
    | 'deposit_window'
    | 'wagered_window'
    | 'deposit_total'
    | 'referrals'
    | 'registered_after'
    | 'wager';
  amount?: number;
  days?: number;
  count?: number;
  date?: string;
  multiplier?: number;
}

function serializeRule(r: RuleDraft): object | null {
  switch (r.type) {
    case 'deposit_window':
    case 'wagered_window':
      return r.amount && r.days
        ? { type: r.type, amount: r.amount, days: r.days }
        : null;
    case 'deposit_total':
      return r.amount ? { type: r.type, amount: r.amount } : null;
    case 'referrals':
      return r.count ? { type: r.type, count: r.count } : null;
    case 'registered_after':
      return r.date ? { type: r.type, date: r.date } : null;
    case 'wager':
      return r.multiplier && r.multiplier > 0
        ? { type: r.type, multiplier: r.multiplier }
        : null;
    default:
      return null;
  }
}

function RulesEditor({
  rules,
  onChange,
}: {
  rules: RuleDraft[];
  onChange: (next: RuleDraft[]) => void;
}) {
  const add = (type: RuleDraft['type']) => {
    onChange([...rules, { type }]);
  };
  const update = (i: number, patch: Partial<RuleDraft>) => {
    const next = rules.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => {
    onChange(rules.filter((_, idx) => idx !== i));
  };

  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] px-3 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
          Условия участия
        </span>
        <select
          onChange={(e) => {
            if (e.target.value) {
              add(e.target.value as RuleDraft['type']);
              e.target.value = '';
            }
          }}
          className="bg-white/[0.04] border border-white/15 rounded-pill px-2 py-1 font-roobert text-[11px] text-frost-white/85 focus:outline-none"
          defaultValue=""
        >
          <option value="">+ добавить</option>
          <option value="deposit_window">Сумма депозитов за период</option>
          <option value="wagered_window">Сумма оборота за период</option>
          <option value="deposit_total">Сумма депозитов всего</option>
          <option value="referrals">Рефералы</option>
          <option value="registered_after">Регистрация после</option>
        </select>
      </div>
      {rules.length === 0 ? (
        <div className="font-roobert text-[11px] text-whisper-gray">
          Без условий — участвует любой
        </div>
      ) : (
        rules.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="font-roobert text-[11px] text-frost-white/85 min-w-[120px]">
              {ruleLabel(r.type)}
            </span>
            {(r.type === 'deposit_window' || r.type === 'wagered_window') && (
              <>
                <NumInput
                  value={r.amount ?? 0}
                  step={50}
                  onChange={(v) => update(i, { amount: v })}
                />
                <span className="font-roobert text-[11px] text-whisper-gray">за</span>
                <NumInput
                  value={r.days ?? 7}
                  step={1}
                  onChange={(v) => update(i, { days: v })}
                />
                <span className="font-roobert text-[11px] text-whisper-gray">дн</span>
              </>
            )}
            {r.type === 'deposit_total' && (
              <NumInput
                value={r.amount ?? 0}
                step={50}
                onChange={(v) => update(i, { amount: v })}
              />
            )}
            {r.type === 'referrals' && (
              <NumInput
                value={r.count ?? 1}
                step={1}
                onChange={(v) => update(i, { count: v })}
              />
            )}
            {r.type === 'registered_after' && (
              <input
                type="date"
                value={r.date ?? ''}
                onChange={(e) => update(i, { date: e.target.value })}
                className="bg-white/[0.04] border border-white/15 rounded-pill px-2 py-1 font-roobert text-[12px] text-frost-white/85 focus:outline-none"
              />
            )}
            <button
              onClick={() => remove(i)}
              className="ml-auto inline-flex items-center justify-center w-6 h-6 rounded-pill border border-white/15 hover:border-white/35 transition-colors"
            >
              <X size={11} strokeWidth={1.8} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function ruleLabel(type: RuleDraft['type']): string {
  switch (type) {
    case 'deposit_window':
      return 'Сумма депозитов ≥';
    case 'wagered_window':
      return 'Сумма оборота ≥';
    case 'deposit_total':
      return 'Сумма депозитов всего ≥';
    case 'referrals':
      return 'Рефералов ≥';
    case 'registered_after':
      return 'Регистрация после';
    case 'wager':
      return 'Отыгрыш (вейджер)';
  }
}

function WagerPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const presets = [0, 1, 3, 5, 10];
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] px-3 py-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-pill border border-white/15 bg-white/[0.04]">
          <Repeat size={12} strokeWidth={1.7} />
        </span>
        <span className="font-roobert text-[12px] text-frost-white">
          Вейджер (отыгрыш бонуса)
        </span>
        <span className="ml-auto font-roobert text-[10px] uppercase tracking-[0.18em] text-whisper-gray">
          {value === 0 ? 'без отыгрыша' : `x${value}`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={cn(
              'px-2.5 py-1 rounded-pill border font-roobert text-[11px] tabular-nums transition-colors',
              value === p
                ? 'bg-frost-white text-midnight-canvas border-frost-white'
                : 'border-white/15 bg-white/[0.04] text-frost-white/85 hover:border-white/25'
            )}
          >
            {p === 0 ? 'Без' : `x${p}`}
          </button>
        ))}
        <div className="ml-auto inline-flex items-center gap-1.5">
          <span className="font-roobert text-[11px] text-whisper-gray">своё</span>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={value}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              onChange(Number.isFinite(v) && v >= 0 ? v : 0);
            }}
            className="w-16 bg-white/[0.04] border border-white/15 rounded-pill px-2 py-1 font-roobert text-[12px] tabular-nums text-frost-white focus:outline-none focus:border-white/30"
          />
        </div>
      </div>
      <p className="font-roobert text-[10.5px] text-whisper-gray leading-snug">
        {value === 0
          ? 'Сумма промокода зачисляется без требований к отыгрышу.'
          : `Перед выводом нужно сделать ставок на сумму = сумма промокода × ${value}.`}
      </p>
    </div>
  );
}

function ContestEditModal({
  id,
  onClose,
  onSaved,
}: {
  id: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [visibility, setVisibility] = useState<'public' | 'private' | 'global'>('public');
  const [prizePool, setPrizePool] = useState(0);
  const [winnersCount, setWinnersCount] = useState(1);
  const [winnerWager, setWinnerWager] = useState(0);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  
  // New state from Create Modal
  const [splitEqual, setSplitEqual] = useState(true);
  const [customShares, setCustomShares] = useState('');
  const [requireDeposit, setRequireDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState<number>(10);
  const [depositPeriodMonths, setDepositPeriodMonths] = useState<number>(12);
  const [depositCount, setDepositCount] = useState<number>(1);
  const [depositMin, setDepositMin] = useState<number>(10);
  const [extraRules, setExtraRules] = useState<RuleDraft[]>([]);

  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/_x/bonuses/contests/${id}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const j = await res.json();
      const c = j.contest;
      setTitle(c.title);
      setDescription(c.description ?? '');
      setBannerUrl((c.bannerUrl as string | null) ?? '');
      setVisibility(c.visibility ?? 'public');
      setPrizePool(c.prizePool);
      setWinnersCount(c.winnersCount);
      setWinnerWager(c.winnerWager ?? 0);
      setStartsAt(toLocalIso(c.startsAt));
      setEndsAt(toLocalIso(c.endsAt));

      if (c.prizeShares === 'equal') {
        setSplitEqual(true);
      } else if (Array.isArray(c.prizeShares)) {
        setSplitEqual(false);
        setCustomShares(c.prizeShares.map((x: any) => x.amount).join(', '));
      }

      let depAmount = 10, depMonths = 12, depCnt = 1, depMin = 10;
      let hasDep = false;
      const ex: RuleDraft[] = [];
      if (Array.isArray(c.rules)) {
        for (const r of c.rules) {
          if (r.type === 'deposit_window') {
            hasDep = true;
            depAmount = r.amount;
            depMonths = Math.max(1, Math.round((r.days || 30) / 30));
            depCnt = r.count || 1;
            depMin = r.min || 10;
          } else {
            ex.push({ ...r, id: Math.random().toString() });
          }
        }
      }
      setRequireDeposit(hasDep);
      setDepositAmount(depAmount);
      setDepositPeriodMonths(depMonths);
      setDepositCount(depCnt);
      setDepositMin(depMin);
      setExtraRules(ex);

      setLoaded(true);
    })();
  }, [id]);

  const submit = async () => {
    if (reason.trim().length < 3) {
      setErr('Причина обязательна');
      return;
    }
    let prizeShares: unknown = 'equal';
    if (!splitEqual) {
      const parsed = customShares
        .split(',')
        .map((s) => parseFloat(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (parsed.length === 0) {
        setErr('Список призов по местам пуст');
        return;
      }
      prizeShares = parsed.map((amount, i) => ({ place: i + 1, amount }));
    }

    const builtRules: object[] = [];
    if (requireDeposit && depositAmount > 0) {
      const days = Math.max(1, Math.round(depositPeriodMonths * 30));
      builtRules.push({
        type: 'deposit_window',
        amount: Math.max(depositAmount, depositMin),
        days,
        count: depositCount,
        min: depositMin,
      });
    }
    for (const r of extraRules) {
      const ser = serializeRule(r);
      if (ser) builtRules.push(ser);
    }

    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/_x/bonuses/contests/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          bannerUrl: bannerUrl.trim() || null,
          visibility,
          prizePool: Number(prizePool),
          winnersCount: Number(winnersCount),
          winnerWager,
          startsAt: new Date(startsAt).getTime(),
          endsAt: new Date(endsAt).getTime(),
          prizeShares,
          rules: builtRules,
          reason: reason.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json.error || 'Ошибка');
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Редактирование конкурса" wide>
      {!loaded ? (
        <Spinner />
      ) : (
        <>
          <SectionCard icon={<Trophy size={14} strokeWidth={1.7} />} title="Основное">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Название" colSpan={2}>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30" />
              </Field>
              <Field label="Описание" colSpan={2}>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full bg-white/[0.04] border border-white/15 rounded-card px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30 resize-none" />
              </Field>
              <Field label="Фото-фон" colSpan={2}>
                <div className="flex gap-2">
                  <input value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} className="flex-1 bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30" placeholder="https://..." />
                </div>
              </Field>
              <Field label="Видимость" colSpan={2}>
                <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'public' | 'private' | 'global')} className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30">
                  <option value="public" className="bg-midnight-canvas text-frost-white">Публичный</option>
                  <option value="private" className="bg-midnight-canvas text-frost-white">Приватный</option>
                  <option value="global" className="bg-midnight-canvas text-frost-white">Глобальный (авто-участие)</option>
                </select>
              </Field>
            </div>
          </SectionCard>

          <SectionCard icon={<Gift size={14} strokeWidth={1.7} />} title="Призовой фонд">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Сумма (zł)" colSpan={2}>
                <NumInput value={prizePool} step={50} min={1} onChange={setPrizePool} />
              </Field>
              <Field label="Количество победителей" colSpan={2}>
                <NumInput value={winnersCount} step={1} min={1} onChange={setWinnersCount} />
              </Field>
            </div>
            <Toggle checked={splitEqual} onChange={setSplitEqual} label="Разделить фонд поровну между победителями" hint={splitEqual ? `Каждому ≈ ${(prizePool / Math.max(1, winnersCount)).toFixed(2)} zł` : 'Можно задать разные суммы по местам'} />
            <div className="mt-3">
              <WagerPicker value={winnerWager} onChange={setWinnerWager} />
            </div>
            {!splitEqual && (
              <Field label="Призы по местам (через запятую)" colSpan={2}>
                <input value={customShares} onChange={(e) => setCustomShares(e.target.value)} placeholder="500, 300, 100, 50, 30..." className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[13px] tabular-nums text-frost-white focus:outline-none focus:border-white/30" />
              </Field>
            )}
          </SectionCard>

          <SectionCard icon={<SettingsIcon size={14} strokeWidth={1.7} />} title="Настройки времени">
            <Field label="Старт" colSpan={2}>
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30" />
            </Field>
            <Field label="Окончание" colSpan={2}>
              <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30" />
            </Field>
          </SectionCard>

          <SectionCard icon={<WalletIcon size={14} strokeWidth={1.7} />} title="Требования к депозитам" right={<Toggle inline checked={requireDeposit} onChange={setRequireDeposit} label="Включить" />}>
            {requireDeposit && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Field label="Сумма депозита (zł)"><NumInput value={depositAmount} step={5} min={0} onChange={setDepositAmount} /></Field>
                <Field label="Период (месяцев)">
                  <select value={depositPeriodMonths} onChange={(e) => setDepositPeriodMonths(Number(e.target.value))} className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[13px] tabular-nums text-frost-white focus:outline-none focus:border-white/30">
                    {[1, 3, 6, 12, 24].map((m) => (<option key={m} value={m} className="bg-midnight-canvas text-frost-white">за {m} мес</option>))}
                  </select>
                </Field>
                <Field label="Количество депозитов"><NumInput value={depositCount} step={1} min={1} onChange={setDepositCount} /></Field>
                <Field label="Минимальный депозит (zł)"><NumInput value={depositMin} step={5} min={0} onChange={setDepositMin} /></Field>
              </div>
            )}
          </SectionCard>

          <SectionCard icon={<SettingsIcon size={14} strokeWidth={1.7} />} title="Дополнительные правила">
            {/* <RuleBuilder rules={extraRules} onChange={setExtraRules} /> */}
            <div className="font-roobert text-[12px] text-whisper-gray">RuleBuilder не реализован</div>
          </SectionCard>

          <ReasonField reason={reason} onChange={setReason} />
          {err && <div className="font-roobert text-[12px] text-[#ff8a76] mt-2">{err}</div>}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10 mt-3">
            <button onClick={onClose} className="px-4 py-2 rounded-pill border border-white/15 bg-white/[0.04] font-roobert text-[12px] text-frost-white/85">Отмена</button>
            <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px] disabled:opacity-50">{busy ? 'Сохранение…' : 'Сохранить'}</button>
          </div>
        </>
      )}
    </Modal>
  );
}

function toLocalIso(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ContestDetailModal({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<{
    contest: {
      id: string;
      title: string;
      description: string | null;
      visibility: string;
      prizePool: number;
      winnersCount: number;
      prizeShares: unknown;
      rules: unknown;
      startsAt: number;
      endsAt: number;
      state: string;
      resolvedWinners: unknown;
      draftWinners?: unknown;
      winnerWager?: number;
      bannerUrl?: string | null;
    };
    participants: Array<{
      id: string;
      userId: string;
      name: string;
      photoUrl: string | null;
      banned: boolean;
      joinedAt: number;
    }>;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/_x/bonuses/contests/${id}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return;
    setData(await res.json());
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const draw = async () => {
    const reason = prompt('Причина проведения розыгрыша:');
    if (!reason || reason.trim().length < 3) return;
    if (!confirm('Разыграть конкурс? Балансы победителей будут пополнены.')) return;
    setBusy(true);
    try {
      await fetch(`/api/_x/bonuses/contests/${id}/draw`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      await reload();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const replaceWinner = async (place: number) => {
    const reason = prompt('Причина замены победителя:');
    if (!reason || reason.trim().length < 3) return;
    setBusy(true);
    try {
      await fetch(`/api/_x/bonuses/contests/${id}/replace-winner`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ place, reason: reason.trim() }),
      });
      await reload();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const banUser = async (userId: string, banned: boolean) => {
    const reason = prompt(`Причина ${banned ? 'дисквалификации' : 'восстановления'}:`);
    if (!reason || reason.trim().length < 3) return;
    setBusy(true);
    try {
      await fetch(
        `/api/_x/bonuses/contests/${id}/participants/${userId}/ban`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ banned, reason: reason.trim() }),
        }
      );
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const draftWinners = useMemo(
    () =>
      Array.isArray(data?.contest.draftWinners)
        ? (data!.contest.draftWinners as Array<{ userId?: string; place?: number }> )
            .map((w, i) => ({
              userId: String(w.userId ?? ''),
              place: Number.isFinite(w.place) && (w.place ?? 0) > 0 ? Number(w.place) : i + 1,
            }))
            .filter((w) => w.userId)
            .sort((a, b) => a.place - b.place)
        : [],
    [data]
  );

  const addDraftWinner = async (userId: string) => {
    const reason = prompt('Причина назначения победителя:');
    if (!reason || reason.trim().length < 3) return;
    const exists = draftWinners.some((w) => w.userId === userId);
    const next = exists
      ? draftWinners
      : [...draftWinners, { userId, place: draftWinners.length + 1 }];
    setBusy(true);
    try {
      await fetch(`/api/_x/bonuses/contests/${id}/draft-winners`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winners: next, reason: reason.trim() }),
      });
      await reload();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const removeDraftWinner = async (userId: string) => {
    const reason = prompt('Причина удаления победителя:');
    if (!reason || reason.trim().length < 3) return;
    setBusy(true);
    try {
      await fetch(`/api/_x/bonuses/contests/${id}/draft-winners/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      await reload();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const kickParticipant = async (userId: string) => {
    const reason = prompt('Причина удаления участника:');
    if (!reason || reason.trim().length < 3) return;
    setBusy(true);
    try {
      await fetch(`/api/_x/bonuses/contests/${id}/participants/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      await reload();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <Modal onClose={onClose} title="Загрузка…">
        <Spinner />
      </Modal>
    );
  }

  const winners = Array.isArray(data.contest.resolvedWinners)
    ? (data.contest.resolvedWinners as Array<{
        userId: string;
        place: number;
        amount: number;
      }>)
    : null;

  const preview = winners
    ? null
    : draftWinners.length > 0
      ? draftWinners
      : null;

  return (
    <Modal onClose={onClose} title={data.contest.title} wide>
      {data.contest.bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.contest.bannerUrl}
          alt="banner"
          className="w-full h-32 object-cover rounded-card border border-white/10"
          referrerPolicy="no-referrer"
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Пул" value={`${data.contest.prizePool.toFixed(0)} zł`} />
        <Stat label="Победителей" value={String(data.contest.winnersCount)} />
        <Stat
          label="Период"
          value={`${new Date(data.contest.startsAt).toLocaleDateString('ru-RU')} → ${new Date(data.contest.endsAt).toLocaleDateString('ru-RU')}`}
        />
        <Stat
          label="Состояние"
          value={
            <StateBadge state={data.contest.state} />
          }
        />
        <Stat
          label="Вейджер победителей"
          value={data.contest.winnerWager ? `x${data.contest.winnerWager}` : 'Без отыгрыша'}
        />
      </div>

      {data.contest.description && (
        <div className="rounded-card border border-white/10 bg-white/[0.03] px-4 py-3 font-roobert text-[12px] text-whisper-gray">
          {data.contest.description}
        </div>
      )}

      {Array.isArray(data.contest.rules) && data.contest.rules.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(data.contest.rules as Array<{ type: string }>).map((r, i) => (
            <span
              key={i}
              className="inline-flex items-center px-2 py-0.5 rounded-pill border border-white/15 bg-white/[0.04] font-roobert text-[10px] text-frost-white/85"
            >
              {ruleLabel(r.type as RuleDraft['type'])}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2">
        <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
          Победители
        </span>
        {data.contest.state !== 'paid' && (
          <button
            onClick={draw}
            disabled={busy || data.participants.filter((p) => !p.banned).length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px] disabled:opacity-50"
          >
            <Shuffle size={11} strokeWidth={1.8} />
            Разыграть
          </button>
        )}
      </div>

      {winners ? (
        <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
          {winners.map((w, i) => {
            const u = data.participants.find((p) => p.userId === w.userId);
            return (
              <div
                key={w.place}
                className={cn(
                  'grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-2',
                  i > 0 && 'border-t border-white/5'
                )}
              >
                <span className="font-roobert text-[12px] tabular-nums text-whisper-gray w-6">
                  #{w.place}
                </span>
                <div className="font-roobert text-[12px] text-frost-white truncate">
                  {u?.name ?? `id${w.userId.slice(0, 6)}`}
                </div>
                <div className="font-roobert text-[12px] tabular-nums text-frost-white/85">
                  {w.amount.toFixed(2)} zł
                </div>
                <button
                  onClick={() => replaceWinner(w.place)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-pill border border-white/15 hover:border-white/35 font-roobert text-[10px] uppercase tracking-[0.16em] text-frost-white/85 disabled:opacity-50"
                >
                  <Shuffle size={10} strokeWidth={1.8} />
                  Заменить
                </button>
              </div>
            );
          })}
        </div>
      ) : preview ? (
        <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
          {preview.map((w: { userId: string; place: number }, i: number) => {
            const u = data.participants.find((p) => p.userId === w.userId);
            return (
              <div
                key={w.place}
                className={cn(
                  'grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-2',
                  i > 0 && 'border-t border-white/5'
                )}
              >
                <span className="font-roobert text-[12px] tabular-nums text-whisper-gray w-6">#{w.place}</span>
                <div className="font-roobert text-[12px] text-frost-white truncate">
                  {u?.name ?? `id${w.userId.slice(0, 6)}`}
                </div>
                <div className="font-roobert text-[12px] text-whisper-gray">предпросмотр</div>
                <div className="flex gap-1">
                  <button
                    onClick={() => replaceWinner(w.place)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-pill border border-white/15 hover:border-white/35 font-roobert text-[10px] uppercase tracking-[0.16em] text-frost-white/85 disabled:opacity-50"
                  >
                    <Shuffle size={10} strokeWidth={1.8} />
                    Заменить
                  </button>
                  <button
                    onClick={() => removeDraftWinner(w.userId)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-pill border border-white/15 hover:border-white/35 font-roobert text-[10px] uppercase tracking-[0.16em] text-[#ff8a76] disabled:opacity-50"
                  >
                    <Trash2 size={10} strokeWidth={1.8} />
                    Удалить
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty text="Розыгрыш ещё не проведён" />
      )}

      <div className="pt-2">
        <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
          Участники ({data.participants.length})
        </span>
      </div>
      <div className="rounded-card border border-white/10 bg-white/[0.03] max-h-72 overflow-y-auto">
        {data.participants.length === 0 ? (
          <div className="px-4 py-6 text-center font-roobert text-[12px] text-whisper-gray">
            Пока никто не присоединился
          </div>
        ) : (
          data.participants.map((p, i) => (
            <div
              key={p.id}
              className={cn(
                'grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2',
                i > 0 && 'border-t border-white/5'
              )}
            >
              {p.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.photoUrl}
                  alt=""
                  className="w-6 h-6 rounded-pill object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="w-6 h-6 rounded-pill bg-white/10 flex items-center justify-center font-roobert text-[10px] text-frost-white/85">
                  {p.name.charAt(0).toUpperCase()}
                </span>
              )}
              <div
                className={cn(
                  'font-roobert text-[12px] truncate',
                  p.banned ? 'text-whisper-gray line-through' : 'text-frost-white'
                )}
              >
                {p.name}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => addDraftWinner(p.userId)}
                  disabled={busy || p.banned}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-pill border border-white/15 hover:border-white/35 font-roobert text-[10px] uppercase tracking-[0.16em] text-frost-white/85 disabled:opacity-50"
                >
                  Сделать победителем
                </button>
                <button
                  onClick={() => banUser(p.userId, !p.banned)}
                  disabled={busy}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-1 rounded-pill border font-roobert text-[10px] uppercase tracking-[0.16em] disabled:opacity-50',
                    p.banned
                      ? 'border-[#a0e0ab]/40 bg-[#a0e0ab]/10 text-frost-white'
                      : 'border-[#ff8a76]/40 bg-[#ff8a76]/10 text-frost-white'
                  )}
                >
                  {p.banned ? <CheckCircle size={10} strokeWidth={1.8} /> : <Ban size={10} strokeWidth={1.8} />}
                  {p.banned ? 'Восст.' : 'Дискв.'}
                </button>
                <button
                  onClick={() => kickParticipant(p.userId)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-pill border border-white/15 hover:border-white/35 font-roobert text-[10px] uppercase tracking-[0.16em] text-[#ff8a76] disabled:opacity-50"
                >
                  Удалить
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

/* ============================================================== Wheel removed */

/* ============================================================== shared */

function Modal({
  onClose,
  title,
  children,
  wide = false,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      // Snap-к-верху на мобиле + большой нижний padding, чтобы кнопки
      // действий (например «Создать») всегда были выше нижнего таб-бара
      // (~96px + safe-area). На sm+ модалка центрируется как раньше.
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center px-4 pt-4 pb-[140px] sm:pb-4 overflow-y-auto overscroll-contain"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'rounded-card border border-white/10 bg-midnight-canvas relative my-auto w-full',
          wide ? 'max-w-[640px]' : 'max-w-[480px]'
        )}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 sticky top-0 bg-midnight-canvas/95 backdrop-blur-sm z-10">
          <span className="font-roobert text-[14px] text-frost-white">{title}</span>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center w-7 h-7 rounded-pill border border-white/15 hover:border-white/35"
          >
            <X size={12} strokeWidth={1.8} />
          </button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">{children}</div>
      </motion.div>
    </motion.div>
  );
}

function Field({
  label,
  children,
  colSpan = 1,
}: {
  label: string;
  children: React.ReactNode;
  colSpan?: 1 | 2;
}) {
  return (
    <div className={cn('flex flex-col gap-1', colSpan === 2 && 'col-span-2')}>
      <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
        {label}
      </span>
      {children}
    </div>
  );
}

function NumInput({
  value,
  step,
  min,
  onChange,
}: {
  value: number;
  step: number;
  min?: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      step={step}
      min={min}
      value={value}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[13px] tabular-nums text-frost-white focus:outline-none focus:border-white/30"
    />
  );
}

function ReasonField({
  reason,
  onChange,
}: {
  reason: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label="Причина (для аудита)" colSpan={2}>
      <input
        value={reason}
        onChange={(e) => onChange(e.target.value)}
        placeholder="например: квартальная промо"
        className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
      />
    </Field>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
        {label}
      </div>
      <div className="mt-1 font-roobert text-[14px] text-frost-white">{value}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] px-2 py-1.5">
      <div className="font-roobert text-[8px] uppercase tracking-[0.18em] text-whisper-gray">
        {label}
      </div>
      <div className="font-roobert text-[12px] text-frost-white tabular-nums">
        {value}
      </div>
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; color: string }> = {
    scheduled: { label: 'Запланирован', color: 'border-white/15 bg-white/[0.04] text-frost-white/85' },
    live: { label: 'Идёт', color: 'border-[#ffac2e]/45 bg-[#ffac2e]/10 text-frost-white' },
    closed: { label: 'Закрыт', color: 'border-white/15 bg-white/[0.04] text-whisper-gray' },
    paid: { label: 'Выплачен', color: 'border-[#a0e0ab]/45 bg-[#a0e0ab]/10 text-frost-white' },
  };
  const m = map[state] || map.scheduled;
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-pill border font-roobert text-[10px] uppercase tracking-[0.16em]',
        m.color
      )}
    >
      {m.label}
    </span>
  );
}

function Spinner() {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] py-12 flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border border-white/20 border-t-frost-white animate-spin" />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-8 text-center font-roobert text-[12px] text-whisper-gray">
      {text}
    </div>
  );
}

function isoLocalNow(addDays = 0): string {
  const d = new Date(Date.now() + addDays * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ============================================================== Deposit Bonuses Admin Section */

function DepositBonusesAdminSection() {
  const [list, setList] = useState<DepositBonusAdminRow[] | null>(null);
  const [editingBonus, setEditingBonus] = useState<DepositBonusAdminRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/_x/bonuses/deposits', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) return setList([]);
      const j = await res.json();
      setList(j.bonuses ?? []);
    } catch {
      setList([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const deleteBonus = async (id: string, title: string) => {
    const reason = prompt(`Причина удаления депозитного бонуса «${title}» (минимум 3 символа):`);
    if (!reason || reason.trim().length < 3) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/_x/bonuses/deposits/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (res.ok) await reload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="font-roobert text-[14px] text-frost-white">Депозитные бонусы (Разовые)</span>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-pill bg-amber-400 text-black font-semibold font-roobert text-[12px] shadow-md hover:bg-amber-300 transition-colors"
        >
          <Plus size={14} strokeWidth={2} />
          Создать бонус
        </button>
      </div>

      {list === null ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty text="Депозитных бонусов пока нет" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((b) => (
            <div
              key={b.id}
              className="rounded-card border border-white/10 bg-white/[0.03] p-4 flex flex-col justify-between gap-3"
            >
              {b.bannerUrl && (
                <div className="w-full h-28 rounded-xl overflow-hidden border border-white/10">
                  <img src={b.bannerUrl} alt={b.title} className="w-full h-full object-cover" />
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-roobert text-[15px] font-bold text-white truncate">{b.title}</h3>
                  <span
                    className={`px-2 py-0.5 rounded-full font-mono text-[9.5px] uppercase border ${
                      b.active
                        ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                        : 'border-white/15 bg-white/5 text-whisper-gray'
                    }`}
                  >
                    {b.active ? 'Активен' : 'Выключен'}
                  </span>
                </div>
                {b.description && (
                  <p className="font-roobert text-[12px] text-whisper-gray mt-1 leading-snug">
                    {b.description}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-roobert text-whisper-gray">
                <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                  <div>Мин. деп</div>
                  <b className="text-amber-400 text-[13px]">{b.minDeposit} zł</b>
                </div>
                <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                  <div>Бонус</div>
                  <b className="text-white text-[13px]">
                    {b.type === 'percent' ? `+${b.bonusValue}%` : `+${b.bonusValue} zł`}
                  </b>
                </div>
                <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                  <div>Вейджер</div>
                  <b className="text-cyan-400 text-[13px]">x{b.wagerMultiplier}</b>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-white/5 pt-3">
                <div className="text-[11px] text-whisper-gray font-roobert">
                  Активаций: <b className="text-white">{b.activationsCount}</b> · Использован:{' '}
                  <b className="text-emerald-400">{b.usedCount}</b>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingBonus(b)}
                    className="px-2.5 py-1 rounded-pill border border-white/15 hover:border-white/30 text-white font-roobert text-[11px]"
                  >
                    Редактировать
                  </button>
                  <button
                    onClick={() => deleteBonus(b.id, b.title)}
                    disabled={busyId === b.id}
                    className="px-2.5 py-1 rounded-pill border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 text-[11px] font-roobert"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Deposit Bonus Modal */}
      {editingBonus && (
        <EditDepositBonusModal
          bonus={editingBonus}
          onClose={() => setEditingBonus(null)}
          onSaved={() => {
            setEditingBonus(null);
            void reload();
          }}
        />
      )}

      {/* Create Deposit Bonus Modal */}
      {creating && (
        <CreateDepositBonusModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void reload();
          }}
        />
      )}
    </div>
  );
}

function EditDepositBonusModal({
  bonus,
  onClose,
  onSaved,
}: {
  bonus: DepositBonusAdminRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(bonus.title);
  const [description, setDescription] = useState(bonus.description || '');
  const [bannerUrl, setBannerUrl] = useState(bonus.bannerUrl || '');
  const [type, setType] = useState<'percent' | 'fixed'>(bonus.type);
  const [bonusValue, setBonusValue] = useState(bonus.bonusValue);
  const [minDeposit, setMinDeposit] = useState(bonus.minDeposit);
  const [wagerMultiplier, setWagerMultiplier] = useState(bonus.wagerMultiplier);
  const [active, setActive] = useState(bonus.active);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (reason.trim().length < 3) {
      setErr('Причина обязательна (минимум 3 символа)');
      return;
    }
    setBusy(true);
    setErr(null);

    try {
      const res = await fetch(`/api/_x/bonuses/deposits/${bonus.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          bannerUrl: bannerUrl.trim() || null,
          type,
          bonusValue,
          minDeposit,
          wagerMultiplier,
          active,
          reason: reason.trim(),
        }),
      });

      if (!res.ok) {
        const j = await res.json();
        setErr(j.error || 'Не удалось сохранить');
      } else {
        onSaved();
      }
    } catch {
      setErr('Ошибка подключения');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Редактирование депозитного бонуса">
      <Field label="Название бонуса">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
        />
      </Field>

      <Field label="Описание">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full bg-white/[0.04] border border-white/15 rounded-card px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30 resize-none"
        />
      </Field>

      <Field label="Ссылка на баннер / фото (оставьте пустым для темы без фото)">
        <input
          value={bannerUrl}
          onChange={(e) => setBannerUrl(e.target.value)}
          placeholder="https://..."
          className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Тип бонуса">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as 'percent' | 'fixed')}
            className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
          >
            <option value="percent" className="bg-midnight-canvas text-white">Процент (+%)</option>
            <option value="fixed" className="bg-midnight-canvas text-white">Фиксированный (+zł)</option>
          </select>
        </Field>

        <Field label="Значение бонуса">
          <NumInput value={bonusValue} step={5} min={1} onChange={setBonusValue} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Мин. депозит (zł)">
          <NumInput value={minDeposit} step={10} min={1} onChange={setMinDeposit} />
        </Field>

        <Field label="Вейджер (множитель)">
          <NumInput value={wagerMultiplier} step={1} min={0} onChange={setWagerMultiplier} />
        </Field>
      </div>

      <Toggle checked={active} onChange={setActive} label="Бонус активен для выбора игроками" />

      <ReasonField reason={reason} onChange={setReason} />
      {err && <div className="font-roobert text-[12px] text-rose-400">{err}</div>}

      <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10 mt-2">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-pill border border-white/15 bg-white/[0.04] font-roobert text-[12px] text-frost-white/85"
        >
          Отмена
        </button>
        <button
          onClick={submit}
          disabled={busy}
          className="px-4 py-2 rounded-pill bg-amber-400 text-black font-semibold font-roobert text-[12px] disabled:opacity-50 shadow-md"
        >
          {busy ? 'Сохранение…' : 'Сохранить изменения'}
        </button>
      </div>
    </Modal>
  );
}

function CreateDepositBonusModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [type, setType] = useState<'percent' | 'fixed'>('percent');
  const [bonusValue, setBonusValue] = useState<number>(100);
  const [minDeposit, setMinDeposit] = useState<number>(100);
  const [wagerMultiplier, setWagerMultiplier] = useState<number>(50);
  const [active, setActive] = useState(true);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) {
      setErr('Укажите название бонуса');
      return;
    }
    if (reason.trim().length < 3) {
      setErr('Причина обязательна (минимум 3 символа)');
      return;
    }
    setBusy(true);
    setErr(null);

    try {
      const res = await fetch('/api/_x/bonuses/deposits', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          bannerUrl: bannerUrl.trim() || null,
          type,
          bonusValue,
          minDeposit,
          wagerMultiplier,
          active,
          reason: reason.trim(),
        }),
      });

      if (!res.ok) {
        const j = await res.json();
        setErr(j.error || 'Не удалось создать бонус');
      } else {
        onSaved();
      }
    } catch {
      setErr('Ошибка подключения');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Создание депозитного бонуса">
      <Field label="Название бонуса">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="например: 🔥 +100% к депозиту"
          className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
        />
      </Field>

      <Field label="Описание">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Описание бонуса для игроков..."
          rows={2}
          className="w-full bg-white/[0.04] border border-white/15 rounded-card px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30 resize-none"
        />
      </Field>

      <Field label="Ссылка на баннер / фото (оставьте пустым для темы без фото)">
        <input
          value={bannerUrl}
          onChange={(e) => setBannerUrl(e.target.value)}
          placeholder="https://..."
          className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Тип бонуса">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as 'percent' | 'fixed')}
            className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
          >
            <option value="percent" className="bg-midnight-canvas text-white">Процент (+%)</option>
            <option value="fixed" className="bg-midnight-canvas text-white">Фиксированный (+zł)</option>
          </select>
        </Field>

        <Field label="Значение бонуса">
          <NumInput value={bonusValue} step={5} min={1} onChange={setBonusValue} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Мин. депозит (zł)">
          <NumInput value={minDeposit} step={10} min={1} onChange={setMinDeposit} />
        </Field>

        <Field label="Вейджер (множитель)">
          <NumInput value={wagerMultiplier} step={1} min={0} onChange={setWagerMultiplier} />
        </Field>
      </div>

      <Toggle checked={active} onChange={setActive} label="Бонус активен для выбора игроками" />

      <ReasonField reason={reason} onChange={setReason} />
      {err && <div className="font-roobert text-[12px] text-rose-400">{err}</div>}

      <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10 mt-2">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-pill border border-white/15 bg-white/[0.04] font-roobert text-[12px] text-frost-white/85"
        >
          Отмена
        </button>
        <button
          onClick={submit}
          disabled={busy}
          className="px-4 py-2 rounded-pill bg-amber-400 text-black font-semibold font-roobert text-[12px] disabled:opacity-50 shadow-md"
        >
          {busy ? 'Создание…' : 'Создать бонус'}
        </button>
      </div>
    </Modal>
  );
}

void Calendar;
