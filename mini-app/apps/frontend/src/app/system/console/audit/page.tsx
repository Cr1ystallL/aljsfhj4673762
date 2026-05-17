'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/admin-shell';
import { HelpButton } from '@/components/admin/help-button';

/**
 * Admin → Audit log.
 *
 * Append-only journal of every mutating admin action. Filters: action
 * verb, target id. Pagination is server-side, 50 per page.
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

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    total: number;
    entries: AuditEntry[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/_x/audit?page=${page}&limit=50`,
          { credentials: 'include', cache: 'no-store' }
        );
        if (!res.ok) {
          if (!cancelled) setData({ total: 0, entries: [] });
          return;
        }
        const j = await res.json();
        if (!cancelled) setData({ total: j.total, entries: j.entries });
      } catch {
        if (!cancelled) setData({ total: 0, entries: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / 50)) : 1;

  return (
    <AdminShell title="Аудит">
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
              Используйте журнал чтобы понять кто и почему сделал
              действие, а также для разбора инцидентов и взаиморасчётов
              между админами.
            </p>
          </HelpButton>
        </div>

        {loading ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] py-16 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border border-white/20 border-t-frost-white animate-spin" />
          </div>
        ) : !data || data.entries.length === 0 ? (
          <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-10 text-center font-roobert text-[12px] text-whisper-gray">
            Журнал пуст.
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
              Назад
            </button>
            <span className="font-roobert text-[12px] tabular-nums text-whisper-gray">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-pill border border-white/15 bg-white/[0.04] text-frost-white/85 disabled:opacity-40 font-roobert text-[12px]"
            >
              Дальше
            </button>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
