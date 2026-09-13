'use client';

import { useState, useEffect, useCallback } from 'react';
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

export default function SupportWorkspacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SupportLookupData | null>(null);

  // Quick Action Modal State
  const [actionModal, setActionModal] = useState<{
    type: 'clear_wager' | 'toggle_withdrawal_lock' | 'grant_freebet' | 'append_note';
    title: string;
  } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionAmount, setActionAmount] = useState('50');
  const [actionNote, setActionNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

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

  useEffect(() => {
    if (initialQuery) {
      void doSearch(initialQuery);
    }
  }, [initialQuery, doSearch]);

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
    } catch (e: any) {
      alert(e?.message || 'Ошибка сети');
    } finally {
      setActionLoading(false);
    }
  };

  const user = data?.user;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-frost-white flex items-center gap-2.5">
            Рабочее место поддержки
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-normal">
              1-Screen Diagnosis
            </span>
          </h1>
          <p className="text-sm text-whisper-gray mt-1">
            Быстрая диагностика игрока, баланс, вейджер, история транзакций и моментальные действия.
          </p>
        </div>
        <HelpButton title="Справка: Рабочее место поддержки">
          <div className="space-y-3 text-xs text-frost-white/80">
            <p>
              <strong>Поиск:</strong> введите ник Telegram без знака @, прямой ID пользователя Telegram или UUID аккаунта.
            </p>
            <p>
              <strong>Диагностика вывода:</strong> если у игрока не нажимается вывод, проверьте оставшийся вейджер (открутку) и переключатель "Заблокировать вывод".
            </p>
            <p>
              <strong>Сброс вейджера:</strong> устанавливает текущий прогресс равным целевому, открывая возможность мгновенного вывода.
            </p>
            <p>
              <strong>Дрейн:</strong> индикатор специального режима слива баланса при подозрительной активности.
            </p>
          </div>
        </HelpButton>
      </div>

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
            placeholder="Поиск игрока: @username, Telegram ID (например 12345678) или UUID..."
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
            {/* User Details */}
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
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-xl font-bold text-frost-white">
                    {user.firstName || user.username || 'Без имени'} {user.lastName || ''}
                  </h2>
                  {user.username && (
                    <span className="text-sm text-whisper-gray font-mono">@{user.username}</span>
                  )}
                  {user.vip && (
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold flex items-center gap-1">
                      <Sparkles size={11} />
                      VIP {user.vip.tier} (Ур. {user.vip.level})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 mt-1.5 text-xs text-whisper-gray flex-wrap">
                  <span className="font-mono">TG ID: {user.telegramId}</span>
                  <span>•</span>
                  <span className="font-mono truncate max-w-[220px]">UID: {user.id}</span>
                  <span>•</span>
                  <span>Регистрация: {new Date(user.createdAt).toLocaleDateString('ru-RU')}</span>
                </div>

                {/* Direct Telegram Chat Link */}
                <div className="mt-3 flex items-center gap-2">
                  <a
                    href={
                      user.username
                        ? `https://t.me/${user.username}`
                        : `tg://user?id=${user.telegramId}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs font-medium hover:bg-blue-500/25 transition-colors"
                  >
                    <Send size={12} />
                    <span>Открыть чат в Telegram</span>
                    <ExternalLink size={11} className="opacity-70" />
                  </a>

                  <button
                    onClick={() => router.push(`/system/console/users?q=${user.id}`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/[0.05] border border-white/10 text-frost-white text-xs font-medium hover:bg-white/[0.1] transition-colors"
                  >
                    <User size={12} />
                    <span>Профиль в консоли</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Status Badges */}
            <div className="flex flex-wrap gap-2.5 self-stretch lg:self-center">
              {user.isBlocked ? (
                <div className="px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1.5">
                  <XCircle size={14} />
                  <span>Аккаунт заблокирован</span>
                </div>
              ) : (
                <div className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5">
                  <CheckCircle2 size={14} />
                  <span>Аккаунт активен</span>
                </div>
              )}

              {user.withdrawalLocked ? (
                <div className="px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1.5">
                  <Lock size={14} />
                  <span>Вывод заблокирован</span>
                </div>
              ) : (
                <div className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5">
                  <Unlock size={14} />
                  <span>Вывод разрешен</span>
                </div>
              )}

              {user.drain.active && (
                <div className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5 animate-pulse">
                  <AlertTriangle size={14} />
                  <span>Дрейн активен ({user.drain.roundsLeft} раундов)</span>
                </div>
              )}
            </div>
          </div>

          {/* Balance & Wager Diagnosis Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Balance Card */}
            <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02] relative overflow-hidden">
              <div className="text-xs uppercase tracking-wider text-whisper-gray font-medium flex items-center justify-between">
                <span>Реальный баланс</span>
                <Coins size={16} className="text-amber-400" />
              </div>
              <div className="mt-3 text-3xl font-black text-white font-mono">
                {user.balance.toFixed(2)} <span className="text-sm font-normal text-amber-300">zł</span>
              </div>
              <p className="mt-1 text-xs text-whisper-gray">Доступные средства для игры и ставок</p>
            </div>

            {/* Wager Target Card */}
            <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02] relative overflow-hidden">
              <div className="text-xs uppercase tracking-wider text-whisper-gray font-medium flex items-center justify-between">
                <span>Вейджер (Открутка депозитов)</span>
                <Clock size={16} className="text-blue-400" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-black text-white font-mono">
                  {user.wagerProgress.toFixed(2)} / {user.wagerTarget.toFixed(2)}
                </span>
                <span className="text-xs text-whisper-gray">zł</span>
              </div>

              {/* Progress Bar */}
              <div className="mt-2.5 w-full bg-white/10 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-emerald-400 h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      user.wagerTarget > 0
                        ? Math.min(100, (user.wagerProgress / user.wagerTarget) * 100)
                        : 100
                    }%`,
                  }}
                />
              </div>

              <div className="mt-2 text-xs flex justify-between items-center text-whisper-gray">
                <span>Осталось отыграть:</span>
                <span
                  className={cn(
                    'font-mono font-bold',
                    user.remainingWager > 0 ? 'text-amber-400' : 'text-emerald-400'
                  )}
                >
                  {user.remainingWager.toFixed(2)} zł
                </span>
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
          </div>

          {/* Quick Actions Action Bar */}
          <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.02] flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-whisper-gray uppercase tracking-wider mr-2">
              Действия:
            </span>

            {/* Clear wager */}
            <button
              onClick={() =>
                setActionModal({
                  type: 'clear_wager',
                  title: 'Сбросить вейджер (открыть вывод)',
                })
              }
              className="px-3.5 py-2 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs font-medium hover:bg-blue-500/25 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Clock size={14} />
              <span>Сбросить вейджер</span>
            </button>

            {/* Toggle Withdrawal Lock */}
            <button
              onClick={() =>
                setActionModal({
                  type: 'toggle_withdrawal_lock',
                  title: user.withdrawalLocked ? 'Разблокировать вывод' : 'Заблокировать вывод',
                })
              }
              className={cn(
                'px-3.5 py-2 rounded-xl border text-xs font-medium transition-all flex items-center gap-2 cursor-pointer',
                user.withdrawalLocked
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-300 hover:bg-rose-500/25'
              )}
            >
              {user.withdrawalLocked ? <Unlock size={14} /> : <Lock size={14} />}
              <span>{user.withdrawalLocked ? 'Разблокировать вывод' : 'Заблокировать вывод'}</span>
            </button>

            {/* Grant Freebet */}
            <button
              onClick={() =>
                setActionModal({
                  type: 'grant_freebet',
                  title: 'Выдать компенсационный фрибет',
                })
              }
              className="px-3.5 py-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-medium hover:bg-purple-500/25 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Gift size={14} />
              <span>Выдать фрибет</span>
            </button>

            {/* Add note */}
            <button
              onClick={() =>
                setActionModal({
                  type: 'append_note',
                  title: 'Добавить служебную заметку саппорта',
                })
              }
              className="px-3.5 py-2 rounded-xl bg-white/[0.06] border border-white/15 text-frost-white text-xs font-medium hover:bg-white/[0.12] transition-all flex items-center gap-2 cursor-pointer"
            >
              <FileText size={14} />
              <span>Добавить заметку</span>
            </button>
          </div>

          {/* Admin Note Box */}
          {user.adminNote && (
            <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] text-xs">
              <div className="text-amber-400 font-semibold mb-1 flex items-center gap-1.5">
                <FileText size={13} />
                <span>Заметки администратора / саппорта:</span>
              </div>
              <pre className="text-frost-white/90 whitespace-pre-wrap font-sans text-xs leading-relaxed">
                {user.adminNote}
              </pre>
            </div>
          )}

          {/* History Tables Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Last 5 Deposits / Orders */}
            <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-frost-white flex items-center gap-2">
                  <ArrowDownToLine size={16} className="text-emerald-400" />
                  Последние депозиты (MacvPay)
                </h3>
              </div>

              {data.recentOrders.length === 0 ? (
                <div className="text-xs text-whisper-gray py-4 text-center">
                  Нет платежных заявок
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-white/5 text-whisper-gray/70">
                        <th className="pb-2">Сумма</th>
                        <th className="pb-2">Метод</th>
                        <th className="pb-2">Статус</th>
                        <th className="pb-2 text-right">Дата</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {data.recentOrders.map((ord) => (
                        <tr key={ord.id}>
                          <td className="py-2.5 font-mono font-bold text-white">
                            {ord.amount.toFixed(2)} zł
                          </td>
                          <td className="py-2.5 text-whisper-gray">{ord.paymentType}</td>
                          <td className="py-2.5">
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase',
                                ord.status === 'paid' || ord.status === 'credited'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : ord.status === 'pending'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-rose-500/20 text-rose-300'
                              )}
                            >
                              {ord.status}
                            </span>
                          </td>
                          <td className="py-2.5 text-right text-whisper-gray font-mono">
                            {new Date(ord.createdAt).toLocaleDateString('ru-RU')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Last 5 Withdrawals */}
            <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-frost-white flex items-center gap-2">
                  <ArrowUpFromLine size={16} className="text-amber-400" />
                  Последние заявки на вывод
                </h3>
              </div>

              {data.recentWithdrawals.length === 0 ? (
                <div className="text-xs text-whisper-gray py-4 text-center">
                  Нет заявок на вывод
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-white/5 text-whisper-gray/70">
                        <th className="pb-2">Сумма</th>
                        <th className="pb-2">Метод / Реквизит</th>
                        <th className="pb-2">Статус</th>
                        <th className="pb-2 text-right">Дата</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {data.recentWithdrawals.map((w) => (
                        <tr key={w.id}>
                          <td className="py-2.5 font-mono font-bold text-white">
                            {w.amount.toFixed(2)} zł
                          </td>
                          <td className="py-2.5 text-whisper-gray font-mono truncate max-w-[140px]">
                            {w.method}: {w.destination}
                          </td>
                          <td className="py-2.5">
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase',
                                w.status === 'completed' || w.status === 'approved'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : w.status === 'pending'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-rose-500/20 text-rose-300'
                              )}
                            >
                              {w.status}
                            </span>
                          </td>
                          <td className="py-2.5 text-right text-whisper-gray font-mono">
                            {new Date(w.createdAt).toLocaleDateString('ru-RU')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Last 5 Bets */}
            <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-frost-white flex items-center gap-2">
                  <Coins size={16} className="text-purple-400" />
                  Последние ставки
                </h3>
              </div>

              {data.recentBets.length === 0 ? (
                <div className="text-xs text-whisper-gray py-4 text-center">Нет ставок</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-white/5 text-whisper-gray/70">
                        <th className="pb-2">Игра</th>
                        <th className="pb-2">Ставка</th>
                        <th className="pb-2">Коэф / Выигрыш</th>
                        <th className="pb-2 text-right">Дата</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {data.recentBets.map((b) => (
                        <tr key={b.id}>
                          <td className="py-2.5 text-whisper-gray uppercase font-semibold">
                            {b.gameType}
                          </td>
                          <td className="py-2.5 font-mono text-white">{b.amount.toFixed(2)} zł</td>
                          <td className="py-2.5 font-mono">
                            {b.payout > 0 ? (
                              <span className="text-emerald-400">
                                x{b.multiplier.toFixed(2)} (+{b.payout.toFixed(2)} zł)
                              </span>
                            ) : (
                              <span className="text-rose-400/80">0.00 zł</span>
                            )}
                          </td>
                          <td className="py-2.5 text-right text-whisper-gray font-mono">
                            {new Date(b.placedAt).toLocaleTimeString('ru-RU', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Anti-Fraud Alerts & Audits */}
            <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-frost-white flex items-center gap-2">
                  <ShieldAlert size={16} className="text-rose-400" />
                  Алерты безопасности и действия
                </h3>
              </div>

              {data.alerts.length === 0 && data.recentAudits.length === 0 ? (
                <div className="text-xs text-whisper-gray py-4 text-center">
                  Нет подозрительных записей или аудита
                </div>
              ) : (
                <div className="space-y-2.5">
                  {data.alerts.map((al) => (
                    <div
                      key={al.id}
                      className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-start gap-2"
                    >
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="font-semibold">{al.type}</div>
                        <div className="text-rose-200/80 mt-0.5">{al.message}</div>
                      </div>
                      <span className="text-[10px] text-whisper-gray font-mono">
                        {new Date(al.createdAt).toLocaleDateString('ru-RU')}
                      </span>
                    </div>
                  ))}

                  {data.recentAudits.map((au) => (
                    <div
                      key={au.id}
                      className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-frost-white/90 flex items-start gap-2"
                    >
                      <FileText size={14} className="shrink-0 text-whisper-gray mt-0.5" />
                      <div className="flex-1">
                        <div className="font-semibold text-whisper-gray">{au.action}</div>
                        {au.reason && <div className="text-whisper-gray/80 mt-0.5">{au.reason}</div>}
                      </div>
                      <span className="text-[10px] text-whisper-gray font-mono">
                        {new Date(au.createdAt).toLocaleDateString('ru-RU')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0e1017] border border-white/20 rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-frost-white">{actionModal.title}</h3>

            {actionModal.type === 'grant_freebet' && (
              <div>
                <label className="text-xs text-whisper-gray block mb-1">Сумма фрибета (PLN):</label>
                <input
                  type="number"
                  min="1"
                  value={actionAmount}
                  onChange={(e) => setActionAmount(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-frost-white text-sm outline-none"
                />
              </div>
            )}

            {actionModal.type === 'append_note' && (
              <div>
                <label className="text-xs text-whisper-gray block mb-1">Текст заметки:</label>
                <textarea
                  rows={3}
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder="Опишите вопрос, с которым обратился игрок..."
                  className="w-full bg-white/[0.05] border border-white/15 rounded-xl p-3 text-frost-white text-sm outline-none resize-none"
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
