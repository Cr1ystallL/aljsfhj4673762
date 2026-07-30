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
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

  const openPendingDeposit = useCallback(
    (e: DepositEntry) => {
      router.push('/balance');
    },
    [router]
  );

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
    <main className="min-h-screen w-full bg-[#0A0B0E] text-zinc-100 flex flex-col items-center pb-24 font-sans select-none">
      <div className="w-full max-w-md px-4 pt-4 flex flex-col gap-4">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/10 pb-3">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300 active:scale-95 transition-transform"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="font-semibold text-sm tracking-wide text-zinc-100 uppercase">
            История транзакций
          </span>
          <div className="w-8 h-8" />
        </header>

        {/* Filters */}
        <div className="grid grid-cols-3 gap-2 p-1 rounded-lg bg-[#13151C] border border-white/10">
          {(['all', 'deposit', 'withdrawal'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'py-2 rounded-md font-semibold text-xs transition-all uppercase tracking-wider',
                filter === f
                  ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                  : 'text-zinc-400 hover:text-white'
              )}
            >
              {f === 'all' ? 'Все' : f === 'deposit' ? 'Депозиты' : 'Выводы'}
            </button>
          ))}
        </div>

        {/* List */}
        {filtered === null ? (
          <div className="rounded-xl border border-white/10 bg-[#13151C] py-16 flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-[#13151C] px-4 py-12 text-center text-xs text-zinc-400">
            История транзакций пока пуста.
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-[#13151C] overflow-hidden divide-y divide-white/5 shadow-md">
            {filtered.map((e) => (
              <Row
                key={e.id}
                entry={e}
                expanded={openId === e.id}
                onOpenPending={openPendingDeposit}
                onToggle={() => setOpenId((cur) => (cur === e.id ? null : e.id))}
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
  onOpenPending,
  onToggle,
}: {
  entry: Entry;
  expanded: boolean;
  onOpenPending: (e: DepositEntry) => void;
  onToggle: () => void;
}) {
  const isDeposit = entry.kind === 'deposit';
  const isPendingDeposit = isDeposit && entry.status === 'pending';

  const handleClick = () => {
    if (isPendingDeposit) {
      onOpenPending(entry as DepositEntry);
    } else {
      onToggle();
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className="w-full text-left grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3.5 hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors"
      >
        <span
          className={cn(
            'w-9 h-9 rounded-lg border flex items-center justify-center shrink-0',
            isDeposit
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-zinc-700 bg-zinc-800 text-zinc-300'
          )}
        >
          {isDeposit ? <ArrowDownToLine size={16} /> : <ArrowUpFromLine size={16} />}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-xs text-white">
              {isDeposit ? 'Пополнение' : 'Вывод'}
            </span>
            <StatusChip status={entry.status} />
          </div>
          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
            {new Date(entry.createdAt).toLocaleString('ru-RU')}
          </div>
        </div>
        <div className="text-right">
          <div
            className={cn(
              'font-bold text-xs font-mono',
              isDeposit ? 'text-emerald-400' : 'text-white'
            )}
          >
            {isDeposit ? '+' : '−'}
            {entry.amount.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} {entry.currency}
          </div>
          <div className="text-[10px] text-zinc-400 inline-flex items-center gap-0.5 mt-0.5">
            {isPendingDeposit ? 'Детали' : 'Подробнее'}
            <ChevronRight
              size={11}
              className={cn('transition-transform', !isPendingDeposit && expanded && 'rotate-90')}
            />
          </div>
        </div>
      </button>

      {expanded && !isPendingDeposit && (
        <div className="px-4 pb-3.5 -mt-1 flex flex-col gap-2">
          {entry.kind === 'deposit' ? (
            <DepositDetails entry={entry} onOpenPending={onOpenPending} />
          ) : (
            <WithdrawalDetails entry={entry} />
          )}
        </div>
      )}
    </div>
  );
}

function DepositDetails({
  entry,
  onOpenPending,
}: {
  entry: DepositEntry;
  onOpenPending: (e: DepositEntry) => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0A0B0E] px-3.5 py-3 flex flex-col gap-2 text-xs">
      <DetailLine label="ID заявки" value={entry.id} mono />
      <DetailLine label="Способ" value={methodLabel(entry.paymentType)} />
      {entry.details && (
        <DetailLine label="Детали" value={entry.details} />
      )}
      {entry.paidAt && (
        <DetailLine label="Зачислено" value={new Date(entry.paidAt).toLocaleString('ru-RU')} />
      )}
    </div>
  );
}

function WithdrawalDetails({ entry }: { entry: WithdrawalEntry }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0A0B0E] px-3.5 py-3 flex flex-col gap-2 text-xs">
      <DetailLine label="ID заявки" value={entry.id} mono />
      <DetailLine label="Способ" value={methodLabel(entry.method)} />
      {entry.details.phone && <DetailLine label="Телефон" value={entry.details.phone} />}
      {entry.details.bank && <DetailLine label="Банк" value={entry.details.bank} />}
      {entry.details.card && <DetailLine label="Карта" value={entry.details.card} />}
      {entry.details.holder && <DetailLine label="Получатель" value={entry.details.holder} />}
      {entry.reviewedAt && (
        <DetailLine
          label={entry.status === 'rejected' ? 'Отклонено' : 'Обработано'}
          value={new Date(entry.reviewedAt).toLocaleString('ru-RU')}
        />
      )}
      {entry.rejectionReason && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 flex items-start gap-2 text-rose-300">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <div className="min-w-0 text-xs">
            <div className="font-semibold">Причина отклонения:</div>
            <div>{entry.rejectionReason}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailLine({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      <span className={cn('text-xs text-zinc-200 break-all', mono && 'font-mono select-all')}>
        {value}
      </span>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; Icon: typeof Clock }> = {
    pending: {
      label: 'Ожидание',
      cls: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
      Icon: Clock,
    },
    paid: {
      label: 'Подтверждён',
      cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
      Icon: Check,
    },
    approved: {
      label: 'Одобрен',
      cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
      Icon: Check,
    },
    cancelled: {
      label: 'Отменён',
      cls: 'border-white/10 bg-white/5 text-zinc-400',
      Icon: X,
    },
    expired: {
      label: 'Истёк',
      cls: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
      Icon: AlertTriangle,
    },
    rejected: {
      label: 'Отклонён',
      cls: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
      Icon: X,
    },
  };
  const m = map[status] ?? {
    label: status,
    cls: 'border-white/10 bg-white/5 text-zinc-400',
    Icon: Clock,
  };
  const Icon = m.Icon;
  return (
    <span className={cn('shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] uppercase tracking-wider font-semibold', m.cls)}>
      <Icon size={10} />
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
