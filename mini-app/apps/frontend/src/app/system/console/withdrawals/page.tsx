'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { AdminShell } from '@/components/admin/admin-shell';
import { HelpButton } from '@/components/admin/help-button';

/**
 * Admin → Withdrawals.
 *
 * Lifecycle list of withdrawal requests. Pending requests have
 * approve / reject actions; each requires a reason.
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
  rejected: 'border-[rgba(165,45,37,0.45)] bg-[rgba(165,45,37,0.18)] text-[#ff8a76]',
};

export default function WithdrawalsPage() {
  const router = useRouter();
  const [data, setData] = useState<WithdrawalRequest[] | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [busy, setBusy] = useState<string | null>(null);

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

  const act = async (id: string, action: 'approve' | 'reject') => {
    const reason = prompt(
      action === 'approve'
        ? 'Причина одобрения (минимум 3 символа):'
        : 'Причина отклонения (попадёт игроку и в аудит):'
    );
    if (!reason || reason.trim().length < 3) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/_x/withdrawal-requests/${id}/${action}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        alert(j?.message ?? 'Не удалось обработать заявку');
      } else {
        await reload();
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminShell title="Выводы">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilter('pending')}
              className={`px-3 py-1.5 rounded-pill border font-roobert text-[12px] transition-colors ${
                filter === 'pending'
                  ? 'border-white/30 bg-white/[0.06] text-frost-white'
                  : 'border-white/10 bg-white/[0.03] text-frost-white/65'
              }`}
            >
              Ожидают
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-pill border font-roobert text-[12px] transition-colors ${
                filter === 'all'
                  ? 'border-white/30 bg-white/[0.06] text-frost-white'
                  : 'border-white/10 bg-white/[0.03] text-frost-white/65'
              }`}
            >
              Все
            </button>
          </div>
          <HelpButton title="Заявки на вывод">
            <p>
              Игрок создаёт заявку из мини-приложения (механика появится
              позже). Деньги <strong>списываются с баланса
              сразу</strong>, заявка попадает в этот список со статусом{' '}
              <code>pending</code>.
            </p>
            <p>
              <strong>Одобрить</strong> — записать transaction-логом
              «вывод», статус <code>paid</code>. Реальная отправка денег
              провайдером — отдельный шаг (когда подключим провайдеры).
            </p>
            <p>
              <strong>Отклонить</strong> — вернуть сумму на баланс,
              статус <code>rejected</code>. Причина попадает в TG-уведомление
              игроку и в аудит.
            </p>
          </HelpButton>
        </div>

        {data === null ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] py-16 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border border-white/20 border-t-frost-white animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-10 text-center font-roobert text-[12px] text-whisper-gray">
            {filter === 'pending'
              ? 'Нет заявок в ожидании.'
              : 'Заявок нет.'}
          </div>
        ) : (
          <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
            {data.map((w) => (
              <div
                key={w.id}
                className="flex flex-col sm:grid sm:grid-cols-[auto_1fr_auto_auto] sm:items-center gap-3 px-4 py-3"
              >
                <button
                  onClick={() => router.push(`/system/console/users/${w.userId}`)}
                  className="contents"
                >
                  {w.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={w.photoUrl}
                      alt={w.name}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-pill border border-white/10 object-cover"
                      draggable={false}
                    />
                  ) : (
                    <span className="w-9 h-9 rounded-pill border border-white/10 bg-white/[0.04] flex items-center justify-center font-roobert text-[12px]">
                      {w.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 text-left">
                    <div className="font-roobert text-[14px] text-frost-white truncate">
                      {w.name}
                    </div>
                    <div className="font-roobert text-[10px] text-whisper-gray truncate">
                      {w.method} · {w.destination} ·{' '}
                      {new Date(w.createdAt).toLocaleString('ru-RU')}
                    </div>
                    {w.rejectionReason && (
                      <div className="font-roobert text-[11px] text-[#ff8a76]/80 mt-0.5 truncate">
                        Причина: {w.rejectionReason}
                      </div>
                    )}
                  </div>
                </button>
                <div className="text-right shrink-0">
                  <div className="font-roobert text-[14px] text-frost-white tabular-nums">
                    −{w.amount.toLocaleString('ru-RU', {
                      maximumFractionDigits: 2,
                    })}{' '}
                    {w.currency}
                  </div>
                  <span
                    className={`mt-0.5 inline-block px-2 py-0.5 rounded-pill border font-roobert text-[10px] uppercase tracking-[0.18em] ${
                      STATUS_TINT[w.status] ??
                      'border-white/15 bg-white/[0.04] text-whisper-gray'
                    }`}
                  >
                    {STATUS_LABEL[w.status] ?? w.status}
                  </span>
                </div>
                {w.status === 'pending' ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => act(w.id, 'approve')}
                      disabled={busy === w.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-pill border border-emerald-400/40 bg-emerald-400/10 text-emerald-100 hover:border-emerald-400/60 disabled:opacity-50 transition-colors font-roobert text-[11px]"
                    >
                      <Check size={11} strokeWidth={1.8} />
                      Одобрить
                    </button>
                    <button
                      onClick={() => act(w.id, 'reject')}
                      disabled={busy === w.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-pill border border-[rgba(165,45,37,0.45)] bg-[rgba(165,45,37,0.10)] text-[#ff8a76] hover:border-[rgba(165,45,37,0.6)] disabled:opacity-50 transition-colors font-roobert text-[11px]"
                    >
                      <X size={11} strokeWidth={1.8} />
                      Отклонить
                    </button>
                  </div>
                ) : (
                  <span className="w-[180px]" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
