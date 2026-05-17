'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { AdminShell } from '@/components/admin/admin-shell';
import { HelpButton } from '@/components/admin/help-button';

/**
 * Admin → Broadcasts list.
 *
 * Table of recent broadcasts with status, audience size and delivery
 * stats. The "Создать" button opens a separate page so the form has
 * room to breathe.
 */

interface Broadcast {
  id: string;
  status: 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'failed' | string;
  text: string;
  parseMode: string;
  mediaUrl: string | null;
  audience: unknown;
  scheduledAt: number | null;
  totalTargets: number;
  delivered: number;
  failed: number;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  errorMessage: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Запланирована',
  sending: 'Отправляется',
  sent: 'Отправлена',
  cancelled: 'Отменена',
  failed: 'Ошибка',
};
const STATUS_TINT: Record<string, string> = {
  scheduled: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  sending: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  sent: 'border-white/15 bg-white/[0.04] text-frost-white/85',
  cancelled: 'border-white/15 bg-white/[0.04] text-whisper-gray',
  failed: 'border-[rgba(165,45,37,0.45)] bg-[rgba(165,45,37,0.18)] text-[#ff8a76]',
};

export default function BroadcastsListPage() {
  const router = useRouter();
  const [data, setData] = useState<Broadcast[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/_x/broadcasts?limit=80', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        setData([]);
        return;
      }
      const j = await res.json();
      setData(j.broadcasts ?? []);
    } catch {
      setData([]);
    }
  }, []);

  useEffect(() => {
    void reload();
    const id = setInterval(reload, 5_000);
    return () => clearInterval(id);
  }, [reload]);

  const cancel = async (id: string) => {
    const reason = prompt('Причина отмены (минимум 3 символа):');
    if (!reason || reason.trim().length < 3) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/_x/broadcasts/${id}/cancel`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        alert('Не удалось отменить');
      } else {
        await reload();
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminShell title="Рассылки">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
            История рассылок · {data?.length ?? 0}
          </span>
          <div className="inline-flex items-center gap-2">
            <button
              onClick={() => router.push('/system/console/broadcasts/new')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill border border-white/15 bg-white/[0.04] hover:border-white/25 transition-colors font-roobert text-[12px] text-frost-white"
            >
              <Plus size={12} strokeWidth={1.8} />
              Создать
            </button>
            <HelpButton title="Что такое рассылка">
              <p>
                Сообщение, которое бот отправит выбранной аудитории.
                Можно с картинкой и до 3 кнопок-ссылок.
              </p>
              <p>
                Темп отправки <strong>25 сообщений / сек</strong> — ниже
                лимита Telegram, чтобы бота не банили. На крупной
                рассылке (10к получателей) уйдёт около 7 минут.
              </p>
              <p>
                Заблокированные игроки и те, кто заблокировал бота, не
                получают сообщений — они отмечаются в логе как{' '}
                <code>blocked</code>.
              </p>
            </HelpButton>
          </div>
        </div>

        {data === null ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] py-16 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border border-white/20 border-t-frost-white animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-10 text-center font-roobert text-[12px] text-whisper-gray">
            Рассылок ещё не было.
          </div>
        ) : (
          <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
            {data.map((b) => {
              const progress =
                b.totalTargets > 0
                  ? Math.round(
                      ((b.delivered + b.failed) / b.totalTargets) * 100
                    )
                  : 0;
              return (
                <div key={b.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-pill border font-roobert text-[10px] uppercase tracking-[0.18em] ${
                          STATUS_TINT[b.status] ??
                          'border-white/15 bg-white/[0.04] text-whisper-gray'
                        }`}
                      >
                        {STATUS_LABEL[b.status] ?? b.status}
                      </span>
                      <span className="font-roobert text-[11px] text-whisper-gray tabular-nums">
                        {new Date(b.createdAt).toLocaleString('ru-RU')}
                      </span>
                    </div>
                    {(b.status === 'scheduled' || b.status === 'sending') && (
                      <button
                        onClick={() => cancel(b.id)}
                        disabled={busy === b.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-pill border border-white/15 bg-white/[0.04] text-frost-white/85 hover:border-white/25 disabled:opacity-50 transition-colors font-roobert text-[11px]"
                      >
                        <X size={11} strokeWidth={1.7} />
                        Отменить
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 font-roobert text-[13px] text-frost-white truncate">
                    {b.text.slice(0, 140)}
                    {b.text.length > 140 ? '…' : ''}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap font-roobert text-[10px] text-whisper-gray tabular-nums">
                    <span>Аудитория: {b.totalTargets.toLocaleString('ru-RU')}</span>
                    <span className="text-frost-white/30">·</span>
                    <span>
                      Доставлено: {b.delivered.toLocaleString('ru-RU')}
                    </span>
                    {b.failed > 0 && (
                      <>
                        <span className="text-frost-white/30">·</span>
                        <span className="text-[#ff8a76]/85">
                          Ошибок: {b.failed.toLocaleString('ru-RU')}
                        </span>
                      </>
                    )}
                  </div>
                  {b.totalTargets > 0 &&
                    (b.status === 'sending' ||
                      b.status === 'sent' ||
                      b.status === 'cancelled') && (
                      <div className="mt-2 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full bg-emerald-400/70"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    )}
                  {b.errorMessage && (
                    <div className="mt-1 font-roobert text-[11px] text-[#ff8a76]/85">
                      {b.errorMessage}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
