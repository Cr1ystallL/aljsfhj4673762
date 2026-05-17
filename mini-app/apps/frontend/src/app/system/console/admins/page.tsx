'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { HelpButton } from '@/components/admin/help-button';

/**
 * Admin → Admin roster.
 *
 * Lists all current admins, distinguishing seed (env-defined,
 * untouchable from UI) from runtime (dynamic, added/removed via UI).
 */

interface AdminEntry {
  telegramId: number;
  name: string;
  username: string | null;
  photoUrl: string | null;
  source: 'seed' | 'dynamic';
  role: 'full' | 'withdrawal';
}

export default function AdminsPage() {
  const [data, setData] = useState<AdminEntry[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [tgInput, setTgInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [roleInput, setRoleInput] = useState<'full' | 'withdrawal'>('full');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/_x/admins', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        setData([]);
        return;
      }
      const j = await res.json();
      setData(j.admins ?? []);
    } catch {
      setData([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const submitAdd = async () => {
    if (!/^\d+$/.test(tgInput.trim())) {
      alert('Telegram ID должен быть числом');
      return;
    }
    if (reasonInput.trim().length < 3) {
      alert('Причина обязательна');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/_x/admins', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramId: tgInput.trim(),
          reason: reasonInput.trim(),
          role: roleInput,
        }),
      });
      if (!res.ok) {
        alert('Не удалось добавить');
      } else {
        setTgInput('');
        setReasonInput('');
        setRoleInput('full');
        setAdding(false);
        await reload();
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (tg: number) => {
    const reason = prompt('Причина снятия прав (минимум 3 символа):');
    if (!reason || reason.trim().length < 3) return;
    try {
      const res = await fetch(`/api/_x/admins/${tg}/remove`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        alert(j?.error ?? 'Не удалось снять права');
      } else {
        await reload();
      }
    } catch {
      alert('Не удалось снять права');
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
            Список админов · {data?.length ?? 0}
          </span>
          <div className="inline-flex items-center gap-2">
            <button
              onClick={() => setAdding((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill border border-white/15 bg-white/[0.04] hover:border-white/25 transition-colors font-roobert text-[11px] text-frost-white"
            >
              <Plus size={11} strokeWidth={1.8} />
              Добавить
            </button>
            <HelpButton title="Назначение админов">
              <p>
                Есть два уровня администрирования:
              </p>
              <p>
                <strong>Seed</strong> — Telegram ID указанные в файле{' '}
                <code>.env</code> в переменной <code>ADMIN_TELEGRAM_IDS</code>.
                Эти админы — корневые owners, их нельзя снять через UI.
                Меняются только редактированием .env и рестартом
                бэкенда.
              </p>
              <p>
                <strong>Dynamic</strong> — добавлены через эту страницу,
                хранятся в Redis. Можно снимать в любой момент.
              </p>
              <p>
                Для нового админа нужен только Telegram ID — пользователь
                может вообще не существовать в базе, как только он
                войдёт в мини-приложение, права будут активированы.
              </p>
            </HelpButton>
          </div>
        </div>

        {adding && (
          <div className="rounded-card border border-white/15 bg-white/[0.04] px-4 py-3 flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-2">
              <input
                value={tgInput}
                onChange={(e) => setTgInput(e.target.value)}
                placeholder="Telegram ID"
                inputMode="numeric"
                className="bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] tabular-nums text-frost-white focus:outline-none focus:border-white/30"
              />
              <input
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder="Причина"
                inputMode="text"
                className="bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
                Роль:
              </span>
              <button
                onClick={() => setRoleInput('full')}
                className={`px-3 py-1.5 rounded-pill border font-roobert text-[11px] transition-colors ${
                  roleInput === 'full'
                    ? 'border-white/30 bg-white/[0.06] text-frost-white'
                    : 'border-white/10 bg-white/[0.03] text-frost-white/65'
                }`}
              >
                Полный доступ
              </button>
              <button
                onClick={() => setRoleInput('withdrawal')}
                className={`px-3 py-1.5 rounded-pill border font-roobert text-[11px] transition-colors ${
                  roleInput === 'withdrawal'
                    ? 'border-white/30 bg-white/[0.06] text-frost-white'
                    : 'border-white/10 bg-white/[0.03] text-frost-white/65'
                }`}
              >
                Только выводы
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setAdding(false)}
                className="px-3 py-1.5 rounded-pill border border-white/15 bg-white/[0.04] font-roobert text-[11px] text-frost-white/85"
              >
                Отмена
              </button>
              <button
                onClick={submitAdd}
                disabled={busy}
                className="px-3 py-1.5 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[11px] uppercase tracking-[0.18em] disabled:opacity-50"
              >
                {busy ? 'Добавление…' : 'Подтвердить'}
              </button>
            </div>
          </div>
        )}

        {data === null ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] py-16 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border border-white/20 border-t-frost-white animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-10 text-center font-roobert text-[12px] text-whisper-gray">
            Нет админов.
          </div>
        ) : (
          <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
            {data.map((a) => (
              <div
                key={a.telegramId}
                className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-3"
              >
                {a.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.photoUrl}
                    alt={a.name}
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 rounded-pill border border-white/10 object-cover"
                    draggable={false}
                  />
                ) : (
                  <span className="w-14 h-14 rounded-pill border border-white/10 bg-white/[0.04] flex items-center justify-center font-roobert text-[18px]">
                    {a.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="font-roobert text-[14px] text-frost-white truncate">
                    {a.name}
                  </div>
                  <div className="font-roobert text-[10px] text-whisper-gray tabular-nums">
                    #{a.telegramId}
                    {a.username ? ` · @${a.username}` : ''}
                    {' · '}
                    {a.role === 'withdrawal' ? 'только выводы' : 'полный доступ'}
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-pill border font-roobert text-[10px] uppercase tracking-[0.18em] ${
                    a.source === 'seed'
                      ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
                      : 'border-white/15 bg-white/[0.04] text-frost-white/85'
                  }`}
                >
                  {a.source}
                </span>
                {a.source === 'dynamic' ? (
                  <button
                    onClick={() => remove(a.telegramId)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-pill border border-white/15 bg-white/[0.04] hover:border-white/25 text-frost-white/85 transition-colors font-roobert text-[11px]"
                  >
                    <Trash2 size={11} strokeWidth={1.7} />
                  </button>
                ) : (
                  <span className="w-[34px]" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
