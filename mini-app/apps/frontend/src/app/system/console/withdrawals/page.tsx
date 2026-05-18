'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, X, ChevronRight, AlertTriangle } from 'lucide-react';
import { HelpButton } from '@/components/admin/help-button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Admin → Withdrawals.
 *
 * Two-pane layout:
 *   1. List rail with status filter chips (pending / all).
 *   2. When a row is opened it slides up a full-screen sheet with the
 *      complete payload the user submitted — every field copyable —
 *      plus large "Принять" / "Отклонить" actions. Reject is gated by
 *      a reason input which lands in the audit log AND is shown to the
 *      player on the history page.
 */

interface WithdrawalRequest {
  id: string;
  userId: string;
  name: string;
  telegramId: number | null;
  photoUrl: string | null;
  amount: number;
  currency: string;
  method: string;
  destination: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid' | string;
  reviewedAt: number | null;
  rejectionReason: string | null;
  metadata: unknown;
  createdAt: number;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Ожидает',
  approved: 'Одобрена',
  rejected: 'Отклонена',
  paid: 'Выплачена',
};

const STATUS_TINT: Record<string, string> = {
  pending: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  approved: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  paid: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  rejected:
    'border-[rgba(165,45,37,0.45)] bg-[rgba(165,45,37,0.18)] text-[#ff8a76]',
};

function methodLabel(m: string): string {
  switch (m) {
    case 'blik':
      return 'BLIK';
    case 'card':
      return 'Банковская карта';
    case 'bank':
      return 'Банковский перевод';
    case 'revolut':
      return 'Revolut';
    default:
      return m;
  }
}

export default function WithdrawalsPage() {
  const router = useRouter();
  const [data, setData] = useState<WithdrawalRequest[] | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [openId, setOpenId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter === 'pending') params.set('status', 'pending');
      params.set('limit', '100');
      const res = await fetch(
        `/api/_x/withdrawal-requests?${params.toString()}`,
        { credentials: 'include', cache: 'no-store' }
      );
      if (!res.ok) {
        setData([]);
        return;
      }
      const j = await res.json();
      setData(j.requests ?? []);
    } catch {
      setData([]);
    }
  }, [filter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const opened = useMemo(
    () => data?.find((w) => w.id === openId) ?? null,
    [data, openId]
  );

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilter('pending')}
              className={cn(
                'px-3 py-1.5 rounded-pill border font-roobert text-[12px] transition-colors',
                filter === 'pending'
                  ? 'border-white/30 bg-white/[0.06] text-frost-white'
                  : 'border-white/10 bg-white/[0.03] text-frost-white/65'
              )}
            >
              Ожидают
            </button>
            <button
              onClick={() => setFilter('all')}
              className={cn(
                'px-3 py-1.5 rounded-pill border font-roobert text-[12px] transition-colors',
                filter === 'all'
                  ? 'border-white/30 bg-white/[0.06] text-frost-white'
                  : 'border-white/10 bg-white/[0.03] text-frost-white/65'
              )}
            >
              Все
            </button>
          </div>
          <HelpButton title="Заявки на вывод">
            <p>
              Игрок создаёт заявку из мини-приложения. Деньги{' '}
              <strong>списываются с баланса сразу</strong>, заявка
              попадает в этот список со статусом <code>pending</code>.
            </p>
            <p>
              <strong>Принять</strong> — пометить заявку как выплаченную.
              Баланс уже списан, реальный перевод денег делается вами
              вручную через ваш банк / BLIK.
            </p>
            <p>
              <strong>Отклонить</strong> — вернуть сумму на баланс
              игрока, статус <code>rejected</code>. Причина увидится
              игроком в его истории платежей и попадёт в аудит.
            </p>
          </HelpButton>
        </div>

        {data === null ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] py-16 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border border-white/20 border-t-frost-white animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-10 text-center font-roobert text-[12px] text-whisper-gray">
            {filter === 'pending' ? 'Нет заявок в ожидании.' : 'Заявок нет.'}
          </div>
        ) : (
          <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
            {data.map((w) => (
              <button
                key={w.id}
                onClick={() => setOpenId(w.id)}
                className="w-full text-left grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-3 active:bg-white/[0.04] transition-colors"
              >
                {w.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={w.photoUrl}
                    alt={w.name}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-pill border border-white/10 object-cover"
                    draggable={false}
                  />
                ) : (
                  <span className="w-10 h-10 rounded-pill border border-white/10 bg-white/[0.04] flex items-center justify-center font-roobert text-[14px]">
                    {w.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="font-roobert text-[14px] text-frost-white truncate">
                    {w.name}
                  </div>
                  <div className="font-roobert text-[10px] text-whisper-gray truncate">
                    {methodLabel(w.method)} ·{' '}
                    {new Date(w.createdAt).toLocaleString('ru-RU')}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-roobert text-[14px] text-frost-white tabular-nums">
                    −
                    {w.amount.toLocaleString('ru-RU', {
                      maximumFractionDigits: 2,
                    })}{' '}
                    {w.currency}
                  </div>
                  <span
                    className={cn(
                      'mt-0.5 inline-block px-2 py-0.5 rounded-pill border font-roobert text-[10px] uppercase tracking-[0.18em]',
                      STATUS_TINT[w.status] ??
                        'border-white/15 bg-white/[0.04] text-whisper-gray'
                    )}
                  >
                    {STATUS_LABEL[w.status] ?? w.status}
                  </span>
                </div>
                <ChevronRight
                  size={14}
                  className="text-frost-white/55"
                  strokeWidth={1.7}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Action sheet */}
      <AnimatePresence>
        {opened && (
          <ActionSheet
            key={opened.id}
            request={opened}
            onClose={() => setOpenId(null)}
            onSubmitted={async () => {
              setOpenId(null);
              await reload();
            }}
            onOpenUser={(uid) => {
              setOpenId(null);
              router.push(`/system/console/users/${uid}`);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* ActionSheet                                                                */
/* -------------------------------------------------------------------------- */

function ActionSheet({
  request: w,
  onClose,
  onSubmitted,
  onOpenUser,
}: {
  request: WithdrawalRequest;
  onClose: () => void;
  onSubmitted: () => void;
  onOpenUser: (userId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'view' | 'reject'>('view');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const md = useMemo(
    () => (w.metadata ?? {}) as Record<string, string>,
    [w.metadata]
  );

  const copy = async (val: string, key: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200);
    } catch {
      // ignore
    }
  };

  const submit = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && reason.trim().length < 3) {
      setError('Нужна причина (минимум 3 символа).');
      return;
    }
    if (action === 'approve' && reason.trim().length < 3) {
      // Approval also writes to audit; ask for at least a short note.
      setError('Укажите коротко причину одобрения.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/_x/withdrawal-requests/${w.id}/${action}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.message ?? 'Не удалось обработать заявку');
        return;
      }
      onSubmitted();
    } finally {
      setBusy(false);
    }
  };

  const isPending = w.status === 'pending';

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center px-3 sm:px-6 pb-3 sm:pb-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-midnight-canvas/85"
      />
      <motion.div
        initial={{ opacity: 0, y: 22, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 22, scale: 0.98 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="relative w-full max-w-[520px] max-h-[92vh] overflow-y-auto rounded-card border border-white/10 bg-white/[0.04] p-5 flex flex-col gap-4"
        style={{ background: 'rgba(10, 10, 10, 0.96)' }}
      >
        {/* Title row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {w.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={w.photoUrl}
                alt={w.name}
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-pill border border-white/10 object-cover shrink-0"
                draggable={false}
              />
            ) : (
              <span className="w-12 h-12 rounded-pill border border-white/10 bg-white/[0.04] flex items-center justify-center font-roobert text-[16px] shrink-0">
                {w.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <button
                onClick={() => onOpenUser(w.userId)}
                className="font-roobert text-[16px] text-frost-white truncate inline-flex items-center gap-1 hover:underline"
              >
                {w.name}
                <ChevronRight size={13} strokeWidth={1.7} />
              </button>
              <div className="font-roobert text-[10px] text-whisper-gray tabular-nums">
                #{w.telegramId ?? '—'} ·{' '}
                {new Date(w.createdAt).toLocaleString('ru-RU')}
              </div>
              <span
                className={cn(
                  'mt-1 inline-block px-2 py-0.5 rounded-pill border font-roobert text-[10px] uppercase tracking-[0.18em]',
                  STATUS_TINT[w.status] ??
                    'border-white/15 bg-white/[0.04] text-whisper-gray'
                )}
              >
                {STATUS_LABEL[w.status] ?? w.status}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="w-11 h-11 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 active:scale-95 transition-transform shrink-0"
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        {/* Headline amount */}
        <div className="rounded-card border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
            Сумма к выплате
          </div>
          <div className="mt-1 font-roobert text-[28px] font-light tabular-nums text-frost-white leading-none">
            {w.amount.toLocaleString('ru-RU', {
              maximumFractionDigits: 2,
            })}{' '}
            <span className="text-[16px] text-whisper-gray">{w.currency}</span>
          </div>
          <div className="mt-1 font-roobert text-[12px] text-whisper-gray">
            {methodLabel(w.method)}
          </div>
        </div>

        {/* Player-submitted details — every field copyable */}
        <div className="rounded-card border border-white/10 bg-white/[0.03] divide-y divide-white/5">
          {w.method === 'blik' ? (
            <>
              <CopyRow
                label="Номер телефона (BLIK)"
                value={md.phone ?? '—'}
                k="phone"
                copied={copied}
                onCopy={copy}
              />
              <CopyRow
                label="Банк получателя"
                value={md.bank ?? '—'}
                k="bank"
                copied={copied}
                onCopy={copy}
              />
              <CopyRow
                label="Имя владельца счёта"
                value={md.holder ?? '—'}
                k="holder"
                copied={copied}
                onCopy={copy}
              />
            </>
          ) : w.method === 'card' ? (
            <>
              <CopyRow
                label="Номер карты"
                value={md.card ?? '—'}
                k="card"
                copied={copied}
                onCopy={copy}
              />
              <CopyRow
                label="Имя владельца"
                value={md.holder ?? '—'}
                k="holder"
                copied={copied}
                onCopy={copy}
              />
            </>
          ) : (
            <CopyRow
              label="Реквизиты"
              value={w.destination}
              k="dest"
              copied={copied}
              onCopy={copy}
            />
          )}
          <CopyRow
            label="ID заявки"
            value={w.id}
            k="id"
            copied={copied}
            onCopy={copy}
            mono
          />
        </div>

        {/* Existing rejection reason if any */}
        {w.rejectionReason && (
          <div className="rounded-card border border-[#ff8a76]/30 bg-[#ff8a76]/10 px-3 py-2.5 flex items-start gap-2">
            <AlertTriangle
              size={14}
              strokeWidth={1.8}
              className="text-[#ff8a76] mt-0.5 shrink-0"
            />
            <div className="min-w-0">
              <div className="font-roobert text-[10px] uppercase tracking-[0.18em] text-[#ff8a76]/85">
                Причина отклонения
              </div>
              <div className="mt-0.5 font-roobert text-[12px] text-frost-white/95 break-words">
                {w.rejectionReason}
              </div>
            </div>
          </div>
        )}

        {/* Actions — only on pending */}
        {isPending && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
                {mode === 'reject'
                  ? 'Причина отклонения (обязательно)'
                  : 'Комментарий для аудита'}
              </span>
              <input
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setError(null);
                }}
                placeholder={
                  mode === 'reject'
                    ? 'Например: Имя владельца карты не совпадает с профилем'
                    : 'Например: Оплачено вручную через PKO BP'
                }
                inputMode="text"
                className="bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2.5 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
              />
            </label>
            {error && (
              <div className="font-roobert text-[12px] text-[#ff8a76]">
                {error}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setMode('reject');
                  void submit('reject');
                }}
                disabled={busy}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-pill border border-[rgba(165,45,37,0.45)] bg-[rgba(165,45,37,0.10)] text-[#ff8a76] active:scale-95 transition-transform disabled:opacity-50 font-roobert text-[12px] uppercase tracking-[0.18em]"
              >
                <X size={14} strokeWidth={1.8} />
                Отклонить
              </button>
              <button
                onClick={() => {
                  setMode('view');
                  void submit('approve');
                }}
                disabled={busy}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-pill bg-frost-white text-midnight-canvas active:scale-95 transition-transform disabled:opacity-50 font-roobert text-[12px] uppercase tracking-[0.18em]"
              >
                <Check size={14} strokeWidth={2} />
                Принять
              </button>
            </div>
            <p className="font-roobert text-[10px] text-whisper-gray leading-relaxed">
              «Принять» — пометить как выплачено (реальный перевод
              делайте вручную). «Отклонить» — вернуть деньги на баланс
              игрока, причина увидится игроком в его истории.
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function CopyRow({
  label,
  value,
  k,
  copied,
  onCopy,
  mono,
}: {
  label: string;
  value: string;
  k: string;
  copied: string | null;
  onCopy: (v: string, k: string) => void;
  mono?: boolean;
}) {
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="font-roobert text-[10px] uppercase tracking-[0.18em] text-whisper-gray">
          {label}
        </div>
        <div
          className={cn(
            'mt-0.5 font-roobert text-[14px] text-frost-white break-all leading-snug',
            mono && 'font-mono select-all'
          )}
        >
          {value}
        </div>
      </div>
      <button
        onClick={() => onCopy(value, k)}
        aria-label={`Скопировать ${label}`}
        className="w-9 h-9 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 active:scale-95 transition-transform shrink-0"
      >
        {copied === k ? (
          <Check size={14} strokeWidth={2} />
        ) : (
          <Copy size={14} strokeWidth={1.7} />
        )}
      </button>
    </div>
  );
}
