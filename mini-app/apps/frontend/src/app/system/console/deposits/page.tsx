'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Check, X, AlertTriangle, Play, ToggleLeft, ToggleRight } from 'lucide-react';
import { HelpButton } from '@/components/admin/help-button';
import { cn } from '@/lib/utils';

/**
 * Deposits Console — FoluxPay lifecycle.
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
  status: 'pending' | 'paid' | 'cancelled' | 'expired' | 'failed' | 'credited';
  card: string | null;
  recipient: string | null;
  details: string | null;
  expiresAt: number | null;
  paidAt: number | null;
  createdAt: number;
}

type StatusFilter = 'all' | 'pending' | 'paid' | 'cancelled' | 'expired' | 'failed';

export default function DepositsPage() {
  const router = useRouter();
  const [data, setData] = useState<Deposit[] | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [now, setNow] = useState(() => Date.now());

  const [depositsEnabled, setDepositsEnabled] = useState(true);
  const [updatingConfig, setUpdatingConfig] = useState(false);
  const [foluxTestResult, setFoluxTestResult] = useState<any>(null);
  const [testingFolux, setTestingFolux] = useState(false);

  const [creditTarget, setCreditTarget] = useState<Deposit | null>(null);
  const [creditAmount, setCreditAmount] = useState<string>('');
  const [creditReason, setCreditReason] = useState<string>('');
  const [crediting, setCrediting] = useState(false);

  const handleOpenCredit = (dep: Deposit) => {
    setCreditTarget(dep);
    setCreditAmount(String(dep.uniqueAmount || dep.amount));
    setCreditReason('Ручное дозачисление по чеку P2P');
  };

  const handleConfirmCredit = async () => {
    if (!creditTarget) return;
    if (!creditReason || creditReason.trim().length < 3) {
      alert('Укажите причину зачисления (минимум 3 символа)');
      return;
    }
    const amt = Number(creditAmount);
    if (!amt || amt <= 0) {
      alert('Укажите корректную сумму');
      return;
    }
    setCrediting(true);
    try {
      const res = await fetch(`/api/_x/deposits/${creditTarget.id}/credit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, reason: creditReason }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j.error || 'Ошибка зачисления');
        return;
      }
      setCreditTarget(null);
      await load();
    } catch (e: any) {
      alert(e?.message || 'Ошибка сети');
    } finally {
      setCrediting(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const [depRes, cfgRes] = await Promise.all([
        fetch('/api/_x/deposits?limit=200', {
          credentials: 'include',
          cache: 'no-store',
        }),
        fetch('/api/_x/wallet-config', {
          credentials: 'include',
          cache: 'no-store',
        })
      ]);

      if (depRes.ok) {
        const j = await depRes.json();
        setData(j.deposits ?? []);
      } else {
        setData([]);
      }

      if (cfgRes.ok) {
        const c = await cfgRes.json();
        if (c.config && typeof c.config.depositsEnabled === 'boolean') {
          setDepositsEnabled(c.config.depositsEnabled);
        }
      }
    } catch {
      setData([]);
    }
  }, []);

  const toggleDeposits = async () => {
    setUpdatingConfig(true);
    try {
      const res = await fetch('/api/_x/wallet-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'deposits kill-switch toggle',
          depositsEnabled: !depositsEnabled
        })
      });
      if (res.ok) {
        const c = await res.json();
        setDepositsEnabled(c.config.depositsEnabled);
      }
    } finally {
      setUpdatingConfig(false);
    }
  };

  const testFoluxPay = async () => {
    setTestingFolux(true);
    setFoluxTestResult(null);
    try {
      const res = await fetch('/api/_x/foluxpay/test');
      const j = await res.json();
      setFoluxTestResult(j);
    } catch (e: any) {
      setFoluxTestResult({ error: e?.message || 'Error fetching' });
    } finally {
      setTestingFolux(false);
    }
  };

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
    if (filter === 'paid') {
      return data.filter((d) => d.status === 'paid' || d.status === 'credited');
    }
    return data.filter((d) => d.status === filter);
  }, [data, filter]);

  const counts = useMemo(() => {
    const c = { all: data?.length ?? 0, pending: 0, paid: 0, cancelled: 0, expired: 0, failed: 0 };
    if (!data) return c;
    for (const d of data) {
      const key = (d.status === 'credited' ? 'paid' : d.status) as keyof typeof c;
      if (key in c) {
        c[key]++;
      }
    }
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
              <li>
                <b>Не удался</b> — попытка создания заявки завершилась ошибкой (видно описание ошибки).
              </li>
            </ul>
            <p>
              Список read-only. Список обновляется каждые 6 секунд. Если
              нужно вручную скорректировать баланс — заходите в карточку
              игрока.
            </p>
          </HelpButton>
        </div>

        {/* Global Deposit Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-card border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3">
            <h3 className="font-roobert text-[14px] text-frost-white">Статус пополнений</h3>
            <p className="text-[12px] text-whisper-gray leading-relaxed">
              Отключите этот тумблер, чтобы временно запретить всем игрокам создавать новые заявки на депозит.
            </p>
            <div className="mt-auto pt-2">
              <button
                onClick={toggleDeposits}
                disabled={updatingConfig}
                className={cn(
                  'flex items-center gap-2 font-roobert text-[13px] transition-colors',
                  depositsEnabled ? 'text-emerald-400' : 'text-red-400',
                  updatingConfig && 'opacity-50'
                )}
              >
                {depositsEnabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                {depositsEnabled ? 'Пополнения ВКЛЮЧЕНЫ' : 'Пополнения ОТКЛЮЧЕНЫ'}
              </button>
            </div>
          </div>

          <div className="rounded-card border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3">
            <h3 className="font-roobert text-[14px] text-frost-white">Тест FoluxPay API</h3>
            <p className="text-[12px] text-whisper-gray leading-relaxed">
              Создать тестовую заявку (20 PLN), чтобы проверить, что именно сейчас выдаёт API FoluxPay (карту или Revtag).
            </p>
            
            <button
              onClick={testFoluxPay}
              disabled={testingFolux}
              className="mt-2 shrink-0 bg-white/10 hover:bg-white/15 active:bg-white/20 text-frost-white font-roobert text-[13px] px-3 py-1.5 rounded-pill transition-colors flex items-center justify-center gap-2 w-fit"
            >
              {testingFolux ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Play size={14} />
              )}
              Проверить FoluxPay
            </button>
            
            {foluxTestResult && (
              <div className="mt-2 p-3 rounded-lg bg-black/40 border border-white/5 overflow-x-auto">
                <pre className="text-[10px] text-emerald-300 font-mono">
                  {JSON.stringify(foluxTestResult.result || foluxTestResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Status pills */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {(['all', 'pending', 'paid', 'cancelled', 'expired', 'failed'] as StatusFilter[]).map(
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

        {/* Manual Credit Modal */}
        {creditTarget && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#121214] border border-white/15 rounded-card max-w-md w-full p-5 flex flex-col gap-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 font-roobert text-[16px] font-medium">
                  <Check size={18} />
                  Ручное зачисление депозита
                </div>
                <button
                  onClick={() => setCreditTarget(null)}
                  className="text-whisper-gray hover:text-frost-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3 text-[12px] text-whisper-gray flex flex-col gap-1">
                <div>
                  Игрок: <span className="text-frost-white font-medium">{creditTarget.name}</span>
                </div>
                <div>
                  ID ордера: <span className="font-mono text-frost-white/80">{creditTarget.id}</span>
                </div>
                <div>
                  Запрошено: <span className="text-frost-white font-medium">{fmt(creditTarget.amount)} {creditTarget.currency}</span>
                  {creditTarget.uniqueAmount > 0 && ` (уникальная: ${fmt(creditTarget.uniqueAmount)})`}
                </div>
                <div>
                  Текущий статус: <span className="text-amber-300 uppercase">{creditTarget.status}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-roobert text-frost-white/70">
                  Сумма к зачислению ({creditTarget.currency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/15 rounded-lg px-3 py-2 text-[14px] text-frost-white font-roobert focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-roobert text-frost-white/70">
                  Причина / Обоснование (аудит)
                </label>
                <input
                  type="text"
                  placeholder="Например: подтверждение по чеку P2P / ошибочная сумма"
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/15 rounded-lg px-3 py-2 text-[14px] text-frost-white font-roobert focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <p className="text-[11px] text-whisper-gray leading-relaxed">
                ⚠️ Средства будут мгновенно зачислены на реальный баланс пользователя с начислением вейджера и сменой статуса заявки на <span className="text-emerald-400 font-mono">credited</span>.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreditTarget(null)}
                  disabled={crediting}
                  className="px-4 py-2 rounded-pill border border-white/10 hover:bg-white/5 text-[13px] font-roobert text-whisper-gray"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCredit}
                  disabled={crediting}
                  className="px-4 py-2 rounded-pill bg-emerald-500 hover:bg-emerald-600 text-black font-roobert text-[13px] font-medium flex items-center gap-2"
                >
                  {crediting && <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />}
                  Зачислить {creditAmount} {creditTarget.currency}
                </button>
              </div>
            </div>
          </div>
        )}

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
                onManualCredit={() => handleOpenCredit(d)}
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
  onManualCredit,
}: {
  deposit: Deposit;
  now: number;
  onClick: () => void;
  onManualCredit: () => void;
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
          className="w-10 h-10 rounded-pill border border-white/10 object-cover"
          draggable={false}
        />
      ) : (
        <span className="w-10 h-10 rounded-pill border border-white/10 bg-white/[0.04] flex items-center justify-center font-roobert text-[14px]">
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
        {deposit.status === 'failed' && deposit.details && (
          <div className="mt-1 flex items-center gap-1 font-roobert text-[11px] text-rose-400 font-medium">
            <AlertTriangle size={12} className="shrink-0 text-rose-400" />
            <span className="truncate">{deposit.details}</span>
          </div>
        )}
      </div>

      <div className="text-right flex flex-col items-end">
        <div
          className={cn(
            'font-roobert text-[14px] tabular-nums',
            deposit.status === 'paid' || deposit.status === 'credited'
              ? 'text-[#a0e0ab]'
              : deposit.status === 'cancelled' || deposit.status === 'expired' || deposit.status === 'failed'
                ? 'text-whisper-gray line-through'
                : 'text-frost-white'
          )}
        >
          {deposit.status === 'paid' || deposit.status === 'credited' ? '+' : ''}
          {fmt(deposit.amount)} {deposit.currency}
        </div>
        {deposit.uniqueAmount > 0 && (
          <div className="font-roobert text-[10px] text-whisper-gray tabular-nums">
            → {fmt(deposit.uniqueAmount)}
          </div>
        )}
        {deposit.status !== 'paid' && deposit.status !== 'credited' && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onManualCredit();
            }}
            className="mt-1.5 px-2.5 py-1 rounded-pill border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 font-roobert text-[11px] font-medium transition-colors"
          >
            Зачислить
          </button>
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

function StatusChip({ status }: { status: Deposit['status'] | string }) {
  const map: Record<string, { label: string; cls: string; Icon: typeof Clock }> = {
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
    credited: {
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
    failed: {
      label: 'Не удался',
      cls: 'border-rose-500/40 bg-rose-500/10 text-rose-400',
      Icon: AlertTriangle,
    },
  };
  const m =
    map[status] ??
    {
      label: status || 'Неизвестно',
      cls: 'border-white/10 bg-white/[0.03] text-whisper-gray',
      Icon: AlertTriangle,
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
    case 'failed':
      return 'Неудавшиеся';
  }
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
