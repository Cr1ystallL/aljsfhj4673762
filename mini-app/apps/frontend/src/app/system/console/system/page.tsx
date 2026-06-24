'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Eraser, RotateCcw, Download, Upload } from 'lucide-react';
import { HelpButton } from '@/components/admin/help-button';

/**
 * Admin → System.
 *
 * Read-only health snapshot of the casino's services + privileged
 * maintenance actions (restart Crash engine, clear Redis cache, tail
 * logs).
 */

interface ServiceStatus {
  name: string;
  status: 'up' | 'degraded' | 'down' | 'unknown';
  detail: string;
}

interface ProcessStats {
  pid: number;
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  uptimeSec: number;
  nodeVersion: string;
}

const STATUS_TINT: Record<ServiceStatus['status'], string> = {
  up: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  degraded: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  down: 'border-[rgba(165,45,37,0.45)] bg-[rgba(165,45,37,0.18)] text-[#ff8a76]',
  unknown: 'border-white/15 bg-white/[0.04] text-whisper-gray',
};

export default function SystemPage() {
  const [services, setServices] = useState<ServiceStatus[] | null>(null);
  const [proc, setProc] = useState<ProcessStats | null>(null);
  const [logService, setLogService] = useState<'backend' | 'frontend' | 'bot'>(
    'backend'
  );
  const [logs, setLogs] = useState<string[] | null>(null);
  const [logsBusy, setLogsBusy] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const [maintEnabled, setMaintEnabled] = useState<boolean>(false);
  const [maintMessage, setMaintMessage] = useState<string>('');
  const [maintBusy, setMaintBusy] = useState<boolean>(false);

  const loadMaintStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/_x/maintenance', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.ok) {
        const j = await res.json();
        setMaintEnabled(j.config.enabled);
        setMaintMessage(j.config.message ?? '');
      }
    } catch {
      // ignore
    }
  }, []);

  const updateMaintenance = async (nextEnabled: boolean, nextMsg: string) => {
    const reason = prompt(
      `Вы собираетесь ${nextEnabled ? 'включить' : 'выключить'} тех. режим. Причина (минимум 3 символа):`
    );
    if (!reason || reason.trim().length < 3) return;
    setMaintBusy(true);
    try {
      const res = await fetch('/api/_x/maintenance', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: nextEnabled,
          message: nextMsg.trim() || undefined,
          reason: reason.trim(),
        }),
      });
      if (res.ok) {
        const j = await res.json();
        setMaintEnabled(j.config.enabled);
        setMaintMessage(j.config.message ?? '');
        alert('Тех. режим обновлен');
      } else {
        alert('Не удалось обновить тех. режим');
      }
    } catch {
      alert('Ошибка сети при обновлении тех. режима');
    } finally {
      setMaintBusy(false);
    }
  };
  const exportConfig = async () => {
    try {
      const res = await fetch('/api/_x/system/export', { credentials: 'include' });
      if (res.ok) {
        const j = await res.json();
        const jsonString = JSON.stringify(j.data, null, 2);
        prompt('Скопируйте настройки (Ctrl+C):', jsonString);
      } else {
        alert('Не удалось экспортировать настройки');
      }
    } catch {
      alert('Ошибка при экспорте настроек');
    }
  };

  const importConfig = async () => {
    const dataStr = prompt('Вставьте настройки (JSON):');
    if (!dataStr || dataStr.trim().length < 10) return;
    try {
      const res = await fetch('/api/_x/system/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dataStr }),
      });
      if (res.ok) {
        alert('Настройки успешно импортированы');
      } else {
        alert('Не удалось импортировать настройки');
      }
    } catch {
      alert('Ошибка при импорте настроек');
    }
  };

  const reloadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/_x/system/status', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const j = await res.json();
      setServices(j.services);
      setProc(j.process);
    } catch {
      // ignore
    }
  }, []);

  const reloadLogs = useCallback(
    async (svc: 'backend' | 'frontend' | 'bot') => {
      setLogsBusy(true);
      try {
        const res = await fetch(
          `/api/_x/system/logs?service=${svc}&lines=200`,
          { credentials: 'include', cache: 'no-store' }
        );
        if (!res.ok) {
          setLogs(['(не удалось получить лог)']);
          return;
        }
        const j = await res.json();
        setLogs(j.lines ?? []);
      } finally {
        setLogsBusy(false);
      }
    },
    []
  );

  useEffect(() => {
    void reloadStatus();
    void loadMaintStatus();
    const id = setInterval(reloadStatus, 10_000);
    return () => clearInterval(id);
  }, [reloadStatus, loadMaintStatus]);

  useEffect(() => {
    void reloadLogs(logService);
  }, [logService, reloadLogs]);

  const restartCrash = async () => {
    const reason = prompt(
      'Перезапуск движка Crash. Текущие активные ставки могут быть потеряны. Причина (минимум 3 символа):'
    );
    if (!reason || reason.trim().length < 3) return;
    setActing('crash');
    try {
      const res = await fetch('/api/_x/system/restart-crash', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) alert('Не удалось перезапустить');
      else {
        await reloadStatus();
        alert('Движок перезапущен');
      }
    } finally {
      setActing(null);
    }
  };

  const clearCache = async () => {
    const reason = prompt('Очистить кэш конфигов игр. Причина (минимум 3):');
    if (!reason || reason.trim().length < 3) return;
    setActing('cache');
    try {
      const res = await fetch('/api/_x/system/clear-cache', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        alert('Не удалось очистить');
      } else {
        const j = await res.json();
        alert(`Удалено ключей: ${j.removedKeys ?? 0}`);
      }
    } finally {
      setActing(null);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-5">
        {/* Service health */}
        <section className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
              Сервисы
            </span>
            <HelpButton title="Что значит статус">
              <p>
                <strong>up</strong> — сервис отвечает на пинг.
              </p>
              <p>
                <strong>degraded</strong> — сервис жив, но какой-то
                индикатор подозрительный (например, у бота давно не было
                heartbeat-сигнала).
              </p>
              <p>
                <strong>down</strong> — нет ответа за 1.5 сек / connection
                refused / ping failed.
              </p>
              <p>
                <strong>unknown</strong> — нет данных. Например, у frontend
                и bot мы не делаем cross-host запрос, чтобы не нагружать
                их и не висеть, если они зависли.
              </p>
            </HelpButton>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
            {services === null
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-card border border-white/10 bg-white/[0.03] px-3 py-2.5 h-[60px] animate-pulse"
                  />
                ))
              : services.map((s) => (
                  <div
                    key={s.name}
                    className="rounded-card border border-white/10 bg-white/[0.03] px-3 py-2.5 flex items-center gap-3"
                  >
                    <Activity
                      size={14}
                      strokeWidth={1.7}
                      className="text-frost-white/65 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-roobert text-[13px] text-frost-white capitalize">
                        {s.name}
                      </div>
                      <div className="font-roobert text-[10px] text-whisper-gray truncate">
                        {s.detail}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-pill border font-roobert text-[10px] uppercase tracking-[0.18em] ${
                        STATUS_TINT[s.status]
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>
                ))}
          </div>
        </section>

        {/* Process stats */}
        <section className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
              Процесс backend
            </span>
            <HelpButton title="Метрики процесса">
              <p>
                <strong>RSS</strong> — реальная физическая память,
                занятая процессом. Когда уверенно растёт без падения —
                намёк на утечку.
              </p>
              <p>
                <strong>Heap used / total</strong> — выделенный V8 heap
                и сколько внутри занято. После любого крупного действия
                heap обычно собирается GC и возвращается к базовому
                уровню.
              </p>
              <p>
                <strong>Uptime</strong> — секунды с последнего рестарта.
                Если меньше пары минут и вы ничего не перезапускали —
                смотрите логи бэка, скорее всего PM2 крашит и поднимает.
              </p>
            </HelpButton>
          </div>
          {proc && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3">
              <Stat label="PID" value={proc.pid.toString()} />
              <Stat label="RSS" value={`${proc.rssMb} МБ`} />
              <Stat
                label="Heap"
                value={`${proc.heapUsedMb} / ${proc.heapTotalMb} МБ`}
              />
              <Stat
                label="Uptime"
                value={formatUptime(proc.uptimeSec)}
              />
              <Stat label="Node" value={proc.nodeVersion} />
            </div>
          )}
        </section>

        {/* Maintenance Mode */}
        <section className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
              Технический Режим (Тех. Режим)
            </span>
            <HelpButton title="Ограничение доступа">
              <p>
                При включенном тех. режиме обычные пользователи на фронте будут
                перенаправляться на страницу-заглушку с сообщением о
                техработах.
              </p>
              <p>
                Бот также перестанет отвечать на обычные действия и будет
                выдавать предупреждение о проведении технических работ.
              </p>
              <p>
                Администраторы могут продолжать использовать консоль для
                отключения этого режима.
              </p>
            </HelpButton>
          </div>
          <div className="p-4 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="font-roobert text-[14px] text-frost-white">
                  Статус режима техработ:{' '}
                  <strong className={maintEnabled ? 'text-red-400' : 'text-emerald-400'}>
                    {maintEnabled ? '🔴 ВКЛЮЧЕН (сайт заблокирован)' : '🟢 ВЫКЛЮЧЕН (активен)'}
                  </strong>
                </span>
                <span className="font-roobert text-[11px] text-whisper-gray mt-0.5">
                  Полная блокировка бота и мини-приложения для обычных пользователей
                </span>
              </div>
              <button
                onClick={() => updateMaintenance(!maintEnabled, maintMessage)}
                disabled={maintBusy}
                className={`px-4 py-2 rounded-pill font-roobert text-[12px] uppercase tracking-wider font-semibold transition-all ${
                  maintEnabled
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-black'
                    : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
              >
                {maintEnabled ? 'Отключить тех. режим' : 'Включить тех. режим'}
              </button>
            </div>

            <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
              <label className="font-roobert text-[12px] text-whisper-gray">
                Сообщение для пользователей (необязательно)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={maintMessage}
                  onChange={(e) => setMaintMessage(e.target.value)}
                  placeholder="Пример: Ведутся плановые обновления. Бот скоро возобновит работу."
                  className="flex-1 rounded-card border border-white/10 bg-white/[0.02] px-3 py-2 font-roobert text-[13px] text-frost-white placeholder:text-white/20 focus:border-white/20 focus:outline-none"
                />
                <button
                  onClick={() => updateMaintenance(maintEnabled, maintMessage)}
                  disabled={maintBusy}
                  className="px-4 py-2 rounded-card border border-white/15 bg-white/[0.04] hover:bg-white/[0.06] font-roobert text-[13px] text-frost-white transition-colors"
                >
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Maintenance actions */}
        <section className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
              Действия
            </span>
            <HelpButton title="Когда применять">
              <p>
                <strong>Перезапустить движок Crash</strong> — если
                раунды зависли (нет новых, кривая стоит). Текущие
                принятые ставки в раунде <strong>теряются</strong>,
                поэтому сначала убедитесь что в раунде никого нет
                (страница «Сводка» / «Сессии»).
              </p>
              <p>
                <strong>Очистить кэш конфигов</strong> — после ручной
                правки <code>game_config:*</code> в Redis извне (или
                если кажется, что конфиг «залип» на старом значении).
                Безопасное действие — следующая ставка просто перечитает
                актуальные значения.
              </p>
            </HelpButton>
          </div>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={restartCrash}
              disabled={acting === 'crash'}
              className="rounded-card border border-white/15 bg-white/[0.04] px-4 py-3 text-left hover:bg-white/[0.06] disabled:opacity-50 transition-colors"
            >
              <div className="flex items-center gap-2 text-frost-white">
                <RotateCcw size={14} strokeWidth={1.7} />
                <span className="font-roobert text-[14px]">
                  Перезапустить движок Crash
                </span>
              </div>
              <div className="font-roobert text-[11px] text-whisper-gray mt-0.5">
                Спин-даун + спин-ап одной комнаты «crash_main»
              </div>
            </button>
            <button
              onClick={clearCache}
              disabled={acting === 'cache'}
              className="rounded-card border border-white/15 bg-white/[0.04] px-4 py-3 text-left hover:bg-white/[0.06] disabled:opacity-50 transition-colors"
            >
              <div className="flex items-center gap-2 text-frost-white">
                <Eraser size={14} strokeWidth={1.7} />
                <span className="font-roobert text-[14px]">
                  Очистить кэш конфигов
                </span>
              </div>
              <div className="font-roobert text-[11px] text-whisper-gray mt-0.5">
                Удалить ключи Redis <code>game_config:*</code>
              </div>
            </button>
            <button
              onClick={exportConfig}
              className="rounded-card border border-white/15 bg-white/[0.04] px-4 py-3 text-left hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-2 text-frost-white">
                <Download size={14} strokeWidth={1.7} />
                <span className="font-roobert text-[14px]">Экспорт конфигов</span>
              </div>
              <div className="font-roobert text-[11px] text-whisper-gray mt-0.5">Скопировать текущие настройки системы</div>
            </button>
            <button
              onClick={importConfig}
              className="rounded-card border border-white/15 bg-white/[0.04] px-4 py-3 text-left hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-2 text-frost-white">
                <Upload size={14} strokeWidth={1.7} />
                <span className="font-roobert text-[14px]">Импорт конфигов</span>
              </div>
              <div className="font-roobert text-[11px] text-whisper-gray mt-0.5">Вставить настройки системы из буфера</div>
            </button>
          </div>
        </section>

        {/* Logs */}
        <section className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {(['backend', 'bot', 'frontend'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setLogService(s)}
                  className={`px-3 py-1 rounded-pill border font-roobert text-[12px] transition-colors ${
                    logService === s
                      ? 'border-white/30 bg-white/[0.06] text-frost-white'
                      : 'border-white/10 bg-white/[0.03] text-frost-white/65'
                  }`}
                >
                  {s}
                </button>
              ))}
              <button
                onClick={() => reloadLogs(logService)}
                disabled={logsBusy}
                className="ml-1 px-3 py-1 rounded-pill border border-white/15 bg-white/[0.04] hover:border-white/25 disabled:opacity-50 font-roobert text-[12px] text-frost-white/85"
              >
                {logsBusy ? 'Обновляется…' : 'Обновить'}
              </button>
            </div>
            <HelpButton title="Просмотр логов">
              <p>
                Tail последних 200 строк PM2 stdout. Если файла нет —
                пробуем fallback по <code>/var/log/macvbet-*.log</code>.
              </p>
              <p>
                Это <strong>read-only</strong> просмотр. Для серьёзного
                разбора инцидентов используйте SSH и{' '}
                <code>pm2 logs</code>.
              </p>
            </HelpButton>
          </div>
          <div className="bg-black/40 max-h-[420px] overflow-auto">
            {logs === null ? (
              <div className="p-6 text-center font-roobert text-[12px] text-whisper-gray">
                Загрузка…
              </div>
            ) : logs.length === 0 ? (
              <div className="p-6 text-center font-roobert text-[12px] text-whisper-gray">
                Лог пуст.
              </div>
            ) : (
              <pre className="font-mono text-[11px] leading-relaxed text-frost-white/85 px-4 py-3 whitespace-pre-wrap break-all">
                {logs.join('\n')}
              </pre>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="font-roobert text-[9px] uppercase tracking-[0.22em] text-whisper-gray">
        {label}
      </div>
      <div className="mt-0.5 font-roobert text-[14px] tabular-nums text-frost-white truncate">
        {value}
      </div>
    </div>
  );
}

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec}с`;
  if (sec < 3600) return `${Math.floor(sec / 60)}м`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}ч ${Math.floor((sec % 3600) / 60)}м`;
  return `${Math.floor(sec / 86400)}д ${Math.floor((sec % 86400) / 3600)}ч`;
}
