'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Search,
  User,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  Coins,
  ArrowDownToLine,
  ArrowUpFromLine,
  Gift,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Send,
  Sparkles,
  RefreshCw,
  HelpCircle,
  Headphones,
  MessageSquare,
  Check,
  CheckCheck,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { HelpButton } from '@/components/admin/help-button';

interface SupportUser {
  id: string;
  telegramId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  createdAt: number;
  isBlocked: boolean;
  withdrawalLocked: boolean;
  ignoreIpCollision: boolean;
  adminNote: string | null;
  balance: number;
  wagerTarget: number;
  wagerProgress: number;
  remainingWager: number;
  totalDeposits?: number;
  canWithdraw: boolean;
  vip: {
    tier: string;
    level: number;
    cashbackPercent: number;
  } | null;
  drain: {
    active: boolean;
    roundsLeft: number;
    expiresAt: number;
    reason: string | null;
  };
}

interface OrderItem {
  id: string;
  amount: number;
  status: string;
  paymentType: string;
  createdAt: number;
  paidAt: number | null;
}

interface WithdrawalItem {
  id: string;
  amount: number;
  status: string;
  method: string;
  destination: string;
  rejectionReason: string | null;
  createdAt: number;
}

interface BetItem {
  id: string;
  gameType: string;
  amount: number;
  payout: number;
  multiplier: number;
  state: string;
  placedAt: number;
}

interface AuditItem {
  id: string;
  adminTelegramId: number;
  action: string;
  reason: string | null;
  createdAt: number;
}

interface AlertItem {
  id: string;
  type: string;
  severity: string;
  message: string;
  createdAt: number;
}

interface SupportLookupData {
  user: SupportUser;
  recentOrders: OrderItem[];
  recentDeposits: { id: string; amount: number; description: string; createdAt: number }[];
  recentWithdrawals: WithdrawalItem[];
  recentBets: BetItem[];
  recentAudits: AuditItem[];
  alerts: AlertItem[];
}

interface AdminTicketItem {
  id: string;
  userId: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  category: string;
  subject: string | null;
  lastMessageAt: number;
  unreadAdminCount: number;
  unreadUserCount: number;
  createdAt: number;
  lastMessage: {
    text: string;
    senderType: string;
    senderName: string | null;
    createdAt: number;
  } | null;
  user: {
    id: string;
    telegramId: number;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    photoUrl: string | null;
    balance: number;
    remainingWager: number;
    isBlocked: boolean;
    withdrawalLocked: boolean;
  };
  claimedBy?: {
    adminId: number;
    adminName: string;
    claimedAt: number;
  } | null;
}

interface AdminMessageItem {
  id: string;
  senderType: 'user' | 'admin' | 'system';
  senderId: string;
  senderName: string | null;
  text: string;
  attachments?: any;
  isRead: boolean;
  createdAt: number;
}

const CANNED_RESPONSES = [
  {
    label: '💳 Депозит на проверке',
    text: 'Здравствуйте! Платёж находится на обработке платёжным шлюзом. Обычно зачисление занимает от 5 до 15 минут. Если средства не поступят в течение этого времени, пришлите чек или квитанцию.',
  },
  {
    label: '✅ Депозит зачислен',
    text: 'Мы проверили платёж. Средства были успешно зачислены на ваш игровой баланс. Желаем приятной игры!',
  },
  {
    label: '⏳ Вейджер по бонусу',
    text: 'Для оформления вывода средств вам необходимо завершить открутку вейджера по активному бонусу. Прогресс открутки отображается в вашем профиле.',
  },
  {
    label: '🔓 Сброс вейджера',
    text: 'Администратор сбросил ваш вейджер. Теперь вы можете оформить заявку на вывод средств в кассе.',
  },
  {
    label: '⚡ Заявка на вывод',
    text: 'Ваша заявка на вывод средств принята и передана в финансовый отдел. Ожидайте зачисления.',
  },
  {
    label: '❓ Уточнить детали',
    text: 'Уточните, пожалуйста, точную дату, время операции и сумму перевода, чтобы мы могли быстрее разобраться.',
  },
];

export default function SupportWorkspacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [viewMode, setViewMode] = useState<'tickets' | 'search'>(
    initialQuery ? 'search' : 'tickets'
  );

  // Search & Diagnosis State
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SupportLookupData | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'withdrawals' | 'bets' | 'audits' | 'alerts'>('overview');

  // Quick Action Modal State
  const [actionModal, setActionModal] = useState<{
    type: 'clear_wager' | 'toggle_withdrawal_lock' | 'grant_freebet' | 'append_note';
    title: string;
  } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionAmount, setActionAmount] = useState('50');
  const [actionNote, setActionNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Tickets & Chat State
  const [tickets, setTickets] = useState<AdminTicketItem[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketMessages, setTicketMessages] = useState<AdminMessageItem[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'pending' | 'resolved'>('all');
  const [ticketSearch, setTicketSearch] = useState('');

  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToChatBottom = () => {
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const doSearch = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/_x/support/lookup?q=${encodeURIComponent(q)}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Пользователь не найден');
        setData(null);
      } else {
        setData(json);
      }
    } catch (e: any) {
      setError(e?.message || 'Ошибка сети при поиске');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTickets = useCallback(async (isSilent = false) => {
    if (!isSilent) setTicketsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (ticketSearch.trim()) params.set('search', ticketSearch.trim());

      const res = await fetch(`/api/support/_x/tickets?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = await res.json();
      if (res.ok && json.tickets) {
        setTickets(json.tickets);
      }
    } catch {}
    finally {
      if (!isSilent) setTicketsLoading(false);
    }
  }, [filterStatus, ticketSearch]);

  const loadTicketMessages = useCallback(async (ticketId: string, isSilent = false) => {
    if (!isSilent) setMessagesLoading(true);
    try {
      const res = await fetch(`/api/support/_x/tickets/${ticketId}/messages`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = await res.json();
      if (res.ok && json.messages) {
        setTicketMessages(json.messages);
        setTimeout(scrollToChatBottom, 50);
      }
    } catch {}
    finally {
      if (!isSilent) setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialQuery) {
      void doSearch(initialQuery);
    }
  }, [initialQuery, doSearch]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Periodic polling for incoming tickets and active conversation
  useEffect(() => {
    const timer = setInterval(() => {
      loadTickets(true);
      if (selectedTicketId) {
        loadTicketMessages(selectedTicketId, true);
      }
    }, 4500);
    return () => clearInterval(timer);
  }, [loadTickets, loadTicketMessages, selectedTicketId]);

  const handleSelectTicket = (t: AdminTicketItem) => {
    setSelectedTicketId(t.id);
    loadTicketMessages(t.id);
    // Also load user diagnosis seamlessly in the background
    void doSearch(t.userId);
  };

  const handleSendReply = async () => {
    if (!selectedTicketId || !replyText.trim() || sendingReply) return;
    setSendingReply(true);
    try {
      const res = await fetch(`/api/support/_x/tickets/${selectedTicketId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text: replyText.trim() }),
      });
      const json = await res.json();
      if (res.ok && json.message) {
        setTicketMessages((prev) => [...prev, json.message]);
        setReplyText('');
        void loadTickets(true);
        setTimeout(scrollToChatBottom, 50);
      } else {
        alert(json.error || 'Ошибка отправки ответа');
      }
    } catch (e: any) {
      alert(e?.message || 'Ошибка сети');
    } finally {
      setSendingReply(false);
    }
  };

  const handleStatusChange = async (newStatus: 'open' | 'pending' | 'resolved' | 'closed') => {
    if (!selectedTicketId) return;
    try {
      const res = await fetch(`/api/support/_x/tickets/${selectedTicketId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        void loadTickets(true);
        void loadTicketMessages(selectedTicketId, true);
      }
    } catch {}
  };

  const handleToggleClaim = async (ticketId: string) => {
    try {
      const res = await fetch(`/api/support/_x/tickets/${ticketId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'toggle' }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Не удалось изменить статус тикета');
        return;
      }
      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, claimedBy: data.claim } : t))
      );
      void loadTickets(true);
    } catch {
      alert('Ошибка при изменении оператора тикета');
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.replace(`/system/console/support?q=${encodeURIComponent(searchQuery.trim())}`);
      void doSearch(searchQuery.trim());
    }
  };

  const handleQuickAction = async () => {
    if (!data || !actionModal) return;
    if (!actionReason || actionReason.trim().length < 3) {
      alert('Укажите причину действия (минимум 3 символа)');
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch('/api/_x/support/quick-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId: data.user.id,
          action: actionModal.type,
          amount: actionModal.type === 'grant_freebet' ? Number(actionAmount) : undefined,
          note: actionModal.type === 'append_note' ? actionNote : undefined,
          reason: actionReason,
        }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        alert(resJson.error || 'Ошибка выполнения действия');
        return;
      }

      setActionModal(null);
      setActionReason('');
      setActionNote('');
      // Reload user data
      await doSearch(data.user.id);
      void loadTickets(true);
    } catch (e: any) {
      alert(e?.message || 'Ошибка сети');
    } finally {
      setActionLoading(false);
    }
  };

  const user = data?.user;
  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) || null;
  const totalUnreads = tickets.reduce((acc, t) => acc + t.unreadAdminCount, 0);

  const formatDateTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div className="space-y-6 max-w-[1500px] mx-auto pb-20">
      {/* ── Top Title & Help ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-frost-white flex items-center gap-2.5">
            Рабочее место поддержки
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-normal">
              Гибридная модель
            </span>
          </h1>
          <p className="text-sm text-whisper-gray mt-1">
            Единый пульт: диалоги поддержки, мгновенные ответы с пушем в Telegram и 1-Click диагностика.
          </p>
        </div>
        <HelpButton title="Справка: Рабочее место поддержки">
          <div className="space-y-3 text-xs text-frost-white/80">
            <p>
              <strong>Диалоги поддержки:</strong> входящие тикеты игроков. При ответе оператора сообщение мгновенно появляется в приложении; если игрок закрыл сайт — бот автоматически отправляет уведомление в Telegram с кнопкой перехода в чат.
            </p>
            <p>
              <strong>Диагностика игрока:</strong> полный аудит кассы, ставок, депозитов и флагов блокировки.
            </p>
            <p>
              <strong>Быстрые действия:</strong> моментальный сброс вейджера, начисление фрибета или переключение блокировки вывода.
            </p>
          </div>
        </HelpButton>
      </div>

      {/* ── Workspace Mode Switcher ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 p-1 rounded-2xl bg-white/[0.03] border border-white/10">
          <button
            onClick={() => setViewMode('tickets')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer',
              viewMode === 'tickets'
                ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                : 'text-whisper-gray hover:text-frost-white'
            )}
          >
            <Headphones size={15} />
            <span>Входящие диалоги</span>
            {totalUnreads > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-500 text-black font-black animate-pulse">
                {totalUnreads}
              </span>
            )}
          </button>

          <button
            onClick={() => setViewMode('search')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer',
              viewMode === 'search'
                ? 'bg-white/10 text-frost-white border border-white/20'
                : 'text-whisper-gray hover:text-frost-white'
            )}
          >
            <Search size={15} />
            <span>Поиск и Диагностика</span>
          </button>
        </div>

        {viewMode === 'tickets' && (
          <button
            onClick={() => loadTickets(false)}
            disabled={ticketsLoading}
            className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs text-zinc-300 flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw size={13} className={cn(ticketsLoading && 'animate-spin text-emerald-400')} />
            <span>Обновить очередь</span>
          </button>
        )}
      </div>

      {/* ── MODE 1: TICKETS & LIVE OPERATOR CHAT ── */}
      {viewMode === 'tickets' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Ticket Queue (4 cols) */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-3">
            {/* Filter pills & search */}
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
              <div className="flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-xl px-2.5 py-1.5">
                <Search size={14} className="text-zinc-400" />
                <input
                  type="text"
                  value={ticketSearch}
                  onChange={(e) => setTicketSearch(e.target.value)}
                  placeholder="Фильтр по нику или Telegram ID..."
                  className="bg-transparent text-xs text-white placeholder-zinc-500 outline-none flex-1"
                />
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {(['all', 'open', 'pending', 'resolved'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setFilterStatus(st)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer',
                      filterStatus === st
                        ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                        : 'bg-white/[0.03] border border-white/5 text-zinc-400 hover:text-white'
                    )}
                  >
                    {st === 'all'
                      ? 'Все'
                      : st === 'open'
                      ? 'Открытые'
                      : st === 'pending'
                      ? 'Ожидают ответа'
                      : 'Решенные'}
                  </button>
                ))}
              </div>
            </div>

            {/* Ticket List */}
            <div className="space-y-2 max-h-[72vh] overflow-y-auto pr-1">
              {ticketsLoading && tickets.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500 flex flex-col items-center gap-2">
                  <RefreshCw size={20} className="animate-spin text-emerald-400" />
                  <span>Загрузка очереди диалогов...</span>
                </div>
              ) : tickets.length === 0 ? (
                <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/5 text-center text-xs text-zinc-500">
                  Нет обращений в выбранной категории
                </div>
              ) : (
                tickets.map((t) => {
                  const isSelected = t.id === selectedTicketId;
                  const hasUnread = t.unreadAdminCount > 0;

                  return (
                    <button
                      key={t.id}
                      onClick={() => handleSelectTicket(t)}
                      className={cn(
                        'w-full p-3.5 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col gap-2 cursor-pointer',
                        isSelected
                          ? 'bg-emerald-500/[0.07] border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.1)] ring-1 ring-emerald-500/20'
                          : hasUnread
                          ? 'bg-white/[0.05] border-amber-400/30 hover:border-amber-400/50'
                          : 'bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {t.user.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={t.user.photoUrl}
                              alt=""
                              className="w-8 h-8 rounded-xl object-cover border border-white/10 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-xl bg-white/[0.08] border border-white/10 flex items-center justify-center text-zinc-300 text-xs font-bold shrink-0">
                              {t.user.firstName?.charAt(0) || 'U'}
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-white truncate block">
                              {t.user.firstName || t.user.username || `ID ${t.user.telegramId}`}
                            </span>
                            <span className="text-[10px] text-zinc-400 truncate block">
                              @{t.user.username || 'нет юзернейма'} • ID: {t.user.telegramId}
                            </span>
                          </div>
                        </div>

                        {/* Unread badge & time */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-[10px] text-zinc-500">
                            {formatDateTime(t.lastMessageAt)}
                          </span>
                          {hasUnread && (
                            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black bg-amber-400 text-black shadow-[0_0_10px_rgba(245,158,11,0.4)]">
                              {t.unreadAdminCount} нов.
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Snippet */}
                      <p className="text-[11px] text-zinc-300 line-clamp-2 leading-relaxed pl-1">
                        {t.lastMessage ? (
                          <>
                            <span className="font-semibold text-zinc-400 mr-1">
                              {t.lastMessage.senderType === 'user' ? 'Игрок:' : 'Саппорт:'}
                            </span>
                            {t.lastMessage.text}
                          </>
                        ) : (
                          'Нет сообщений'
                        )}
                      </p>

                      {/* Bottom quick stats */}
                      <div className="flex items-center justify-between text-[10px] text-zinc-400 border-t border-white/5 pt-2 mt-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span>Баланс: {t.user.balance.toFixed(2)} zł</span>
                          {t.claimedBy && (
                            <span
                              className="px-1.5 py-0.2 rounded text-[9.5px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 truncate max-w-[120px]"
                              title={`В работе: ${t.claimedBy.adminName}`}
                            >
                              🛡️ {t.claimedBy.adminName}
                            </span>
                          )}
                        </div>
                        {t.user.remainingWager > 0 ? (
                          <span className="text-amber-400 font-medium">Вейджер: {t.user.remainingWager.toFixed(2)} zł</span>
                        ) : (
                          <span className="text-emerald-400">Вейджер: 0 zł</span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Live Chat Operator Desk (8 cols) */}
          <div className="lg:col-span-7 xl:col-span-8">
            {selectedTicket ? (
              <div className="rounded-3xl border border-white/10 bg-[#0E1015] overflow-hidden flex flex-col h-[78vh] shadow-2xl">
                {/* Chat Header: Compact Player Quick Bar & Actions */}
                <div className="p-4 border-b border-white/10 bg-white/[0.02] flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-3">
                    {selectedTicket.user.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selectedTicket.user.photoUrl}
                        alt=""
                        className="w-10 h-10 rounded-xl object-cover border border-white/10"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-white/[0.08] border border-white/10 flex items-center justify-center text-white font-bold">
                        {selectedTicket.user.firstName?.charAt(0) || 'U'}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">
                          {selectedTicket.user.firstName || 'Игрок'}
                        </span>
                        <span className="text-xs text-zinc-400">
                          (@{selectedTicket.user.username || 'нет_ника'})
                        </span>
                        <span className="text-xs font-mono text-zinc-500">
                          [{selectedTicket.user.telegramId}]
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-zinc-400 mt-0.5">
                        <span>Баланс: <strong className="text-white">{user?.balance?.toFixed(2) ?? selectedTicket.user.balance.toFixed(2)} zł</strong></span>
                        <span>Вейджер: <strong className={user && user.remainingWager > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                          {user?.remainingWager?.toFixed(2) ?? selectedTicket.user.remainingWager.toFixed(2)} zł
                        </strong></span>
                        {user?.totalDeposits !== undefined && (
                          <span>Депозиты: <strong className="text-white">{user.totalDeposits.toFixed(2)} zł</strong></span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 1-Click Quick Actions Cluster */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {user?.remainingWager && user.remainingWager > 0 ? (
                      <button
                        onClick={() => {
                          setActionModal({
                            type: 'clear_wager',
                            title: 'Сбросить вейджер пользователю',
                          });
                          setActionReason('По обращению в чат поддержки');
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-amber-400/15 border border-amber-400/30 text-amber-300 hover:bg-amber-400/25 text-xs font-medium transition-all flex items-center gap-1 cursor-pointer"
                        title="Сбросить вейджер игроку"
                      >
                        <Sparkles size={13} />
                        <span>Сбросить вейджер</span>
                      </button>
                    ) : null}

                    <button
                      onClick={() => {
                        setActionModal({
                          type: 'grant_freebet',
                          title: 'Выдать фрибет игроку',
                        });
                        setActionReason('Компенсация / бонус по обращению');
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 text-xs font-medium transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Gift size={13} />
                      <span>Фрибет</span>
                    </button>

                    {/* Кнопка "Забрать тикет" / "В работе" */}
                    <button
                      onClick={() => handleToggleClaim(selectedTicket.id)}
                      className={cn(
                        'px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 cursor-pointer',
                        selectedTicket.claimedBy
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                          : 'bg-white/5 border-white/10 text-zinc-300 hover:text-white hover:bg-white/10'
                      )}
                      title={
                        selectedTicket.claimedBy
                          ? `Взял(а): ${selectedTicket.claimedBy.adminName}. Нажмите, чтобы освободить тикет.`
                          : 'Взять тикет в работу'
                      }
                    >
                      <ShieldCheck size={13} />
                      <span>
                        {selectedTicket.claimedBy
                          ? `Взял: ${selectedTicket.claimedBy.adminName}`
                          : 'Забрать тикет'}
                      </span>
                    </button>

                    <button
                      onClick={() => handleStatusChange(selectedTicket.status === 'resolved' ? 'open' : 'resolved')}
                      className={cn(
                        'px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all flex items-center gap-1 cursor-pointer',
                        selectedTicket.status === 'resolved'
                          ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white'
                          : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                      )}
                    >
                      <CheckCircle2 size={13} />
                      <span>{selectedTicket.status === 'resolved' ? 'Открыть тикет' : 'Закрыть тикет'}</span>
                    </button>

                    <button
                      onClick={() => {
                        setViewMode('search');
                        if (user) void doSearch(user.id);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-zinc-300 hover:text-white text-xs transition-all flex items-center gap-1 cursor-pointer"
                      title="Открыть подробную диагностику"
                    >
                      <span>Диагностика →</span>
                    </button>
                  </div>
                </div>

                {/* Message Stream */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0A0B0E]/60">
                  {messagesLoading ? (
                    <div className="h-full flex items-center justify-center text-xs text-zinc-500 gap-2">
                      <RefreshCw size={16} className="animate-spin text-emerald-400" />
                      <span>Загрузка переписки...</span>
                    </div>
                  ) : ticketMessages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-zinc-500">
                      История сообщений пуста. Напишите первое сообщение игроку ниже.
                    </div>
                  ) : (
                    ticketMessages.map((m) => {
                      const isUser = m.senderType === 'user';
                      const isSystem = m.senderType === 'system';

                      if (isSystem) {
                        return (
                          <div key={m.id} className="flex justify-center my-2">
                            <span className="px-3 py-1 rounded-full text-[11px] bg-white/[0.04] border border-white/10 text-zinc-400">
                              {m.text}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={m.id}
                          className={cn(
                            'flex flex-col max-w-[80%]',
                            isUser ? 'mr-auto items-start' : 'ml-auto items-end'
                          )}
                        >
                          <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-zinc-500">
                            <span className={cn('font-semibold', isUser ? 'text-amber-400' : 'text-emerald-400')}>
                              {isUser ? selectedTicket.user.firstName || 'Игрок' : 'Вы (Саппорт)'}
                            </span>
                            <span>{formatDateTime(m.createdAt)}</span>
                          </div>

                          <div
                            className={cn(
                              'px-4 py-2.5 rounded-2xl text-xs leading-relaxed break-words relative shadow-md',
                              isUser
                                ? 'bg-[#181B24] border border-white/15 text-zinc-100 rounded-tl-xs'
                                : 'bg-gradient-to-r from-emerald-600/30 to-teal-600/30 border border-emerald-500/40 text-emerald-100 rounded-tr-xs'
                            )}
                          >
                            <p className="whitespace-pre-wrap">{m.text}</p>
                            {!isUser && (
                              <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-zinc-400">
                                {m.isRead ? (
                                  <CheckCheck size={12} className="text-emerald-400" />
                                ) : (
                                  <Check size={12} className="text-zinc-500" />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatMessagesEndRef} />
                </div>

                {/* Canned Responses Chips */}
                <div className="px-4 py-2 bg-[#0E1015] border-t border-white/5 flex items-center gap-1.5 overflow-x-auto shrink-0">
                  <span className="text-[10px] text-zinc-500 uppercase font-semibold shrink-0 mr-1">
                    Быстрые ответы:
                  </span>
                  {CANNED_RESPONSES.map((cr, idx) => (
                    <button
                      key={idx}
                      onClick={() => setReplyText(cr.text)}
                      className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 text-[11px] text-zinc-300 hover:text-white shrink-0 transition-all cursor-pointer"
                    >
                      {cr.label}
                    </button>
                  ))}
                </div>

                {/* Admin Reply Input Bar */}
                <div className="p-3 bg-[#0A0B0E] border-t border-white/10 shrink-0">
                  <div className="flex items-end gap-2 bg-[#141720] border border-white/15 focus-within:border-emerald-500/50 rounded-2xl p-2 pl-3">
                    <textarea
                      rows={2}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          handleSendReply();
                        }
                      }}
                      placeholder="Ответить игроку (Ctrl+Enter для отправки)..."
                      className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 outline-none resize-none leading-relaxed"
                    />

                    <button
                      onClick={handleSendReply}
                      disabled={sendingReply || !replyText.trim()}
                      className="h-9 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold text-xs flex items-center gap-1.5 hover:brightness-110 active:scale-95 disabled:opacity-40 transition-all cursor-pointer shrink-0"
                    >
                      {sendingReply ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <>
                          <span>Ответить</span>
                          <Send size={13} />
                        </>
                      )}
                    </button>
                  </div>

                  <div className="mt-1 px-2 flex items-center justify-between text-[10px] text-zinc-500">
                    <span>💡 Если игрок сейчас не в приложении, бот автоматически отправит ему пуш-уведомление в Telegram</span>
                    <span>Ctrl + Enter</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-white/10 bg-[#0E1015]/60 h-[78vh] flex flex-col items-center justify-center gap-3 text-zinc-500 p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-zinc-400">
                  <MessageSquare size={30} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Выберите диалог из списка</h3>
                  <p className="text-xs text-zinc-400 mt-1 max-w-sm">
                    Нажмите на обращение в очереди слева, чтобы открыть диалог, увидеть баланс игрока и отправить ответ.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODE 2: PLAYER SEARCH & FULL DIAGNOSTIC DASHBOARD ── */}
      {viewMode === 'search' && (
        <div className="space-y-6">
          {/* Search Input Bar */}
          <form onSubmit={handleSearchSubmit} className="relative">
            <div className="flex items-center gap-3 bg-white/[0.03] border border-white/15 rounded-2xl p-2 focus-within:border-white/40 transition-colors shadow-lg">
              <div className="pl-3 text-whisper-gray">
                <Search size={20} />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск игрока: @username, Telegram ID (например 1862215959) или UUID..."
                className="flex-1 bg-transparent text-frost-white placeholder-whisper-gray/50 text-sm md:text-base outline-none px-1"
              />
              <button
                type="submit"
                disabled={loading || !searchQuery.trim()}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium text-sm hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer shrink-0"
              >
                {loading ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                <span>Найти</span>
              </button>
            </div>
          </form>

          {/* Error notification */}
          {error && (
            <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm flex items-center gap-3">
              <AlertTriangle size={18} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* User Found Card */}
          {user && (
            <div className="space-y-6">
              {/* Top Profile & Status Bar */}
              <div className="p-6 rounded-2xl border border-white/15 bg-white/[0.03] backdrop-blur-xl shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  {user.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.photoUrl}
                      alt={user.username || 'User'}
                      className="w-16 h-16 rounded-2xl object-cover border border-white/20 shadow-md"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-white/[0.08] border border-white/15 flex items-center justify-center text-white/80">
                      <User size={32} />
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-white">
                        {user.firstName || ''} {user.lastName || ''}
                      </h2>
                      {user.vip && (
                        <span className="text-xs px-2 py-0.5 rounded-md bg-amber-400/20 text-amber-300 border border-amber-400/30 font-semibold uppercase">
                          VIP: {user.vip.tier} ({user.vip.level} ур.)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-whisper-gray mt-1 flex-wrap">
                      <span>@{user.username || '—'}</span>
                      <span>•</span>
                      <span>TG ID: <strong className="text-white font-mono">{user.telegramId}</strong></span>
                      <span>•</span>
                      <span>UUID: <span className="font-mono text-[11px]">{user.id}</span></span>
                    </div>
                  </div>
                </div>

                {/* Quick Diagnostics Counters */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
                  <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 text-center">
                    <span className="text-[11px] text-whisper-gray block">Баланс</span>
                    <span className="text-base font-bold text-emerald-400">{user.balance.toFixed(2)} zł</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 text-center">
                    <span className="text-[11px] text-whisper-gray block">Вейджер</span>
                    <span className="text-base font-bold text-amber-300">{user.remainingWager.toFixed(2)} zł</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 text-center">
                    <span className="text-[11px] text-whisper-gray block">Депозиты</span>
                    <span className="text-base font-bold text-white">{(user.totalDeposits ?? 0).toFixed(2)} zł</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 text-center">
                    <span className="text-[11px] text-whisper-gray block">Вывод</span>
                    <span className={cn('text-base font-bold', user.canWithdraw ? 'text-emerald-400' : 'text-rose-400')}>
                      {user.canWithdraw ? 'Доступен' : 'Заблокирован'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Can Withdraw Diagnosis Card */}
              <div
                className={cn(
                  'p-5 rounded-2xl border relative overflow-hidden',
                  user.canWithdraw
                    ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
                    : 'border-rose-500/30 bg-rose-500/[0.04]'
                )}
              >
                <div className="text-xs uppercase tracking-wider font-medium flex items-center justify-between">
                  <span className={user.canWithdraw ? 'text-emerald-300' : 'text-rose-300'}>
                    Статус вывода средств
                  </span>
                  {user.canWithdraw ? (
                    <ShieldCheck size={18} className="text-emerald-400" />
                  ) : (
                    <ShieldAlert size={18} className="text-rose-400" />
                  )}
                </div>

                <div className="mt-3 text-lg font-bold text-white flex items-center gap-2">
                  {user.canWithdraw ? (
                    <>
                      <CheckCircle2 size={20} className="text-emerald-400" />
                      <span className="text-emerald-300">Вывод доступен</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={20} className="text-rose-400" />
                      <span className="text-rose-300">Вывод заблокирован</span>
                    </>
                  )}
                </div>

                <div className="mt-2 text-xs text-whisper-gray">
                  {!user.canWithdraw && (
                    <ul className="list-disc list-inside space-y-1">
                      {user.totalDeposits !== undefined && user.totalDeposits < 100 && (
                        <li>Депозиты за все время ({user.totalDeposits.toFixed(2)} zł) меньше 100 zł</li>
                      )}
                      {user.remainingWager > 0 && (
                        <li>Не закрыт вейджер ({user.remainingWager.toFixed(2)} zł)</li>
                      )}
                      {user.withdrawalLocked && <li>Ручная блокировка вывода саппортом</li>}
                      {user.isBlocked && <li>Аккаунт пользователя заблокирован</li>}
                    </ul>
                  )}
                  {user.canWithdraw && <p>Все условия выполнены, игрок может подавать заявку.</p>}
                </div>
              </div>

              {/* Quick Actions Action Bar */}
              <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.02] flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold text-whisper-gray uppercase tracking-wider mr-2">
                  Действия:
                </span>

                <button
                  onClick={() => {
                    setActionModal({
                      type: 'clear_wager',
                      title: 'Сбросить вейджер пользователю',
                    });
                    setActionReason('Обращение в поддержку: сброс остатка вейджера');
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-medium transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles size={14} />
                  <span>Сбросить вейджер</span>
                </button>

                <button
                  onClick={() => {
                    setActionModal({
                      type: 'toggle_withdrawal_lock',
                      title: user.withdrawalLocked
                        ? 'Разблокировать вывод средств'
                        : 'Заблокировать вывод средств',
                    });
                    setActionReason(
                      user.withdrawalLocked
                        ? 'Снятие блокировки вывода после проверки'
                        : 'Блокировка вывода на время проверки'
                    );
                  }}
                  className={cn(
                    'px-4 py-2 rounded-xl text-xs font-medium border transition-all flex items-center gap-2 cursor-pointer',
                    user.withdrawalLocked
                      ? 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30 text-rose-300'
                  )}
                >
                  {user.withdrawalLocked ? <Unlock size={14} /> : <Lock size={14} />}
                  <span>{user.withdrawalLocked ? 'Разблокировать вывод' : 'Заблокировать вывод'}</span>
                </button>

                <button
                  onClick={() => {
                    setActionModal({
                      type: 'grant_freebet',
                      title: 'Выдать фрибет',
                    });
                    setActionAmount('50');
                    setActionReason('Бонус от поддержки');
                  }}
                  className="px-4 py-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-medium transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Gift size={14} />
                  <span>Выдать фрибет</span>
                </button>

                <button
                  onClick={() => {
                    setActionModal({
                      type: 'append_note',
                      title: 'Добавить заметку к аккаунту',
                    });
                    setActionNote(user.adminNote || '');
                    setActionReason('Обновление служебной заметки');
                  }}
                  className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-white text-xs font-medium transition-all flex items-center gap-2 cursor-pointer"
                >
                  <FileText size={14} />
                  <span>Заметка саппорта</span>
                </button>

                {/* Open Ticket Button */}
                <button
                  onClick={() => {
                    setViewMode('tickets');
                    setTicketSearch(String(user.telegramId));
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-medium transition-all flex items-center gap-2 cursor-pointer ml-auto"
                >
                  <Headphones size={14} />
                  <span>Перейти в диалог поддержки →</span>
                </button>
              </div>

              {/* Subtabs for Details */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-white/10 pb-2 overflow-x-auto">
                  {[
                    { id: 'overview', label: 'Обзор' },
                    { id: 'orders', label: `Депозиты (${data?.recentDeposits.length || 0})` },
                    { id: 'withdrawals', label: `Выводы (${data?.recentWithdrawals.length || 0})` },
                    { id: 'bets', label: `Ставки (${data?.recentBets.length || 0})` },
                    { id: 'audits', label: `Аудит саппорта (${data?.recentAudits.length || 0})` },
                    { id: 'alerts', label: `Безопасность (${data?.alerts.length || 0})` },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={cn(
                        'px-4 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap',
                        activeTab === tab.id
                          ? 'bg-white/10 text-white shadow-sm'
                          : 'text-whisper-gray hover:text-white'
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab content renders */}
                {activeTab === 'overview' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-whisper-gray mb-3">
                        Заметка администратора
                      </h4>
                      <p className="text-sm text-zinc-300 whitespace-pre-wrap">
                        {user.adminNote || 'Заметка отсутствует.'}
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-whisper-gray mb-3">
                        Антифрод и SmartDrain
                      </h4>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-zinc-400">SmartDrain:</span>
                          <span className={user.drain.active ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                            {user.drain.active ? `АКТИВЕН (${user.drain.roundsLeft} раундов)` : 'Не активен'}
                          </span>
                        </div>
                        {user.drain.reason && (
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Причина дрейна:</span>
                            <span className="text-white">{user.drain.reason}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'orders' && (
                  <div className="space-y-2">
                    {data?.recentDeposits.length === 0 ? (
                      <div className="p-6 text-center text-xs text-zinc-500">Депозитов нет</div>
                    ) : (
                      data?.recentDeposits.map((dep) => (
                        <div key={dep.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/10 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-white block">{dep.description}</span>
                            <span className="text-[10px] text-zinc-500">{formatDateTime(dep.createdAt)}</span>
                          </div>
                          <span className="font-bold text-emerald-400 text-sm">+{dep.amount.toFixed(2)} zł</span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'withdrawals' && (
                  <div className="space-y-2">
                    {data?.recentWithdrawals.length === 0 ? (
                      <div className="p-6 text-center text-xs text-zinc-500">Заявок на вывод нет</div>
                    ) : (
                      data?.recentWithdrawals.map((w) => (
                        <div key={w.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/10 flex items-center justify-between text-xs">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">{w.method.toUpperCase()}</span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 border border-white/10 text-zinc-300">
                                {w.status}
                              </span>
                            </div>
                            <span className="text-[10px] text-zinc-500">{formatDateTime(w.createdAt)}</span>
                            {w.rejectionReason && (
                              <p className="text-[11px] text-rose-400 mt-1">Причина отказа: {w.rejectionReason}</p>
                            )}
                          </div>
                          <span className="font-bold text-amber-400 text-sm">-{w.amount.toFixed(2)} zł</span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'bets' && (
                  <div className="space-y-2">
                    {data?.recentBets.length === 0 ? (
                      <div className="p-6 text-center text-xs text-zinc-500">Ставок нет</div>
                    ) : (
                      data?.recentBets.map((b) => (
                        <div key={b.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/10 flex items-center justify-between text-xs">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white uppercase">{b.gameType}</span>
                              <span className={cn('text-[10px] px-2 py-0.5 rounded', b.payout > 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300')}>
                                {b.state}
                              </span>
                            </div>
                            <span className="text-[10px] text-zinc-500">{formatDateTime(b.placedAt)}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-zinc-400 block">Ставка: {b.amount.toFixed(2)} zł</span>
                            <span className={cn('font-bold', b.payout > 0 ? 'text-emerald-400' : 'text-zinc-500')}>
                              Выигрыш: {b.payout.toFixed(2)} zł (x{b.multiplier.toFixed(2)})
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'audits' && (
                  <div className="space-y-2">
                    {data?.recentAudits.length === 0 ? (
                      <div className="p-6 text-center text-xs text-zinc-500">Аудиторских записей нет</div>
                    ) : (
                      data?.recentAudits.map((a) => (
                        <div key={a.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/10 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-white block">{a.action}</span>
                            <span className="text-zinc-400 text-[11px] block">{a.reason || 'Без причины'}</span>
                            <span className="text-[10px] text-zinc-500">{formatDateTime(a.createdAt)}</span>
                          </div>
                          <span className="text-[10px] text-zinc-400">Админ TG: {a.adminTelegramId}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'alerts' && (
                  <div className="space-y-2">
                    {data?.alerts.length === 0 ? (
                      <div className="p-6 text-center text-xs text-zinc-500">Предупреждений безопасности нет</div>
                    ) : (
                      data?.alerts.map((al) => (
                        <div key={al.id} className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-rose-300 block">{al.type} ({al.severity})</span>
                            <span className="text-zinc-300 text-[11px] block">{al.message}</span>
                            <span className="text-[10px] text-zinc-500">{formatDateTime(al.createdAt)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Confirmation Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/20 bg-[#12141A] p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles size={18} className="text-emerald-400" />
              <span>{actionModal.title}</span>
            </h3>

            {actionModal.type === 'grant_freebet' && (
              <div>
                <label className="text-xs text-whisper-gray block mb-1">
                  Сумма фрибета (PLN):
                </label>
                <input
                  type="number"
                  value={actionAmount}
                  onChange={(e) => setActionAmount(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-frost-white text-sm outline-none"
                  min="1"
                />
              </div>
            )}

            {actionModal.type === 'append_note' && (
              <div>
                <label className="text-xs text-whisper-gray block mb-1">
                  Текст заметки:
                </label>
                <textarea
                  rows={3}
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-frost-white text-sm outline-none resize-none"
                />
              </div>
            )}

            <div>
              <label className="text-xs text-whisper-gray block mb-1">
                Обоснование / Причина (для аудита):
              </label>
              <input
                type="text"
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Например: обращение в саппорт по поводу задержки..."
                className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-frost-white text-sm outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActionModal(null)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl text-xs text-whisper-gray hover:text-frost-white transition-colors cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleQuickAction}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium text-xs hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
              >
                {actionLoading ? 'Выполнение...' : 'Подтвердить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
