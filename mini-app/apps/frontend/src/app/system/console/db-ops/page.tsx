'use client';

import { useEffect, useMemo, useState } from 'react';
import { Database, Download, Lock, RefreshCw, Upload, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SessionState {
  authorized: boolean;
  expiresInMs: number;
}

interface ExportState {
  stage: 'idle' | 'running' | 'ready' | 'error';
  startedAt: number;
  finishedAt?: number;
  message?: string;
  error?: string;
  downloadToken?: string;
}

interface ImportState {
  stage: 'idle' | 'uploading' | 'restoring' | 'restarting' | 'done' | 'error';
  startedAt: number;
  finishedAt?: number;
  message?: string;
  error?: string;
}

export default function DbOpsPage() {
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<SessionState>({ authorized: false, expiresInMs: 0 });
  const [exportState, setExportState] = useState<ExportState>({ stage: 'idle', startedAt: 0 });
  const [importState, setImportState] = useState<ImportState>({ stage: 'idle', startedAt: 0 });
  const [busyExport, setBusyExport] = useState(false);
  const [busyImport, setBusyImport] = useState(false);
  const [dbInfo, setDbInfo] = useState<{ version: string; url: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const sessionExpiresInMin = useMemo(() => Math.max(0, Math.round(session.expiresInMs / 60000)), [session.expiresInMs]);

  const fetchSession = async () => {
    try {
      const res = await fetch('/api/_x/dbops/session', { credentials: 'include' });
      if (res.ok) {
        const j = await res.json();
        setSession({ authorized: j.authorized, expiresInMs: j.expiresInMs });
      }
    } catch {
      // ignore
    }
  };

  const fetchInfo = async () => {
    try {
      const res = await fetch('/api/_x/dbops/info', { credentials: 'include' });
      if (res.ok) {
        const j = await res.json();
        setDbInfo(j.db);
      }
    } catch {
      // ignore
    }
  };

  const fetchExportStatus = async () => {
    try {
      const res = await fetch('/api/_x/dbops/export/status', { credentials: 'include' });
      if (res.ok) {
        const j = await res.json();
        setExportState(j.state);
        setSession((s) => ({ ...s, expiresInMs: j.expiresInMs ?? s.expiresInMs }));
      }
    } catch {
      // ignore
    }
  };

  const fetchImportStatus = async () => {
    try {
      const res = await fetch('/api/_x/dbops/import/status', { credentials: 'include' });
      if (res.ok) {
        const j = await res.json();
        setImportState(j.state);
        setSession((s) => ({ ...s, expiresInMs: j.expiresInMs ?? s.expiresInMs }));
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void fetchSession();
    void fetchInfo();
  }, []);

  useEffect(() => {
    if (!session.authorized) return;
    const id = setInterval(() => {
      void fetchExportStatus();
      void fetchImportStatus();
      void fetchSession();
    }, 5000);
    return () => clearInterval(id);
  }, [session.authorized]);

  const login = async () => {
    try {
      const res = await fetch('/api/_x/dbops/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j?.error ?? 'Неверный пароль');
        return;
      }
      setSession({ authorized: true, expiresInMs: j.expiresInMs });
      void fetchExportStatus();
      void fetchImportStatus();
    } catch {
      alert('Не удалось войти');
    }
  };

  const startExport = async () => {
    setBusyExport(true);
    try {
      const res = await fetch('/api/_x/dbops/export/start', {
        method: 'POST',
        credentials: 'include',
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j?.error ?? 'Не удалось запустить экспорт');
        return;
      }
      setExportState(j.state);
      setSession((s) => ({ ...s, expiresInMs: j.expiresInMs ?? s.expiresInMs }));
    } finally {
      setBusyExport(false);
    }
  };

  const downloadExport = () => {
    if (exportState.stage !== 'ready' || !exportState.downloadToken) return;
    window.open(`/api/_x/dbops/export/download?token=${exportState.downloadToken}`, '_blank');
  };

  const startImport = async () => {
    if (!file) {
      alert('Выберите архив .dump');
      return;
    }
    setBusyImport(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/_x/dbops/import', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j?.error ?? 'Не удалось запустить импорт');
        return;
      }
      setImportState(j.state);
      setSession((s) => ({ ...s, expiresInMs: j.expiresInMs ?? s.expiresInMs }));
    } finally {
      setBusyImport(false);
    }
  };

  const stageBadge = (stage: string) => (
    <span className="px-2 py-0.5 rounded-pill text-[10px] uppercase tracking-[0.2em] bg-white/[0.06] text-frost-white/80">
      {stage}
    </span>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database size={18} className="text-frost-white" />
          <span className="font-roobert text-[14px] text-frost-white/90 uppercase tracking-[0.16em]">
            Экспорт / импорт БД
          </span>
        </div>
        {session.authorized && (
          <span className="text-[11px] text-emerald-300/85 font-roobert">
            Доступ активен ~{sessionExpiresInMin} мин
          </span>
        )}
      </div>

      {!session.authorized && (
        <div className="rounded-card border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3 max-w-xl">
          <div className="flex items-center gap-2 text-frost-white font-roobert text-[13px]">
            <Lock size={16} />
            Доступ защищён паролем (срок сессии 5 минут)
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль из .env (DB_OPS_PASSWORD)"
            className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
          />
          <button
            onClick={login}
            className="self-start inline-flex items-center gap-2 px-4 py-2 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px] uppercase tracking-[0.22em]"
          >
            Войти
          </button>
        </div>
      )}

      {session.authorized && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-card border border-white/10 bg-white/[0.04] p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="font-roobert text-[12px] text-whisper-gray uppercase tracking-[0.16em]">
                  Экспорт
                </div>
                {stageBadge(exportState.stage)}
              </div>
              <div className="text-[12px] text-frost-white/80 font-roobert leading-snug">
                {exportState.message || 'Создайте архив и скачайте .dump'}
              </div>
              {exportState.error && (
                <div className="text-[11px] text-rose-300">{exportState.error}</div>
              )}
              <div className="flex gap-2 mt-2 flex-wrap">
                <button
                  onClick={startExport}
                  disabled={busyExport || exportState.stage === 'running'}
                  className={cn(
                    'inline-flex items-center gap-2 px-3 py-1.5 rounded-pill border border-white/15 bg-white/[0.05] font-roobert text-[12px] text-frost-white',
                    busyExport && 'opacity-60'
                  )}
                >
                  <RefreshCw size={14} /> Запустить архивирование
                </button>
                {exportState.stage === 'ready' && exportState.downloadToken && (
                  <button
                    onClick={downloadExport}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px]"
                  >
                    <Download size={14} /> Скачать .dump
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-card border border-white/10 bg-white/[0.04] p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="font-roobert text-[12px] text-whisper-gray uppercase tracking-[0.16em]">
                  Импорт
                </div>
                {stageBadge(importState.stage)}
              </div>
              <div className="text-[12px] text-frost-white/80 font-roobert leading-snug">
                Загрузите ранее созданный .dump. Текущая БД будет перезаписана, сервисы перезапустятся.
              </div>
              {importState.error && (
                <div className="text-[11px] text-rose-300">{importState.error}</div>
              )}
              {importState.message && (
                <div className="text-[11px] text-emerald-300/85">{importState.message}</div>
              )}
              <input
                type="file"
                accept=".dump,.tar,.gz"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-2 text-[12px] text-frost-white/80"
              />
              <div className="flex gap-2 mt-2 flex-wrap">
                <button
                  onClick={startImport}
                  disabled={busyImport || !file}
                  className={cn(
                    'inline-flex items-center gap-2 px-3 py-1.5 rounded-pill border border-white/15 bg-white/[0.05] font-roobert text-[12px] text-frost-white',
                    busyImport && 'opacity-60'
                  )}
                >
                  <Upload size={14} /> Импортировать
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-card border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-2 max-w-xl">
            <div className="flex items-center gap-2 text-frost-white font-roobert text-[13px]">
              <ShieldCheck size={16} />
              Информация о базе
            </div>
            <div className="text-[12px] text-frost-white/80 font-roobert leading-snug">
              {dbInfo ? (
                <>
                  <div>Version: {dbInfo.version}</div>
                  <div className="text-whisper-gray/80 break-all">URL: {dbInfo.url}</div>
                </>
              ) : (
                'Загрузка…'
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
