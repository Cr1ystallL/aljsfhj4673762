'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { AdminShell } from '@/components/admin/admin-shell';
import { HelpButton } from '@/components/admin/help-button';

/**
 * Admin → Active sessions.
 *
 * Lists every live JWT/Redis session across the casino. Admins can
 * revoke any session — kicks the user out immediately on next request.
 */

interface AdminSession {
  sessionId: string;
  userId: string;
  telegramId: number;
  name: string;
  photoUrl: string | null;
  createdAt: number;
  lastActivity: number;
  expiresAt: number;
  ipAddress: string | null;
  userAgent: string | null;
}

export default function SessionsPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminSession[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/_x/sessions', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        setData([]);
        return;
      }
      const j = await res.json();
      setData(j.sessions ?? []);
    } catch {
      setData([]);
    }
  }, []);

  useEffect(() => {
    void reload();
    const id = setInterval(reload, 15_000);
    return () => clearInterval(id);
  }, [reload]);

  const revoke = async (sid: string) => {
    const reason = prompt('Причина отзыва сессии (минимум 3 символа):');
    if (!reason || reason.trim().length < 3) return;
    setBusy(sid);
    try {
      const res = await fetch(`/api/_x/sessions/${sid}/revoke`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        alert('Не удалось отозвать сессию');
      } else {
        await reload();
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminShell title="Сессии">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
            Активные сессии · {data?.length ?? 0}
          </span>
          <HelpButton title="Активные сессии">
            <p>
              Каждая запись — открытая JWT-сессия в Redis. Пока сессия
              жива, у пользователя действует cookie и он может делать
              ставки.
            </p>
            <p>
              Отзыв сессии вылогинивает пользователя на следующем же
              запросе. Это <strong>не блокирует</strong> аккаунт — игрок
              может зайти заново. Если нужно полностью отрезать —
              блокируйте аккаунт в карточке игрока.
            </p>
            <p>
              Список обновляется каждые 15 секунд автоматически.
            </p>
          </HelpButton>
        </div>

        {data === null ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] py-16 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border border-white/20 border-t-frost-white animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-10 text-center font-roobert text-[12px] text-whisper-gray">
            Активных сессий нет.
          </div>
        ) : (
          <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
            {data.map((s) => (
              <div
                key={s.sessionId}
                className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-3"
              >
                <button
                  onClick={() => router.push(`/system/console/users/${s.userId}`)}
                  className="contents"
                >
                  {s.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.photoUrl}
                      alt={s.name}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-pill border border-white/10 object-cover"
                      draggable={false}
                    />
                  ) : (
                    <span className="w-9 h-9 rounded-pill border border-white/10 bg-white/[0.04] flex items-center justify-center font-roobert text-[12px]">
                      {s.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 text-left">
                    <div className="font-roobert text-[13px] text-frost-white truncate">
                      {s.name}{' '}
                      <span className="font-roobert text-[10px] text-whisper-gray tabular-nums">
                        #{s.telegramId}
                      </span>
                    </div>
                    <div className="font-roobert text-[10px] text-whisper-gray tabular-nums truncate">
                      {s.ipAddress ?? '—'} ·{' '}
                      {new Date(s.lastActivity).toLocaleString('ru-RU')}
                    </div>
                  </div>
                </button>
                <span
                  className="font-mono text-[10px] text-whisper-gray tabular-nums truncate max-w-[120px]"
                  title={s.sessionId}
                >
                  {s.sessionId.slice(0, 12)}…
                </span>
                <button
                  onClick={() => revoke(s.sessionId)}
                  disabled={busy === s.sessionId}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-pill border border-white/15 bg-white/[0.04] text-frost-white/85 hover:border-white/25 disabled:opacity-50 transition-colors font-roobert text-[11px]"
                >
                  <LogOut size={11} strokeWidth={1.7} />
                  {busy === s.sessionId ? 'Отзыв…' : 'Отозвать'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
