'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Save, Sparkles, Target, RefreshCw } from 'lucide-react';
import { HelpButton } from '@/components/admin/help-button';
import { cn } from '@/lib/utils';

/**
 * Admin → Auto-RTP machine.
 *
 * Sets a target casino profit (or pay-out) over a window of time and
 * lets the closed-loop controller nudge per-player house edge so the
 * actual profit tracks the target. See `services/rtp-engine.ts` on
 * the backend for the formula.
 */

type Mode = 'off' | 'earn' | 'give';

interface RtpStatus {
  mode: Mode;
  target: number;
  windowMs: number;
  intensity: number;
  windowStart: number;
  windowEnd: number;
  windowProfit: number;
  windowStake: number;
  signal: number;
  released: boolean;
}

const WINDOW_PRESETS: Array<{ label: string; ms: number }> = [
  { label: '6 часов', ms: 6 * 3600_000 },
  { label: '12 часов', ms: 12 * 3600_000 },
  { label: '24 часа', ms: 24 * 3600_000 },
  { label: '7 дней', ms: 7 * 24 * 3600_000 },
];

export default function RtpPage() {
  const [status, setStatus] = useState<RtpStatus | null>(null);
  const [mode, setMode] = useState<Mode>('off');
  const [target, setTarget] = useState<string>('1000');
  const [windowMs, setWindowMs] = useState<number>(24 * 3600_000);
  const [intensity, setIntensity] = useState<number>(0.5);
  const [reason, setReason] = useState('');
  const [reset, setReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  // Once the user has edited any control we stop letting the polled
  // status overwrite the form. The status card itself keeps refreshing
  // independently — only the form controls are pinned.
  const [dirty, setDirty] = useState(false);

  const load = useCallback(
    async (syncForm: boolean) => {
      try {
        const res = await fetch('/api/_x/rtp', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) return;
        const j = await res.json();
        const s = j.status as RtpStatus;
        setStatus(s);
        if (syncForm) {
          setMode(s.mode);
          setTarget(String(s.target));
          setWindowMs(s.windowMs);
          setIntensity(s.intensity);
        }
      } catch {
        // ignore
      }
    },
    []
  );

  useEffect(() => {
    void load(true);
    const id = setInterval(() => void load(false), 10000);
    return () => clearInterval(id);
  }, [load]);

  const save = async () => {
    if (reason.trim().length < 3) {
      alert('Причина обязательна');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/_x/rtp', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          target: Number(target) || 0,
          windowMs,
          intensity,
          reset,
          reason: reason.trim(),
        }),
      });
      if (!res.ok) {
        alert('Не удалось сохранить');
      } else {
        setReason('');
        setReset(false);
        setDirty(false);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
        await load(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const progress = useMemo(() => {
    if (!status) return 0;
    if (status.windowMs <= 0) return 0;
    const f = (Date.now() - status.windowStart) / status.windowMs;
    return Math.max(0, Math.min(1, f));
  }, [status]);

  const expectedProfit = useMemo(() => {
    if (!status) return 0;
    if (status.mode === 'earn') return status.target * progress;
    if (status.mode === 'give') return -status.target * progress;
    return 0;
  }, [status, progress]);

  return (
    <>
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
            Авто-RTP · контроллер прибыли
          </span>
          <HelpButton title="Что делает авто-RTP" size={12}>
            <p>
              Это <b>замкнутый контроллер</b>. Игроки играют как обычно
              — провабли-фейр движок честно генерирует исход каждого
              раунда. Контроллер только сдвигает <b>распределение
              исходов</b> в нужную сторону.
            </p>
            <p>
              Режим <b>earn</b> — казино должно заработать{' '}
              <code>target</code> zł за период. Если идём с отставанием
              от плана — следующие раунды чаще проигрышные. Догнали
              план — отпускаем, до конца окна играем по штатному edge.
            </p>
            <p>
              Режим <b>give</b> — казино должно отдать игрокам{' '}
              <code>target</code> zł за период. Раунды чаще выигрышные.
              На выплаты включён{' '}
              <b>per-bet cap</b>: один игрок не может одной ставкой
              съесть весь бюджет окна — крупный win обрезается до
              справедливой доли.
            </p>
            <p>
              <b>Sygnał</b> ∈ [-1; +1]: положительный — отстаём от плана,
              отрицательный — опережаем. <b>Intensity</b> 0..1 — сила
              воздействия.
            </p>
            <p>
              <b>Per-user cooldown.</b> На каждого игрока копится «load»,
              который затухает за 5 минут. Чем активнее у игрока шёл
              tilt, тем меньше тилта он лично получит на следующих
              ставках. Это распределяет нагрузку на всю активную
              аудиторию вместо одного несчастного.
            </p>
            <p>
              <b>Бывает что bias = 0.</b> Это нормально — значит
              контроллер сейчас идёт в графике или достиг цели.
            </p>
            <p>
              Что НЕ делается:{' '}
              <i>не</i> срезаем выплаты постфактум,{' '}
              <i>не</i> делаем все ставки гарантированно проигрышными,{' '}
              <i>не</i> трогаем provably-fair хеши. Player может
              верифицировать любой раунд по выданному serverSeed.
            </p>
          </HelpButton>
        </div>

        {/* Status card */}
        {status && (
          <div className="relative overflow-hidden rounded-card border border-white/10 bg-white/[0.03]">
            <div
              aria-hidden
              className="absolute inset-0 opacity-50 pointer-events-none"
              style={{
                background:
                  'radial-gradient(110% 90% at 100% 0%, rgba(160, 224, 171, 0.15) 0%, rgba(255, 172, 46, 0.08) 50%, transparent 75%)',
              }}
            />
            <div className="relative px-5 py-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-2">
                  <Target size={14} className="text-frost-white/70" strokeWidth={1.6} />
                  <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
                    Текущее окно
                  </span>
                  {status.released && (
                    <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-pill border border-[#a0e0ab]/40 bg-[#a0e0ab]/10 font-roobert text-[10px] uppercase tracking-[0.18em] text-[#a0e0ab]">
                      Цель достигнута · отпущено
                    </span>
                  )}
                </div>
                <ModeBadge mode={status.mode} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Прибыль казино" value={fmt(status.windowProfit)} unit="zł" />
                <Stat
                  label="Ожидалось"
                  value={fmt(expectedProfit)}
                  unit="zł"
                  muted
                />
                <Stat label="Оборот ставок" value={fmt(status.windowStake)} unit="zł" muted />
                <Stat
                  label="Сигнал"
                  value={status.signal.toFixed(2)}
                  unit=""
                  positive={status.signal > 0.05}
                  negative={status.signal < -0.05}
                />
              </div>

              {/* Window progress bar */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
                  <span>Прогресс окна</span>
                  <span className="tabular-nums">
                    {(progress * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-pill bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-pill"
                    style={{
                      width: `${progress * 100}%`,
                      background:
                        'linear-gradient(90deg, rgb(160, 224, 171), rgb(255, 172, 46) 60%, rgb(165, 45, 37))',
                    }}
                  />
                </div>
                <div className="flex items-center justify-between font-roobert text-[10px] text-whisper-gray tabular-nums">
                  <span>{new Date(status.windowStart).toLocaleString('ru-RU')}</span>
                  <span>→</span>
                  <span>{new Date(status.windowEnd).toLocaleString('ru-RU')}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mode picker */}
        <Section title="Режим" subtitle="Что должно делать казино за окно">
          <div className="grid grid-cols-3 gap-2">
            <ModeChip
              active={mode === 'off'}
              onClick={() => {
                setMode('off');
                setDirty(true);
              }}
              title="Выключен"
              hint="Только базовый edge"
            />
            <ModeChip
              active={mode === 'earn'}
              onClick={() => {
                setMode('earn');
                setDirty(true);
              }}
              title="Заработать"
              hint="Прибыль казино"
            />
            <ModeChip
              active={mode === 'give'}
              onClick={() => {
                setMode('give');
                setDirty(true);
              }}
              title="Отдать"
              hint="Игрокам в плюс"
            />
          </div>
          {dirty && (
            <p className="mt-3 font-roobert text-[11px] text-[#ff8a76]/85">
              Изменения не сохранены. Чтобы они вступили в силу, заполните
              причину ниже и нажмите «Сохранить».
            </p>
          )}
        </Section>

        {/* Target & window */}
        <Section
          title="Цель"
          subtitle={
            mode === 'give'
              ? 'Сумма, которую казино вернёт игрокам за окно'
              : 'Сумма, которую казино должно заработать за окно'
          }
        >
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
                Target, zł
              </span>
              <input
                type="number"
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  setDirty(true);
                }}
                disabled={mode === 'off'}
                className="bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[14px] tabular-nums text-frost-white focus:outline-none focus:border-white/30 disabled:opacity-50"
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
                Длительность окна
              </span>
              <div className="flex flex-wrap gap-2">
                {WINDOW_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => {
                      setWindowMs(p.ms);
                      setDirty(true);
                    }}
                    className={cn(
                      'px-3 py-1.5 rounded-pill border font-roobert text-[12px] transition-colors',
                      windowMs === p.ms
                        ? 'border-white/30 bg-white/[0.06] text-frost-white'
                        : 'border-white/10 bg-white/[0.03] text-frost-white/65'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Intensity */}
        <Section
          title="Сила воздействия"
          subtitle="0 — не вмешиваться, 1 — максимум"
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={intensity}
              onChange={(e) => {
                setIntensity(Number(e.target.value));
                setDirty(true);
              }}
              className="flex-1"
            />
            <span className="w-12 text-right font-roobert text-[14px] tabular-nums text-frost-white">
              {intensity.toFixed(2)}
            </span>
          </div>
          <p className="mt-2 font-roobert text-[11px] text-whisper-gray leading-relaxed">
            При intensity = {intensity.toFixed(2)} сила tilt'а
            пропорциональна сигналу — текущий сигнал {(status?.signal ?? 0).toFixed(2)}
            {' '}даёт примерно{' '}
            {((status?.signal ?? 0) * intensity * 100).toFixed(0)}% от
            максимума. Per-user cooldown ещё уменьшает индивидуальную
            нагрузку на игрока.
          </p>
        </Section>

        {/* Reset toggle */}
        <label className="rounded-card border border-white/10 bg-white/[0.03] px-4 py-3 flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={reset}
            onChange={(e) => setReset(e.target.checked)}
            className="w-4 h-4 accent-frost-white"
          />
          <RefreshCw size={14} className="text-frost-white/70" strokeWidth={1.6} />
          <div className="flex-1">
            <div className="font-roobert text-[13px] text-frost-white">
              Сбросить текущее окно
            </div>
            <div className="font-roobert text-[11px] text-whisper-gray">
              Стартует новое окно с нулевым P/L. Используйте при смене стратегии.
            </div>
          </div>
        </label>

        {/* Save row */}
        <div className="rounded-card border border-white/10 bg-white/[0.03] px-4 py-4 flex flex-col gap-2.5">
          <label className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
            Причина изменения (обязательно)
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            inputMode="text"
            placeholder="Например: «Запускаем недельную мягкую кампанию»"
            className="bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
          />
          <div className="flex items-center justify-between gap-2">
            {savedFlash && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-pill border border-emerald-400/40 bg-emerald-400/10 font-roobert text-[10px] uppercase tracking-[0.18em] text-emerald-200">
                Сохранено
              </span>
            )}
            {dirty && (
              <button
                type="button"
                onClick={() => {
                  setDirty(false);
                  void load(true);
                  setReason('');
                  setReset(false);
                }}
                className="px-3 py-2 rounded-pill border border-white/15 bg-white/[0.04] font-roobert text-[12px] uppercase tracking-[0.18em] text-frost-white/85"
              >
                Отменить
              </button>
            )}
            <button
              onClick={save}
              disabled={busy || reason.trim().length < 3}
              className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px] uppercase tracking-[0.22em] disabled:opacity-50 active:scale-95 transition-transform"
            >
              <Save size={13} strokeWidth={1.8} />
              {busy ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10">
        <div className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
          {title}
        </div>
        {subtitle && (
          <div className="mt-0.5 font-roobert text-[12px] text-whisper-gray">
            {subtitle}
          </div>
        )}
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function ModeBadge({ mode }: { mode: Mode }) {
  const map: Record<Mode, { label: string; cls: string }> = {
    off: { label: 'Выключен', cls: 'border-white/15 bg-white/[0.04] text-frost-white/70' },
    earn: {
      label: 'Заработать',
      cls: 'border-[#a0e0ab]/40 bg-[#a0e0ab]/10 text-[#a0e0ab]',
    },
    give: {
      label: 'Отдать',
      cls: 'border-[#ff8a76]/40 bg-[#ff8a76]/10 text-[#ff8a76]',
    },
  };
  const m = map[mode];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill border font-roobert text-[10px] uppercase tracking-[0.22em]',
        m.cls
      )}
    >
      <Sparkles size={10} strokeWidth={1.7} />
      {m.label}
    </span>
  );
}

function ModeChip({
  active,
  onClick,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-card border px-3 py-3 text-left transition-colors',
        active
          ? 'border-white/30 bg-white/[0.06]'
          : 'border-white/10 bg-white/[0.03] text-frost-white/85'
      )}
    >
      <div className="font-roobert text-[14px] text-frost-white">{title}</div>
      <div className="mt-0.5 font-roobert text-[11px] text-whisper-gray">{hint}</div>
    </button>
  );
}

function Stat({
  label,
  value,
  unit,
  muted,
  positive,
  negative,
}: {
  label: string;
  value: string;
  unit: string;
  muted?: boolean;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div>
      <div className="font-roobert text-[9px] uppercase tracking-[0.22em] text-whisper-gray">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 font-roobert text-[18px] font-light tabular-nums',
          muted
            ? 'text-frost-white/65'
            : positive
              ? 'text-[#a0e0ab]'
              : negative
                ? 'text-[#ff8a76]'
                : 'text-frost-white'
        )}
      >
        {value}
        {unit ? <span className="text-[12px] text-whisper-gray ml-1">{unit}</span> : null}
      </div>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}
