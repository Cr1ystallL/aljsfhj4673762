'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy,
  Check,
  Crown,
  Lock,
  Percent,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Wallet,
  ChevronRight,
  X,
  Zap,
  Trophy,
  Coins,
} from 'lucide-react';
import { HelpButton } from '@/components/admin/help-button';
import { resolveGameKey, gameLabel } from '@/components/ui/game-icon';
import { VipBadge } from '@/components/vip/vip-badge';
import { VIP_RANKS, type VipStatusDto, type CashbackStatusDto } from '@/lib/vip';

/**
 * Admin → User detail page.
 *
 * Pulls everything `/api/_x/users/:id` returns:
 *   - profile + balance
 *   - aggregate stats
 *   - 30 most recent bets
 *   - 30 most recent transactions
 *   - 30 most recent admin-log entries for this user
 *
 * Provides three privileged actions:
 *   1. Adjust balance (positive or negative delta with required reason).
 *   2. Toggle "isBlocked" — fully blocks the account.
 *   3. Toggle "withdrawalLocked" — playing OK, withdraws blocked.
 *
 * Every mutating call carries the admin's reason and is recorded in the
 * audit log. UI optimistically refreshes after each call.
 */

interface UserDetail {
  ok: true;
  user: {
    id: string;
    telegramId: number;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    languageCode: string | null;
    photoUrl: string | null;
    isPremium: boolean;
    isBlocked: boolean;
    ignoreIpCollision: boolean;
    withdrawalLocked: boolean;
    adminNote: string | null;
    createdAt: number;
    updatedAt: number;
    balance: number;
    currency: string;
    wagerTarget: number;
    wagerProgress: number;
    xp?: number;
    vipLevel?: number;
  };
  vip?: VipStatusDto | null;
  cashback?: CashbackStatusDto | null;
  drain?: {
    active: boolean;
    roundsLeft: number;
    expiresAt: number;
    reason: string | null;
  };
  stats: {
    totalBets: number;
    wagered: number;
    paidOut: number;
    ggr: number;
    maxMultiplier: number;
    maxBet: number;
  };
  lastSeenAt: number | null;
  sessions: Array<{
    sessionId: string;
    createdAt: number;
    lastActivity: number;
    expiresAt: number;
    ipAddress: string | null;
    userAgent: string | null;
  }>;
  bets: Array<{
    id: string;
    gameType: string;
    amount: number;
    payout: number | null;
    multiplier: number | null;
    state: string;
    placedAt: number;
    resolvedAt: number | null;
    isTournament?: boolean;
    balanceType?: 'real' | 'tournament';
    tournamentId?: string | null;
    isScriptIntervened?: boolean;
    scriptReason?: string | null;
    metadata?: unknown;
    source?: string | null;
  }>;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    gameType: string | null;
    createdAt: number;
    metadata: unknown;
    source?: string | null;
  }>;
  totals?: {
    bets: number;
    transactions: number;
  };
  adminLog: Array<{
    id: string;
    action: string;
    adminTelegramId: number;
    payloadBefore: unknown;
    payloadAfter: unknown;
    reason: string | null;
    createdAt: number;
  }>;
  securityAlerts: Array<{
    id: string;
    type: string;
    severity: string;
    description: string;
    resolved: boolean;
    createdAt: number;
  }>;
}

type RtpMode = 'off' | 'earn' | 'give';

interface UserRtp {
  config: {
    mode: RtpMode;
    target: number;
    windowMs: number;
    intensity: number;
  };
  status: {
    mode: RtpMode;
    target: number;
    windowMs: number;
    intensity: number;
    windowStart: number;
    windowEnd: number;
    windowProfit: number;
    windowStake: number;
    signal: number;
    released: boolean;
  };
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const router = useRouter();
  const [data, setData] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [betLimit, setBetLimit] = useState(100);
  const [txLimit, setTxLimit] = useState(100);
  const [rtp, setRtp] = useState<UserRtp | null>(null);
  const [rtpBusy, setRtpBusy] = useState(false);
  const [rtpForm, setRtpForm] = useState<{
    mode: RtpMode;
    target: string;
    windowMinutes: string;
    intensity: string;
  }>({ mode: 'off', target: '0', windowMinutes: '60', intensity: '0.6' });

  const [wagerForm, setWagerForm] = useState({ target: '0', progress: '0' });
  const [wagerBusy, setWagerBusy] = useState(false);
  const [wagerHistory, setWagerHistory] = useState<any[]>([]);
  const [betFilter, setBetFilter] = useState<'all' | 'real' | 'tournament' | 'script'>('all');
  const [drainBusy, setDrainBusy] = useState(false);

  type Action = 'balance' | 'block' | 'lock' | 'whitelist' | null;
  const [action, setAction] = useState<Action>(null);
  const [delta, setDelta] = useState<string>('');
  const [txType, setTxType] = useState<string>('admin_adjustment');
  const [reason, setReason] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [vipLevel, setVipLevel] = useState<number>(0);
  const [vipXp, setVipXp] = useState<string>('0');
  const [vipBusy, setVipBusy] = useState(false);
  const [cbManualAmount, setCbManualAmount] = useState<string>('');
  const [cbReason, setCbReason] = useState<string>('');
  const [cbBusy, setCbBusy] = useState(false);

  const toggleDrain = async (enable: boolean, rounds = 200) => {
    const reason = prompt(
      enable
        ? `Причина установки слива (SmartDrain ${rounds} побед / 2 часа):`
        : 'Причина снятия со слива:'
    );
    if (!reason || reason.trim().length < 3) return;
    setDrainBusy(true);
    try {
      if (enable) {
        await fetch(`/api/_x/users/${userId}/drain`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rounds,
            durationMs: 2 * 3600 * 1000,
            reason: reason.trim(),
          }),
        });
      } else {
        await fetch(`/api/_x/users/${userId}/drain`, {
          method: 'DELETE',
          credentials: 'include',
        });
      }
      await reload();
    } finally {
      setDrainBusy(false);
    }
  };

  const filteredBets = (data?.bets ?? []).filter((b) => {
    if (betFilter === 'real') return !b.isTournament;
    if (betFilter === 'tournament') return !!b.isTournament;
    if (betFilter === 'script') return !!b.isScriptIntervened;
    return true;
  });

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/_x/users/${userId}?betLimit=${betLimit}&txLimit=${txLimit}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        setError('not-found');
        return;
      }
      const j = (await res.json()) as UserDetail;
      setData(j);
      if (j.user) {
        setWagerForm({ target: String(j.user.wagerTarget), progress: String(j.user.wagerProgress) });
      }
      setError(null);
    } catch {
      setError('not-found');
    }
  }, [userId, betLimit, txLimit]);

  const loadRtp = useCallback(async () => {
    try {
      const res = await fetch(`/api/_x/users/${userId}/rtp`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const j = (await res.json()) as { ok: boolean } & UserRtp;
      setRtp(j);
      setRtpForm({
        mode: j.config.mode,
        target: String(j.config.target),
        windowMinutes: String(Math.floor(j.config.windowMs / 60000)),
        intensity: String(j.config.intensity),
      });
    } catch {
      // ignore
    }
  }, [userId]);

  const loadWagerHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/_x/users/${userId}/wager-history`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const j = await res.json();
      if (j.history) setWagerHistory(j.history);
    } catch {
      // ignore
    }
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void loadRtp();
  }, [loadRtp]);

  useEffect(() => {
    void loadWagerHistory();
  }, [loadWagerHistory]);

  useEffect(() => {
    if (data?.vip) {
      setVipLevel(data.vip.currentTier.level);
      setVipXp(String(data.vip.xp));
    } else if (data?.user) {
      setVipLevel(data.user.vipLevel ?? 0);
      setVipXp(String(data.user.xp ?? 0));
    }
  }, [data]);

  const submitVip = async () => {
    setVipBusy(true);
    try {
      const res = await fetch(`/api/_x/users/${userId}/vip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          vipLevel: Number(vipLevel),
          xp: Number(vipXp) || 0,
          reason: 'Admin panel update',
        }),
      });
      if (!res.ok) {
        alert('Не удалось обновить VIP ранг');
        return;
      }
      await reload();
      alert('VIP ранг и XP успешно обновлены!');
    } catch {
      alert('Ошибка сети');
    } finally {
      setVipBusy(false);
    }
  };

  const submitCashback = async (action: 'reset_cooldown' | 'credit') => {
    setCbBusy(true);
    try {
      const body: any = { action, reason: cbReason || 'Admin action' };
      if (action === 'credit') {
        const amt = parseFloat(cbManualAmount);
        if (!amt || amt <= 0) {
          alert('Укажите корректную сумму');
          setCbBusy(false);
          return;
        }
        body.amount = amt;
      }

      const res = await fetch(`/api/_x/users/${userId}/cashback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        alert(j?.error || 'Не удалось обновить кэшбэк');
        return;
      }
      setCbManualAmount('');
      setCbReason('');
      await reload();
      alert(action === 'reset_cooldown' ? 'Кулдаун кэшбэка сброшен!' : 'Кэшбэк успешно начислен!');
    } catch {
      alert('Ошибка сети');
    } finally {
      setCbBusy(false);
    }
  };

  const handleCopyId = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(String(data.user.telegramId));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const submitAction = async () => {
    if (!data || !action) return;
    if (!reason.trim() || reason.trim().length < 3) return;

    setBusy(true);
    try {
      if (action === 'balance') {
        // Поддерживаем «100,5» (русская локаль) и «+50» (явный плюс) —
        // input теперь type=text, поэтому валидируем сами.
        const normalized = delta.trim().replace(',', '.').replace(/^\+/, '');
        const num = parseFloat(normalized);
        if (!Number.isFinite(num) || num === 0) {
          setBusy(false);
          return;
        }
        const res = await fetch(
          `/api/_x/users/${userId}/balance`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delta: num, reason: reason.trim(), txType }),
          }
        );
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          alert(j?.message ?? 'Не удалось изменить баланс');
          setBusy(false);
          return;
        }
      } else if (action === 'block') {
        const res = await fetch(`/api/_x/users/${userId}/flags`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isBlocked: !data.user.isBlocked,
            reason: reason.trim(),
          }),
        });
        if (!res.ok) {
          alert('Не удалось изменить блокировку');
          setBusy(false);
          return;
        }
      } else if (action === 'lock') {
        const res = await fetch(`/api/_x/users/${userId}/flags`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            withdrawalLocked: !data.user.withdrawalLocked,
            reason: reason.trim(),
          }),
        });
        if (!res.ok) {
          alert('Не удалось изменить блок вывода');
          setBusy(false);
          return;
        }
      } else if (action === 'whitelist') {
        const res = await fetch(`/api/_x/users/${userId}/flags`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ignoreIpCollision: !data.user.ignoreIpCollision,
            reason: reason.trim(),
          }),
        });
        if (!res.ok) {
          alert('Не удалось изменить белый список');
          setBusy(false);
          return;
        }
      }

      // Success — refresh and close.
      setAction(null);
      setDelta('');
      setReason('');
      await reload();
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <>
        <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-6 text-center font-roobert text-[12px] text-whisper-gray">
          Игрок не найден.
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

  const u = data.user;
  const initials = (u.firstName?.charAt(0) ?? 'U').toUpperCase();

  const formatDate = (ts: number | null) =>
    ts
      ? new Date(ts).toLocaleString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';

  const submitRtp = async () => {
    if (!rtp) return;
    const reason = prompt('Причина изменения RTP (минимум 3 символа):');
    if (!reason || reason.trim().length < 3) return;
    setRtpBusy(true);
    try {
      const body = {
        mode: rtpForm.mode,
        target: parseFloat(rtpForm.target) || 0,
        windowMs: Math.round((parseFloat(rtpForm.windowMinutes) || 60) * 60000),
        intensity: Math.min(1, Math.max(0, parseFloat(rtpForm.intensity) || 0)),
        reason: reason.trim(),
      };
      const res = await fetch(`/api/_x/users/${userId}/rtp`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const j = (await res.json()) as { ok: boolean } & UserRtp;
        setRtp(j);
        setRtpForm({
          mode: j.config.mode,
          target: String(j.config.target),
          windowMinutes: String(Math.floor(j.config.windowMs / 60000)),
          intensity: String(j.config.intensity),
        });
        alert('Персональный RTP обновлён');
      } else {
        alert('Не удалось обновить RTP');
      }
    } catch {
      alert('Ошибка сети при обновлении RTP');
    } finally {
      setRtpBusy(false);
    }
  };

  const submitWager = async () => {
    if (!data) return;
    const reason = prompt('Причина изменения Вейджера (минимум 3 символа):');
    if (!reason || reason.trim().length < 3) return;
    setWagerBusy(true);
    try {
      const body = {
        wagerTarget: parseFloat(wagerForm.target) || 0,
        wagerProgress: parseFloat(wagerForm.progress) || 0,
        reason: reason.trim(),
      };
      const res = await fetch(`/api/_x/users/${userId}/wager`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await reload();
        alert('Вейджер обновлён');
      } else {
        alert('Не удалось обновить Вейджер');
      }
    } catch {
      alert('Ошибка сети при обновлении Вейджера');
    } finally {
      setWagerBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-5">
        {/* Identity card */}
        <section className="relative overflow-hidden rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-sm">
          <div
            aria-hidden
            className="absolute inset-0 opacity-50"
            style={{
              background:
                'radial-gradient(120% 110% at 80% 110%, rgba(165, 45, 37, 0.20) 0%, rgba(255, 172, 46, 0.10) 35%, transparent 75%)',
            }}
          />
          <div className="relative px-5 py-5 flex items-start gap-4">
            {u.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={u.photoUrl}
                alt={u.firstName || 'Игрок'}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-pill border border-white/15 object-cover"
                draggable={false}
              />
            ) : (
              <span className="w-16 h-16 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center font-roobert text-[20px] text-frost-white">
                {initials}
              </span>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-roobert text-[20px] text-frost-white truncate">
                  {(u.firstName ?? '') + (u.lastName ? ` ${u.lastName}` : '') ||
                    'Игрок'}
                </span>
                {u.isBlocked && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill border border-[rgba(165,45,37,0.5)] bg-[rgba(165,45,37,0.18)] text-[10px] uppercase tracking-[0.18em] text-[#ff8a76] font-roobert">
                    <ShieldAlert size={10} strokeWidth={1.8} /> Блок
                  </span>
                )}
                {u.withdrawalLocked && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill border border-amber-400/40 bg-amber-400/10 text-[10px] uppercase tracking-[0.18em] text-amber-200 font-roobert">
                    <Lock size={10} strokeWidth={1.8} /> Вывод
                  </span>
                )}
                {u.ignoreIpCollision && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill border border-emerald-400/40 bg-emerald-400/10 text-[10px] uppercase tracking-[0.18em] text-emerald-200 font-roobert">
                    <Check size={10} strokeWidth={1.8} /> Whitelist
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleCopyId}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill border border-white/15 bg-white/[0.04] hover:border-white/25 transition-colors"
                >
                  <span className="font-roobert text-[11px] text-whisper-gray tabular-nums">
                    #{u.telegramId}
                  </span>
                  {copied ? (
                    <Check size={11} strokeWidth={2} />
                  ) : (
                    <Copy size={11} strokeWidth={1.7} />
                  )}
                </button>
                {u.username && (
                  <span className="font-roobert text-[11px] text-whisper-gray">
                    @{u.username}
                  </span>
                )}
                <span className="font-roobert text-[11px] text-whisper-gray">
                  Зарегистрирован{' '}
                  {new Date(u.createdAt).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                  })}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill border border-white/15 bg-white/[0.04]">
                  <Wallet size={13} className="text-frost-white/70" strokeWidth={1.7} />
                  <span className="font-roobert text-frost-white text-[14px] tabular-nums font-bold">
                    {u.balance.toLocaleString('ru-RU', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span className="font-roobert text-whisper-gray text-[11px]">
                    {u.currency}
                  </span>
                </div>

                {data.vip && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-pill border border-amber-400/30 bg-amber-950/20">
                    <VipBadge rankId={data.vip.currentTier.id} size="sm" />
                    <span className="font-roobert text-white text-[12px] font-extrabold">
                      {data.vip.currentTier.nameRu} (Lvl {data.vip.currentTier.level})
                    </span>
                    <span className="text-amber-300 text-[11px] font-mono">
                      {data.vip.xp.toLocaleString('ru-RU')} XP
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* VIP & Cashback Management Section */}
        <section className="rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <Crown size={15} className="text-amber-400" />
              <span className="font-roobert text-[12px] uppercase tracking-[0.1em] text-white font-bold">
                Управление VIP Рангом & Кэшбэком
              </span>
            </div>
          </div>

          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. VIP Rank Editor */}
            <div className="p-4 rounded-2xl border border-white/10 bg-black/40 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-roobert text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <Crown size={14} /> VIP Ранг и Опыт (XP)
                </span>
                {data?.vip && (
                  <span className="text-[11px] text-white/50">
                    Текущий: <b className="text-white">{data.vip.currentTier.nameRu}</b>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-whisper-gray">Уровень ранга</label>
                  <select
                    value={vipLevel}
                    onChange={(e) => setVipLevel(Number(e.target.value))}
                    className="rounded-xl border border-white/10 bg-[#14161c] px-3 py-2 text-white text-xs"
                  >
                    {VIP_RANKS.map((r) => (
                      <option key={r.id} value={r.level}>
                        Lvl {r.level} — {r.nameRu} ({r.cashbackPercent}% кэшбэк)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-whisper-gray">XP (Опыт)</label>
                  <input
                    type="number"
                    value={vipXp}
                    onChange={(e) => setVipXp(e.target.value)}
                    className="rounded-xl border border-white/10 bg-[#14161c] px-3 py-2 text-white text-xs font-mono"
                    placeholder="0"
                  />
                </div>
              </div>

              <button
                onClick={submitVip}
                disabled={vipBusy}
                className="w-full mt-1 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-xs transition-colors shadow-md disabled:opacity-50"
              >
                {vipBusy ? 'Сохраняю…' : '💾 Сохранить VIP Ранг и XP'}
              </button>
            </div>

            {/* 2. Cashback Management */}
            <div className="p-4 rounded-2xl border border-white/10 bg-black/40 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-roobert text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <Percent size={14} /> Еженедельный Кэшбэк
                </span>
                <span className="text-[11px] text-white/50">
                  Ставка: <b className="text-emerald-400">{data?.cashback?.cashbackPercent ?? 2}%</b>
                </span>
              </div>

              {data?.cashback && (
                <div className="grid grid-cols-3 gap-1.5 text-center bg-white/[0.03] p-2.5 rounded-xl border border-white/5 text-[10.5px]">
                  <div>
                    <span className="text-white/40 block">Оборот</span>
                    <span className="font-bold text-white">{data.cashback.totalWagered.toFixed(0)} zł</span>
                  </div>
                  <div>
                    <span className="text-white/40 block">Проигрыш</span>
                    <span className="font-bold text-white">{data.cashback.netLoss.toFixed(0)} zł</span>
                  </div>
                  <div>
                    <span className="text-white/40 block">К выплате</span>
                    <span className="font-bold text-emerald-400">{data.cashback.amount.toFixed(2)} zł</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => submitCashback('reset_cooldown')}
                  disabled={cbBusy}
                  className="flex-1 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  🔄 Сбросить кулдаун
                </button>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                <input
                  type="number"
                  value={cbManualAmount}
                  onChange={(e) => setCbManualAmount(e.target.value)}
                  placeholder="Сумма (zł)"
                  className="w-28 rounded-xl border border-white/10 bg-[#14161c] px-3 py-2 text-white text-xs font-mono"
                />
                <button
                  onClick={() => submitCashback('credit')}
                  disabled={cbBusy || !cbManualAmount}
                  className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs transition-colors disabled:opacity-50"
                >
                  {cbBusy ? '...' : '✨ Начислить вручную'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Wager Controls */}
        <section className="rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="font-roobert text-[10.5px] uppercase tracking-[0.05em] text-whisper-gray">
              Управление Вейджером
            </span>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="font-roobert text-[11px] text-whisper-gray">Цель Вейджера (wagerTarget)</label>
              <input
                type="number"
                value={wagerForm.target}
                onChange={(e) => setWagerForm((f) => ({ ...f, target: e.target.value }))}
                className="rounded-card border border-white/10 bg-white/[0.04] px-3 py-2 text-frost-white text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-roobert text-[11px] text-whisper-gray">Прогресс Вейджера (wagerProgress)</label>
              <input
                type="number"
                value={wagerForm.progress}
                onChange={(e) => setWagerForm((f) => ({ ...f, progress: e.target.value }))}
                className="rounded-card border border-white/10 bg-white/[0.04] px-3 py-2 text-frost-white text-[13px]"
              />
            </div>
          </div>
          <div className="flex items-center justify-end px-4 pb-4 border-b border-white/10">
            <div className="flex gap-2">
              <button
                onClick={submitWager}
                disabled={wagerBusy}
                className="px-4 py-2 rounded-pill border border-white/20 bg-white/[0.08] text-[12px] text-frost-white hover:border-white/30 disabled:opacity-50"
              >
                {wagerBusy ? 'Сохраняю…' : 'Сохранить Вейджер'}
              </button>
            </div>
          </div>
          <div className="p-4">
            <h3 className="font-roobert text-[11px] text-whisper-gray mb-3 uppercase tracking-wider">История изменения вейджера</h3>
            {wagerHistory.length === 0 ? (
              <div className="text-[12px] text-white/50 italic">История пуста.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {wagerHistory.map((item, i) => (
                  <div key={i} className="flex justify-between items-center text-[12px] bg-white/[0.02] p-2 rounded-lg border border-white/5">
                    <div>
                      <span className="text-frost-white font-medium">{item.reason}</span>
                      <span className="text-white/40 ml-2 text-[10px]">{formatDate(new Date(item.date).getTime())}</span>
                      <div className="text-[10px] text-whisper-gray mt-1">Тип: {item.action} {item.amount ? `· Сумма: ${item.amount} PLN` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Activity & sessions */}
        <section className="rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex flex-col gap-1">
              <span className="font-roobert text-[10.5px] uppercase tracking-[0.05em] text-whisper-gray">
                Активность
              </span>
              <span className="font-roobert text-[12px] text-frost-white">
                Последняя активность: {formatDate(data.lastSeenAt)} · Сессий: {data.sessions.length}
              </span>
            </div>
            <HelpButton title="Сессии и активность" size={12}>
              <p>lastSeen строится по последней активности в живых сессиях (Redis).</p>
              <p>Отзыв сессии на странице «Сессии» вылогинивает пользователя при следующем запросе.</p>
            </HelpButton>
          </div>
          {data.sessions.length === 0 ? (
            <div className="p-4 font-roobert text-[12px] text-whisper-gray">Активных сессий нет.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {data.sessions.map((s) => (
                <div
                  key={s.sessionId}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="font-roobert text-[12px] text-frost-white truncate">{s.sessionId}</div>
                    <div className="font-roobert text-[10px] text-whisper-gray tabular-nums truncate">
                      IP: {s.ipAddress ?? '—'} · UA: {s.userAgent ?? '—'}
                    </div>
                  </div>
                  <div className="text-right font-roobert text-[11px] text-whisper-gray tabular-nums">
                    Создана: {formatDate(s.createdAt)}
                  </div>
                  <div className="text-right font-roobert text-[11px] text-frost-white tabular-nums">
                    Активность: {formatDate(s.lastActivity)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Stats grid */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Ставок" value={data.stats.totalBets.toLocaleString('ru-RU')} />
          <Stat
            label="Оборот"
            value={`${data.stats.wagered.toLocaleString('ru-RU', {
              maximumFractionDigits: 0,
            })} zł`}
          />
          <Stat
            label="GGR"
            value={`${data.stats.ggr.toLocaleString('ru-RU', {
              maximumFractionDigits: 0,
            })} zł`}
            warn={data.stats.ggr < 0}
          />
          <Stat
            label="Макс. кф"
            value={
              data.stats.maxMultiplier > 0
                ? `x${data.stats.maxMultiplier.toFixed(2)}`
                : '—'
            }
          />
        </section>

        {/* Actions */}
        <section className="rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="font-roobert text-[10.5px] uppercase tracking-[0.05em] text-whisper-gray">
                Действия
              </span>
              {data.drain?.active && (
                <span className="px-2 py-0.5 rounded-pill bg-red-500/20 border border-red-500/40 text-red-300 font-mono text-[10px] font-bold animate-pulse inline-flex items-center gap-1">
                  <Zap size={10} className="text-red-400" />
                  SmartDrain АКТИВЕН ({data.drain.roundsLeft} раунд.)
                </span>
              )}
            </div>
            <HelpButton title="Действия с игроком" size={12}>
              <p>
                Каждое действие требует <strong>причину</strong> минимум
                3 символа — она сохраняется в журнале аудита и видна другим
                админам в разделе «Аудит».
              </p>
              <p>
                <strong>SmartDrain:</strong> в минах это жёсткая мина на каждом клике. Счётчик жжёт только выигрыши, не 1 zł пробы. По умолчанию 200 побед или 2 часа.
              </p>
            </HelpButton>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-white/5">
            <ActionButton
              label="Изменить баланс"
              hint="Кредит / дебет с причиной"
              onClick={() => {
                setAction('balance');
                setDelta('');
                setReason('');
              }}
            />
            <ActionButton
              label={data.drain?.active ? '⚡ Снять со слива' : '⚡ Поставить на слив'}
              hint={data.drain?.active ? `SmartDrain: ${data.drain.roundsLeft} побед` : 'Слив SmartDrain (200 побед / 2 часа)'}
              danger={Boolean(data.drain?.active)}
              onClick={() => toggleDrain(!data.drain?.active, 200)}
            />
            <ActionButton
              label={u.isBlocked ? 'Снять блокировку' : 'Заблокировать'}
              hint={u.isBlocked ? 'Игрок снова может играть' : 'Запрет на игры и выводы'}
              danger={!u.isBlocked}
              onClick={() => {
                setAction('block');
                setReason('');
              }}
            />
            <ActionButton
              label={
                u.withdrawalLocked ? 'Разрешить вывод' : 'Заморозить вывод'
              }
              hint={
                u.withdrawalLocked
                  ? 'Снять блок на вывод'
                  : 'Игры разрешены, выводы — нет'
              }
              onClick={() => {
                setAction('lock');
                setReason('');
              }}
            />
            <ActionButton
              label={u.ignoreIpCollision ? 'Убрать из Whitelist' : 'Добавить в Whitelist'}
              hint="Игнорировать совпадение IP"
              onClick={() => {
                setAction('whitelist');
                setReason('');
              }}
            />
          </div>
        </section>

        {/* Recent bets */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-1 mb-2.5 gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
                Последние ставки
              </span>
              {/* Filter tabs */}
              <div className="flex flex-wrap items-center gap-1 bg-white/[0.04] border border-white/10 p-0.5 rounded-pill text-[11px] font-roobert">
                <button
                  onClick={() => setBetFilter('all')}
                  className={`px-2.5 py-0.5 rounded-pill transition-all ${
                    betFilter === 'all'
                      ? 'bg-white/15 text-frost-white font-medium shadow-sm'
                      : 'text-whisper-gray hover:text-frost-white'
                  }`}
                >
                  Все ({data.bets.length})
                </button>
                <button
                  onClick={() => setBetFilter('real')}
                  className={`px-2.5 py-0.5 rounded-pill transition-all ${
                    betFilter === 'real'
                      ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-medium'
                      : 'text-whisper-gray hover:text-frost-white'
                  }`}
                >
                  💰 Реальный ({data.bets.filter((b) => !b.isTournament).length})
                </button>
                <button
                  onClick={() => setBetFilter('tournament')}
                  className={`px-2.5 py-0.5 rounded-pill transition-all ${
                    betFilter === 'tournament'
                      ? 'bg-amber-500/20 border border-amber-500/30 text-amber-300 font-medium'
                      : 'text-whisper-gray hover:text-frost-white'
                  }`}
                >
                  🏆 Турнирный ({data.bets.filter((b) => b.isTournament).length})
                </button>
                <button
                  onClick={() => setBetFilter('script')}
                  className={`px-2.5 py-0.5 rounded-pill transition-all ${
                    betFilter === 'script'
                      ? 'bg-red-500/20 border border-red-500/30 text-red-300 font-medium'
                      : 'text-whisper-gray hover:text-frost-white'
                  }`}
                >
                  ⚡ Скрипт ({data.bets.filter((b) => b.isScriptIntervened).length})
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-whisper-gray font-roobert">
              <span>
                {filteredBets.length} из {data.totals?.bets ?? data.bets.length}
              </span>
              {data.bets.length < (data.totals?.bets ?? Infinity) && data.bets.length < 500 && (
                <button
                  onClick={() => setBetLimit((v) => Math.min(500, v + 100))}
                  className="px-2 py-0.5 rounded-pill border border-white/15 bg-white/[0.05] hover:border-white/25 text-frost-white"
                >
                  Показать ещё
                </button>
              )}
            </div>
          </div>

          {filteredBets.length === 0 ? (
            <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-6 text-center font-roobert text-[12px] text-whisper-gray">
              {betFilter === 'all' ? 'Игрок ещё не делал ставок.' : 'Нет ставок по данному фильтру.'}
            </div>
          ) : (
            <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
              {filteredBets.map((b) => {
                const won = (b.payout ?? 0) > 0;
                const net = (b.payout ?? 0) - b.amount;
                return (
                  <div
                    key={b.id}
                    className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02] ${
                      b.isTournament
                        ? 'border-l-2 border-l-amber-400 bg-amber-400/[0.02]'
                        : b.isScriptIntervened
                        ? 'border-l-2 border-l-red-500 bg-red-500/[0.03]'
                        : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 font-roobert text-[13px] text-frost-white truncate">
                        <span className="font-semibold">{gameLabel(resolveGameKey(b.gameType))}</span>

                        {/* Balance source badge */}
                        {b.isTournament ? (
                          <span className="px-2 py-0.5 rounded-pill bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-[10px] font-bold inline-flex items-center gap-1">
                            🏆 Турнирный
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-pill bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 font-mono text-[10px] font-medium inline-flex items-center gap-1">
                            💰 Реальный
                          </span>
                        )}

                        {/* Script intervention badge */}
                        {b.isScriptIntervened ? (
                          <span
                            className="px-2 py-0.5 rounded-pill bg-red-500/20 border border-red-500/40 text-red-300 font-mono text-[10px] font-bold inline-flex items-center gap-1"
                            title={b.scriptReason || 'Вмешательство скрипта / RTP'}
                          >
                            ⚡ {b.scriptReason || 'Слив (SmartDrain)'}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded-pill bg-white/[0.03] border border-white/10 text-white/40 text-[9px] font-mono">
                            🎲 RNG
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 font-roobert text-[10px] text-whisper-gray tabular-nums truncate mt-0.5">
                        <span>{new Date(b.placedAt).toLocaleString('ru-RU')} · {b.state}</span>
                        {b.source && (
                          <span className="px-1.5 py-0.2 rounded-pill border border-white/15 bg-white/[0.04] uppercase tracking-[0.1em] text-[9px]">
                            {b.source}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-roobert text-[11px] text-whisper-gray tabular-nums">
                        Ставка
                      </div>
                      <div className="font-roobert text-[13px] font-medium tabular-nums text-frost-white">
                        {b.amount.toLocaleString('ru-RU')} {data.user.currency}
                      </div>
                    </div>

                    <div className="text-right w-24">
                      <div className="font-roobert text-[11px] text-whisper-gray tabular-nums">
                        {b.multiplier !== null ? `x${b.multiplier.toFixed(2)}` : '—'}
                      </div>
                      <div
                        className={`font-roobert text-[13px] font-semibold tabular-nums ${
                          won ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {net >= 0 ? '+' : '−'}
                        {Math.abs(net).toLocaleString('ru-RU', {
                          maximumFractionDigits: 2,
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Transactions */}
        <section>
          <div className="flex items-baseline justify-between px-1 mb-2">
            <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
              Транзакции
            </span>
            <div className="flex items-center gap-2 text-[11px] text-whisper-gray font-roobert">
              <span>
                {data.transactions.length} / {data.totals?.transactions ?? data.transactions.length}
              </span>
              {data.transactions.length < (data.totals?.transactions ?? Infinity) &&
                data.transactions.length < 500 && (
                  <button
                    onClick={() => setTxLimit((v) => Math.min(500, v + 100))}
                    className="px-2 py-0.5 rounded-pill border border-white/15 bg-white/[0.05] hover:border-white/25"
                  >
                    Показать ещё
                  </button>
                )}
            </div>
          </div>
          {data.transactions.length === 0 ? (
            <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-6 text-center font-roobert text-[12px] text-whisper-gray">
              Транзакций нет.
            </div>
          ) : (
            <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
              {data.transactions.map((t) => (
                <div key={t.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-roobert text-[13px] text-frost-white truncate">
                      {t.type} {t.gameType ? `(${t.gameType})` : ''}
                    </div>
                    <div className="flex items-center gap-2 font-roobert text-[10px] text-whisper-gray tabular-nums truncate">
                      <span>{new Date(t.createdAt).toLocaleString('ru-RU')}</span>
                      {t.source && (
                        <span className="px-2 py-0.5 rounded-pill border border-white/15 bg-white/[0.04] uppercase tracking-[0.12em]">
                          {t.source}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-roobert text-[11px] text-whisper-gray">До</div>
                    <div className="font-roobert text-[12px] tabular-nums">
                      {t.balanceBefore.toLocaleString('ru-RU')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-roobert text-[11px] text-whisper-gray">После</div>
                    <div className="font-roobert text-[12px] tabular-nums">
                      {t.balanceAfter.toLocaleString('ru-RU')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Security Alerts for this user */}
        {data.securityAlerts && data.securityAlerts.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between px-1 mb-2">
              <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-[#ff4d4d]">
                Алерты Безопасности
              </span>
              <span className="font-roobert text-[11px] text-[#ff4d4d]">
                {data.securityAlerts.length}
              </span>
            </div>
            <div className="rounded-card border border-[#ff4d4d]/30 bg-[#ff4d4d]/[0.05] overflow-hidden divide-y divide-[#ff4d4d]/10">
              {data.securityAlerts.map((a) => (
                <div key={a.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-roobert text-[12px] text-[#ff4d4d] font-bold">
                      {a.type}
                    </span>
                    <span className="font-roobert text-[10px] text-[#ff4d4d]/80 tabular-nums">
                      {new Date(a.createdAt).toLocaleString('ru-RU')}
                    </span>
                  </div>
                  <div className="mt-1 font-roobert text-[12px] text-frost-white">
                    {a.description}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Admin log for this user */}
        <section>
          <div className="flex items-baseline justify-between px-1 mb-2">
            <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
              Действия админов
            </span>
            <span className="font-roobert text-[11px] text-whisper-gray">
              {data.adminLog.length}
            </span>
          </div>
          {data.adminLog.length === 0 ? (
            <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-6 text-center font-roobert text-[12px] text-whisper-gray">
              Нет действий админов.
            </div>
          ) : (
            <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
              {data.adminLog.map((a) => (
                <div key={a.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-roobert text-[12px] text-frost-white">
                      {a.action}
                    </span>
                    <span className="font-roobert text-[10px] text-whisper-gray tabular-nums">
                      {new Date(a.createdAt).toLocaleString('ru-RU')}
                    </span>
                  </div>
                  <div className="font-roobert text-[10px] text-whisper-gray mt-0.5 tabular-nums">
                    Админ #{a.adminTelegramId}
                  </div>
                  {a.reason && (
                    <div className="mt-1 font-roobert text-[12px] text-whisper-gray">
                      «{a.reason}»
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Action modal */}
      <AnimatePresence>
        {action && (
          <motion.div
            className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center px-3 pb-3 sm:pb-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              onClick={() => !busy && setAction(null)}
              aria-label="Закрыть"
              className="absolute inset-0 bg-midnight-canvas/85 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
              className="relative w-full max-w-[420px] rounded-card border border-white/10 p-5 backdrop-blur-2xl shadow-2xl"
              style={{ background: 'rgba(10, 10, 10, 0.96)' }}
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-roobert text-[18px] text-frost-white">
                  {action === 'balance'
                    ? 'Изменить баланс'
                    : action === 'block'
                    ? u.isBlocked
                      ? 'Снять блокировку'
                      : 'Заблокировать игрока'
                    : action === 'lock'
                    ? u.withdrawalLocked
                      ? 'Разрешить вывод'
                      : 'Заморозить вывод'
                    : u.ignoreIpCollision
                    ? 'Убрать из Whitelist'
                    : 'Добавить в Whitelist'}
                </h3>
                <button
                  onClick={() => !busy && setAction(null)}
                  aria-label="Закрыть"
                  className="w-11 h-11 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 active:scale-95 transition-transform"
                >
                  <X size={18} strokeWidth={1.8} />
                </button>
              </div>

              {action === 'balance' && (
                <div className="flex flex-col gap-3 mb-3">
                  <label className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
                    Изменение (положительное = кредит, отрицательное = дебет)
                  </label>
                  <input
                    value={delta}
                    onChange={(e) => setDelta(e.target.value)}
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    pattern="^-?\d+([.,]\d+)?$"
                    placeholder="+100 или -50"
                    className="bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[14px] tabular-nums text-frost-white focus:outline-none focus:border-white/30"
                  />
                  <label className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray mt-2">
                    Тип транзакции (как отобразится в истории)
                  </label>
                  <select
                    value={txType}
                    onChange={(e) => setTxType(e.target.value)}
                    className="bg-white/[0.04] border border-white/15 rounded-pill px-3 py-2 font-roobert text-[14px] text-frost-white focus:outline-none focus:border-white/30 appearance-none"
                  >
                    <option value="admin_adjustment">Админ. начисление / списание</option>
                    <option value="deposit">Депозит</option>
                    <option value="withdrawal">Вывод</option>
                  </select>
                  <div className="font-roobert text-[11px] text-whisper-gray">
                    Текущий баланс:{' '}
                    {u.balance.toLocaleString('ru-RU', {
                      maximumFractionDigits: 2,
                    })}{' '}
                    {u.currency}
                  </div>
                </div>
              )}

              <label className="block font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray mb-1">
                Причина (обязательно)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Почему производится действие — попадёт в аудит"
                className="w-full bg-white/[0.04] border border-white/15 rounded-card px-3 py-2 font-roobert text-[13px] text-frost-white focus:outline-none focus:border-white/30 mb-4"
              />

              <button
                onClick={submitAction}
                disabled={busy || reason.trim().length < 3}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px] uppercase tracking-[0.22em] disabled:opacity-50"
              >
                {busy ? 'Применение…' : 'Подтвердить'}
                <ChevronRight size={14} strokeWidth={2} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-sm px-3 py-2.5">
      <div className="font-roobert text-[9.5px] uppercase tracking-[0.05em] text-whisper-gray">
        {label}
      </div>
      <div
        className={`mt-0.5 font-roobert text-[16px] tabular-nums tracking-[-0.02em] ${
          warn ? 'text-[#ff8a76]' : 'text-frost-white'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  hint,
  onClick,
  danger,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left px-4 py-3 hover:bg-white/[0.04] active:scale-[0.98] transition-all w-full"
    >
      <div
        className={`font-roobert text-[14px] ${
          danger ? 'text-[#ff8a76]' : 'text-frost-white'
        }`}
      >
        {label}
      </div>
      <div className="font-roobert text-[11px] text-whisper-gray mt-0.5">
        {hint}
      </div>
    </button>
  );
}
