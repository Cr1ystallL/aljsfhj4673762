'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { HelpButton } from '@/components/admin/help-button';

/**
 * Admin → Audit log.
 *
 * Append-only journal of every mutating admin action. Server-side
 * pagination at 10 rows/page (matches the user's request — small
 * pages, fast scan), free-text search across action / target id /
 * reason, and a sort dropdown (newest first by default, oldest
 * first as the alternative). Action filter quick-pills are shown for
 * the most common verbs.
 */

interface AuditEntry {
  id: string;
  adminUserId: string;
  adminTelegramId: number;
  action: string;
  targetType: string;
  targetId: string | null;
  payloadBefore: unknown;
  payloadAfter: unknown;
  reason: string | null;
  ipAddress: string | null;
  createdAt: number;
}

const PAGE_SIZE = 10;

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [data, setData] = useState<{
    total: number;
    entries: AuditEntry[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Debounce the search box so we don't hammer the API on every keystroke.
  const debouncedSearch = useDebounced(search, 300);

  useEffect(() => {
    // Whenever filters change, jump back to page 1 — otherwise the
    // user can end up on an empty page after narrowing the result set.
    setPage(1);
  }, [debouncedSearch, actionFilter, sortDir]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', String(PAGE_SIZE));
        if (debouncedSearch) params.set('q', debouncedSearch);
        if (actionFilter) params.set('action', actionFilter);
        const res = await fetch(`/api/_x/audit?${params.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) {
          if (!cancelled) setData({ total: 0, entries: [] });
          return;
        }
        const j = await res.json();
        let entries = j.entries as AuditEntry[];
        if (sortDir === 'asc') entries = [...entries].reverse();
        if (!cancelled) setData({ total: j.total, entries });
      } catch {
        if (!cancelled) setData({ total: 0, entries: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch, actionFilter, sortDir]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const quickActions = useMemo(
    () => [
      { value: '', label: 'Все' },
      { value: 'balance.credit', label: 'Зачисления' },
      { value: 'balance.debit', label: 'Списания' },
      { value: 'user.flags', label: 'Флаги игрока' },
      { value: 'promo.create', label: 'Создание промо' },
      { value: 'contest.draw', label: 'Розыгрыши' },
    ],
    []
  );

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
            Действия админов · {data?.total ?? 0}
          </span>
          <HelpButton title="Аудит-лог">
            <p>
              В журнал попадает <strong>каждое мутирующее действие</strong>{' '}
              из админки: изменение баланса, блокировка / разблокировка
              игрока, заморозка вывода и любое другое изменение состояния.
            </p>
            <p>
              Запись содержит: кто (Telegram ID), когда, что (action),
              цель (тип + id), снимки до/после, причину и IP. Журнал{' '}
              <strong>append-only</strong> — удалить запись нельзя
              никаким UI-действием.
            </p>
            <p>
              Используйте поиск чтобы найти запись по action / id цели /
              тексту причины — и стрелочки внизу для перелистывания.
            </p>
          </HelpButton>
        </div>

        {/* Search + sort row */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={13}
              strokeWidth={1.7}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-frost-white/55"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по action / id цели / причине"
              className="w-full bg-white/[0.04] border border-white/15 rounded-pill pl-9 pr-3 py-2 font-roobert text-[12px] text-frost-white focus:outline-none focus:border-white/30 placeholder:text-whisper-gray"
            />
          </div>
          <select
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value as 'desc' | 'asc')}
            className="bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[12px] text-frost-white focus:outline-none focus:border-white/30"
          >
            <option value="desc">Сначала новые</option>
            <option value="asc">Сначала старые</option>
          </select>
        </div>

        {/* Action quick filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {quickActions.map((q) => (
            <button
              key={q.value || 'all'}
              onClick={() => setActionFilter(q.value)}
              className={`shrink-0 px-3 py-1 rounded-pill border font-roobert text-[11px] transition-colors ${
                actionFilter === q.value
                  ? 'bg-frost-white text-midnight-canvas border-frost-white'
                  : 'border-white/15 bg-white/[0.04] text-frost-white/85 hover:border-white/25'
              }`}
            >
              {q.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] py-16 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border border-white/20 border-t-frost-white animate-spin" />
          </div>
        ) : !data || data.entries.length === 0 ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-10 text-center font-roobert text-[12px] text-whisper-gray">
            Ничего не найдено по текущим фильтрам.
          </div>
        ) : (
          <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
            {data.entries.map((e) => (
              <div key={e.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-roobert text-[12px] text-frost-white">
                    {e.action}
                  </span>
                  <span className="font-roobert text-[10px] tabular-nums text-whisper-gray">
                    {new Date(e.createdAt).toLocaleString('ru-RU')}
                  </span>
                </div>
                <div className="font-roobert text-[10px] text-whisper-gray tabular-nums">
                  Админ #{e.adminTelegramId} ·{' '}
                  {e.targetType}
                  {e.targetId ? ` · ${e.targetId.slice(0, 8)}…` : ''}
                  {e.ipAddress ? ` · ${e.ipAddress}` : ''}
                </div>
                {e.reason && (
                  <div className="mt-1 font-roobert text-[12px] text-whisper-gray">
                    «{e.reason}»
                  </div>
                )}
                {(Boolean(e.payloadBefore) || Boolean(e.payloadAfter)) && (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer font-roobert text-[10px] uppercase tracking-[0.18em] text-whisper-gray hover:text-frost-white transition-colors">
                      Детали
                    </summary>
                    <pre className="mt-1 font-mono text-[10px] text-frost-white/80 bg-white/[0.03] rounded-card px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all">
{JSON.stringify(
  { before: e.payloadBefore, after: e.payloadAfter },
  null,
  2
)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}

        {data && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-pill border border-white/15 bg-white/[0.04] text-frost-white/85 disabled:opacity-40 font-roobert text-[12px]"
            >
              ←
            </button>
            <span className="font-roobert text-[12px] tabular-nums text-whisper-gray">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-pill border border-white/15 bg-white/[0.04] text-frost-white/85 disabled:opacity-40 font-roobert text-[12px]"
            >
              →
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/** Tiny debounce hook so we don't refetch on every keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  const ref = useRef<number | null>(null);
  useEffect(() => {
    if (ref.current) window.clearTimeout(ref.current);
    ref.current = window.setTimeout(() => setDebounced(value), ms);
    return () => {
      if (ref.current) window.clearTimeout(ref.current);
    };
  }, [value, ms]);
  return debounced;
}
