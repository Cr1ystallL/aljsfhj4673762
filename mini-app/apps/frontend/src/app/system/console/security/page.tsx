'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldAlert,
  Lock,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  UserX,
  UserCheck,
  ShieldCheck,
} from 'lucide-react';
import { HelpButton } from '@/components/admin/help-button';
import { cn } from '@/lib/utils';

interface SecurityUser {
  id: string;
  telegramId: number;
  name: string;
  isBlocked: boolean;
  withdrawalLocked: boolean;
  createdAt: number;
  firstSeen: number;
  lastSeen: number;
  count: number;
  isRoot: boolean;
  isVpn: boolean;
  adminNote: string | null;
  isMain: boolean;
}

interface SecurityIpRow {
  ipAddress: string;
  accountsCount: number;
  users: SecurityUser[];
}

interface SecurityListResponse {
  ok: true;
  total: number;
  page: number;
  limit: number;
  ips: SecurityIpRow[];
}

const LIMIT = 10;

export default function SecurityPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SecurityListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(LIMIT));
      params.set('page', String(page));
      const res = await fetch(`/api/_x/security/ips?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.ok) {
        const j = (await res.json()) as SecurityListResponse;
        setData(j);
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleBlock = async (userId: string, isCurrentlyBlocked: boolean) => {
    if (updating) return;
    if (!confirm(isCurrentlyBlocked ? 'Разблокировать пользователя?' : 'Заблокировать пользователя навсегда?')) return;

    setUpdating(userId);
    try {
      const res = await fetch(`/api/_x/users/${userId}/flags`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isBlocked: !isCurrentlyBlocked,
          reason: isCurrentlyBlocked ? 'Разблокировка из панели безопасности' : 'Блокировка из панели безопасности (Мультиаккаунт)',
        }),
      });
      if (res.ok) {
        await load();
      } else {
        alert('Ошибка при обновлении статуса');
      }
    } catch (e) {
      alert('Сетевая ошибка');
    } finally {
      setUpdating(null);
    }
  };

  const toggleLock = async (userId: string, isCurrentlyLocked: boolean) => {
    if (updating) return;
    if (!confirm(isCurrentlyLocked ? 'Разрешить выводы?' : 'Заблокировать выводы?')) return;

    setUpdating(userId);
    try {
      const res = await fetch(`/api/_x/users/${userId}/flags`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          withdrawalLocked: !isCurrentlyLocked,
          reason: isCurrentlyLocked ? 'Разблокировка выводов из панели безопасности' : 'Блокировка выводов из панели безопасности (Мультиаккаунт)',
        }),
      });
      if (res.ok) {
        await load();
      } else {
        alert('Ошибка при обновлении статуса');
      }
    } catch (e) {
      alert('Сетевая ошибка');
    } finally {
      setUpdating(null);
    }
  };

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1),
    [data]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-roobert text-[18px] text-frost-white flex items-center gap-2">
          <ShieldAlert size={18} className="text-[#ff8a76]" />
          Подозрения на мультиаккаунт
        </h2>
        <HelpButton title="Мониторинг IP">
          <p>
            Здесь отображаются IP-адреса, с которых заходило <strong>более одного</strong> пользователя.
            Это может быть признаком мультиаккаунтинга или использования общего VPN/Proxy.
          </p>
          <p>
            Самый старый аккаунт помечается как <strong>Основной</strong> (Main). Вы можете вручную заблокировать подозрительные аккаунты прямо отсюда.
          </p>
        </HelpButton>
      </div>

      {/* Stats summary */}
      {data && (
        <div className="font-roobert text-[11px] uppercase tracking-[0.22em] text-whisper-gray flex items-center gap-2 px-1">
          <span>
            Найдено совпадений IP: {data.total.toLocaleString('ru-RU')}
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
          Не удалось загрузить данные.
        </div>
      ) : data.ips.length === 0 ? (
        <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-6 flex flex-col items-center gap-2 text-center">
          <ShieldCheck size={32} className="text-frost-white/50 mb-2" />
          <div className="font-roobert text-[14px] text-frost-white">Всё чисто</div>
          <div className="font-roobert text-[12px] text-whisper-gray max-w-sm">
            Не найдено ни одного IP-адреса, с которого бы заходили разные пользователи.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {data.ips.map((ipGroup) => (
            <div key={ipGroup.ipAddress} className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[13px] text-frost-white bg-black/20 px-2 py-1 rounded">
                    {ipGroup.ipAddress}
                  </span>
                  <span className="font-roobert text-[11px] text-whisper-gray">
                    {ipGroup.accountsCount} аккаунтов
                  </span>
                </div>
                {ipGroup.users.some(u => u.isVpn) && (
                  <span className="font-roobert text-[10px] uppercase tracking-[0.1em] text-amber-300/80 border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 rounded-full">
                    VPN/Proxy Suspicion
                  </span>
                )}
              </div>
              <div className="divide-y divide-white/5">
                {ipGroup.users.map((u) => (
                  <div key={u.id} className={cn("px-4 py-3 flex items-center justify-between transition-colors", u.isBlocked ? "bg-red-500/[0.02]" : "hover:bg-white/[0.02]")}>
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {u.isMain ? (
                          <span className="font-roobert text-[9px] uppercase tracking-[0.1em] text-emerald-400 border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 rounded-sm">
                            Main
                          </span>
                        ) : (
                          <span className="font-roobert text-[9px] uppercase tracking-[0.1em] text-whisper-gray border border-white/10 bg-white/[0.05] px-1.5 py-0.5 rounded-sm">
                            Alt
                          </span>
                        )}
                        <a href={`/system/console/users/${u.id}`} className="font-roobert text-[14px] text-frost-white hover:underline truncate">
                          {u.name}
                        </a>
                        <span className="font-roobert text-[11px] text-whisper-gray">
                          #{u.telegramId}
                        </span>
                        {u.isBlocked && (
                          <ShieldAlert size={12} className="text-[#ff8a76] shrink-0" strokeWidth={1.8} />
                        )}
                        {u.withdrawalLocked && (
                          <Lock size={11} className="text-amber-300 shrink-0" strokeWidth={1.8} />
                        )}
                      </div>
                      <div className="font-roobert text-[11px] text-whisper-gray flex items-center gap-3">
                        <span>Создан: {new Date(u.createdAt).toLocaleDateString('ru-RU')}</span>
                        <span>IP Логинов: {u.count}</span>
                        {u.isRoot && <span className="text-emerald-400/70">Root IP</span>}
                      </div>
                      {u.adminNote && (
                        <div className="font-roobert text-[11px] text-amber-200/60 mt-0.5 truncate max-w-xl">
                          Note: {u.adminNote}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pl-4">
                      <button
                        onClick={() => toggleLock(u.id, u.withdrawalLocked)}
                        disabled={updating === u.id}
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                          u.withdrawalLocked ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30" : "bg-white/5 text-frost-white/60 hover:bg-white/10 hover:text-frost-white",
                          updating === u.id && "opacity-50 cursor-wait"
                        )}
                        title={u.withdrawalLocked ? "Разблокировать выводы" : "Заблокировать выводы"}
                      >
                        <Lock size={14} strokeWidth={2} />
                      </button>
                      <button
                        onClick={() => toggleBlock(u.id, u.isBlocked)}
                        disabled={updating === u.id}
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                          u.isBlocked ? "bg-[#ff8a76]/20 text-[#ff8a76] hover:bg-[#ff8a76]/30" : "bg-white/5 text-frost-white/60 hover:bg-white/10 hover:text-frost-white",
                          updating === u.id && "opacity-50 cursor-wait"
                        )}
                        title={u.isBlocked ? "Разблокировать аккаунт" : "Заблокировать аккаунт навсегда"}
                      >
                        {u.isBlocked ? <UserCheck size={14} strokeWidth={2} /> : <UserX size={14} strokeWidth={2} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && totalPages > 1 && (
        <PageNav
          page={page}
          totalPages={totalPages}
          onChange={(next) => setPage(Math.min(totalPages, Math.max(1, next)))}
        />
      )}
    </div>
  );
}

function PageNav({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (next: number) => void;
}) {
  const visiblePages = useMemo(() => {
    const out: number[] = [];
    let start = page - 1;
    let end = page + 1;
    if (start < 1) {
      end += 1 - start;
      start = 1;
    }
    if (end > totalPages) {
      start -= end - totalPages;
      end = totalPages;
    }
    start = Math.max(1, start);
    end = Math.min(totalPages, end);
    for (let i = start; i <= end; i++) out.push(i);
    return out;
  }, [page, totalPages]);

  const atStart = page <= 1;
  const atEnd = page >= totalPages;

  return (
    <div className="flex items-center justify-center gap-1.5 pt-1">
      <PageButton aria-label="Первая страница" disabled={atStart} onClick={() => onChange(1)}>
        <ChevronsLeft size={14} strokeWidth={1.8} />
      </PageButton>
      <PageButton aria-label="Предыдущая страница" disabled={atStart} onClick={() => onChange(page - 1)}>
        <ChevronLeft size={14} strokeWidth={1.8} />
      </PageButton>
      {visiblePages.map((p) => (
        <PageButton key={p} active={p === page} onClick={() => onChange(p)} aria-label={`Страница ${p}`}>
          {p}
        </PageButton>
      ))}
      <PageButton aria-label="Следующая страница" disabled={atEnd} onClick={() => onChange(page + 1)}>
        <ChevronRight size={14} strokeWidth={1.8} />
      </PageButton>
      <PageButton aria-label="Последняя страница" disabled={atEnd} onClick={() => onChange(totalPages)}>
        <ChevronsRight size={14} strokeWidth={1.8} />
      </PageButton>
    </div>
  );
}

function PageButton({
  children,
  active,
  disabled,
  onClick,
  ...rest
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'disabled'>) {
  return (
    <button
      {...rest}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'min-w-[34px] h-9 px-2.5 rounded-pill border font-roobert text-[12px] tabular-nums transition-colors inline-flex items-center justify-center',
        active
          ? 'bg-frost-white text-midnight-canvas border-frost-white'
          : 'border-white/15 bg-white/[0.04] text-frost-white/85 hover:border-white/25',
        disabled && 'opacity-40 cursor-not-allowed hover:border-white/15'
      )}
    >
      {children}
    </button>
  );
}
