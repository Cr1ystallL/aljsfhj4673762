'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Save } from 'lucide-react';
import { HelpButton } from '@/components/admin/help-button';
import { resolveGameKey, gameLabel } from '@/components/ui/game-icon';

/**
 * Admin → Games configuration.
 *
 * Surfaces every editable knob from `gameConfig` (Redis-backed):
 *   - paused flag
 *   - min / max bet
 *   - house edge (%)
 *   - per-game extras (countdown lengths, mine bounds, max payout, …)
 *
 * Every save requires a reason and writes to the audit log.
 *
 * Note about RTP / edge: house edge is the slice the casino keeps in
 * the long run. RTP = 100% - edge%. We expose edge directly because
 * that's what the engines apply mathematically; users see RTP because
 * that's what they intuit.
 */

type GameType = 'crash' | 'mines' | 'plinko' | 'coinflip' | 'wheel' | 'bridges' | 'blackjack';

interface GameCfg {
  paused: boolean;
  hidden: boolean;
  minBet: number;
  maxBet: number;
  houseEdge: number;
  extras?: Record<string, unknown>;
}

interface GamesResponse {
  ok: true;
  games: Array<{ gameType: GameType; config: GameCfg }>;
  defaults: Record<GameType, GameCfg>;
}

const ORDER: GameType[] = ['crash', 'mines', 'blackjack', 'plinko', 'coinflip', 'wheel', 'bridges'];

export default function GamesAdminPage() {
  const [data, setData] = useState<GamesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({ crash: true });

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/_x/games', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        setError('not-found');
        return;
      }
      const j = (await res.json()) as GamesResponse;
      setData(j);
      setError(null);
    } catch {
      setError('not-found');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (error) {
    return (
      <>
        <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-6 text-center font-roobert text-[12px] text-whisper-gray">
          Не удалось загрузить настройки.
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <div className="rounded-card border border-white/10 bg-white/[0.03] py-16 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border border-white/20 border-t-frost-white animate-spin" />
        </div>
      </>
    );
  }

  const games = ORDER.map(
    (t) => data.games.find((g) => g.gameType === t) || {
      gameType: t,
      config: data.defaults[t],
    }
  );

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
            Конфигурация
          </span>
          <HelpButton title="Как это работает" size={12}>
            <p>
              Все параметры применяются <strong>сразу</strong> к новым
              ставкам. Ставки, уже находящиеся в раунде (не закрытые),
              разыгрываются по тем параметрам, с которыми были приняты —
              изменения мгновенно во время раунда не влияют на исход.
            </p>
            <p>
              Если изменили <strong>RTP / house edge</strong> — затронутся
              все будущие ставки во всех режимах этой игры. Сохраняется
              в Redis, движок перечитывает с TTL 5 секунд.
            </p>
            <p>
              Каждое сохранение требует причину и пишется в аудит.
            </p>
          </HelpButton>
        </div>

        {games.map((g) => (
          <GameCard
            key={g.gameType}
            gameType={g.gameType}
            initial={g.config}
            isOpen={!!open[g.gameType]}
            onToggle={() =>
              setOpen((s) => ({ ...s, [g.gameType]: !s[g.gameType] }))
            }
            onSaved={reload}
          />
        ))}
      </div>
    </>
  );
}

function GameCard({
  gameType,
  initial,
  isOpen,
  onToggle,
  onSaved,
}: {
  gameType: GameType;
  initial: GameCfg;
  isOpen: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  // Editable form state — initialised from server, dirty when user
  // changes anything.
  const [form, setForm] = useState<GameCfg>(initial);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  const dirty =
    form.paused !== initial.paused ||
    form.hidden !== initial.hidden ||
    form.minBet !== initial.minBet ||
    form.maxBet !== initial.maxBet ||
    form.houseEdge !== initial.houseEdge ||
    JSON.stringify(form.extras ?? {}) !== JSON.stringify(initial.extras ?? {});

  const save = async () => {
    if (!dirty) return;
    if (reason.trim().length < 3) {
      alert('Причина обязательна (минимум 3 символа)');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/_x/games/${gameType}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, reason: reason.trim() }),
      });
      if (!res.ok) {
        alert('Не удалось сохранить');
      } else {
        setReason('');
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
        onSaved();
      }
    } finally {
      setBusy(false);
    }
  };

  const updateExtra = (key: string, value: unknown) => {
    setForm((f) => ({
      ...f,
      extras: { ...(f.extras ?? {}), [key]: value },
    }));
  };

  const rtp = (1 - form.houseEdge) * 100;

  return (
    <section className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-roobert text-[16px] text-frost-white">
            {gameLabel(resolveGameKey(gameType))}
          </span>
          {form.paused && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-pill border border-amber-400/40 bg-amber-400/10 font-roobert text-[10px] uppercase tracking-[0.18em] text-amber-200">
              На паузе
            </span>
          )}
          {form.hidden && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-pill border border-white/20 bg-white/[0.06] font-roobert text-[10px] uppercase tracking-[0.18em] text-frost-white">
              Скрыто
            </span>
          )}
          {dirty && !busy && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-pill border border-white/20 bg-white/[0.04] font-roobert text-[10px] uppercase tracking-[0.18em] text-frost-white">
              Не сохранено
            </span>
          )}
          {savedFlash && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-pill border border-emerald-400/40 bg-emerald-400/10 font-roobert text-[10px] uppercase tracking-[0.18em] text-emerald-200">
              Сохранено
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-roobert text-[11px] text-whisper-gray tabular-nums">
            RTP {rtp.toFixed(2)}%
          </span>
          {isOpen ? (
            <ChevronUp size={14} strokeWidth={1.7} />
          ) : (
            <ChevronDown size={14} strokeWidth={1.7} />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-white/5 px-4 py-4 flex flex-col gap-4">
          {/* Pause */}
          <Field
            label="Пауза игры"
            help={{
              title: 'Пауза игры',
              body: (
                <>
                  <p>
                    Когда включено, движок отказывает новым ставкам с
                    сообщением «Игра временно приостановлена
                    администратором».
                  </p>
                  <p>
                    Ставки, уже принятые до паузы, доигрываются нормально.
                    Снимите паузу — приём ставок возобновится.
                  </p>
                </>
              ),
            }}
          >
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, paused: !f.paused }))}
              className={`px-3 py-1.5 rounded-pill border font-roobert text-[12px] transition-colors ${
                form.paused
                  ? 'border-amber-400/50 bg-amber-400/15 text-amber-100'
                  : 'border-white/15 bg-white/[0.04] text-frost-white/85'
              }`}
            >
              {form.paused ? 'На паузе' : 'Играет'}
            </button>
          </Field>

          {/* Min/max bet */}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Мин. ставка (zł)"
              help={{
                title: 'Минимальная ставка',
                body: (
                  <p>
                    Нижняя граница ставки в этой игре. Если игрок
                    попробует поставить меньше — движок вернёт ошибку
                    «Минимальная ставка X».
                  </p>
                ),
              }}
            >
              <NumberInput
                value={form.minBet}
                step={1}
                min={0}
                onChange={(v) => setForm((f) => ({ ...f, minBet: v }))}
              />
            </Field>

            <Field
              label="Макс. ставка (zł)"
              help={{
                title: 'Максимальная ставка',
                body: (
                  <p>
                    Верхняя граница. Защищает казино от слишком крупных
                    одиночных ставок. Должна быть{' '}
                    <strong>не меньше</strong> минимальной.
                  </p>
                ),
              }}
            >
              <NumberInput
                value={form.maxBet}
                step={10}
                min={0}
                onChange={(v) => setForm((f) => ({ ...f, maxBet: v }))}
              />
            </Field>
          </div>

          {/* Hidden */}
          <Field
            label="Скрыть игру"
            help={{
              title: 'Скрытая игра',
              body: (
                <>
                  <p>Скрывает игру из лобби для всех, кроме админов.</p>
                  <p>Админы продолжают видеть и открывать игру для тестов.</p>
                </>
              ),
            }}
          >
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, hidden: !f.hidden }))}
              className={`px-3 py-1.5 rounded-pill border font-roobert text-[12px] transition-colors ${
                form.hidden
                  ? 'border-white/30 bg-white/[0.08] text-frost-white'
                  : 'border-white/15 bg-white/[0.04] text-frost-white/85'
              }`}
            >
              {form.hidden ? 'Скрыто' : 'Видно всем'}
            </button>
          </Field>

          {/* House edge */}
          <Field
            label="House Edge"
            help={{
              title: 'House Edge / RTP',
              body: (
                <>
                  <p>
                    <strong>House Edge</strong> — доля, которую казино
                    удерживает в долгосрочной перспективе от каждой
                    ставки. 0.01 = 1% (стандарт индустрии для
                    провайдер-фер игр).
                  </p>
                  <p>
                    <strong>RTP</strong> = 100% − Edge. При edge 1% игроки
                    в среднем получают 99% обратно — на короткой
                    дистанции возможны большие отклонения.
                  </p>
                  <p>
                    Меняя edge выше — увеличиваете прибыль казино, но
                    игра становится менее привлекательной для игроков.
                    Хардкап на стороне сервера: 50%.
                  </p>
                </>
              ),
            }}
          >
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={1.0}
                step={0.001}
                value={form.houseEdge}
                onChange={(e) =>
                  setForm((f) => ({ ...f, houseEdge: parseFloat(e.target.value) }))
                }
                className="flex-1 accent-frost-white"
              />
              <span className="font-roobert text-[13px] tabular-nums text-frost-white w-20 text-right">
                {(form.houseEdge * 100).toFixed(2)}%
              </span>
            </div>
          </Field>

          {/* Game-specific extras */}
          {gameType === 'crash' && (
            <Field
              label="Приём ставок (с)"
              help={{
                title: 'Длина окна ставок',
                body: (
                  <>
                    <p>
                      Сколько секунд между раундами длится приём ставок.
                      Дольше = игроки успевают подумать; короче =
                      больше раундов в час.
                    </p>
                    <p>
                      Между раундами нет обратного отсчёта — как только
                      окно ставок закрывается, кривая стартует сразу.
                    </p>
                  </>
                ),
              }}
            >
              <NumberInput
                value={Number(form.extras?.waitingPhaseSeconds ?? 15)}
                step={1}
                min={3}
                max={120}
                onChange={(v) => updateExtra('waitingPhaseSeconds', v)}
              />
            </Field>
          )}

          {gameType === 'mines' && (
            <div className="grid grid-cols-3 gap-3">
              <Field
                label="Мин. мин"
                help={{
                  title: 'Минимальное количество мин',
                  body: (
                    <p>
                      Нижняя граница количества мин которое может выбрать
                      игрок. Меньше мин = выше шанс пройти много шагов,
                      но мультипликатор растёт медленнее.
                    </p>
                  ),
                }}
              >
                <NumberInput
                  value={Number(form.extras?.minMines ?? 1)}
                  step={1}
                  min={1}
                  max={24}
                  onChange={(v) => updateExtra('minMines', v)}
                />
              </Field>
              <Field
                label="Макс. мин"
                help={{
                  title: 'Максимальное количество мин',
                  body: (
                    <p>
                      Верхняя граница. До 24 (поле 5×5 = 25 клеток, 1
                      должна остаться безопасной).
                    </p>
                  ),
                }}
              >
                <NumberInput
                  value={Number(form.extras?.maxMines ?? 24)}
                  step={1}
                  min={1}
                  max={24}
                  onChange={(v) => updateExtra('maxMines', v)}
                />
              </Field>
              <Field
                label="Лимит выплат"
                help={{
                  title: 'Лимит на выплату за раунд',
                  body: (
                    <p>
                      Защита от джекпотов: даже если игрок собрал бы
                      огромный мультипликатор, выплата ограничена этим
                      числом. Защищает от непреднамеренных огромных
                      выплат.
                    </p>
                  ),
                }}
              >
                <NumberInput
                  value={Number(form.extras?.maxPayout ?? 1_000_000)}
                  step={1000}
                  min={0}
                  onChange={(v) => updateExtra('maxPayout', v)}
                />
              </Field>
            </div>
          )}

          {gameType === 'plinko' && (
            <Field
              label="Лимит выплат"
              help={{
                title: 'Лимит выплат',
                body: (
                  <p>
                    Верхний предел выплаты на один шар. Полезно при
                    высоких мультипликаторах в режиме «Hard».
                  </p>
                ),
              }}
            >
              <NumberInput
                value={Number(form.extras?.maxPayout ?? 1_000_000)}
                step={1000}
                min={0}
                onChange={(v) => updateExtra('maxPayout', v)}
              />
            </Field>
          )}

          {gameType === 'coinflip' && (
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Шаг множителя"
                help={{
                  title: 'Шаг множителя',
                  body: (
                    <p>
                      Во сколько раз растёт ставка при каждом успешном
                      броске в режиме «С умножением». Стандартное
                      значение 1.94 = 2× минус 3% house edge.
                    </p>
                  ),
                }}
              >
                <NumberInput
                  value={Number(form.extras?.stepMultiplier ?? 1.94)}
                  step={0.01}
                  min={1}
                  onChange={(v) => updateExtra('stepMultiplier', v)}
                />
              </Field>
              <Field
                label="Макс. раундов"
                help={{
                  title: 'Максимум раундов в серии',
                  body: (
                    <p>
                      Лимит длины серии в режиме «С умножением».
                      Защищает казино от теоретически бесконечных серий.
                    </p>
                  ),
                }}
              >
                <NumberInput
                  value={Number(form.extras?.maxRounds ?? 20)}
                  step={1}
                  min={1}
                  max={100}
                  onChange={(v) => updateExtra('maxRounds', v)}
                />
              </Field>
            </div>
          )}

          {gameType === 'wheel' && (
            <Field
              label="Приём ставок (с)"
              help={{
                title: 'Длина окна ставок',
                body: (
                  <p>
                    Сколько секунд между раундами длится приём ставок.
                    Между спинами нет обратного отсчёта — раунд стартует
                    сразу. Длительность самого спина рандомизируется
                    8–15 секунд автоматически.
                  </p>
                ),
              }}
            >
              <NumberInput
                value={Number(form.extras?.waitingPhaseSeconds ?? 9)}
                step={1}
                min={3}
                max={60}
                onChange={(v) => updateExtra('waitingPhaseSeconds', v)}
              />
            </Field>
          )}

          {gameType === 'bridges' && (
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Рядов"
                help={{
                  title: 'Количество рядов в мостах',
                  body: (
                    <p>
                      Сколько рядов нужно пройти от старта до финиша.
                      Стандарт — 5. Менять не рекомендуется, т.к.
                      лестница множителей рассчитана под 5 рядов.
                    </p>
                  ),
                }}
              >
                <NumberInput
                  value={Number(form.extras?.rows ?? 5)}
                  step={1}
                  min={3}
                  max={10}
                  onChange={(v) => updateExtra('rows', v)}
                />
              </Field>
              <Field
                label="Ячеек в ряду"
                help={{
                  title: 'Количество ячеек в ряду',
                  body: (
                    <p>
                      Сколько досок в каждом ряду. По умолчанию 4.
                      Меняет вероятности: больше ячеек = легче пройти.
                    </p>
                  ),
                }}
              >
                <NumberInput
                  value={Number(form.extras?.cells ?? 4)}
                  step={1}
                  min={2}
                  max={8}
                  onChange={(v) => updateExtra('cells', v)}
                />
              </Field>
            </div>
          )}

          {/* Reason + save */}
          <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
            <label className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
              Причина изменения (обязательно)
            </label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Например: «Снижаем edge в Crash на промо»"
              className="bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
            />
            <button
              onClick={save}
              disabled={busy || !dirty || reason.trim().length < 3}
              className="self-end inline-flex items-center gap-2 px-4 py-2 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px] uppercase tracking-[0.22em] disabled:opacity-50"
            >
              <Save size={13} strokeWidth={1.8} />
              {busy ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  children,
  help,
}: {
  label: string;
  children: React.ReactNode;
  help?: { title: string; body: React.ReactNode };
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
          {label}
        </span>
        {help && (
          <HelpButton title={help.title} size={11}>
            {help.body}
          </HelpButton>
        )}
      </div>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  step,
  min,
  max,
  onChange,
}: {
  value: number;
  step: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      step={step}
      min={min}
      max={max}
      value={value}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      className="bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[13px] tabular-nums text-frost-white focus:outline-none focus:border-white/30"
    />
  );
}
