'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronLeft,
  ChevronRight,
  Clock,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Payment History — Monopo Saigon Style.
 *
 * Single page that lists every deposit and withdrawal the player has
 * created, newest first. Each row collapses by default and expands
 * inline to reveal the full data the user submitted plus any admin
 * action (rejection reason for declined withdrawals, paid timestamp
 * for completed deposits, …).
 */

interface DepositEntry {
  kind: 'deposit';
  id: string;
  amount: number;
  uniqueAmount: number | null;
  currency: string;
  paymentType: string;
  status: 'pending' | 'paid' | 'cancelled' | 'expired' | string;
  details: string | null;
  recipient: string | null;
  expiresAt: number | null;
  paidAt: number | null;
  createdAt: number;
}

interface WithdrawalEntry {
  kind: 'withdrawal';
  id: string;
  amount: number;
  currency: string;
  method: 'blik' | 'card' | string;
  destination: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid' | string;
  rejectionReason: string | null;
  details: {
    phone: string | null;
    bank: string | null;
    card: string | null;
    holder: string | null;
  };
  reviewedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

type Entry = DepositEntry | WithdrawalEntry;
type Filter = 'all' | 'deposit' | 'withdrawal';

export default function PaymentHistoryPage() {
  const router = useRouter();
  const [data, setData] = useState<Entry[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/balance/payment-history?limit=80', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return setData([]);
      const j = await res.json();
      setData(j.history ?? []);
    } catch {
      setData([]);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 15_000);
    return () => clearInterval(id);
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return null;
    if (filter === 'all') return data;
    return data.filter((e) => e.kind === filter);
  }, [data, filter]);

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-4 pt-4 pb-32 flex flex-col gap-5">
        {/* Header */}
        <header className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            aria-label="Назад"
            className="w-11 h-11 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 active:scale-95 transition-transform"
          >
            <ChevronLeft size={18} strokeWidth={1.8} />
          </button>
          <span className="font-roobert text-[14px] uppercase tracking-[0.28em] text-whisper-gray">
            История
          </span>
          <span className="w-11 h-11" />
        </header>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {(['all', 'deposit', 'withdrawal'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'flex-1 px-3 py-2 rounded-pill border font-roobert text-[12px] transition-colors',
                filter === f
                  ? 'border-white/30 bg-white/[0.06] text-frost-white'
                  : 'border-white/10 bg-white/[0.03] text-frost-white/65'
              )}
            >
              {f === 'all'
                ? 'Все'
                : f === 'deposit'
                  ? 'Пополнения'
                  : 'Выводы'}
            </button>
          ))}
        </div>

        {/* List */}
        {filtered === null ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] py-16 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border border-white/20 border-t-frost-white animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-10 text-center font-roobert text-[12px] text-whisper-gray">
            Здесь будут ваши пополнения и выводы.
          </div>
        ) : (
          <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
            {filtered.map((e) => (
              <Row
                key={e.id}
                entry={e}
                expanded={openId === e.id}
                onToggle={() =>
                  setOpenId((cur) => (cur === e.id ? null : e.id))
                }
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function Row({
  entry,
  expanded,
  onToggle,
}: {
  entry: Entry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isDeposit = entry.kind === 'deposit';
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full text-left grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 active:bg-white/[0.04] transition-colors"
      >
        <span
          className={cn(
            'w-10 h-10 rounded-pill border flex items-center justify-center shrink-0',
            isDeposit
              ? 'border-[#a0e0ab]/40 bg-[#a0e0ab]/10 text-[#a0e0ab]'
              : 'border-[#ff8a76]/40 bg-[#ff8a76]/10 text-[#ff8a76]'
          )}
        >
          {isDeposit ? (
            <ArrowDownToLine size={16} strokeWidth={1.8} />
          ) : (
            <ArrowUpFromLine size={16} strokeWidth={1.8} />
          )}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-roobert text-[14px] text-frost-white">
              {isDeposit ? 'Пополнение' : 'Вывод'}
            </span>
            <StatusChip status={entry.status} />
          </div>
          <div className="font-roobert text-[10px] text-whisper-gray tabular-nums">
            {new Date(entry.createdAt).toLocaleString('ru-RU')}
          </div>
        </div>
        <div className="text-right">
          <div
            className={cn(
              'font-roobert text-[14px] tabular-nums',
              isDeposit ? 'text-[#a0e0ab]' : 'text-frost-white'
            )}
          >
            {isDeposit ? '+' : '−'}
            {entry.amount.toLocaleString('ru-RU', {
              maximumFractionDigits: 2,
            })}{' '}
            {entry.currency}
          </div>
          <div className="font-roobert text-[10px] text-whisper-gray inline-flex items-center gap-0.5">
            Подробнее
            <ChevronRight
              size={11}
              strokeWidth={1.7}
              className={cn(
                'transition-transform',
                expanded && 'rotate-90'
              )}
            />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 -mt-1 flex flex-col gap-2.5">
          {entry.kind === 'deposit' ? (
            <DepositDetails entry={entry} />
          ) : (
            <WithdrawalDetails entry={entry} />
          )}
        </div>
      )}
    </div>
  );
}

function DepositDetails({ entry }: { entry: DepositEntry }) {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.02] px-4 py-3 flex flex-col gap-2.5">
      <DetailLine label="ID заявки" value={entry.id} mono />
      <DetailLine label="Метод" value={methodLabel(entry.paymentType)} />
      {entry.details && (
        <DetailLine
          label={entry.paymentType === 'bank' ? 'Номер счёта / BLIK' : 'Телефон'}
          value={entry.details}
        />
      )}
      {entry.uniqueAmount != null && (
        <DetailLine
          label="Сумма к переводу"
          value={`${entry.uniqueAmount.toLocaleString('ru-RU', {
            maximumFractionDigits: 2,
          })} ${entry.currency}`}
        />
      )}
      {entry.paidAt && (
        <DetailLine
          label="Зачислено"
          value={new Date(entry.paidAt).toLocaleString('ru-RU')}
        />
      )}
      {entry.expiresAt && entry.status === 'pending' && (
        <DetailLine
          label="Истекает"
          value={new Date(entry.expiresAt).toLocaleString('ru-RU')}
        />
      )}
    </div>
  );
}

function WithdrawalDetails({ entry }: { entry: WithdrawalEntry }) {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.02] px-4 py-3 flex flex-col gap-2.5">
      <DetailLine label="ID заявки" value={entry.id} mono />
      <DetailLine label="Метод" value={methodLabel(entry.method)} />
      {entry.details.phone && (
        <DetailLine label="Телефон" value={entry.details.phone} />
      )}
      {entry.details.bank && (
        <DetailLine label="Банк" value={entry.details.bank} />
      )}
      {entry.details.card && (
        <DetailLine label="Карта" value={entry.details.card} />
      )}
      {entry.details.holder && (
        <DetailLine label="Получатель" value={entry.details.holder} />
      )}
      {entry.reviewedAt && (
        <DetailLine
          label={entry.status === 'rejected' ? 'Отклонено' : 'Обработано'}
          value={new Date(entry.reviewedAt).toLocaleString('ru-RU')}
        />
      )}
      {entry.rejectionReason && (
        <div className="rounded-card border border-[#ff8a76]/30 bg-[#ff8a76]/10 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle
            size={13}
            strokeWidth={1.8}
            className="text-[#ff8a76] mt-0.5 shrink-0"
          />
          <div className="min-w-0">
            <div className="font-roobert text-[10px] uppercase tracking-[0.18em] text-[#ff8a76]/85">
              Причина отклонения
            </div>
            <div className="mt-0.5 font-roobert text-[12px] text-frost-white/95 break-words">
              {entry.rejectionReason}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailLine({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-roobert text-[10px] uppercase tracking-[0.18em] text-whisper-gray">
        {label}
      </span>
      <span
        className={cn(
          'font-roobert text-[12px] text-frost-white break-all leading-snug',
          mono && 'font-mono select-all'
        )}
      >
        {value}
      </span>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<
    string,
    { label: string; cls: string; Icon: typeof Clock }
  > = {
    pending: {
      label: 'Ожидание',
      cls: 'border-white/15 bg-white/[0.04] text-frost-white/85',
      Icon: Clock,
    },
    paid: {
      label: 'Подтверждён',
      cls: 'border-[#a0e0ab]/40 bg-[#a0e0ab]/10 text-[#a0e0ab]',
      Icon: Check,
    },
    approved: {
      label: 'Одобрен',
      cls: 'border-[#a0e0ab]/40 bg-[#a0e0ab]/10 text-[#a0e0ab]',
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
    rejected: {
      label: 'Отклонён',
      cls: 'border-[#ff8a76]/40 bg-[#ff8a76]/10 text-[#ff8a76]',
      Icon: X,
    },
  };
  const m = map[status] ?? {
    label: status,
    cls: 'border-white/10 bg-white/[0.04] text-frost-white/65',
    Icon: Clock,
  };
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

function methodLabel(m: string): string {
  switch (m) {
    case 'bank':
      return 'Банковский перевод';
    case 'revolut':
      return 'Revolut';
    case 'blik':
      return 'BLIK';
    case 'card':
      return 'Банковская карта';
    default:
      return m;
  }
}
