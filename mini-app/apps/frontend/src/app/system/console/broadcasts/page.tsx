'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  X,
  Gift,
  Zap,
  Users,
  Send,
  CheckCircle2,
  Clock,
  Search,
  Ban,
  UserX,
  Moon,
  BarChart3,
  TrendingUp,
  ChevronDown,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { HelpButton } from '@/components/admin/help-button';

type InactiveReason = 'bot_blocked' | 'deactivated' | 'never_played' | 'dormant';

interface BroadcastAudience {
  kind?: string;
  telegramIds?: number[];
  inactiveDays?: number;
  reasons?: InactiveReason[];
  samplePercent?: number;
  promoCode?: string;
  promoAmount?: number;
  wagerMultiplier?: number;
}

interface Broadcast {
  id: string;
  status: 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'failed' | string;
  text: string;
  parseMode: string;
  mediaUrl: string | null;
  audience: BroadcastAudience | unknown;
  scheduledAt: number | null;
  totalTargets: number;
  delivered: number;
  failed: number;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  errorMessage: string | null;
  broadcastType?: 'single' | 'cyclical';
  intervalSeconds?: number | null;
  intervalStr?: string | null;
  untilDate?: number | null;
  cycleCount?: number;
  messagesDeleted?: boolean;
}

interface ReasonCounts {
  bot_blocked: number;
  deactivated: number;
  never_played: number;
  dormant: number;
}

interface Effectiveness {
  broadcastId: string;
  status: string;
  audience: {
    kind: string | null;
    inactiveDays: number | null;
    reasons: InactiveReason[];
    samplePercent: number | null;
    promoCode: string | null;
    promoAmount: number | null;
    wagerMultiplier: number | null;
  };
  delivery: {
    totalTargets: number;
    delivered: number;
    blocked: number;
    errors: number;
    failed: number;
  };
  activity: {
    returned: number;
    returnRate: number;
    played: number;
    playRate: number;
    medianHoursToReturn: number | null;
    medianHoursToPlay: number | null;
  };
  promo: {
    code: string;
    amount: number | null;
    wagerMultiplier: number | null;
    redeemed: number;
    redemptionRate: number;
    medianHoursToRedeem: number | null;
  } | null;
}

const DEFAULT_TEMPLATE =
  '<b>{jetLine}</b>\n\nПромо <b>{amount} PLN</b> — код <code>{code}</code> в профиле.';

const REASON_META: Record<
  InactiveReason,
  { label: string; hint: string; icon: typeof Ban }
> = {
  bot_blocked: {
    label: 'Заблокировали бота',
    hint: 'Последняя рассылка этому пользователю упала с ошибкой блока бота',
    icon: Ban,
  },
  deactivated: {
    label: 'Аккаунт удалён',
    hint: 'Telegram ответил, что пользователь деактивирован',
    icon: UserX,
  },
  never_played: {
    label: 'Никогда не играли',
    hint: 'Нет ставок и игровых сессий, давно не заходили в бота',
    icon: Users,
  },
  dormant: {
    label: 'Давно не заходили',
    hint: 'Последняя активность (бот, ставка или сессия) старше выбранного окна',
    icon: Moon,
  },
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Запланирована',
  sending: 'В процессе отправки',
  sent: 'Отправлена',
  cancelled: 'Отменена',
  failed: 'Ошибка',
};

const STATUS_TINT: Record<string, string> = {
  scheduled: 'border-amber-400/40 bg-amber-400/10 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.15)]',
  sending: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.15)]',
  sent: 'border-white/15 bg-white/[0.04] text-frost-white/90',
  cancelled: 'border-white/15 bg-white/[0.03] text-whisper-gray',
  failed: 'border-rose-500/40 bg-rose-500/10 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.15)]',
};

function asAudience(raw: unknown): BroadcastAudience {
  if (raw && typeof raw === 'object') return raw as BroadcastAudience;
  return {};
}

function formatHours(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h)) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} мин`;
  if (h < 48) return `${h.toFixed(1)} ч`;
  return `${(h / 24).toFixed(1)} д`;
}

function parseIdText(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const chunk of value.split(/[\s,;]+/)) {
    const trimmed = chunk.trim();
    if (!/^-?\d+$/.test(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export default function BroadcastsListPage() {
  const router = useRouter();
  const [data, setData] = useState<Broadcast[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'scheduled' | 'cyclical' | 'sent' | 'failed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [inactiveDays, setInactiveDays] = useState(3);
  const [samplePercent, setSamplePercent] = useState(100);
  const [selectedReasons, setSelectedReasons] = useState<InactiveReason[]>([
    'never_played',
    'dormant',
  ]);
  const [idListText, setIdListText] = useState('');
  const [amount, setAmount] = useState(10);
  const [wagerMultiplier, setWagerMultiplier] = useState(15);
  const [messageTemplate, setMessageTemplate] = useState(DEFAULT_TEMPLATE);
  const [reasonCounts, setReasonCounts] = useState<ReasonCounts | null>(null);
  const [selectedCount, setSelectedCount] = useState<number | null>(null);
  const [jetLine, setJetLine] = useState('MacvJet живой на главной');
  const [lastCrashLabel, setLastCrashLabel] = useState('—');
  const [loadingInactive, setLoadingInactive] = useState(true);
  const [reengageBusy, setReengageBusy] = useState(false);
  const [reengageResult, setReengageResult] = useState<{
    code: string;
    totalTargets: number;
    amount: number;
  } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [effectiveness, setEffectiveness] = useState<Record<string, Effectiveness | 'error'>>(
    {}
  );
  const [effectivenessLoading, setEffectivenessLoading] = useState<string | null>(null);

  const explicitIds = useMemo(() => parseIdText(idListText), [idListText]);
  const usingExplicitIds = explicitIds.length > 0;

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/_x/broadcasts?limit=80', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        setData([]);
        return;
      }
      const j = await res.json();
      setData(j.broadcasts ?? []);
    } catch {
      setData([]);
    }
  }, []);

  const loadReengageStats = useCallback(async () => {
    setLoadingInactive(true);
    try {
      const body = {
        inactiveDays,
        samplePercent,
        reasons: selectedReasons,
        telegramIds: usingExplicitIds ? explicitIds : undefined,
      };
      const res = await fetch('/api/_x/broadcasts/reengage-stats', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const j = await res.json();
        setReasonCounts(j.reasons ?? null);
        setSelectedCount(j.selectedCount ?? 0);
        const crash = Number(j.lastCrash);
        setLastCrashLabel(
          Number.isFinite(crash) && crash >= 1
            ? crash >= 10
              ? crash.toFixed(1)
              : crash.toFixed(2)
            : '—'
        );
        setJetLine(
          typeof j.jetLine === 'string' && j.jetLine.trim()
            ? j.jetLine
            : 'MacvJet живой на главной'
        );
      } else {
        setReasonCounts({
          bot_blocked: 0,
          deactivated: 0,
          never_played: 0,
          dormant: 0,
        });
        setSelectedCount(0);
      }
    } catch {
      setReasonCounts({
        bot_blocked: 0,
        deactivated: 0,
        never_played: 0,
        dormant: 0,
      });
      setSelectedCount(0);
    } finally {
      setLoadingInactive(false);
    }
  }, [inactiveDays, samplePercent, selectedReasons, usingExplicitIds, explicitIds]);

  useEffect(() => {
    void reload();
    const id = setInterval(reload, 5_000);
    return () => clearInterval(id);
  }, [reload]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadReengageStats();
    }, 350);
    return () => clearTimeout(t);
  }, [loadReengageStats]);

  const toggleReason = (reason: InactiveReason) => {
    setSelectedReasons((prev) => {
      if (prev.includes(reason)) {
        if (prev.length === 1) return prev;
        return prev.filter((r) => r !== reason);
      }
      return [...prev, reason];
    });
  };

  const handleQuickReengage = async () => {
    if (!selectedCount || selectedCount === 0) {
      alert('Нет получателей по выбранным фильтрам');
      return;
    }
    const audienceLabel = usingExplicitIds
      ? `${selectedCount} указанным ID`
      : `${selectedCount} пользователям (${selectedReasons
          .map((r) => REASON_META[r].label)
          .join(', ')}, ${samplePercent}% выборки, ${inactiveDays} дн.)`;
    if (
      !confirm(
        `Запустить удерживающую рассылку на ${amount} PLN для ${audienceLabel}?`
      )
    ) {
      return;
    }

    setReengageBusy(true);
    try {
      const res = await fetch('/api/_x/broadcasts/quick-reengage', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          wagerMultiplier,
          inactiveDays,
          samplePercent,
          reasons: selectedReasons,
          telegramIds: usingExplicitIds ? explicitIds : undefined,
          text: messageTemplate,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        alert(err?.error || 'Не удалось запустить удержание');
      } else {
        const j = await res.json();
        setReengageResult({
          code: j.code,
          totalTargets: j.totalTargets,
          amount: j.amount ?? amount,
        });
        await reload();
        await loadReengageStats();
      }
    } catch {
      alert('Ошибка при запуске рассылки');
    } finally {
      setReengageBusy(false);
    }
  };

  const loadEffectiveness = async (id: string) => {
    setEffectivenessLoading(id);
    try {
      const res = await fetch(`/api/_x/broadcasts/${id}/effectiveness`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        setEffectiveness((prev) => ({ ...prev, [id]: 'error' }));
        return;
      }
      const j = (await res.json()) as Effectiveness;
      setEffectiveness((prev) => ({ ...prev, [id]: j }));
    } catch {
      setEffectiveness((prev) => ({ ...prev, [id]: 'error' }));
    } finally {
      setEffectivenessLoading(null);
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedId((prev) => {
      const next = prev === id ? null : id;
      if (next) void loadEffectiveness(next);
      return next;
    });
  };

  const cancel = async (id: string) => {
    const reason = prompt('Причина отмены (минимум 3 символа):');
    if (!reason || reason.trim().length < 3) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/_x/broadcasts/${id}/cancel`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        alert('Не удалось отменить');
      } else {
        await reload();
      }
    } finally {
      setBusy(null);
    }
  };

  const stopAndDeleteMessages = async (b: Broadcast) => {
    const isRunning = b.status === 'scheduled' || b.status === 'sending';
    const confirmText = isRunning
      ? 'Остановить эту рассылку и удалить все отправленные сообщения из Telegram чатов пользователей?'
      : 'Удалить отправленные сообщения этой рассылки из Telegram чатов пользователей?';
    if (!window.confirm(confirmText)) return;

    setBusy(b.id);
    try {
      const res = await fetch(`/api/_x/broadcasts/${b.id}/delete-messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Admin stopped and deleted messages' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        alert(err?.error || 'Не удалось удалить сообщения');
      } else {
        const j = await res.json().catch(() => null);
        alert(`Успешно! Удалено сообщений: ${j?.deletedCount ?? 0}`);
        await reload();
      }
    } catch {
      alert('Ошибка при выполнении запроса');
    } finally {
      setBusy(null);
    }
  };

  const statsSummary = useMemo(() => {
    if (!data) return { total: 0, delivered: 0, failed: 0, successRate: 0, activeCount: 0 };
    const total = data.length;
    const delivered = data.reduce((acc, b) => acc + (b.delivered || 0), 0);
    const failed = data.reduce((acc, b) => acc + (b.failed || 0), 0);
    const totalTargets = data.reduce((acc, b) => acc + (b.totalTargets || 0), 0);
    const successRate = totalTargets > 0 ? Math.round((delivered / totalTargets) * 100) : 100;
    const activeCount = data.filter((b) => b.status === 'scheduled' || b.status === 'sending').length;
    return { total, delivered, failed, successRate, activeCount };
  }, [data]);

  const filteredData = useMemo(() => {
    if (!data) return [];
    return data.filter((b) => {
      if (filterTab === 'scheduled' && b.status !== 'scheduled' && b.status !== 'sending') return false;
      if (filterTab === 'cyclical' && b.broadcastType !== 'cyclical') return false;
      if (filterTab === 'sent' && b.status !== 'sent') return false;
      if (filterTab === 'failed' && b.status !== 'failed') return false;
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase();
        const audience = asAudience(b.audience);
        return (
          b.text.toLowerCase().includes(q) ||
          b.id.toLowerCase().includes(q) ||
          (audience.promoCode ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, filterTab, searchQuery]);

  const previewText = messageTemplate
    .replaceAll('{amount}', String(amount))
    .replaceAll('{code}', 'GIFT…')
    .replaceAll('{lastCrash}', lastCrashLabel)
    .replaceAll('{jetLine}', jetLine);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="font-roobert text-[11px] uppercase tracking-[0.2em] text-whisper-gray">
            Управление рассылками
          </div>
          <div className="font-roobert text-[22px] font-light text-frost-white flex items-center gap-2">
            <span>Рассылки & Удержание аудитории</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20 font-mono">
              {data?.length ?? 0} рассылок
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/system/console/broadcasts/new')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-200 text-black font-semibold text-[13px] shadow-[0_0_20px_rgba(255,172,46,0.25)] transition-all transform hover:scale-[1.02]"
          >
            <Plus size={16} strokeWidth={2.2} />
            Создать рассылку
          </button>

          <HelpButton title="Система рассылок и удержания">
            <p>
              Рассылки отправляются со скоростью <strong>25 сообщений / сек</strong> (безопасно для лимитов Telegram Bot API).
            </p>
            <p>
              Модуль удержания показывает, почему пользователь неактивен: блок бота (по последней неудачной рассылке), удалённый аккаунт, никогда не играл или давно не заходил. Можно выбрать причины, долю аудитории, конкретные Telegram ID, текст и сумму промика. После отправки на карточке видна эффективность: доставка, возврат, активация промика и медиана времени.
            </p>
          </HelpButton>
        </div>
      </div>

      <section className="relative overflow-hidden rounded-[24px] border border-amber-400/30 bg-gradient-to-r from-amber-500/10 via-black/60 to-black/80 backdrop-blur-3xl p-6 shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-400/10 blur-[100px] pointer-events-none rounded-full" />

        <div className="relative z-10 flex flex-col gap-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl border border-amber-400/40 bg-amber-400/15 flex items-center justify-center text-amber-400 shrink-0 shadow-[0_0_20px_rgba(255,172,46,0.2)]">
              <Gift size={24} strokeWidth={1.8} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-roobert text-[11px] uppercase tracking-[0.2em] text-amber-400 font-bold">
                  Удерживающая рассылка
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-400/20 text-amber-300 font-mono">
                  Настраиваемая аудитория + промо
                </span>
              </div>
              <h2 className="font-roobert text-[18px] font-medium text-white mt-1">
                Вернуть неактивных игроков с персональным промиком
              </h2>
              <p className="font-roobert text-[12.5px] text-whisper-gray mt-1 leading-relaxed max-w-3xl">
                Причины считаются по последней рассылке (блок бота / удалён аккаунт) и по реальной активности: ставки, игровые сессии и заходы в бота. Заблокированных ботом по умолчанию не берём — они всё равно не получат сообщение.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
            {(Object.keys(REASON_META) as InactiveReason[]).map((reason) => {
              const meta = REASON_META[reason];
              const Icon = meta.icon;
              const count = reasonCounts?.[reason] ?? 0;
              const on = selectedReasons.includes(reason);
              return (
                <button
                  key={reason}
                  type="button"
                  onClick={() => toggleReason(reason)}
                  disabled={usingExplicitIds}
                  title={meta.hint}
                  className={`text-left p-3.5 rounded-2xl border transition-all ${
                    usingExplicitIds
                      ? 'opacity-50 cursor-not-allowed border-white/10 bg-white/[0.02]'
                      : on
                        ? 'border-amber-400/40 bg-amber-400/10'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-amber-300">
                      <Icon size={14} />
                      <span className="font-roobert text-[11px] uppercase tracking-[0.08em] text-whisper-gray">
                        {meta.label}
                      </span>
                    </div>
                    {!usingExplicitIds && (
                      <span
                        className={`w-4 h-4 rounded-full border ${
                          on ? 'bg-amber-400 border-amber-300' : 'border-white/30'
                        }`}
                      />
                    )}
                  </div>
                  <div className="mt-2 font-roobert text-[20px] font-bold text-white tabular-nums">
                    {loadingInactive ? '…' : count.toLocaleString('ru-RU')}
                  </div>
                  <div className="mt-1 font-roobert text-[10.5px] text-whisper-gray leading-snug">
                    {meta.hint}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <label className="flex flex-col gap-1.5 p-3 rounded-2xl border border-white/10 bg-white/[0.03]">
              <span className="font-roobert text-[10.5px] uppercase tracking-[0.08em] text-whisper-gray">
                Неактивны, дней
              </span>
              <input
                type="number"
                min={1}
                max={365}
                value={inactiveDays}
                disabled={usingExplicitIds}
                onChange={(e) => setInactiveDays(Math.max(1, Number(e.target.value) || 1))}
                className="bg-transparent text-white font-roobert text-[16px] outline-none tabular-nums disabled:opacity-50"
              />
            </label>
            <label className="flex flex-col gap-1.5 p-3 rounded-2xl border border-white/10 bg-white/[0.03]">
              <span className="font-roobert text-[10.5px] uppercase tracking-[0.08em] text-whisper-gray">
                Доля аудитории, %
              </span>
              <input
                type="number"
                min={1}
                max={100}
                value={samplePercent}
                disabled={usingExplicitIds}
                onChange={(e) =>
                  setSamplePercent(Math.min(100, Math.max(1, Number(e.target.value) || 1)))
                }
                className="bg-transparent text-white font-roobert text-[16px] outline-none tabular-nums disabled:opacity-50"
              />
            </label>
            <label className="flex flex-col gap-1.5 p-3 rounded-2xl border border-white/10 bg-white/[0.03]">
              <span className="font-roobert text-[10.5px] uppercase tracking-[0.08em] text-whisper-gray">
                Сумма промика, PLN
              </span>
              <input
                type="number"
                min={1}
                max={10000}
                value={amount}
                onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
                className="bg-transparent text-white font-roobert text-[16px] outline-none tabular-nums"
              />
            </label>
            <label className="flex flex-col gap-1.5 p-3 rounded-2xl border border-white/10 bg-white/[0.03]">
              <span className="font-roobert text-[10.5px] uppercase tracking-[0.08em] text-whisper-gray">
                Вейджер, ×
              </span>
              <input
                type="number"
                min={1}
                max={200}
                value={wagerMultiplier}
                onChange={(e) => setWagerMultiplier(Math.max(1, Number(e.target.value) || 1))}
                className="bg-transparent text-white font-roobert text-[16px] outline-none tabular-nums"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="font-roobert text-[10.5px] uppercase tracking-[0.08em] text-whisper-gray">
              Telegram ID (необязательно — если указать, причины и % игнорируются)
            </span>
            <textarea
              value={idListText}
              onChange={(e) => setIdListText(e.target.value)}
              rows={3}
              placeholder="123456789, 987654321 …"
              className="w-full rounded-2xl bg-black/30 border border-white/10 px-3.5 py-2.5 text-[12.5px] text-white placeholder-whisper-gray/70 font-mono outline-none focus:border-amber-400/40"
            />
            {usingExplicitIds && (
              <span className="font-roobert text-[11px] text-amber-300">
                В списке {explicitIds.length.toLocaleString('ru-RU')} ID. Отправим тем, кто есть в базе и не забанен админом.
              </span>
            )}
          </label>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-roobert text-[10.5px] uppercase tracking-[0.08em] text-whisper-gray">
                Текст. Плейсхолдеры: {'{jetLine}'}, {'{lastCrash}'}, {'{amount}'}, {'{code}'}
              </span>
              <textarea
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                rows={7}
                className="w-full rounded-2xl bg-black/30 border border-white/10 px-3.5 py-2.5 text-[12.5px] text-white font-mono outline-none focus:border-amber-400/40"
              />
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="font-roobert text-[10.5px] uppercase tracking-[0.08em] text-whisper-gray">
                Предпросмотр
              </span>
              <div
                className="flex-1 rounded-2xl bg-black/30 border border-white/5 p-3.5 font-roobert text-[13px] text-white/95 leading-relaxed whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: previewText }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 bg-white/[0.03] border border-white/10 p-3.5 rounded-2xl">
            <div>
              <div className="font-roobert text-[10.5px] uppercase tracking-[0.1em] text-whisper-gray">
                Будет отправлено
              </div>
              <div className="font-roobert text-[22px] font-bold text-amber-400 tabular-nums">
                {loadingInactive ? '…' : `${(selectedCount ?? 0).toLocaleString('ru-RU')} чел.`}
              </div>
            </div>
            <button
              onClick={() => void handleQuickReengage()}
              disabled={reengageBusy || loadingInactive || !selectedCount}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-200 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-[13px] shadow-[0_0_25px_rgba(255,172,46,0.3)] transition-all transform hover:scale-[1.03]"
            >
              {reengageBusy ? (
                <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <Zap size={16} fill="currentColor" />
              )}
              <span>
                Запустить рассылку {amount} PLN
              </span>
            </button>
          </div>
        </div>

        <AnimatePresence>
          {reengageResult && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center justify-between text-xs font-roobert"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>
                  Рассылка запущена для <b>{reengageResult.totalTargets}</b> пользователей. Промокод:{' '}
                  <code>{reengageResult.code}</code> ({reengageResult.amount} PLN).
                </span>
              </div>
              <button onClick={() => setReengageResult(null)} className="text-emerald-300 hover:text-white">
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
          <div className="flex items-center justify-between text-whisper-gray mb-1">
            <span className="font-roobert text-[10.5px] uppercase tracking-[0.08em]">Всего рассылок</span>
            <BarChart3 size={14} />
          </div>
          <div className="font-roobert text-[20px] font-light text-white tabular-nums">
            {statsSummary.total}
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
          <div className="flex items-center justify-between text-whisper-gray mb-1">
            <span className="font-roobert text-[10.5px] uppercase tracking-[0.08em]">Доставлено</span>
            <Send size={14} className="text-emerald-400" />
          </div>
          <div className="font-roobert text-[20px] font-light text-emerald-400 tabular-nums">
            {statsSummary.delivered.toLocaleString('ru-RU')}
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
          <div className="flex items-center justify-between text-whisper-gray mb-1">
            <span className="font-roobert text-[10.5px] uppercase tracking-[0.08em]">Успешность</span>
            <TrendingUp size={14} className="text-cyan-400" />
          </div>
          <div className="font-roobert text-[20px] font-light text-cyan-400 tabular-nums">
            {statsSummary.successRate}%
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
          <div className="flex items-center justify-between text-whisper-gray mb-1">
            <span className="font-roobert text-[10.5px] uppercase tracking-[0.08em]">Активные сейчас</span>
            <Clock size={14} className="text-amber-400" />
          </div>
          <div className="font-roobert text-[20px] font-light text-amber-400 tabular-nums">
            {statsSummary.activeCount}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <div className="flex items-center gap-1 p-1 rounded-full bg-white/[0.04] border border-white/10">
          {(
            [
              { id: 'all', label: 'Все рассылки' },
              { id: 'scheduled', label: 'Запланированы / Отправляются' },
              { id: 'cyclical', label: 'Цикличные' },
              { id: 'sent', label: 'Завершенные' },
              { id: 'failed', label: 'С ошибками' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id)}
              className={`px-3.5 py-1.5 rounded-full text-[11.5px] font-medium font-roobert transition-all ${
                filterTab === tab.id
                  ? 'bg-amber-400 text-black font-semibold shadow-md'
                  : 'text-whisper-gray hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-whisper-gray" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по тексту, ID или промокоду..."
            className="w-full pl-9 pr-4 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-[12px] text-white placeholder-whisper-gray focus:outline-none focus:border-amber-400/50 font-roobert"
          />
        </div>
      </div>

      {data === null ? (
        <div className="rounded-card border border-white/10 bg-white/[0.03] py-16 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border border-white/20 border-t-amber-400 animate-spin" />
        </div>
      ) : filteredData.length === 0 ? (
        <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-12 text-center font-roobert text-[13px] text-whisper-gray">
          Рассылок не найдено.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredData.map((b) => {
            const progress =
              b.totalTargets > 0
                ? Math.round(((b.delivered + b.failed) / b.totalTargets) * 100)
                : 0;
            const audience = asAudience(b.audience);
            const isReengage = audience.kind === 'reengage' || Boolean(audience.promoCode);
            const open = expandedId === b.id;
            const eff = effectiveness[b.id];

            return (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl hover:border-white/20 transition-all shadow-[0_4px_20px_rgba(0,0,0,0.2)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2.5 py-0.5 rounded-full border font-roobert text-[10.5px] uppercase tracking-[0.12em] font-semibold ${
                        STATUS_TINT[b.status] ?? 'border-white/15 bg-white/[0.04] text-whisper-gray'
                      }`}
                    >
                      {STATUS_LABEL[b.status] ?? b.status}
                    </span>
                    {b.broadcastType === 'cyclical' && (
                      <span className="px-2.5 py-0.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 font-roobert text-[10.5px] uppercase tracking-[0.12em] flex items-center gap-1">
                        <RotateCcw size={10} />
                        Цикличная ({b.intervalStr || '?'})
                        {b.cycleCount && b.cycleCount > 0 ? ` • цикл #${b.cycleCount}` : ''}
                        {b.untilDate
                          ? ` • до ${new Date(b.untilDate).toLocaleDateString('ru-RU')} ${new Date(b.untilDate).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
                          : ' • бессрочно'}
                      </span>
                    )}
                    {b.messagesDeleted && (
                      <span className="px-2.5 py-0.5 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-300 font-roobert text-[10.5px] uppercase tracking-[0.12em]">
                        Сообщения удалены
                      </span>
                    )}
                    {isReengage && (
                      <span className="px-2.5 py-0.5 rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-300 font-roobert text-[10.5px] uppercase tracking-[0.12em]">
                        Удержание {audience.promoAmount ? `${audience.promoAmount} PLN` : ''}
                      </span>
                    )}
                    <span className="font-roobert text-[11.5px] text-whisper-gray tabular-nums">
                      {new Date(b.createdAt).toLocaleString('ru-RU')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => toggleExpanded(b.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/15 bg-white/[0.04] text-white/80 hover:bg-white/[0.08] font-roobert text-[11px]"
                    >
                      <BarChart3 size={12} />
                      Эффективность
                      <ChevronDown
                        size={12}
                        className={`transition-transform ${open ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {(b.status === 'scheduled' || b.status === 'sending') && (
                      <button
                        onClick={() => cancel(b.id)}
                        disabled={busy === b.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/15 bg-white/[0.04] text-whisper-gray hover:text-white hover:bg-white/[0.08] disabled:opacity-50 transition-colors font-roobert text-[11px]"
                      >
                        <X size={12} />
                        Отменить
                      </button>
                    )}
                    {!b.messagesDeleted && (
                      <button
                        onClick={() => stopAndDeleteMessages(b)}
                        disabled={busy === b.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 disabled:opacity-50 transition-colors font-roobert text-[11px]"
                        title={
                          b.status === 'scheduled' || b.status === 'sending'
                            ? 'Остановить рассылку и удалить все отправленные сообщения'
                            : 'Удалить отправленные сообщения этой рассылки из чатов Telegram'
                        }
                      >
                        <Trash2 size={12} />
                        {b.status === 'scheduled' || b.status === 'sending'
                          ? 'Остановить и удалить'
                          : 'Удалить сообщения'}
                      </button>
                    )}
                  </div>
                </div>

                <div
                  className="mt-3 font-roobert text-[13.5px] text-white/95 leading-relaxed bg-black/30 p-3.5 rounded-xl border border-white/5 whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: b.text }}
                />

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] font-roobert text-whisper-gray">
                  <div className="flex items-center gap-4">
                    <span>
                      Аудитория: <b className="text-white">{b.totalTargets.toLocaleString('ru-RU')}</b>
                    </span>
                    <span>
                      Доставлено: <b className="text-emerald-400">{b.delivered.toLocaleString('ru-RU')}</b>
                    </span>
                    {b.failed > 0 && (
                      <span className="text-rose-400">
                        Ошибок: <b>{b.failed.toLocaleString('ru-RU')}</b>
                      </span>
                    )}
                    {audience.promoCode && (
                      <span>
                        Промо: <b className="text-amber-300">{audience.promoCode}</b>
                      </span>
                    )}
                  </div>

                  <span className="font-mono text-amber-400 font-bold">{progress}% отправлено</span>
                </div>

                {b.totalTargets > 0 && (
                  <div className="mt-2 h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 rounded-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}

                {b.errorMessage && (
                  <div className="mt-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300 font-roobert">
                    <b>Ошибка:</b> {b.errorMessage}
                  </div>
                )}

                {open && (
                  <div className="mt-3 p-3.5 rounded-xl border border-white/10 bg-black/25">
                    {effectivenessLoading === b.id && !eff && (
                      <div className="text-[12px] text-whisper-gray font-roobert">Считаем эффективность…</div>
                    )}
                    {eff === 'error' && (
                      <div className="text-[12px] text-rose-300 font-roobert">
                        Не удалось загрузить эффективность.
                      </div>
                    )}
                    {eff && eff !== 'error' && (
                      <EffectivenessPanel
                        data={eff}
                        onRefresh={() => {
                          setEffectiveness((prev) => {
                            const next = { ...prev };
                            delete next[b.id];
                            return next;
                          });
                          void loadEffectiveness(b.id);
                        }}
                      />
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EffectivenessPanel({
  data,
  onRefresh,
}: {
  data: Effectiveness;
  onRefresh: () => void;
}) {
  const tiles = [
    {
      label: 'Доставлено',
      value: data.delivery.delivered.toLocaleString('ru-RU'),
      hint: `блок бота ${data.delivery.blocked}, ошибки ${data.delivery.errors}`,
    },
    {
      label: 'Вернулись',
      value: `${data.activity.returned.toLocaleString('ru-RU')} (${data.activity.returnRate}%)`,
      hint: `медиана ${formatHours(data.activity.medianHoursToReturn)}`,
    },
    {
      label: 'Сыграли',
      value: `${data.activity.played.toLocaleString('ru-RU')} (${data.activity.playRate}%)`,
      hint: `медиана до ставки ${formatHours(data.activity.medianHoursToPlay)}`,
    },
    {
      label: 'Активировали промо',
      value: data.promo
        ? `${data.promo.redeemed.toLocaleString('ru-RU')} (${data.promo.redemptionRate}%)`
        : 'нет промика',
      hint: data.promo
        ? `медиана ${formatHours(data.promo.medianHoursToRedeem)}`
        : 'обычная рассылка',
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-roobert text-[11px] uppercase tracking-[0.12em] text-amber-300">
          Эффективность после доставки
        </div>
        <button
          onClick={onRefresh}
          className="font-roobert text-[11px] text-whisper-gray hover:text-white"
        >
          Обновить
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {tiles.map((tile) => (
          <div key={tile.label} className="p-3 rounded-xl border border-white/10 bg-white/[0.03]">
            <div className="font-roobert text-[10px] uppercase tracking-[0.08em] text-whisper-gray">
              {tile.label}
            </div>
            <div className="mt-1 font-roobert text-[15px] text-white">{tile.value}</div>
            <div className="mt-0.5 font-roobert text-[10.5px] text-whisper-gray">{tile.hint}</div>
          </div>
        ))}
      </div>
      {data.audience.reasons.length > 0 && (
        <div className="font-roobert text-[11px] text-whisper-gray">
          Аудитория:{' '}
          {data.audience.inactiveDays ? `${data.audience.inactiveDays} дн. · ` : ''}
          {data.audience.reasons.map((r) => REASON_META[r]?.label ?? r).join(', ')}
          {data.audience.samplePercent ? ` · ${data.audience.samplePercent}%` : ''}
        </div>
      )}
    </div>
  );
}
