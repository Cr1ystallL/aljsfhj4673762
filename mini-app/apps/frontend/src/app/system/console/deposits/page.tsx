'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Check, X, AlertTriangle } from 'lucide-react';
import { HelpButton } from '@/components/admin/help-button';
import { cn } from '@/lib/utils';

/**
 * Deposits Console — MacvPay lifecycle.
 *
 * Lists every payment order with its current status:
 *   - `pending`   → waiting for the player to wire the unique amount
 *   - `paid`      → provider webhook confirmed, balance credited
 *   - `cancelled` → either cancelled by the player or aborted by the
 *                   provider
 *   - `expired`   → server-derived: still pending past `expiresAt`
 *
 * The page polls every 6s so the timer counts down live and statuses
 * flip into `paid` without a manual refresh.
 */

interface Deposit {
  id: string;
  providerOrderId: string;
  userId: string;
  name: string;
  telegramId: number | null;
  photoUrl: string | null;
  amount: number;
  uniqueAmount: number;
  currency: string;
  type: string;
  status: 'pending' | 'paid' | 'cancelled' | 'expired';
  card: string | null;
  recipient: string | null;
  details: string | null;
  expiresAt: number | null;
  paidAt: number | null;
  createdAt: number;
}

type StatusFilter = 'all' | 'pending' | 'paid' | 'cancelled' | 'expired';

export default function DepositsPage() {
  const router = useRouter();
  const [data, setData] = useState<Deposit[] | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/_x/deposits?limit=200', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return setData([]);
      const j = await res.json();
      setData(j.deposits ?? []);
    } catch {
      setData([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      if (cancelled) return;
    })();
    const id = setInterval(() => {
      void load();
    }, 10000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearInterval(tick);
    };
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return null;
    if (filter === 'all') return data;
    return data.filter((d) => d.status === filter);
  }, [data, filter]);

  const counts = useMemo(() => {
    const c = { all: data?.length ?? 0, pending: 0, paid: 0, cancelled: 0, expired: 0 };
    if (!data) return c;
    for (const d of data) c[d.status]++;
    return c;
  }, [data]);

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
            Депозиты · {data?.length ?? 0}
          </span>
          <HelpButton title="Список депозитов">
            <p>
              Каждая запись — заявка на пополнение через платёжного
              провайдера. Статусы:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <b>Ожидание</b> — игрок ещё не оплатил, видна обратная
                метка времени до истечения.
              </li>
              <li>
                <b>Подтверждён</b> — провайдер прислал вебхук, баланс
                автоматически зачислен.
              </li>
              <li>
                <b>Отменён</b> — игрок нажал «Закрыть» или провайдер
                отменил.
              </li>
              <li>
                <b>Истёк</b> — заявка не оплачена в отведённое время.
              </li>
            </ul>
            <p>
              Список read-only. Список обновляется каждые 6 секунд. Если
              нужно вручную скорректировать баланс — заходите в карточку
              игрока.
            </p>
          </HelpButton>
        </div>

        {/* Status pills */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {(['all', 'pending', 'paid', 'cancelled', 'expired'] as StatusFilter[]).map(
            (s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={cn(
                  'shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill border font-roobert text-[12px] transition-colors',
                  filter === s
                    ? 'border-white/30 bg-white/[0.06] text-frost-white'
                    : 'border-white/10 bg-white/[0.03] text-frost-white/65'
                )}
              >
                {statusLabel(s)} · {counts[s]}
              </button>
            )
          )}
        </div>

        {filtered === null ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] py-16 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border border-white/20 border-t-frost-white animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-10 text-center font-roobert text-[12px] text-whisper-gray">
            Заявок не найдено.
          </div>
        ) : (
          <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
            {filtered.map((d) => (
              <DepositRow
                key={d.id}
                deposit={d}
                now={now}
                onClick={() => router.push(`/system/console/users/${d.userId}`)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function DepositRow({
  deposit,
  now,
  onClick,
}: {
  deposit: Deposit;
  now: number;
  onClick: () => void;
}) {
  const remaining =
    deposit.status === 'pending' && deposit.expiresAt
      ? Math.max(0, deposit.expiresAt - now)
      : null;

  return (
    <button
      onClick={onClick}
      className="w-full text-left grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 active:bg-white/[0.04] transition-colors"
    >
      {deposit.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={deposit.photoUrl}
          alt={deposit.name}
          referrerPolicy="no-referrer"
          className="w-14 h-14 rounded-pill border border-white/10 object-cover"
          draggable={false}
        />
      ) : (
        <span className="w-14 h-14 rounded-pill border border-white/10 bg-white/[0.04] flex items-center justify-center font-roobert text-[18px]">
          {deposit.name.charAt(0).toUpperCase()}
        </span>
      )}

      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-roobert text-[14px] text-frost-white truncate">
            {deposit.name}
          </span>
          <StatusChip status={deposit.status} />
        </div>
        <div className="mt-0.5 font-roobert text-[10px] text-whisper-gray tabular-nums">
          {new Date(deposit.createdAt).toLocaleString('ru-RU')}
          {remaining !== null && (
            <span className="ml-2 inline-flex items-center gap-1 text-frost-white/80">
              <Clock size={10} strokeWidth={1.7} />
              {formatRemaining(remaining)}
            </span>
          )}
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-frost-white/45 truncate">
          {deposit.providerOrderId}
        </div>
      </div>

      <div className="text-right">
        <div
          className={cn(
            'font-roobert text-[14px] tabular-nums',
            deposit.status === 'paid'
              ? 'text-[#a0e0ab]'
              : deposit.status === 'cancelled' || deposit.status === 'expired'
                ? 'text-whisper-gray line-through'
                : 'text-frost-white'
          )}
        >
          {deposit.status === 'paid' ? '+' : ''}
          {fmt(deposit.amount)} {deposit.currency}
        </div>
        {deposit.uniqueAmount > 0 && (
          <div className="font-roobert text-[10px] text-whisper-gray tabular-nums">
            → {fmt(deposit.uniqueAmount)}
          </div>
        )}
      </div>
    </button>
  );
}

function fmt(n: number | null | undefined): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return v.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

function StatusChip({ status }: { status: Deposit['status'] }) {
  const map: Record<Deposit['status'], { label: string; cls: string; Icon: typeof Clock }> = {
    pending: {
      label: 'Ожидание',
      cls: 'border-white/15 bg-white/[0.04] text-frost-white/85',
      Icon: Clock,
    },
    paid: {
      label: 'Подтверждён',
      cls: 'border-[#a0e0ab]/35 bg-[#a0e0ab]/10 text-[#a0e0ab]',
      Icon: Check,
    },
    cancelled: {
      label: 'Отменён',
      cls: 'border-white/10 bg-white/[0.03] text-whisper-gray',
      Icon: X,
    },
    expired: {
      label: 'Истёк',
      cls: 'border-[#ff8a76]/40 bg-[#ff8a76]/10 text-[#ff8a76]',
      Icon: AlertTriangle,
    },
  };
  const m = map[status];
  const Icon = m.Icon;
  return (
    <span
      className={cn(
        'shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-pill border font-roobert text-[10px] uppercase tracking-[0.18em]',
        m.cls
      )}
    >
      <Icon size={10} strokeWidth={1.8} />
      {m.label}
    </span>
  );
}

function statusLabel(s: StatusFilter): string {
  switch (s) {
    case 'all':
      return 'Все';
    case 'pending':
      return 'Ожидание';
    case 'paid':
      return 'Подтверждённые';
    case 'cancelled':
      return 'Отменённые';
    case 'expired':
      return 'Истёкшие';
  }
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
