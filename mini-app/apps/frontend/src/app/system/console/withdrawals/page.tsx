'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/components/admin/admin-shell';
import { HelpButton } from '@/components/admin/help-button';

/**
 * Admin → Withdrawals.
 *
 * Read-only list of withdrawal-flavoured transactions. Right now the
 * mini-app doesn't expose a withdrawal flow, so this list is normally
 * empty / fed from the bot's withdrawal-pipeline. Approval / rejection
 * actions land in Phase 4.
 */

interface Withdrawal {
  id: string;
  userId: string;
  name: string;
  telegramId: number | null;
  photoUrl: string | null;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: number;
  metadata: unknown;
}

export default function WithdrawalsPage() {
  const router = useRouter();
  const [data, setData] = useState<Withdrawal[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/_x/withdrawals?limit=100', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) {
          if (!cancelled) setData([]);
          return;
        }
        const j = await res.json();
        if (!cancelled) setData(j.withdrawals ?? []);
      } catch {
        if (!cancelled) setData([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminShell title="Выводы">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
            Заявки на вывод
          </span>
          <HelpButton title="Раздел «Выводы»">
            <p>
              Здесь собраны транзакции с типом{' '}
              <code>withdrawal</code> /<code>withdraw_request</code>.
            </p>
            <p>
              В мини-приложении вывод средств пока не доступен —
              функционал появится позже отдельной фазой. Сейчас список
              пополняется из внешних источников (бот, ручные операции).
            </p>
            <p>
              Возможность одобрять / отклонять заявки появится в Фазе 4
              «Финансы и кошелёк».
            </p>
          </HelpButton>
        </div>

        {data === null ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] py-16 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border border-white/20 border-t-frost-white animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-10 text-center font-roobert text-[12px] text-whisper-gray">
            Нет заявок на вывод.
          </div>
        ) : (
          <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
            {data.map((w) => (
              <button
                key={w.id}
                onClick={() => router.push(`/system/console/users/${w.userId}`)}
                className="w-full text-left grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors"
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
                <div className="min-w-0">
                  <div className="font-roobert text-[14px] text-frost-white truncate">
                    {w.name}
                  </div>
                  <div className="font-roobert text-[11px] text-whisper-gray tabular-nums">
                    {new Date(w.createdAt).toLocaleString('ru-RU')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-roobert text-[14px] text-frost-white tabular-nums">
                    −{w.amount.toLocaleString('ru-RU', {
                      maximumFractionDigits: 2,
                    })}{' '}
                    zł
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
