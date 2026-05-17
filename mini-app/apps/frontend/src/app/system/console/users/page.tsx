'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ShieldAlert, Lock, ChevronRight } from 'lucide-react';
import { HelpButton } from '@/components/admin/help-button';

/**
 * Admin → Users list.
 *
 * Server-paginated (50 per page), search by name / username / TG id,
 * filter by moderation flag. Each row links to the user's detail page.
 */

interface UserRow {
  id: string;
  telegramId: number;
  name: string;
  username: string | null;
  photoUrl: string | null;
  isBlocked: boolean;
  withdrawalLocked: boolean;
  createdAt: number;
  balance: number;
  bets: number;
  wagered: number;
  ggr: number;
}

interface ListResponse {
  ok: true;
  total: number;
  page: number;
  limit: number;
  users: UserRow[];
}

const LIMIT = 50;

export default function UsersListPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [flag, setFlag] = useState<'' | 'blocked' | 'locked'>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(LIMIT));
      params.set('page', String(page));
      if (q.trim()) params.set('q', q.trim());
      if (flag) params.set('flag', flag);
      const res = await fetch(`/api/_x/users?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.ok) {
        const j = (await res.json()) as ListResponse;
        setData(j);
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [q, flag, page]);

  // Debounced load on q/flag changes
  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [load]);

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1),
    [data]
  );

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Search + filter */}
        <div className="flex items-center gap-2">
          <div className="flex-1 inline-flex items-center gap-2 px-3 py-2 rounded-pill border border-white/15 bg-white/[0.04]">
            <Search size={14} className="text-frost-white/60" strokeWidth={1.7} />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Имя, @username или Telegram ID"
              className="flex-1 bg-transparent text-frost-white text-[13px] placeholder-whisper-gray font-roobert focus:outline-none"
            />
            <HelpButton title="Поиск игроков">
              <p>
                Ищем по полям профиля. Если введёте только цифры — ищем по
                <strong> Telegram ID</strong> точным совпадением; иначе ищем
                подстроку без учёта регистра в имени, фамилии и username.
              </p>
              <p>
                Поиск автоматически перезапускается через 250 мс после
                окончания ввода — не нужно жать Enter.
              </p>
            </HelpButton>
          </div>

          <select
            value={flag}
            onChange={(e) => {
              setFlag(e.target.value as '' | 'blocked' | 'locked');
              setPage(1);
            }}
            className="px-3 py-2 rounded-pill border border-white/15 bg-white/[0.04] text-frost-white text-[12px] font-roobert focus:outline-none"
          >
            <option value="" className="bg-midnight-canvas">
              Все
            </option>
            <option value="blocked" className="bg-midnight-canvas">
              Заблокированные
            </option>
            <option value="locked" className="bg-midnight-canvas">
              С блоком вывода
            </option>
          </select>
        </div>

        {/* Stats summary */}
        {data && (
          <div className="font-roobert text-[11px] uppercase tracking-[0.22em] text-whisper-gray flex items-center gap-2 px-1">
            <span>
              Найдено: {data.total.toLocaleString('ru-RU')}
            </span>
            <span className="text-frost-white/30">·</span>
            <span>
              Стр. {data.page} / {totalPages}
            </span>
          </div>
        )}

        {/* Rows */}
        {loading && !data ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] py-16 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border border-white/20 border-t-frost-white animate-spin" />
          </div>
        ) : !data ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-6 text-center font-roobert text-[12px] text-whisper-gray">
            Не удалось загрузить список.
          </div>
        ) : data.users.length === 0 ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-6 text-center font-roobert text-[12px] text-whisper-gray">
            Никого не найдено.
          </div>
        ) : (
          <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
            {data.users.map((u) => (
              <button
                key={u.id}
                onClick={() => router.push(`/system/console/users/${u.id}`)}
                className="w-full text-left grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors"
              >
                {u.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={u.photoUrl}
                    alt={u.name}
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 rounded-pill border border-white/10 object-cover"
                    draggable={false}
                  />
                ) : (
                  <span className="w-14 h-14 rounded-pill border border-white/10 bg-white/[0.04] flex items-center justify-center font-roobert text-[18px] text-frost-white">
                    {u.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="font-roobert text-[14px] text-frost-white truncate flex items-center gap-1.5">
                    {u.name}
                    {u.isBlocked && (
                      <ShieldAlert
                        size={12}
                        className="text-[#ff8a76] shrink-0"
                        strokeWidth={1.8}
                      />
                    )}
                    {u.withdrawalLocked && (
                      <Lock
                        size={11}
                        className="text-amber-300 shrink-0"
                        strokeWidth={1.8}
                      />
                    )}
                  </div>
                  <div className="font-roobert text-[11px] text-whisper-gray tabular-nums truncate">
                    #{u.telegramId}
                    {u.username && ` · @${u.username}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-roobert text-[13px] text-frost-white tabular-nums">
                    {u.balance.toLocaleString('ru-RU', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}{' '}
                    zł
                  </div>
                  <div className="font-roobert text-[10px] text-whisper-gray tabular-nums">
                    {u.bets.toLocaleString('ru-RU')} ставок · GGR{' '}
                    {u.ggr.toLocaleString('ru-RU', {
                      maximumFractionDigits: 0,
                    })}
                  </div>
                </div>
                <ChevronRight
                  size={14}
                  strokeWidth={1.6}
                  className="text-frost-white/40"
                />
              </button>
            ))}
          </div>
        )}

        {/* Pagination */}
        {data && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-pill border border-white/15 bg-white/[0.04] text-frost-white/85 hover:border-white/25 disabled:opacity-40 transition-colors font-roobert text-[12px]"
            >
              Назад
            </button>
            <span className="font-roobert text-[12px] tabular-nums text-whisper-gray">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-pill border border-white/15 bg-white/[0.04] text-frost-white/85 hover:border-white/25 disabled:opacity-40 transition-colors font-roobert text-[12px]"
            >
              Дальше
            </button>
          </div>
        )}
      </div>
    </>
  );
}
