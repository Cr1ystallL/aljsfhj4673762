'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Trash2, Plus } from 'lucide-react';
import { HelpButton } from '@/components/admin/help-button';

/**
 * Admin → Broadcast composer.
 *
 * Three sections:
 *   1. Message — text + parse mode + optional image URL + up to 3 buttons.
 *   2. Audience — filters: all / regAfter / regBefore / minBalance /
 *                 inactiveDays / specific Telegram IDs. Live preview.
 *   3. Schedule — send now or pick a future timestamp.
 *
 * Submit creates the broadcast row; the Python worker picks it up
 * within 10 seconds.
 */

interface ButtonInput {
  text: string;
  url: string;
}

interface AudienceFilter {
  all?: boolean;
  minBalance?: number;
  regAfter?: number;
  regBefore?: number;
  inactiveDays?: number;
  telegramIds?: number[];
  channelId?: string;
  channels?: string[];
}

export default function NewBroadcastPage() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [parseMode, setParseMode] = useState<'HTML' | 'Markdown' | 'none'>('HTML');
  const [mediaUrl, setMediaUrl] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [buttons, setButtons] = useState<ButtonInput[]>([]);

  // Audience
  const [audModes, setAudModes] = useState<string[]>(['all']);
  const [minBalance, setMinBalance] = useState<string>('');
  const [regAfter, setRegAfter] = useState<string>(''); // ISO date string
  const [regBefore, setRegBefore] = useState<string>('');
  const [inactiveDays, setInactiveDays] = useState<string>('');
  const [specificIds, setSpecificIds] = useState<string>('');
  const [channelId, setChannelId] = useState<string>('');

  // Schedule
  const [sendNow, setSendNow] = useState(true);
  const [scheduledAt, setScheduledAt] = useState<string>('');

  // Type: Single vs Cyclical
  const [broadcastType, setBroadcastType] = useState<'single' | 'cyclical'>('single');
  const [intervalStr, setIntervalStr] = useState('01:00:00');
  const [hasUntilDate, setHasUntilDate] = useState(false);
  const [untilDate, setUntilDate] = useState<string>('');

  // Reason
  const [reason, setReason] = useState('');

  // Upload Error
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  // Preview
  const [preview, setPreview] = useState<{
    total: number;
    sample: Array<{ telegramId: number; name: string }>;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);

  const buildAudience = (): AudienceFilter => {
    const f: AudienceFilter = {};
    if (audModes.includes('all')) {
      f.all = true;
    }
    if (audModes.includes('channel') && channelId.trim()) {
      f.channels = channelId.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    }
    if (audModes.includes('specific')) {
      f.telegramIds = specificIds
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n) && n > 0);
    }
    if (audModes.includes('filter')) {
      if (minBalance) {
        const v = Number(minBalance);
        if (Number.isFinite(v) && v > 0) f.minBalance = v;
      }
      if (regAfter) f.regAfter = new Date(regAfter).getTime();
      if (regBefore) f.regBefore = new Date(regBefore).getTime();
      if (inactiveDays) {
        const v = Number(inactiveDays);
        if (Number.isFinite(v) && v > 0) f.inactiveDays = v;
      }
    }
    return f;
  };

  // Auto-refresh preview when audience changes.
  useEffect(() => {
    const handler = setTimeout(async () => {
      try {
        const res = await fetch('/api/_x/broadcasts/preview', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audience: buildAudience() }),
        });
        if (res.ok) {
          const j = await res.json();
          setPreview({ total: j.total, sample: j.sample });
          setPreviewError(null);
        } else {
          const j = await res.json().catch(() => null);
          setPreview({ total: 0, sample: [] });
          setPreviewError(j?.error || 'Ошибка проверки аудитории');
        }
      } catch {
        setPreviewError('Ошибка сети');
      }
    }, 350);
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audModes, minBalance, regAfter, regBefore, inactiveDays, specificIds, channelId]);

  const submit = async () => {
    if (text.trim().length < 1) {
      alert('Текст обязателен');
      return;
    }
    if (reason.trim().length < 3) {
      alert('Причина обязательна');
      return;
    }

    if (broadcastType === 'cyclical') {
      const match = intervalStr.trim().match(/^(\d{1,3}):(\d{2}):(\d{2})$/);
      if (!match) {
        alert('Интервал должен быть в формате ЧЧ:ММ:СС (например, 01:00:00)');
        return;
      }
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const s = parseInt(match[3], 10);
      if (m > 59 || s > 59) {
        alert('Минуты и секунды должны быть от 00 до 59');
        return;
      }
      if (h * 3600 + m * 60 + s < 30) {
        alert('Интервал повтора должен быть не менее 30 секунд');
        return;
      }
      if (hasUntilDate && untilDate) {
        const untilTime = new Date(untilDate).getTime();
        const startTime = sendNow || !scheduledAt ? Date.now() : new Date(scheduledAt).getTime();
        if (untilTime <= startTime) {
          alert('Дата окончания рассылки должна быть позже даты её начала');
          return;
        }
      }
    }

    const validButtons = buttons
      .filter((b) => b.text.trim() && b.url.trim())
      .slice(0, 3);

    setBusy(true);
    try {
      const res = await fetch('/api/_x/broadcasts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          parseMode,
          mediaUrl: mediaUrl.trim() || null,
          buttons: validButtons,
          audience: buildAudience(),
          scheduledAt:
            sendNow || !scheduledAt ? null : new Date(scheduledAt).getTime(),
          reason: reason.trim(),
          broadcastType,
          intervalStr: broadcastType === 'cyclical' ? intervalStr.trim() : null,
          untilDate:
            broadcastType === 'cyclical' && hasUntilDate && untilDate
              ? new Date(untilDate).getTime()
              : null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        alert(j?.error ?? 'Не удалось создать рассылку');
      } else {
        router.push('/system/console/broadcasts');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-5">
        {/* Message */}
        <Section
          title="Сообщение"
          help={{
            title: 'Содержание сообщения',
            body: (
              <>
                <p>
                  Текст до 4000 символов. Поддерживается HTML или Markdown
                  (Telegram Bot API). Без форматирования — выберите{' '}
                  <code>none</code>.
                </p>
                <p>
                  Опционально — URL картинки (тогда отправится фото с
                  подписью до 1024 символов) и до 3 inline-кнопок-ссылок.
                </p>
              </>
            ),
          }}
        >
          <Field label="Парсинг">
            <div className="flex items-center gap-2">
              {(['HTML', 'Markdown', 'none'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setParseMode(m)}
                  className={`px-3 py-1 rounded-pill border font-roobert text-[12px] transition-colors ${
                    parseMode === m
                      ? 'border-white/30 bg-white/[0.06] text-frost-white'
                      : 'border-white/10 bg-white/[0.03] text-frost-white/65'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Текст">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              maxLength={4000}
              placeholder="Используйте <b>HTML</b>, <i>курсив</i>, ссылки…"
              className="w-full bg-white/[0.04] border border-white/15 rounded-card px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
            />
            <div className="font-roobert text-[10px] text-whisper-gray text-right tabular-nums">
              {text.length} / 4000
            </div>
          </Field>
          <Field label="Картинка (опционально)">
            <input
              type="file"
              accept="image/*"
              disabled={uploadingMedia}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploadingMedia(true);
                setSubmitErr(null);
                try {
                  const formData = new FormData();
                  formData.append('file', file);
                  const res = await fetch('/api/_x/upload', {
                    method: 'POST',
                    body: formData,
                  });
                  const json = await res.json();
                  if (json.ok && json.url) setMediaUrl(json.url);
                  else setSubmitErr(json.error || 'Ошибка загрузки');
                } catch {
                  setSubmitErr('Ошибка загрузки');
                } finally {
                  setUploadingMedia(false);
                }
              }}
              className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[12px] text-frost-white focus:outline-none focus:border-white/30 file:mr-4 file:py-1 file:px-3 file:rounded-pill file:border-0 file:text-[12px] file:font-medium file:bg-white/10 file:text-white hover:file:bg-white/20"
            />
            {uploadingMedia && <div className="text-[12px] text-white/50 mt-1">Загрузка...</div>}
            {submitErr && <div className="text-[12px] text-red-400 mt-1">{submitErr}</div>}
            {mediaUrl.trim() && (
              <img
                src={mediaUrl.trim()}
                alt="Preview"
                className="mt-2 w-full h-32 object-cover rounded-card border border-white/10"
                referrerPolicy="no-referrer"
              />
            )}
          </Field>
          <Field label="Кнопки (до 3)">
            <div className="flex flex-col gap-2">
              {buttons.map((b, i) => (
                <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
                  <input
                    value={b.text}
                    onChange={(e) =>
                      setButtons((arr) => {
                        const next = [...arr];
                        next[i] = { ...next[i], text: e.target.value };
                        return next;
                      })
                    }
                    placeholder="Текст"
                    className="bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[12px] text-frost-white focus:outline-none"
                  />
                  <input
                    value={b.url}
                    onChange={(e) =>
                      setButtons((arr) => {
                        const next = [...arr];
                        next[i] = { ...next[i], url: e.target.value };
                        return next;
                      })
                    }
                    placeholder="https://…"
                    className="bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[12px] text-frost-white focus:outline-none"
                  />
                  <button
                    onClick={() =>
                      setButtons((arr) => arr.filter((_, j) => j !== i))
                    }
                    className="px-2.5 py-1.5 rounded-pill border border-white/15 bg-white/[0.04] text-frost-white/85"
                  >
                    <Trash2 size={11} strokeWidth={1.7} />
                  </button>
                </div>
              ))}
              {buttons.length < 3 && (
                <button
                  onClick={() =>
                    setButtons((arr) => [...arr, { text: '', url: '' }])
                  }
                  className="self-start inline-flex items-center gap-1 px-3 py-1.5 rounded-pill border border-white/15 bg-white/[0.04] hover:border-white/25 transition-colors font-roobert text-[11px] text-frost-white"
                >
                  <Plus size={11} strokeWidth={1.8} />
                  Добавить кнопку
                </button>
              )}
            </div>
          </Field>
        </Section>

        {/* Audience */}
        <Section
          title="Аудитория"
          help={{
            title: 'Кому отправить',
            body: (
              <>
                <p>
                  <strong>Все игроки</strong> — рассылка пойдёт каждому
                  активному (не заблокированному) пользователю.
                </p>
                <p>
                  <strong>Фильтр</strong> — комбинация: минимальный
                  баланс, период регистрации, неактивные больше N дней.
                  Все условия применяются через AND.
                </p>
                <p>
                  <strong>Конкретные ID</strong> — список Telegram ID
                  через запятую или пробел. Полезно для пилотных
                  рассылок и точечных уведомлений.
                </p>
                <p>
                  Заблокированные аккаунты исключаются автоматически.
                </p>
              </>
            ),
          }}
        >
          <Field label="Тип (можно выбрать несколько)">
            <div className="flex items-center gap-2 flex-wrap">
              {(
                [
                  ['all', 'Все игроки'],
                  ['filter', 'Фильтр'],
                  ['specific', 'Конкретные ID'],
                  ['channel', 'Каналы / Группы'],
                ] as const
              ).map(([key, label]) => {
                const isActive = audModes.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setAudModes((prev) => {
                        if (prev.includes(key)) {
                          if (prev.length === 1) return prev; // prevent empty
                          return prev.filter((k) => k !== key);
                        }
                        // Adding the key
                        if (key === 'all') return [...prev.filter((k) => k !== 'filter'), 'all'];
                        if (key === 'filter') return [...prev.filter((k) => k !== 'all'), 'filter'];
                        
                        return [...prev, key];
                      });
                    }}
                    className={`px-3 py-1 rounded-pill border font-roobert text-[12px] transition-colors ${
                      isActive
                        ? 'border-white/30 bg-white/[0.06] text-frost-white'
                        : 'border-white/10 bg-white/[0.03] text-frost-white/65'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </Field>

          {audModes.includes('filter') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Минимальный баланс, zł">
                <input
                  type="number"
                  step={1}
                  value={minBalance}
                  onChange={(e) => setMinBalance(e.target.value)}
                  className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[13px] tabular-nums text-frost-white focus:outline-none"
                />
              </Field>
              <Field label="Неактивные ≥ N дней">
                <input
                  type="number"
                  step={1}
                  value={inactiveDays}
                  onChange={(e) => setInactiveDays(e.target.value)}
                  className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[13px] tabular-nums text-frost-white focus:outline-none"
                />
              </Field>
              <Field label="Зарегистрированы после">
                <input
                  type="datetime-local"
                  value={regAfter}
                  onChange={(e) => setRegAfter(e.target.value)}
                  className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[12px] text-frost-white focus:outline-none"
                />
              </Field>
              <Field label="Зарегистрированы до">
                <input
                  type="datetime-local"
                  value={regBefore}
                  onChange={(e) => setRegBefore(e.target.value)}
                  className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[12px] text-frost-white focus:outline-none"
                />
              </Field>
            </div>
          )}

          {audModes.includes('specific') && (
            <Field label="Telegram IDs (через запятую или пробел)">
              <textarea
                value={specificIds}
                onChange={(e) => setSpecificIds(e.target.value)}
                rows={3}
                placeholder="123456789, 987654321"
                className="w-full bg-white/[0.04] border border-white/15 rounded-card px-3 py-2 font-roobert text-[12px] tabular-nums text-frost-white focus:outline-none focus:border-white/30"
              />
            </Field>
          )}

          {audModes.includes('channel') && (
            <Field label="ID Канала / Группы (или Username)">
              <input
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                placeholder="Например: -100123456789, @channel1, @channel2"
                className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
              />
              <p className="text-whisper-gray mt-2 text-[11px] leading-tight">
                Можно ввести несколько через запятую. Бот должен состоять в этих каналах/группах с правами писать сообщения.
              </p>
            </Field>
          )}

          {/* Preview Error */}
          {previewError && (
            <div className="rounded-card border border-red-500/20 bg-red-500/10 px-3 py-2.5">
              <span className="font-roobert text-[12px] text-red-400">
                {previewError}
              </span>
            </div>
          )}

          {/* Preview */}
          {preview && !previewError && (
            <div className="rounded-card border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="font-roobert text-[10px] uppercase tracking-[0.2em] text-whisper-gray">
                  Предпросмотр
                </span>
                <span className="font-roobert text-[14px] text-frost-white tabular-nums">
                  {preview.total.toLocaleString('ru-RU')} получ.
                </span>
              </div>
              {preview.sample.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {preview.sample.map((s) => (
                    <span
                      key={s.telegramId}
                      className="px-2 py-0.5 rounded-pill border border-white/10 bg-white/[0.04] font-roobert text-[10px] text-whisper-gray"
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </Section>

        {/* Schedule & Type */}
        <Section
          title="Тип и расписание"
          help={{
            title: 'Тип рассылки и расписание',
            body: (
              <>
                <p>
                  <strong>Одноразовая</strong> — отправляется один раз (сейчас или в указанную дату/время).
                </p>
                <p>
                  <strong>Цикличная</strong> — автоматически повторяется раз в указанный интервал (HH:MM:SS), например, раз в 1 час или 24 часа.
                </p>
                <p>
                  Для цикличной рассылки можно установить дату и время окончания. Если дата окончания не задана, она будет повторяться непрерывно, пока её не остановят вручную.
                </p>
                <p>
                  Любую рассылку можно остановить и удалить её сообщения из Telegram.
                </p>
              </>
            ),
          }}
        >
          <Field label="Тип рассылки">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setBroadcastType('single')}
                className={`px-3 py-1.5 rounded-pill border font-roobert text-[12px] transition-colors ${
                  broadcastType === 'single'
                    ? 'border-white/30 bg-white/[0.08] text-frost-white font-medium'
                    : 'border-white/10 bg-white/[0.03] text-frost-white/65'
                }`}
              >
                Одноразовая (по умолчанию)
              </button>
              <button
                type="button"
                onClick={() => setBroadcastType('cyclical')}
                className={`px-3 py-1.5 rounded-pill border font-roobert text-[12px] transition-colors ${
                  broadcastType === 'cyclical'
                    ? 'border-amber-400/40 bg-amber-400/10 text-amber-300 font-medium'
                    : 'border-white/10 bg-white/[0.03] text-frost-white/65'
                }`}
              >
                Цикличная (регулярная)
              </button>
            </div>
          </Field>

          {broadcastType === 'cyclical' && (
            <div className="rounded-card border border-amber-400/20 bg-amber-400/[0.04] p-3.5 flex flex-col gap-3">
              <Field label="Интервал повтора (HH:MM:SS)">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={intervalStr}
                      onChange={(e) => setIntervalStr(e.target.value)}
                      placeholder="01:00:00"
                      className="w-36 bg-white/[0.06] border border-white/20 rounded-pill px-3 py-1.5 font-mono text-[13px] text-amber-300 focus:outline-none focus:border-amber-400"
                    />
                    <span className="font-roobert text-[11px] text-whisper-gray">
                      Формат: ЧЧ:ММ:СС (часы : минуты : секунды)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-whisper-gray uppercase tracking-wider mr-1">Быстрый выбор:</span>
                    {[
                      { label: '30 мин', val: '00:30:00' },
                      { label: '1 час', val: '01:00:00' },
                      { label: '3 часа', val: '03:00:00' },
                      { label: '6 часов', val: '06:00:00' },
                      { label: '12 часов', val: '12:00:00' },
                      { label: '24 часа', val: '24:00:00' },
                    ].map((p) => (
                      <button
                        key={p.val}
                        type="button"
                        onClick={() => setIntervalStr(p.val)}
                        className={`px-2 py-0.5 rounded-pill border text-[10.5px] font-mono transition-colors ${
                          intervalStr === p.val
                            ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                            : 'border-white/10 bg-white/[0.02] text-whisper-gray hover:text-white'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </Field>

              <Field label="Ограничение по времени">
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hasUntilDate}
                      onChange={(e) => setHasUntilDate(e.target.checked)}
                      className="rounded border-white/20 bg-white/10 text-amber-400 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span className="font-roobert text-[12px] text-frost-white">
                      Установить дату и время окончания цикла (опционально)
                    </span>
                  </label>

                  {hasUntilDate ? (
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="datetime-local"
                        value={untilDate}
                        onChange={(e) => setUntilDate(e.target.value)}
                        className="bg-white/[0.06] border border-white/20 rounded-pill px-3 py-1.5 font-roobert text-[12px] text-frost-white focus:outline-none focus:border-amber-400"
                      />
                      <span className="font-roobert text-[11px] text-whisper-gray">
                        До этой даты и времени рассылка будет повторяться
                      </span>
                    </div>
                  ) : (
                    <p className="font-roobert text-[11px] text-amber-300/80">
                      Рассылка будет повторяться каждые {intervalStr} бессрочно — пока её не остановят вручную.
                    </p>
                  )}
                </div>
              </Field>
            </div>
          )}

          <Field label={broadcastType === 'cyclical' ? 'Первый запуск' : 'Когда отправить'}>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setSendNow(true)}
                className={`px-3 py-1 rounded-pill border font-roobert text-[12px] transition-colors ${
                  sendNow
                    ? 'border-white/30 bg-white/[0.06] text-frost-white'
                    : 'border-white/10 bg-white/[0.03] text-frost-white/65'
                }`}
              >
                Сейчас
              </button>
              <button
                type="button"
                onClick={() => setSendNow(false)}
                className={`px-3 py-1 rounded-pill border font-roobert text-[12px] transition-colors ${
                  !sendNow
                    ? 'border-white/30 bg-white/[0.06] text-frost-white'
                    : 'border-white/10 bg-white/[0.03] text-frost-white/65'
                }`}
              >
                Запланировать
              </button>
              {!sendNow && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[12px] text-frost-white focus:outline-none"
                />
              )}
            </div>
          </Field>
        </Section>

        {/* Reason + submit */}
        <div className="rounded-card border border-white/10 bg-white/[0.03] px-4 py-4 flex flex-col gap-2.5">
          <label className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
            Причина / комментарий (попадёт в аудит)
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Например: «Промо MacvJet — снизили edge на сегодня»"
            className="bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
          />
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="font-roobert text-[12px] text-whisper-gray hover:text-frost-white transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={submit}
              disabled={busy || text.trim().length < 1 || reason.trim().length < 3}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px] uppercase tracking-[0.22em] disabled:opacity-50"
            >
              <Send size={13} strokeWidth={1.8} />
              {busy ? 'Создание…' : sendNow ? 'Отправить' : 'Запланировать'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Section({
  title,
  help,
  children,
}: {
  title: string;
  help: { title: string; body: React.ReactNode };
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
          {title}
        </span>
        <HelpButton title={help.title} size={12}>
          {help.body}
        </HelpButton>
      </div>
      <div className="px-4 py-4 flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
        {label}
      </span>
      {children}
    </div>
  );
}
