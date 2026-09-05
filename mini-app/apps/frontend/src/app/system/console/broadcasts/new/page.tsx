'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Send,
  Trash2,
  Plus,
  GripVertical,
  Sparkles,
  Trophy,
  ArrowDown,
  ArrowUp,
  ClipboardCopy,
} from 'lucide-react';
import { HelpButton } from '@/components/admin/help-button';

type ButtonColor =
  | 'default'
  | 'green'
  | 'blue'
  | 'yellow'
  | 'red'
  | 'purple'
  | 'orange';

interface ComposerButton {
  id: string;
  text: string;
  url: string;
  color: ButtonColor;
}

const BUTTON_COLOR_CONFIG: Record<
  ButtonColor,
  { label: string; bgClass: string; borderClass: string; textClass: string; badge: string }
> = {
  default: {
    label: 'Стандартная',
    bgClass: 'bg-white/[0.06]',
    borderClass: 'border-white/20',
    textClass: 'text-white/80',
    badge: 'border-white/20 bg-white/10 text-white/70',
  },
  green: {
    label: 'Изумрудный',
    bgClass: 'bg-emerald-500/15',
    borderClass: 'border-emerald-500/40',
    textClass: 'text-emerald-400',
    badge: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  },
  blue: {
    label: 'Синий',
    bgClass: 'bg-sky-500/15',
    borderClass: 'border-sky-500/40',
    textClass: 'text-sky-400',
    badge: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
  },
  yellow: {
    label: 'Золотой',
    bgClass: 'bg-amber-500/15',
    borderClass: 'border-amber-500/40',
    textClass: 'text-amber-400',
    badge: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  },
  red: {
    label: 'Красный',
    bgClass: 'bg-rose-500/15',
    borderClass: 'border-rose-500/40',
    textClass: 'text-rose-400',
    badge: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
  },
  purple: {
    label: 'Фиолетовый',
    bgClass: 'bg-purple-500/15',
    borderClass: 'border-purple-500/40',
    textClass: 'text-purple-400',
    badge: 'border-purple-500/40 bg-purple-500/15 text-purple-300',
  },
  orange: {
    label: 'Оранжевый',
    bgClass: 'bg-orange-500/15',
    borderClass: 'border-orange-500/40',
    textClass: 'text-orange-400',
    badge: 'border-orange-500/40 bg-orange-500/15 text-orange-300',
  },
};

const DEFAULT_WHEEL_TEMPLATE = `🍁 <b>ОСЕННИЙ ТУРНИР ПО WHEEL В MACVBET!</b> 🍁

Первый осенний турнир по Wheel уже в разгаре! Вращай колесо фортуны, выбивай максимальные иксы и забирай свой куш! 🎡🚀

<blockquote>🏆 <b>ПРИЗОВОЙ ФОНД — 555 ZŁ:</b>

🥇 <b>1 место</b> ➔ 🎁 <b>111 zł</b> на баланс
🥈 <b>2 место</b> ➔ 🎁 <b>111 zł</b> на баланс
🥉 <b>3 место</b> ➔ 🎁 <b>111 zł</b> на баланс
🏅 <b>4 место</b> ➔ 🎁 <b>111 zł</b> на баланс
🏅 <b>5 место</b> ➔ 🎁 <b>111 zł</b> на баланс

⚡️ <b>5 победителей</b></blockquote>

<blockquote>🔥 <b>АКТУАЛЬНЫЙ ТОП-5 ЛИДЕРОВ:</b>
{wheel_leaders}</blockquote>

⚠️ <b>Анти-AFK правило:</b>
Для получения призов нужно сделать <b>минимум 5 ставок</b> в колесе! Игроки с 0–4 ставками не квалифицируются.

👇 <i>Жми кнопку ниже и залетай в турнир:</i>`;

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [text, setText] = useState('');
  const [parseMode, setParseMode] = useState<'HTML' | 'Markdown' | 'none'>('HTML');
  const [mediaUrl, setMediaUrl] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // Multi-row buttons with colors & drag & drop
  const [buttonRows, setButtonRows] = useState<ComposerButton[][]>([]);
  const [draggedBtn, setDraggedBtn] = useState<{ rowIdx: number; btnIdx: number } | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ rowIdx: number; btnIdx: number } | null>(null);
  const [isOverNewRowZone, setIsOverNewRowZone] = useState(false);

  // Premium Emoji Modal / Helper
  const [emojiModalOpen, setEmojiModalOpen] = useState(false);
  const [customEmojiIdInput, setCustomEmojiIdInput] = useState('');
  const [customEmojiFallbackInput, setCustomEmojiFallbackInput] = useState('');

  // Audience
  const [audModes, setAudModes] = useState<string[]>(['all']);
  const [minBalance, setMinBalance] = useState<string>('');
  const [regAfter, setRegAfter] = useState<string>('');
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

  // Audience Preview
  const [preview, setPreview] = useState<{
    total: number;
    sample: Array<{ telegramId: number; name: string }>;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);

  const totalButtonsCount = buttonRows.reduce((sum, r) => sum + r.length, 0);

  const buildAudience = (): AudienceFilter => {
    const f: AudienceFilter = {};
    if (audModes.includes('all')) {
      f.all = true;
    }
    if (audModes.includes('channel') && channelId.trim()) {
      f.channels = channelId.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
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

  // Auto-refresh audience preview
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

  // Insert tag helper into textarea
  const insertTagAtCursor = (tagToInsert: string) => {
    if (!textareaRef.current) {
      setText((prev) => prev + tagToInsert);
      return;
    }
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const updated = text.substring(0, start) + tagToInsert + text.substring(end);
    setText(updated);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + tagToInsert.length, start + tagToInsert.length);
    }, 50);
  };

  // Button management methods
  const createNewBtn = (color: ButtonColor = 'default'): ComposerButton => ({
    id: `btn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    text: '',
    url: '',
    color,
  });

  const addButtonToRow = (rowIdx: number) => {
    if (totalButtonsCount >= 8) {
      alert('Максимум 8 кнопок в рассылке');
      return;
    }
    setButtonRows((prev) => {
      const next = prev.map((r) => [...r]);
      if (next[rowIdx] && next[rowIdx].length < 4) {
        next[rowIdx].push(createNewBtn());
      }
      return next;
    });
  };

  const addNewRow = () => {
    if (totalButtonsCount >= 8) {
      alert('Максимум 8 кнопок в рассылке');
      return;
    }
    if (buttonRows.length >= 6) {
      alert('Максимум 6 рядов кнопок');
      return;
    }
    setButtonRows((prev) => [...prev, [createNewBtn()]]);
  };

  const updateButton = (
    rowIdx: number,
    btnIdx: number,
    patch: Partial<ComposerButton>
  ) => {
    setButtonRows((prev) => {
      const next = prev.map((r) => [...r]);
      if (next[rowIdx] && next[rowIdx][btnIdx]) {
        next[rowIdx][btnIdx] = { ...next[rowIdx][btnIdx], ...patch };
      }
      return next;
    });
  };

  const removeButton = (rowIdx: number, btnIdx: number) => {
    setButtonRows((prev) => {
      const next = prev.map((r) => [...r]);
      if (next[rowIdx]) {
        next[rowIdx].splice(btnIdx, 1);
        if (next[rowIdx].length === 0) {
          next.splice(rowIdx, 1);
        }
      }
      return next;
    });
  };

  const moveButtonToNewRow = (rowIdx: number, btnIdx: number) => {
    if (buttonRows.length >= 6) {
      alert('Максимум 6 рядов кнопок');
      return;
    }
    setButtonRows((prev) => {
      const next = prev.map((r) => [...r]);
      const [btn] = next[rowIdx].splice(btnIdx, 1);
      if (next[rowIdx].length === 0) {
        next.splice(rowIdx, 1);
      }
      next.push([btn]);
      return next;
    });
  };

  const moveButtonUpRow = (rowIdx: number, btnIdx: number) => {
    if (rowIdx <= 0) return;
    setButtonRows((prev) => {
      const next = prev.map((r) => [...r]);
      if (next[rowIdx - 1].length >= 4) {
        alert('В одном ряду не может быть больше 4 кнопок');
        return prev;
      }
      const [btn] = next[rowIdx].splice(btnIdx, 1);
      if (next[rowIdx].length === 0) {
        next.splice(rowIdx, 1);
      }
      next[rowIdx - 1].push(btn);
      return next;
    });
  };

  const moveButtonDownRow = (rowIdx: number, btnIdx: number) => {
    if (rowIdx >= buttonRows.length - 1) {
      moveButtonToNewRow(rowIdx, btnIdx);
      return;
    }
    setButtonRows((prev) => {
      const next = prev.map((r) => [...r]);
      if (next[rowIdx + 1].length >= 4) {
        alert('В одном ряду не может быть больше 4 кнопок');
        return prev;
      }
      const [btn] = next[rowIdx].splice(btnIdx, 1);
      if (next[rowIdx].length === 0) {
        next.splice(rowIdx, 1);
      }
      next[rowIdx + 1].push(btn);
      return next;
    });
  };

  // Drag and drop handlers
  const handleDragStart = (rowIdx: number, btnIdx: number) => {
    setDraggedBtn({ rowIdx, btnIdx });
  };

  const handleDragOver = (e: React.DragEvent, rowIdx: number, btnIdx: number) => {
    e.preventDefault();
    setDragOverTarget({ rowIdx, btnIdx });
  };

  const handleDropOnButton = (toRow: number, toBtn: number) => {
    if (!draggedBtn) return;
    const { rowIdx: fromRow, btnIdx: fromBtn } = draggedBtn;
    if (fromRow === toRow && fromBtn === toBtn) {
      setDraggedBtn(null);
      setDragOverTarget(null);
      return;
    }

    setButtonRows((prev) => {
      const next = prev.map((r) => [...r]);
      const [btn] = next[fromRow].splice(fromBtn, 1);
      if (next[fromRow].length === 0 && fromRow !== toRow) {
        next.splice(fromRow, 1);
        const adjustedToRow = fromRow < toRow ? toRow - 1 : toRow;
        next[adjustedToRow].splice(toBtn, 0, btn);
      } else {
        next[toRow].splice(toBtn, 0, btn);
      }
      return next;
    });

    setDraggedBtn(null);
    setDragOverTarget(null);
  };

  const handleDropOnNewRowZone = () => {
    if (!draggedBtn) return;
    if (buttonRows.length >= 6) {
      alert('Максимум 6 рядов кнопок');
      setDraggedBtn(null);
      setIsOverNewRowZone(false);
      return;
    }
    const { rowIdx: fromRow, btnIdx: fromBtn } = draggedBtn;
    setButtonRows((prev) => {
      const next = prev.map((r) => [...r]);
      const [btn] = next[fromRow].splice(fromBtn, 1);
      if (next[fromRow].length === 0) {
        next.splice(fromRow, 1);
      }
      next.push([btn]);
      return next;
    });
    setDraggedBtn(null);
    setIsOverNewRowZone(false);
  };

  // Preset Template: Wheel tournament
  const applyWheelTournamentPreset = () => {
    setText(DEFAULT_WHEEL_TEMPLATE);
    setParseMode('HTML');
    setBroadcastType('cyclical');
    setIntervalStr('01:00:00');
    setReason('Циклическое напоминание о турнире Wheel с live-лидерами');
    setButtonRows([
      [
        {
          id: 'btn_wheel_play',
          text: '🎡 Крутить Wheel',
          url: 'https://t.me/macvbet_bot/app?startapp=wheel',
          color: 'default',
        },
      ],
      [
        {
          id: 'btn_wheel_leaders',
          text: '🏆 Таблица лидеров',
          url: 'https://t.me/macvbet_bot/app?startapp=tournaments',
          color: 'default',
        },
        {
          id: 'btn_wheel_chat',
          text: '💬 Чат игроков',
          url: 'https://t.me/macvbet_chat',
          color: 'default',
        },
      ],
    ]);
  };

  // Paste Copied Template from localStorage
  const pasteCopiedTemplate = () => {
    try {
      const raw = localStorage.getItem('macvbet_broadcast_template');
      if (!raw) {
        alert(
          'В памяти нет скопированного шаблона.\nСначала нажмите «Скопировать шаблон» на карточке нужной рассылки в списке рассылок.'
        );
        return;
      }
      const data = JSON.parse(raw);
      if (typeof data.text === 'string') setText(data.text);
      if (data.parseMode && ['HTML', 'Markdown', 'none'].includes(data.parseMode)) {
        setParseMode(data.parseMode);
      }
      if (typeof data.mediaUrl === 'string') setMediaUrl(data.mediaUrl);
      if (data.broadcastType === 'single' || data.broadcastType === 'cyclical') {
        setBroadcastType(data.broadcastType);
      }
      if (typeof data.intervalStr === 'string' && data.intervalStr) {
        setIntervalStr(data.intervalStr);
      }
      if (typeof data.hasUntilDate === 'boolean') {
        setHasUntilDate(data.hasUntilDate);
      }
      if (typeof data.untilDate === 'string') {
        setUntilDate(data.untilDate);
      }
      if (typeof data.reason === 'string') {
        setReason(data.reason);
      }

      if (data.buttons) {
        if (Array.isArray(data.buttons)) {
          if (data.buttons.length > 0 && Array.isArray(data.buttons[0])) {
            const rows: ComposerButton[][] = (data.buttons as any[][]).map((row, rIdx) =>
              row.map((btn, bIdx) => ({
                id: `pasted_${rIdx}_${bIdx}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                text: String(btn.text || ''),
                url: String(btn.url || ''),
                color: (btn.color || 'default') as ButtonColor,
              }))
            );
            setButtonRows(rows);
          } else {
            const flat: ComposerButton[] = (data.buttons as any[]).map((btn, bIdx) => ({
              id: `pasted_0_${bIdx}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              text: String(btn.text || ''),
              url: String(btn.url || ''),
              color: (btn.color || 'default') as ButtonColor,
            }));
            setButtonRows([flat]);
          }
        }
      }
      alert('Скопированный шаблон успешно вставлен!');
    } catch {
      alert('Не удалось применить скопированный шаблон');
    }
  };

  // Submit broadcast
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

    // Build 2D buttons payload
    const validButtonRows = buttonRows
      .map((row, rowIdx) =>
        row
          .filter((b) => b.text.trim() && b.url.trim())
          .map((b) => ({
            text: b.text.trim(),
            url: b.url.trim(),
            color: b.color !== 'default' ? b.color : undefined,
            row: rowIdx,
          }))
      )
      .filter((row) => row.length > 0);

    const totalValidButtons = validButtonRows.reduce((sum, r) => sum + r.length, 0);
    if (totalValidButtons > 8) {
      alert('Максимум 8 кнопок в сумме');
      return;
    }

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
          buttons: validButtonRows.length > 0 ? validButtonRows : null,
          audience: buildAudience(),
          scheduledAt: sendNow || !scheduledAt ? null : new Date(scheduledAt).getTime(),
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

  // Parse text for Live Telegram Preview
  const renderPreviewText = (raw: string) => {
    if (!raw) return <span className="text-white/30 italic">Текст сообщения пуст...</span>;

    let processed = raw;

    // Leaderboard preview simulation (555 zł pool: 200, 125, 100, 75, 55 zł)
    const mockLeadersHtml =
      `🥇 <b>@crypto_king</b> — <code>24 500 pts</code> (~200 zł)\n` +
      `🥈 <b>@fortune_spin</b> — <code>18 200 pts</code> (~125 zł)\n` +
      `🥉 <b>@lucky_strike</b> — <code>14 000 pts</code> (~100 zł)\n` +
      `4️⃣ <b>@spin_master</b> — <code>9 800 pts</code> (~75 zł)\n` +
      `5️⃣ <b>@jackpot_hunt</b> — <code>6 400 pts</code> (~55 zł)`;

    processed = processed
      .replace(/{wheel_leaders}|{leaders}|{wheel_top5}|{top5}/g, mockLeadersHtml);

    // Custom emoji preview simulation: {ID} or {ID:fallback} -> badge
    processed = processed.replace(
      /\{(?:emoji:|tg-emoji:)?(\d{6,25})(?::([^}\n]+))?\}/g,
      (_m, id, fb) =>
        `<span class="inline-flex items-center gap-1 px-1 py-0.5 rounded bg-amber-400/20 text-amber-300 font-mono text-[11px] border border-amber-400/30" title="Telegram Premium Emoji ID: ${id}">${fb || '✨'} [TG-Emoji]</span>`
    );

    // Telegram blockquote
    processed = processed
      .replace(/<blockquote>/gi, '<div class="my-2 border-l-2 border-[#54a9eb] bg-[#54a9eb]/10 pl-3 py-1.5 rounded-r text-[13px] leading-relaxed">')
      .replace(/<\/blockquote>/gi, '</div>');

    return (
      <div
        className="font-roobert text-[13.5px] leading-relaxed text-white whitespace-pre-wrap break-words"
        dangerouslySetInnerHTML={{ __html: processed }}
      />
    );
  };

  return (
    <>
      <div className="flex flex-col gap-6 max-w-5xl">
        {/* Quick Presets Bar */}
        <div className="flex items-center justify-between flex-wrap gap-2.5 rounded-card border border-amber-400/25 bg-amber-400/[0.04] p-3">
          <div className="flex items-center gap-2">
            <Trophy size={16} className="text-amber-400" />
            <span className="font-roobert text-[12.5px] text-frost-white font-medium">
              Готовые шаблоны и помощники
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={pasteCopiedTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill border border-emerald-400/40 bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/25 font-roobert text-[11.5px] font-medium transition-all shadow-[0_0_15px_rgba(52,211,153,0.15)]"
              title="Вставить скопированный ранее шаблон (текст, кнопки, медиа, тип)"
            >
              <ClipboardCopy size={13} />
              📋 Вставить скопированный шаблон
            </button>
            <button
              type="button"
              onClick={applyWheelTournamentPreset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill border border-amber-400/40 bg-amber-400/15 text-amber-300 hover:bg-amber-400/25 font-roobert text-[11.5px] font-medium transition-all"
            >
              🎡 Шаблон: Осенний турнир Wheel (555 zł)
            </button>
            <button
              type="button"
              onClick={() => insertTagAtCursor('<blockquote>{wheel_leaders}</blockquote>')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill border border-white/15 bg-white/[0.04] hover:bg-white/10 text-frost-white font-roobert text-[11.5px] transition-all"
            >
              🏆 Вставить блок лидеров Wheel
            </button>
            <button
              type="button"
              onClick={() => setEmojiModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill border border-white/15 bg-white/[0.04] hover:bg-white/10 text-frost-white font-roobert text-[11.5px] transition-all"
            >
              ⭐ Вставить Premium эмодзи
            </button>
          </div>
        </div>

        {/* Message Content Section */}
        <Section
          title="Сообщение"
          help={{
            title: 'Содержание сообщения и форматирование',
            body: (
              <>
                <p>
                  Текст до 4000 символов. Поддерживается HTML или Markdown (Telegram Bot API).
                </p>
                <p>
                  <b>Тег лидеров Wheel:</b> используйте <code>{'<blockquote>{wheel_leaders}</blockquote>'}</code>. Бот автоматически заполнит его топ-5 участниками турнира из базы данных при каждой отправке!
                </p>
                <p>
                  <b>Telegram Premium эмодзи:</b> укажите <code>{'{ID_ЭМОДЗИ}'}</code> (например, <code>{'{5368324170671202286}'}</code>) или <code>{'{ID:ФОЛЛБЭК}'}</code> (например, <code>{'{5368324170671202286:🔥}'}</code>). Бот сконвертирует это в <code>{'<tg-emoji>'}</code>.
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
                  type="button"
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

          <Field label="Текст рассылки">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px] text-whisper-gray">
                <span>
                  Поддерживаются <code>&lt;b&gt;</code>, <code>&lt;i&gt;</code>, <code>&lt;blockquote&gt;</code>, тег <code>{'{wheel_leaders}'}</code> и Premium эмодзи <code>{'{ID_ЭМОДЗИ}'}</code>
                </span>
                <span className="tabular-nums">{text.length} / 4000</span>
              </div>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                maxLength={4000}
                placeholder="Используйте <b>HTML</b>, <blockquote>{wheel_leaders}</blockquote>, {5368324170671202286}…"
                className="w-full bg-white/[0.04] border border-white/15 rounded-card px-3 py-2 font-mono text-[12.5px] leading-relaxed text-frost-white focus:outline-none focus:border-white/30"
              />
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
              <div className="relative mt-2 group">
                <img
                  src={mediaUrl.trim()}
                  alt="Preview"
                  className="w-full max-h-48 object-cover rounded-card border border-white/10"
                  referrerPolicy="no-referrer"
                />
                <button
                  type="button"
                  onClick={() => setMediaUrl('')}
                  className="absolute top-2 right-2 px-2 py-1 rounded bg-black/70 text-white text-[10px] hover:bg-black"
                >
                  Удалить
                </button>
              </div>
            )}
          </Field>

          {/* Multi-Row Drag & Drop Buttons Builder */}
          <Field label={`Инлайн-кнопки (${totalButtonsCount}/8 кнопок)`}>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-[11px] text-whisper-gray">
                <span>
                  Располагайте кнопки по рядам (до 4 кнопок в ряду). Перетаскивайте мышкой (Drag & Drop) или используйте стрелки управления рядом.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={addNewRow}
                    disabled={totalButtonsCount >= 8 || buttonRows.length >= 6}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-pill border border-white/15 bg-white/[0.04] hover:bg-white/10 disabled:opacity-40 text-frost-white text-[11px] transition-all"
                  >
                    <Plus size={11} />
                    Добавить ряд
                  </button>
                </div>
              </div>

              {buttonRows.length === 0 ? (
                <div className="rounded-card border border-dashed border-white/15 p-6 flex flex-col items-center justify-center gap-2 text-center bg-white/[0.01]">
                  <p className="font-roobert text-[12.5px] text-whisper-gray">
                    Кнопок пока нет. Вы можете добавить кнопки в один ряд или в несколько рядов.
                  </p>
                  <button
                    type="button"
                    onClick={addNewRow}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-pill bg-white/10 hover:bg-white/15 text-frost-white font-roobert text-[12px] font-medium transition-all"
                  >
                    <Plus size={13} />
                    Создать первый ряд кнопок
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {buttonRows.map((row, rowIdx) => (
                    <div
                      key={rowIdx}
                      className="rounded-card border border-white/15 bg-white/[0.02] p-3 flex flex-col gap-2.5 transition-all"
                    >
                      <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-roobert text-[11px] uppercase tracking-wider text-whisper-gray">
                            Ряд {rowIdx + 1}
                          </span>
                          <span className="text-[10px] text-white/40">
                            ({row.length} {row.length === 1 ? 'кнопка' : 'кнопки'})
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {row.length < 4 && totalButtonsCount < 8 && (
                            <button
                              type="button"
                              onClick={() => addButtonToRow(rowIdx)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-white/10 bg-white/[0.04] hover:bg-white/10 text-frost-white text-[10.5px]"
                            >
                              <Plus size={10} /> Добавить в этот ряд
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Buttons in this row */}
                      <div className="flex flex-col gap-2">
                        {row.map((btn, btnIdx) => {
                          const colorCfg = BUTTON_COLOR_CONFIG[btn.color] || BUTTON_COLOR_CONFIG.default;
                          const isBeingDragged =
                            draggedBtn?.rowIdx === rowIdx && draggedBtn?.btnIdx === btnIdx;
                          const isDragTarget =
                            dragOverTarget?.rowIdx === rowIdx && dragOverTarget?.btnIdx === btnIdx;

                          return (
                            <div
                              key={btn.id}
                              draggable
                              onDragStart={() => handleDragStart(rowIdx, btnIdx)}
                              onDragOver={(e) => handleDragOver(e, rowIdx, btnIdx)}
                              onDrop={() => handleDropOnButton(rowIdx, btnIdx)}
                              className={`rounded-card border transition-all p-2 flex flex-col sm:flex-row items-start sm:items-center gap-2 ${
                                isBeingDragged
                                  ? 'opacity-40 scale-95 border-amber-400 bg-amber-400/10'
                                  : isDragTarget
                                  ? 'border-amber-400 bg-amber-400/10'
                                  : `${colorCfg.borderClass} ${colorCfg.bgClass}`
                              }`}
                            >
                              {/* Drag handle */}
                              <div
                                className="cursor-grab active:cursor-grabbing p-1 text-white/40 hover:text-white flex items-center"
                                title="Перетащите мышкой для смены порядка или ряда"
                              >
                                <GripVertical size={14} />
                              </div>

                              {/* Color Selector */}
                              <div className="flex items-center gap-1">
                                <select
                                  value={btn.color}
                                  onChange={(e) =>
                                    updateButton(rowIdx, btnIdx, {
                                      color: e.target.value as ButtonColor,
                                    })
                                  }
                                  className="bg-black/50 border border-white/15 rounded-pill px-2 py-1 font-roobert text-[11px] text-frost-white focus:outline-none focus:border-white/30"
                                >
                                  {Object.entries(BUTTON_COLOR_CONFIG).map(([cKey, cVal]) => (
                                    <option key={cKey} value={cKey}>
                                      {cVal.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Text input */}
                              <div className="flex-1 w-full">
                                <input
                                  type="text"
                                  value={btn.text}
                                  onChange={(e) =>
                                    updateButton(rowIdx, btnIdx, { text: e.target.value })
                                  }
                                  placeholder="Текст кнопки (например: Крутить Wheel)"
                                  className="w-full bg-black/40 border border-white/15 rounded-pill px-3 py-1 font-roobert text-[12px] text-frost-white focus:outline-none focus:border-white/30"
                                />
                              </div>

                              {/* URL input */}
                              <div className="flex-1 w-full">
                                <input
                                  type="text"
                                  value={btn.url}
                                  onChange={(e) =>
                                    updateButton(rowIdx, btnIdx, { url: e.target.value })
                                  }
                                  placeholder="https://t.me/…"
                                  className="w-full bg-black/40 border border-white/15 rounded-pill px-3 py-1 font-mono text-[11.5px] text-frost-white focus:outline-none focus:border-white/30"
                                />
                              </div>

                              {/* Actions: Move row up/down / delete */}
                              <div className="flex items-center gap-1 self-end sm:self-auto">
                                {rowIdx > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => moveButtonUpRow(rowIdx, btnIdx)}
                                    title="Перенести в ряд выше"
                                    className="p-1.5 rounded-pill border border-white/10 bg-white/[0.04] text-whisper-gray hover:text-white"
                                  >
                                    <ArrowUp size={11} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => moveButtonDownRow(rowIdx, btnIdx)}
                                  title="Перенести в ряд ниже"
                                  className="p-1.5 rounded-pill border border-white/10 bg-white/[0.04] text-whisper-gray hover:text-white"
                                >
                                  <ArrowDown size={11} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeButton(rowIdx, btnIdx)}
                                  title="Удалить кнопку"
                                  className="p-1.5 rounded-pill border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Drop zone for dragging into a brand new row */}
                  {draggedBtn && (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsOverNewRowZone(true);
                      }}
                      onDragLeave={() => setIsOverNewRowZone(false)}
                      onDrop={handleDropOnNewRowZone}
                      className={`rounded-card border-2 border-dashed p-4 text-center transition-all ${
                        isOverNewRowZone
                          ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                          : 'border-white/20 bg-white/[0.02] text-whisper-gray'
                      }`}
                    >
                      <span className="font-roobert text-[12px] font-medium">
                        + Перетащите кнопку сюда, чтобы создать для неё новый отдельный ряд
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Field>
        </Section>

        {/* Live Telegram Preview Section */}
        <Section
          title="Предпросмотр в Telegram"
          help={{
            title: 'Как пост будет выглядеть в Telegram',
            body: (
              <p>
                Живая визуализация сообщения с учетом цитат blockquote, подстановки лидеров турнира Wheel и стилизованных inline-кнопок по рядам.
              </p>
            ),
          }}
        >
          <div className="flex justify-center p-2 sm:p-4">
            <div className="w-full max-w-md rounded-2xl bg-[#1e2329] border border-white/10 p-3 sm:p-4 shadow-2xl flex flex-col gap-2.5 text-left">
              <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300 font-bold text-[11px]">
                  MB
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="font-roobert font-medium text-[13px] text-white">Macvbet</span>
                    <span className="px-1.5 py-0.2 rounded bg-[#54a9eb]/20 text-[#54a9eb] text-[9px] uppercase font-semibold">
                      bot
                    </span>
                  </div>
                  <span className="text-[10px] text-white/40">Официальный бот</span>
                </div>
              </div>

              {/* Photo preview */}
              {mediaUrl.trim() && (
                <div className="overflow-hidden rounded-xl border border-white/10">
                  <img
                    src={mediaUrl.trim()}
                    alt="Preview"
                    className="w-full max-h-56 object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}

              {/* Body text rendered */}
              <div className="p-1">{renderPreviewText(text)}</div>

              {/* Inline Keyboard Rows Preview */}
              {buttonRows.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {buttonRows.map((row, rIdx) => {
                    const validRowBtns = row.filter((b) => b.text.trim());
                    if (validRowBtns.length === 0) return null;
                    return (
                      <div
                        key={rIdx}
                        className="grid gap-1.5"
                        style={{
                          gridTemplateColumns: `repeat(${validRowBtns.length}, minmax(0, 1fr))`,
                        }}
                      >
                        {validRowBtns.map((btn) => {
                          const displayBtnText = btn.text.replace(
                            /\{(?:emoji:|tg-emoji:)?(\d{6,25})(?::([^}\n]+))?\}/g,
                            (_m, _id, fb) => fb || '✨'
                          );
                          return (
                            <div
                              key={btn.id}
                              className="py-2 px-2 text-center rounded-xl border border-white/20 bg-white/10 text-white/90 font-roobert text-[12px] font-medium transition-all shadow-sm truncate hover:bg-white/15"
                            >
                              {displayBtnText}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* Audience Section */}
        <Section
          title="Аудитория"
          help={{
            title: 'Кому отправить',
            body: (
              <>
                <p>
                  <strong>Все игроки</strong> — рассылка пойдёт каждому активному пользователю.
                </p>
                <p>
                  <strong>Фильтр</strong> — комбинация: минимальный баланс, период регистрации, неактивные больше N дней.
                </p>
                <p>
                  <strong>Каналы / Группы</strong> — указать @канал или ID группы.
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
                    type="button"
                    onClick={() => {
                      setAudModes((prev) => {
                        if (prev.includes(key)) {
                          if (prev.length === 1) return prev;
                          return prev.filter((k) => k !== key);
                        }
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
                Можно ввести несколько через запятую. Бот должен быть администратором в этих каналах/группах.
              </p>
            </Field>
          )}

          {previewError && (
            <div className="rounded-card border border-red-500/20 bg-red-500/10 px-3 py-2.5">
              <span className="font-roobert text-[12px] text-red-400">{previewError}</span>
            </div>
          )}

          {preview && !previewError && (
            <div className="rounded-card border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="font-roobert text-[10px] uppercase tracking-[0.2em] text-whisper-gray">
                  Охват аудитории
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

        {/* Schedule & Type Section */}
        <Section
          title="Тип и расписание"
          help={{
            title: 'Тип рассылки и расписание',
            body: (
              <>
                <p>
                  <strong>Одноразовая</strong> — отправляется один раз (сейчас или в назначенное время).
                </p>
                <p>
                  <strong>Цикличная</strong> — автоматически повторяется раз в указанный интервал (например, 01:00:00).
                </p>
                <p>
                  Если в цикличной рассылке используется тег <code>{'{wheel_leaders}'}</code>, список лидеров будет обновляться автоматически в каждом цикле!
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
                    <span className="text-[10px] text-whisper-gray uppercase tracking-wider mr-1">
                      Быстрый выбор:
                    </span>
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

        {/* Reason + Submit Section */}
        <div className="rounded-card border border-white/10 bg-white/[0.03] px-4 py-4 flex flex-col gap-2.5">
          <label className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
            Причина / комментарий (попадёт в аудит)
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Например: «Циклическое напоминание о турнире Wheel»"
            className="bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30"
          />
          <div className="flex items-center justify-between mt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="font-roobert text-[12px] text-whisper-gray hover:text-frost-white transition-colors"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || text.trim().length < 1 || reason.trim().length < 3}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px] font-semibold uppercase tracking-[0.22em] hover:bg-white transition-all disabled:opacity-50 shadow-lg"
            >
              <Send size={13} strokeWidth={2} />
              {busy ? 'Создание…' : sendNow ? 'Запустить рассылку' : 'Запланировать'}
            </button>
          </div>
        </div>
      </div>

      {/* Premium Emoji Insert Modal */}
      {emojiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#14171d] p-5 shadow-2xl flex flex-col gap-4 text-left">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-amber-400" />
                <span className="font-roobert text-[13.5px] font-medium text-white">
                  Вставка Telegram Premium эмодзи
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEmojiModalOpen(false)}
                className="text-white/40 hover:text-white text-[18px] leading-none"
              >
                ×
              </button>
            </div>

            <p className="font-roobert text-[12px] text-whisper-gray leading-relaxed">
              В Telegram Premium эмодзи идентифицируются по их числовому ID (custom_emoji_id). Бот автоматически переведет конструкцию вида <code>{'{ID:ФОЛЛБЭК}'}</code> в валидный тег <code>{'<tg-emoji>'}</code>.
            </p>

            <div className="flex flex-col gap-2.5">
              <div>
                <label className="text-[11px] text-whisper-gray block mb-1">
                  Custom Emoji ID (число):
                </label>
                <input
                  type="text"
                  value={customEmojiIdInput}
                  onChange={(e) => setCustomEmojiIdInput(e.target.value.trim())}
                  placeholder="5368324170671202286"
                  className="w-full bg-white/[0.05] border border-white/15 rounded-pill px-3 py-1.5 font-mono text-[12.5px] text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-[11px] text-whisper-gray block mb-1">
                  Фоллбэк-эмодзи (отобразится, если у клиента нет Premium):
                </label>
                <input
                  type="text"
                  value={customEmojiFallbackInput}
                  onChange={(e) => setCustomEmojiFallbackInput(e.target.value)}
                  placeholder="🔥 (или оставьте пустым)"
                  className="w-full bg-white/[0.05] border border-white/15 rounded-pill px-3 py-1.5 font-roobert text-[12.5px] text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setEmojiModalOpen(false)}
                className="px-3 py-1.5 rounded-pill text-[12px] text-whisper-gray hover:text-white"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={!customEmojiIdInput}
                onClick={() => {
                  const tag = customEmojiFallbackInput.trim()
                    ? `{${customEmojiIdInput}:${customEmojiFallbackInput.trim()}}`
                    : `{${customEmojiIdInput}}`;
                  insertTagAtCursor(tag);
                  setEmojiModalOpen(false);
                  setCustomEmojiIdInput('');
                  setCustomEmojiFallbackInput('');
                }}
                className="px-4 py-1.5 rounded-pill bg-amber-400 text-black font-roobert text-[12px] font-medium disabled:opacity-50"
              >
                Вставить в текст
              </button>
            </div>
          </div>
        </div>
      )}
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
