'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/components/admin/admin-shell';
import { HelpButton } from '@/components/admin/help-button';

interface Deposit {
  id: string;
  userId: string;
  name: string;
  telegramId: number | null;
  photoUrl: string | null;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: number;
}

export default function DepositsPage() {
  const router = useRouter();
  const [data, setData] = useState<Deposit[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/_x/deposits?limit=200', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) {
          if (!cancelled) setData([]);
          return;
        }
        const j = await res.json();
        if (!cancelled) setData(j.deposits ?? []);
      } catch {
        if (!cancelled) setData([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminShell title="Депозиты">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
            Все депозиты · {data?.length ?? 0}
          </span>
          <HelpButton title="Список депозитов">
            <p>
              Каждая запись — транзакция типа <code>deposit</code>.
              Депозиты приходят от платёжных провайдеров (когда они
              подключатся) или от админа через изменение баланса
              в карточке игрока (тип <code>admin_credit</code>, в этот
              список не попадает).
            </p>
            <p>
              Список read-only. Манипуляции делаются в карточке игрока
              или в разделе «Кошелёк» для конфигурации провайдеров.
            </p>
          </HelpButton>
        </div>

        {data === null ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] py-16 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border border-white/20 border-t-frost-white animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-10 text-center font-roobert text-[12px] text-whisper-gray">
            Депозитов нет.
          </div>
        ) : (
          <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
            {data.map((d) => (
              <button
                key={d.id}
                onClick={() => router.push(`/system/console/users/${d.userId}`)}
                className="w-full text-left grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors"
              >
                {d.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.photoUrl}
                    alt={d.name}
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-pill border border-white/10 object-cover"
                    draggable={false}
                  />
                ) : (
                  <span className="w-9 h-9 rounded-pill border border-white/10 bg-white/[0.04] flex items-center justify-center font-roobert text-[12px]">
                    {d.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="font-roobert text-[14px] text-frost-white truncate">
                    {d.name}
                  </div>
                  <div className="font-roobert text-[10px] text-whisper-gray tabular-nums">
                    {new Date(d.createdAt).toLocaleString('ru-RU')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-roobert text-[14px] text-emerald-200 tabular-nums">
                    +{d.amount.toLocaleString('ru-RU', {
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
