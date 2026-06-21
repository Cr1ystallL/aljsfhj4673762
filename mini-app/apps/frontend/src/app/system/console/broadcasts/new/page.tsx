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
}

export default function NewBroadcastPage() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [parseMode, setParseMode] = useState<'HTML' | 'Markdown' | 'none'>('HTML');
  const [mediaUrl, setMediaUrl] = useState('');
  const [buttons, setButtons] = useState<ButtonInput[]>([]);

  // Audience
  const [audMode, setAudMode] = useState<'all' | 'filter' | 'specific' | 'channel'>('all');
  const [minBalance, setMinBalance] = useState<string>('');
  const [regAfter, setRegAfter] = useState<string>(''); // ISO date string
  const [regBefore, setRegBefore] = useState<string>('');
  const [inactiveDays, setInactiveDays] = useState<string>('');
  const [specificIds, setSpecificIds] = useState<string>('');
  const [channelId, setChannelId] = useState<string>('');

  // Schedule
  const [sendNow, setSendNow] = useState(true);
  const [scheduledAt, setScheduledAt] = useState<string>('');

  // Reason
  const [reason, setReason] = useState('');

  // Preview
  const [preview, setPreview] = useState<{
    total: number;
    sample: Array<{ telegramId: number; name: string }>;
  } | null>(null);

  const [busy, setBusy] = useState(false);

  const buildAudience = (): AudienceFilter => {
    if (audMode === 'all') return { all: true };
    if (audMode === 'channel') {
      return { channelId: channelId.trim() };
    }
    if (audMode === 'specific') {
      const ids = specificIds
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n) && n > 0);
      return { telegramIds: ids };
    }
    const f: AudienceFilter = {};
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
        }
      } catch {
        // ignore
      }
    }, 350);
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audMode, minBalance, regAfter, regBefore, inactiveDays, specificIds]);

  const submit = async () => {
    if (text.trim().length < 1) {
      alert('Текст обязателен');
      return;
    }
    if (reason.trim().length < 3) {
      alert('Причина обязательна');
      return;
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
          <Field label="URL картинки (опционально)">
            <input
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="https://…"
              className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[12px] text-frost-white focus:outline-none focus:border-white/30"
            />
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
          <Field label="Тип">
            <div className="flex items-center gap-2 flex-wrap">
              {(
                [
                  ['all', 'Все игроки'],
                  ['filter', 'Фильтр'],
                  ['specific', 'Конкретные ID'],
                  ['channel', 'Канал / Группа'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setAudMode(key)}
                  className={`px-3 py-1 rounded-pill border font-roobert text-[12px] transition-colors ${
                    audMode === key
                      ? 'border-white/30 bg-white/[0.06] text-frost-white'
                      : 'border-white/10 bg-white/[0.03] text-frost-white/65'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          {audMode === 'filter' && (
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

          {audMode === 'specific' && (
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

          {audMode === 'channel' && (
            <Field label="ID Канала / Группы (или Username)">
              <input
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                placeholder="Например: -100123456789 или @channel"
                className="w-full bg-white/[0.04] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
              />
              <p className="text-whisper-gray mt-2 text-[11px] leading-tight">
                Бот должен состоять в этом канале/группе с правами администратора (или хотя бы правом писать сообщения), чтобы рассылка прошла успешно.
              </p>
            </Field>
          )}

          {/* Preview */}
          {preview && (
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

        {/* Schedule */}
        <Section
          title="Расписание"
          help={{
            title: 'Когда отправить',
            body: (
              <>
                <p>
                  По умолчанию — «Сейчас». Бот возьмёт задачу из очереди
                  в течение 10 секунд и начнёт рассылку с темпом
                  25 сообщений/сек.
                </p>
                <p>
                  Запланировать — выберите дату и время. Запись попадёт
                  в очередь, но обработается только когда время наступит.
                </p>
              </>
            ),
          }}
        >
          <Field label="Когда">
            <div className="flex items-center gap-2 flex-wrap">
              <button
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
