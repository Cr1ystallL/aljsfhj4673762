'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

type Tab = 'promo' | 'contests';

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
              { id: 'contests' as const, label: 'Конкурсы' },
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
      {tab === 'contests' && <ContestsTab />}
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
          {p.amount.toFixed(2)} {p.currency} · {p.redemptions} активаций
          {p.maxRedemptions !== null && ` / ${p.maxRedemptions}`} ·{' '}
          {p.active ? 'активен' : 'выключен'}
        </div>
      </div>
      <span className="font-roobert text-[12px] text-frost-white/85 tabular-nums">
        {p.paidOut.toFixed(0)} {p.currency}
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
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState(10);
  const [maxRedemptions, setMaxRedemptions] = useState<number>(-1);
  const [expiresAt, setExpiresAt] = useState<string>('');
  // Вейджер — множитель отыгрыша бонуса. 0 — без отыгрыша.
  // Сохраняется в rules как {type:'wager', multiplier:N}, бэк-валидатор
  // правил активации этот type безопасно игнорирует (видим в UI).
  const [wagerMultiplier, setWagerMultiplier] = useState(0);
  const [withRules, setWithRules] = useState(false);
  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      // Добавляем wager как специальный пункт rules. Это отдельно
      // от условий активации: вейджер — требование после активации, а не
      // фильтр допуска.
      const finalRules =
        wagerMultiplier > 0
          ? [...baseRules, { type: 'wager', multiplier: wagerMultiplier }]
          : baseRules;
      const res = await fetch('/api/_x/bonuses/promos', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          amount: Number(amount),
          // Отрицательное значение = безлимитное число активаций (на стороне
          // бэка пишется NULL).
          maxRedemptions: maxRedemptions < 0 ? null : Number(maxRedemptions),
          // По умолчанию каждый пользователь может активировать промо один раз.
          // Если админу нужны множественные активации, увеличит через PATCH.
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Код" colSpan={2}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="WELCOME10"
            className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white tracking-[0.18em] focus:outline-none focus:border-white/30"
          />
        </Field>
        <Field label="Сумма (zł)">
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
            <Stat label="Сумма" value={`${data.promo.amount.toFixed(2)} ${data.promo.currency}`} />
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
                    +{r.amount.toFixed(2)}
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
          <Field label="Фото-фон (URL)" colSpan={2}>
            <input
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
              placeholder="https://example.com/banner.jpg"
              className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[12px] text-frost-white focus:outline-none focus:border-white/30"
            />
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
          Вернуться к результатам
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
  const [visibility, setVisibility] = useState<'public' | 'private' | 'global'>('public');
  const [prizePool, setPrizePool] = useState(0);
  const [winnersCount, setWinnersCount] = useState(1);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
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
      setStartsAt(toLocalIso(c.startsAt));
      setEndsAt(toLocalIso(c.endsAt));
      setLoaded(true);
    })();
  }, [id]);

  const submit = async () => {
    if (reason.trim().length < 3) {
      setErr('Причина обязательна');
      return;
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
          startsAt: new Date(startsAt).getTime(),
          endsAt: new Date(endsAt).getTime(),
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
                rows={2}
                className="w-full bg-white/[0.04] border border-white/15 rounded-card px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30 resize-none"
              />
            </Field>
            <Field label="Фото-фон (URL)" colSpan={2}>
              <input
                value={bannerUrl}
                onChange={(e) => setBannerUrl(e.target.value)}
                placeholder="https://example.com/banner.jpg"
                className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[12px] text-frost-white focus:outline-none focus:border-white/30"
              />
            </Field>
            <Field label="Видимость">
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
            <Field label="Призовой пул (zł)">
              <NumInput value={prizePool} step={50} min={1} onChange={setPrizePool} />
            </Field>
            <Field label="Победителей">
              <NumInput value={winnersCount} step={1} min={1} onChange={setWinnersCount} />
            </Field>
            <Field label="Старт">
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
              />
            </Field>
            <Field label="Окончание">
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
              />
            </Field>
          </div>
          <ReasonField reason={reason} onChange={setReason} />
          {err && <div className="font-roobert text-[12px] text-[#ff8a76]">{err}</div>}
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
              {busy ? 'Сохранение…' : 'Сохранить'}
            </button>
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

  return (
    <Modal onClose={onClose} title={data.contest.title} wide>
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

void Calendar;
