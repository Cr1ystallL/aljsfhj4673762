'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy,
  Check,
  Lock,
  ShieldAlert,
  Wallet,
  ChevronRight,
  X,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/admin-shell';
import { HelpButton } from '@/components/admin/help-button';
import { resolveGameKey, gameLabel } from '@/components/ui/game-icon';

/**
 * Admin → User detail page.
 *
 * Pulls everything `/api/_x/users/:id` returns:
 *   - profile + balance
 *   - aggregate stats
 *   - 30 most recent bets
 *   - 30 most recent transactions
 *   - 30 most recent admin-log entries for this user
 *
 * Provides three privileged actions:
 *   1. Adjust balance (positive or negative delta with required reason).
 *   2. Toggle "isBlocked" — fully blocks the account.
 *   3. Toggle "withdrawalLocked" — playing OK, withdraws blocked.
 *
 * Every mutating call carries the admin's reason and is recorded in the
 * audit log. UI optimistically refreshes after each call.
 */

interface UserDetail {
  ok: true;
  user: {
    id: string;
    telegramId: number;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    languageCode: string | null;
    photoUrl: string | null;
    isPremium: boolean;
    isBlocked: boolean;
    withdrawalLocked: boolean;
    adminNote: string | null;
    createdAt: number;
    updatedAt: number;
    balance: number;
    currency: string;
  };
  stats: {
    totalBets: number;
    wagered: number;
    paidOut: number;
    ggr: number;
    maxMultiplier: number;
    maxBet: number;
  };
  bets: Array<{
    id: string;
    gameType: string;
    amount: number;
    payout: number | null;
    multiplier: number | null;
    state: string;
    placedAt: number;
    resolvedAt: number | null;
  }>;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    gameType: string | null;
    createdAt: number;
    metadata: unknown;
  }>;
  adminLog: Array<{
    id: string;
    action: string;
    adminTelegramId: number;
    payloadBefore: unknown;
    payloadAfter: unknown;
    reason: string | null;
    createdAt: number;
  }>;
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const router = useRouter();
  const [data, setData] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Action modal state — single modal driven by `action`.
  type Action = null | 'balance' | 'block' | 'lock';
  const [action, setAction] = useState<Action>(null);
  const [delta, setDelta] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/_x/users/${userId}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        setError('not-found');
        return;
      }
      const j = (await res.json()) as UserDetail;
      setData(j);
      setError(null);
    } catch {
      setError('not-found');
    }
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCopyId = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(String(data.user.telegramId));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const submitAction = async () => {
    if (!data || !action) return;
    if (!reason.trim() || reason.trim().length < 3) return;

    setBusy(true);
    try {
      if (action === 'balance') {
        const num = parseFloat(delta);
        if (!Number.isFinite(num) || num === 0) {
          setBusy(false);
          return;
        }
        const res = await fetch(
          `/api/_x/users/${userId}/balance`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delta: num, reason: reason.trim() }),
          }
        );
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          alert(j?.message ?? 'Не удалось изменить баланс');
          setBusy(false);
          return;
        }
      } else if (action === 'block') {
        const res = await fetch(`/api/_x/users/${userId}/flags`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isBlocked: !data.user.isBlocked,
            reason: reason.trim(),
          }),
        });
        if (!res.ok) {
          alert('Не удалось изменить блокировку');
          setBusy(false);
          return;
        }
      } else if (action === 'lock') {
        const res = await fetch(`/api/_x/users/${userId}/flags`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            withdrawalLocked: !data.user.withdrawalLocked,
            reason: reason.trim(),
          }),
        });
        if (!res.ok) {
          alert('Не удалось изменить блок вывода');
          setBusy(false);
          return;
        }
      }

      // Success — refresh and close.
      setAction(null);
      setDelta('');
      setReason('');
      await reload();
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <AdminShell title="Игрок">
        <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-6 text-center font-roobert text-[12px] text-whisper-gray">
          Игрок не найден.
        </div>
      </AdminShell>
    );
  }

  if (!data) {
    return (
      <AdminShell title="Игрок">
        <div className="rounded-card border border-white/10 bg-white/[0.03] py-16 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border border-white/20 border-t-frost-white animate-spin" />
        </div>
      </AdminShell>
    );
  }

  const u = data.user;
  const initials = (u.firstName?.charAt(0) ?? 'U').toUpperCase();

  return (
    <AdminShell title={u.firstName || u.username || 'Игрок'}>
      <div className="flex flex-col gap-5">
        {/* Identity card */}
        <section className="relative overflow-hidden rounded-card border border-white/10 bg-white/[0.03]">
          <div
            aria-hidden
            className="absolute inset-0 opacity-50"
            style={{
              background:
                'radial-gradient(120% 110% at 80% 110%, rgba(165, 45, 37, 0.20) 0%, rgba(255, 172, 46, 0.10) 35%, transparent 75%)',
            }}
          />
          <div className="relative px-5 py-5 flex items-start gap-4">
            {u.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={u.photoUrl}
                alt={u.firstName || 'Игрок'}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-pill border border-white/15 object-cover"
                draggable={false}
              />
            ) : (
              <span className="w-16 h-16 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center font-roobert text-[20px] text-frost-white">
                {initials}
              </span>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-roobert text-[20px] text-frost-white truncate">
                  {(u.firstName ?? '') + (u.lastName ? ` ${u.lastName}` : '') ||
                    'Игрок'}
                </span>
                {u.isBlocked && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill border border-[rgba(165,45,37,0.5)] bg-[rgba(165,45,37,0.18)] text-[10px] uppercase tracking-[0.18em] text-[#ff8a76] font-roobert">
                    <ShieldAlert size={10} strokeWidth={1.8} /> Блок
                  </span>
                )}
                {u.withdrawalLocked && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill border border-amber-400/40 bg-amber-400/10 text-[10px] uppercase tracking-[0.18em] text-amber-200 font-roobert">
                    <Lock size={10} strokeWidth={1.8} /> Вывод
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleCopyId}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill border border-white/15 bg-white/[0.04] hover:border-white/25 transition-colors"
                >
                  <span className="font-roobert text-[11px] text-whisper-gray tabular-nums">
                    #{u.telegramId}
                  </span>
                  {copied ? (
                    <Check size={11} strokeWidth={2} />
                  ) : (
                    <Copy size={11} strokeWidth={1.7} />
                  )}
                </button>
                {u.username && (
                  <span className="font-roobert text-[11px] text-whisper-gray">
                    @{u.username}
                  </span>
                )}
                <span className="font-roobert text-[11px] text-whisper-gray">
                  Зарегистрирован{' '}
                  {new Date(u.createdAt).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                  })}
                </span>
              </div>
              <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill border border-white/15 bg-white/[0.04]">
                <Wallet size={13} className="text-frost-white/70" strokeWidth={1.7} />
                <span className="font-roobert text-frost-white text-[14px] tabular-nums">
                  {u.balance.toLocaleString('ru-RU', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="font-roobert text-whisper-gray text-[11px]">
                  {u.currency}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Stats grid */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Ставок" value={data.stats.totalBets.toLocaleString('ru-RU')} />
          <Stat
            label="Оборот"
            value={`${data.stats.wagered.toLocaleString('ru-RU', {
              maximumFractionDigits: 0,
            })} zł`}
          />
          <Stat
            label="GGR"
            value={`${data.stats.ggr.toLocaleString('ru-RU', {
              maximumFractionDigits: 0,
            })} zł`}
            warn={data.stats.ggr < 0}
          />
          <Stat
            label="Макс. кф"
            value={
              data.stats.maxMultiplier > 0
                ? `x${data.stats.maxMultiplier.toFixed(2)}`
                : '—'
            }
          />
        </section>

        {/* Actions */}
        <section className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
            <span className="font-roobert text-[10px] uppercase tracking-[0.28em] text-whisper-gray">
              Действия
            </span>
            <HelpButton title="Действия с игроком" size={12}>
              <p>
                Каждое действие требует <strong>причину</strong> минимум
                3 символа — она сохраняется в журнале аудита и видна другим
                админам в разделе «Аудит».
              </p>
              <p>
                Изменения баланса проходят через атомарную транзакцию,
                поэтому конкурентные ставки игрока не могут «обойти»
                ваше изменение.
              </p>
            </HelpButton>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/5">
            <ActionButton
              label="Изменить баланс"
              hint="Кредит / дебет с причиной"
              onClick={() => {
                setAction('balance');
                setDelta('');
                setReason('');
              }}
            />
            <ActionButton
              label={u.isBlocked ? 'Снять блокировку' : 'Заблокировать'}
              hint={u.isBlocked ? 'Игрок снова может играть' : 'Запрет на игры и выводы'}
              danger={!u.isBlocked}
              onClick={() => {
                setAction('block');
                setReason('');
              }}
            />
            <ActionButton
              label={
                u.withdrawalLocked ? 'Разрешить вывод' : 'Заморозить вывод'
              }
              hint={
                u.withdrawalLocked
                  ? 'Снять блок на вывод'
                  : 'Игры разрешены, выводы — нет'
              }
              onClick={() => {
                setAction('lock');
                setReason('');
              }}
            />
          </div>
        </section>

        {/* Recent bets */}
        <section>
          <div className="flex items-baseline justify-between px-1 mb-2">
            <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
              Последние ставки
            </span>
            <span className="font-roobert text-[11px] text-whisper-gray">
              {data.bets.length}
            </span>
          </div>
          {data.bets.length === 0 ? (
            <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-6 text-center font-roobert text-[12px] text-whisper-gray">
              Игрок ещё не делал ставок.
            </div>
          ) : (
            <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
              {data.bets.map((b) => {
                const won = (b.payout ?? 0) > 0;
                const net = (b.payout ?? 0) - b.amount;
                return (
                  <div
                    key={b.id}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="font-roobert text-[13px] text-frost-white truncate">
                        {gameLabel(resolveGameKey(b.gameType))}
                      </div>
                      <div className="font-roobert text-[10px] text-whisper-gray tabular-nums truncate">
                        {new Date(b.placedAt).toLocaleString('ru-RU')} · {b.state}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-roobert text-[12px] text-whisper-gray tabular-nums">
                        Ставка
                      </div>
                      <div className="font-roobert text-[12px] tabular-nums">
                        {b.amount.toLocaleString('ru-RU')}
                      </div>
                    </div>
                    <div className="text-right w-20">
                      <div className="font-roobert text-[12px] text-whisper-gray tabular-nums">
                        {b.multiplier !== null ? `x${b.multiplier.toFixed(2)}` : '—'}
                      </div>
                      <div
                        className={`font-roobert text-[12px] tabular-nums ${
                          won ? 'text-frost-white' : 'text-[#ff8a76]/85'
                        }`}
                      >
                        {net >= 0 ? '+' : '−'}
                        {Math.abs(net).toLocaleString('ru-RU', {
                          maximumFractionDigits: 0,
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Admin log for this user */}
        <section>
          <div className="flex items-baseline justify-between px-1 mb-2">
            <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
              Действия админов
            </span>
            <span className="font-roobert text-[11px] text-whisper-gray">
              {data.adminLog.length}
            </span>
          </div>
          {data.adminLog.length === 0 ? (
            <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-6 text-center font-roobert text-[12px] text-whisper-gray">
              Нет действий админов.
            </div>
          ) : (
            <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
              {data.adminLog.map((a) => (
                <div key={a.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-roobert text-[12px] text-frost-white">
                      {a.action}
                    </span>
                    <span className="font-roobert text-[10px] text-whisper-gray tabular-nums">
                      {new Date(a.createdAt).toLocaleString('ru-RU')}
                    </span>
                  </div>
                  <div className="font-roobert text-[10px] text-whisper-gray mt-0.5 tabular-nums">
                    Админ #{a.adminTelegramId}
                  </div>
                  {a.reason && (
                    <div className="mt-1 font-roobert text-[12px] text-whisper-gray">
                      «{a.reason}»
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Action modal */}
      <AnimatePresence>
        {action && (
          <motion.div
            className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center px-3 pb-3 sm:pb-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              onClick={() => !busy && setAction(null)}
              aria-label="Закрыть"
              className="absolute inset-0 bg-midnight-canvas/85 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              className="relative w-full max-w-[420px] rounded-card border border-white/10 p-5 backdrop-blur-2xl"
              style={{ background: 'rgba(10, 10, 10, 0.96)' }}
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-roobert text-[18px] text-frost-white">
                  {action === 'balance'
                    ? 'Изменить баланс'
                    : action === 'block'
                    ? u.isBlocked
                      ? 'Снять блокировку'
                      : 'Заблокировать игрока'
                    : u.withdrawalLocked
                    ? 'Разрешить вывод'
                    : 'Заморозить вывод'}
                </h3>
                <button
                  onClick={() => !busy && setAction(null)}
                  className="w-8 h-8 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80"
                >
                  <X size={14} strokeWidth={1.8} />
                </button>
              </div>

              {action === 'balance' && (
                <div className="flex flex-col gap-3 mb-3">
                  <label className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
                    Изменение (положительное = кредит, отрицательное = дебет)
                  </label>
                  <input
                    value={delta}
                    onChange={(e) => setDelta(e.target.value)}
                    type="number"
                    placeholder="+100 или -50"
                    className="bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[14px] tabular-nums text-frost-white focus:outline-none focus:border-white/30"
                  />
                  <div className="font-roobert text-[11px] text-whisper-gray">
                    Текущий баланс:{' '}
                    {u.balance.toLocaleString('ru-RU', {
                      maximumFractionDigits: 2,
                    })}{' '}
                    {u.currency}
                  </div>
                </div>
              )}

              <label className="block font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray mb-1">
                Причина (обязательно)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Почему производится действие — попадёт в аудит"
                className="w-full bg-white/[0.04] border border-white/15 rounded-card px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30 mb-4"
              />

              <button
                onClick={submitAction}
                disabled={busy || reason.trim().length < 3}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px] uppercase tracking-[0.22em] disabled:opacity-50"
              >
                {busy ? 'Применение…' : 'Подтвердить'}
                <ChevronRight size={14} strokeWidth={2} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AdminShell>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <div className="font-roobert text-[9px] uppercase tracking-[0.22em] text-whisper-gray">
        {label}
      </div>
      <div
        className={`mt-0.5 font-roobert text-[16px] tabular-nums ${
          warn ? 'text-[#ff8a76]' : 'text-frost-white'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  hint,
  onClick,
  danger,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left px-4 py-3 hover:bg-white/[0.04] transition-colors w-full"
    >
      <div
        className={`font-roobert text-[14px] ${
          danger ? 'text-[#ff8a76]' : 'text-frost-white'
        }`}
      >
        {label}
      </div>
      <div className="font-roobert text-[11px] text-whisper-gray mt-0.5">
        {hint}
      </div>
    </button>
  );
}
