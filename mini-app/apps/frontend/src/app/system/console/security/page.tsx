'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
  Lock,
  Unlock,
  UserX,
  UserCheck,
  Cpu,
  CreditCard,
  Globe,
  AlertTriangle,
  RefreshCw,
  Eye,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Layers,
} from 'lucide-react';
import { HelpButton } from '@/components/admin/help-button';
import { cn } from '@/lib/utils';

interface SecurityStats {
  totalAlerts: number;
  unresolvedAlerts: number;
  blockedUsers: number;
  lockedWithdrawals: number;
  hardwareClustersCount: number;
  financialClustersCount: number;
  ipClustersCount: number;
}

interface ClusterUser {
  id: string;
  telegramId: number;
  username?: string | null;
  firstName?: string | null;
  name?: string;
  isBlocked: boolean;
  withdrawalLocked: boolean;
  ignoreIpCollision?: boolean;
  trustScore?: number;
  createdAt: number;
  firstSeen?: number;
  lastSeen?: number;
  isMain?: boolean;
  lastAmount?: number;
  currency?: string;
  status?: string;
  adminNote?: string | null;
}

interface ClusterRow {
  hardwareHash?: string;
  destination?: string;
  ipAddress?: string;
  accountsCount: number;
  totalVolume?: number;
  deviceSpecs?: any;
  users: ClusterUser[];
}

interface SecurityAlertItem {
  id: string;
  userId: string;
  user: {
    id: string;
    telegramId: number;
    username?: string | null;
    firstName?: string | null;
    isBlocked: boolean;
    withdrawalLocked: boolean;
    trustScore: number;
  };
  type: string;
  severity: string;
  description: string;
  resolved: boolean;
  createdAt: number;
}

interface UserDossier {
  id: string;
  telegramId: number;
  username?: string | null;
  name: string;
  isBlocked: boolean;
  withdrawalLocked: boolean;
  ignoreIpCollision: boolean;
  isPremium: boolean;
  trustScore: number;
  trustBreakdown: Array<{ description: string; delta: number; type: 'positive' | 'negative' | 'neutral' }>;
  hardwareHash?: string | null;
  deviceSpecs?: any;
  adminNote?: string | null;
  createdAt: number;
  financials: {
    depositsCount: number;
    totalDeposited: number;
    withdrawalsCount: number;
    totalWithdrawn: number;
    netProfitCasino: number;
    destinations: Array<{
      destination: string;
      method: string;
      status: string;
      amount: number;
      date: number;
    }>;
  };
  ips: Array<{
    ipAddress: string;
    firstSeen: number;
    lastSeen: number;
    count: number;
    isRoot: boolean;
    isVpn: boolean;
  }>;
  alerts: Array<{
    id: string;
    type: string;
    severity: string;
    description: string;
    resolved: boolean;
    createdAt: number;
  }>;
}

export default function SecurityPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'hardware' | 'wallet' | 'ip' | 'alerts'>('hardware');
  const [stats, setStats] = useState<SecurityStats | null>(null);
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [alerts, setAlerts] = useState<SecurityAlertItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // User Dossier Modal
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [dossier, setDossier] = useState<UserDossier | null>(null);
  const [loadingDossier, setLoadingDossier] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // 1. Fetch Stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/_x/security/stats', { credentials: 'include', cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    } catch {}
  }, []);

  // 2. Fetch Clusters / Alerts
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'alerts') {
        const res = await fetch(`/api/_x/security/alerts?page=${page}&limit=20`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          setAlerts(data.alerts || []);
          setTotal(data.total || 0);
        }
      } else {
        const res = await fetch(`/api/_x/security/clusters?type=${activeTab}&page=${page}&limit=15`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          setClusters(data.clusters || []);
          setTotal(data.total || 0);
        }
      }
    } catch {
      setClusters([]);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, page]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 3. Fetch Dossier
  const openDossier = async (userId: string) => {
    setSelectedUserId(userId);
    setLoadingDossier(true);
    try {
      const res = await fetch(`/api/_x/security/users/${userId}/dossier`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setDossier(data.dossier);
      }
    } catch {
      setDossier(null);
    } finally {
      setLoadingDossier(false);
    }
  };

  // 4. Quick Actions
  const handleWhitelist = async (userId: string) => {
    if (!confirm('Разблокировать пользователя, снять заморозку вывода и внести в Белый список?')) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/_x/security/users/${userId}/whitelist`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        alert('Пользователь успешно разблокирован и добавлен в белый список!');
        fetchStats();
        fetchData();
        if (selectedUserId === userId) openDossier(userId);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleBlock = async (userId: string, isBlocked: boolean) => {
    if (!confirm(isBlocked ? 'Разблокировать пользователя?' : 'Заблокировать пользователя навсегда?')) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/_x/users/${userId}/flags`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isBlocked: !isBlocked,
          reason: isBlocked ? 'Разблокировка администратором' : 'Блокировка за мультиаккаунтинг',
        }),
      });
      if (res.ok) {
        fetchStats();
        fetchData();
        if (selectedUserId === userId) openDossier(userId);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleWithdrawalLock = async (userId: string, isLocked: boolean) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/_x/users/${userId}/flags`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          withdrawalLocked: !isLocked,
          reason: !isLocked ? 'Ручная заморозка вывода' : 'Разморозка вывода администратором',
        }),
      });
      if (res.ok) {
        fetchStats();
        fetchData();
        if (selectedUserId === userId) openDossier(userId);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleBanCluster = async (type: 'hardware' | 'wallet' | 'ip', value: string) => {
    if (!confirm(`Вы уверены, что хотите заблокировать ВСЕ аккаунты в этом кластере (${type}: ${value})?`)) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/_x/security/clusters/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, value }),
      });
      if (res.ok) {
        const d = await res.json();
        alert(`Заблокировано аккаунтов в кластере: ${d.bannedCount}`);
        fetchStats();
        fetchData();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      await fetch(`/api/_x/security/alerts/${alertId}/resolve`, {
        method: 'PATCH',
        credentials: 'include',
      });
      fetchStats();
      fetchData();
    } catch {}
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-7 h-7 text-emerald-500" />
            <h1 className="text-2xl font-bold tracking-tight text-white">Центр Кибербезопасности & Антифрод</h1>
            <HelpButton title="Центр кибербезопасности">
              <p className="text-xs text-neutral-300">
                Модуль кибербезопасности нового поколения: отслеживает физические слепки устройств (TMA Hardware Fingerprints),
                вычисляет многофакторный рейтинг доверия (Trust Score) и выявляет мультиаккаунты по железу, общим кошелькам и IP-сетям.
              </p>
            </HelpButton>
          </div>
          <p className="text-sm text-neutral-400 mt-1">
            Аппаратный фингерпринтинг (TMA Hardware), скоринг доверия (Trust Score) и финансовый граф связей.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchStats();
              fetchData();
            }}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg border border-neutral-700 transition"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Обновить
          </button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-medium">
            <span>Алерты</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-white mt-1.5">{stats?.totalAlerts ?? '—'}</div>
          <div className="text-xs text-amber-400/90 mt-0.5">{stats?.unresolvedAlerts ?? 0} не решено</div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-medium">
            <span>Сетки по Железу</span>
            <Cpu className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-xl font-bold text-cyan-400 mt-1.5">{stats?.hardwareClustersCount ?? '—'}</div>
          <div className="text-xs text-neutral-400 mt-0.5">TMA Fingerprints</div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-medium">
            <span>Дубли Кошельков</span>
            <CreditCard className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-bold text-indigo-400 mt-1.5">{stats?.financialClustersCount ?? '—'}</div>
          <div className="text-xs text-neutral-400 mt-0.5">Общие реквизиты</div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-medium">
            <span>Сетки по IP</span>
            <Globe className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400 mt-1.5">{stats?.ipClustersCount ?? '—'}</div>
          <div className="text-xs text-neutral-400 mt-0.5">Совпадения сети</div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-medium">
            <span>Заблокировано</span>
            <UserX className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl font-bold text-rose-400 mt-1.5">{stats?.blockedUsers ?? '—'}</div>
          <div className="text-xs text-neutral-400 mt-0.5">Перманентный бан</div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-medium">
            <span>Фриз Вывода</span>
            <Lock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-amber-400 mt-1.5">{stats?.lockedWithdrawals ?? '—'}</div>
          <div className="text-xs text-neutral-400 mt-0.5">Ручная проверка</div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-medium">
            <span>Статус Anti-Fraud</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-base font-bold text-emerald-400 mt-1.5">АКТИВЕН</div>
          <div className="text-xs text-neutral-400 mt-0.5">Trust Score v2.0</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-800 gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('hardware')}
          className={cn(
            'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap',
            activeTab === 'hardware'
              ? 'border-cyan-500 text-cyan-400'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          )}
        >
          <Cpu className="w-4 h-4" />
          Кластеры по Железу ({stats?.hardwareClustersCount ?? 0})
        </button>

        <button
          onClick={() => setActiveTab('wallet')}
          className={cn(
            'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap',
            activeTab === 'wallet'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          )}
        >
          <CreditCard className="w-4 h-4" />
          Платежные коллизии ({stats?.financialClustersCount ?? 0})
        </button>

        <button
          onClick={() => setActiveTab('ip')}
          className={cn(
            'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap',
            activeTab === 'ip'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          )}
        >
          <Globe className="w-4 h-4" />
          Сетевые совпадения IP ({stats?.ipClustersCount ?? 0})
        </button>

        <button
          onClick={() => setActiveTab('alerts')}
          className={cn(
            'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap',
            activeTab === 'alerts'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          )}
        >
          <AlertTriangle className="w-4 h-4" />
          Журнал Алертов ({stats?.unresolvedAlerts ?? 0})
        </button>
      </div>

      {/* Main Content View */}
      {loading ? (
        <div className="flex items-center justify-center p-16 text-neutral-400 text-sm">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Загрузка данных кибербезопасности...
        </div>
      ) : activeTab === 'alerts' ? (
        /* Alerts Stream View */
        <div className="space-y-3">
          {alerts.length === 0 ? (
            <div className="text-center py-12 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-400 text-sm">
              Активных алертов безопасности не обнаружено.
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  'p-4 bg-neutral-900 border rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition',
                  alert.resolved ? 'border-neutral-800 opacity-60' : 'border-neutral-700 bg-neutral-900/90'
                )}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        'text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider',
                        alert.severity === 'critical' && 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
                        alert.severity === 'high' && 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
                        alert.severity === 'medium' && 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
                        alert.severity === 'low' && 'bg-neutral-700 text-neutral-300'
                      )}
                    >
                      {alert.severity}
                    </span>
                    <span className="text-xs font-mono text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded">
                      {alert.type}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {new Date(alert.createdAt).toLocaleString('ru-RU')}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-200 font-medium">{alert.description}</p>
                  <div className="text-xs text-neutral-400 flex items-center gap-2">
                    <span>Пользователь:</span>
                    <button
                      onClick={() => openDossier(alert.userId)}
                      className="text-cyan-400 hover:underline font-mono"
                    >
                      {alert.user?.username ? `@${alert.user.username}` : `TG: ${alert.user?.telegramId}`}
                    </button>
                    <span>| Trust: {alert.user?.trustScore ?? '—'}/100</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openDossier(alert.userId)}
                    className="px-3 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 transition"
                  >
                    Досье
                  </button>
                  {!alert.resolved && (
                    <button
                      onClick={() => handleResolveAlert(alert.id)}
                      className="px-3 py-1.5 text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded border border-emerald-500/30 transition"
                    >
                      Решено
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Clusters View (Hardware / Financial / IP) */
        <div className="space-y-4">
          {clusters.length === 0 ? (
            <div className="text-center py-12 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-400 text-sm">
              Коллизий и мультиаккаунтов в этой категории не обнаружено.
            </div>
          ) : (
            clusters.map((cluster, idx) => {
              const clusterKey = cluster.hardwareHash || cluster.destination || cluster.ipAddress || String(idx);
              const clusterType = cluster.hardwareHash ? 'hardware' : cluster.destination ? 'wallet' : 'ip';

              return (
                <div
                  key={clusterKey}
                  className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden"
                >
                  {/* Cluster Header */}
                  <div className="p-4 bg-neutral-950/60 border-b border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {clusterType === 'hardware' && <Cpu className="w-5 h-5 text-cyan-400" />}
                        {clusterType === 'wallet' && <CreditCard className="w-5 h-5 text-indigo-400" />}
                        {clusterType === 'ip' && <Globe className="w-5 h-5 text-emerald-400" />}

                        <span className="font-mono text-sm font-bold text-neutral-100 truncate max-w-md">
                          {clusterKey}
                        </span>

                        <span className="bg-rose-500/20 text-rose-400 text-xs px-2 py-0.5 rounded-full font-bold border border-rose-500/30">
                          {cluster.accountsCount} аккаунтов
                        </span>

                        {cluster.totalVolume ? (
                          <span className="text-xs text-neutral-400 font-mono">
                            Объем: {cluster.totalVolume.toFixed(2)} PLN
                          </span>
                        ) : null}
                      </div>

                      {cluster.deviceSpecs ? (
                        <div className="text-xs text-neutral-400">
                          GPU: <span className="text-neutral-300">{cluster.deviceSpecs.gpuRenderer}</span> | Экран:{' '}
                          <span className="text-neutral-300">{cluster.deviceSpecs.screen}</span> | ОС:{' '}
                          <span className="text-neutral-300">{cluster.deviceSpecs.platform}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleBanCluster(clusterType, clusterKey)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 rounded-lg border border-rose-500/30 transition font-medium"
                      >
                        <UserX className="w-3.5 h-3.5" />
                        Забанить всю сетку
                      </button>
                    </div>
                  </div>

                  {/* Users Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-neutral-900 text-neutral-400 uppercase text-[10px] tracking-wider border-b border-neutral-800">
                        <tr>
                          <th className="p-3">Пользователь</th>
                          <th className="p-3">Telegram ID</th>
                          <th className="p-3">Trust Score</th>
                          <th className="p-3">Статус</th>
                          <th className="p-3">Дата регистрации</th>
                          <th className="p-3 text-right">Действия</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-800/60">
                        {cluster.users.map((u) => {
                          const trust = u.trustScore ?? 80;
                          return (
                            <tr key={u.id} className="hover:bg-neutral-800/40 transition">
                              <td className="p-3 font-medium text-neutral-200">
                                <div className="flex items-center gap-2">
                                  <span>{u.name || u.firstName || u.username || 'Игрок'}</span>
                                  {u.isMain && (
                                    <span className="text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.2 rounded border border-neutral-700">
                                      Main
                                    </span>
                                  )}
                                </div>
                                {u.username && <div className="text-neutral-500 text-[11px]">@{u.username}</div>}
                              </td>

                              <td className="p-3 font-mono text-neutral-400">{u.telegramId}</td>

                              <td className="p-3 font-mono">
                                <span
                                  className={cn(
                                    'px-2 py-0.5 rounded font-bold text-xs',
                                    trust >= 75 && 'bg-emerald-500/20 text-emerald-400',
                                    trust >= 50 && trust < 75 && 'bg-amber-500/20 text-amber-400',
                                    trust < 50 && 'bg-rose-500/20 text-rose-400'
                                  )}
                                >
                                  {trust} / 100
                                </span>
                              </td>

                              <td className="p-3">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {u.isBlocked ? (
                                    <span className="text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded border border-rose-500/30">
                                      Заблокирован
                                    </span>
                                  ) : (
                                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30">
                                      Активен
                                    </span>
                                  )}

                                  {u.withdrawalLocked && (
                                    <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/30">
                                      Фриз вывода
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="p-3 text-neutral-400 font-mono">
                                {new Date(u.createdAt).toLocaleDateString('ru-RU')}
                              </td>

                              <td className="p-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => openDossier(u.id)}
                                    className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 transition"
                                    title="Открыть кибербез-досье"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    onClick={() => handleWhitelist(u.id)}
                                    className="p-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded border border-emerald-500/30 transition"
                                    title="Разблокировать и в Белый список"
                                  >
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    onClick={() => handleToggleBlock(u.id, u.isBlocked)}
                                    className={cn(
                                      'p-1.5 rounded border transition',
                                      u.isBlocked
                                        ? 'bg-neutral-800 text-neutral-400 hover:text-white border-neutral-700'
                                        : 'bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border-rose-500/30'
                                    )}
                                    title={u.isBlocked ? 'Разблокировать' : 'Заблокировать'}
                                  >
                                    <UserX className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* User Dossier Modal */}
      {selectedUserId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
            {loadingDossier ? (
              <div className="p-16 flex items-center justify-center text-neutral-400">
                <RefreshCw className="w-6 h-6 animate-spin mr-3" />
                Загрузка полного досье игрока...
              </div>
            ) : !dossier ? (
              <div className="p-8 text-center text-neutral-400">
                Не удалось загрузить данные досье.
                <div className="mt-4">
                  <button
                    onClick={() => setSelectedUserId(null)}
                    className="px-4 py-2 bg-neutral-800 rounded-lg text-white text-sm"
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {/* Dossier Header */}
                <div className="p-6 bg-neutral-950 border-b border-neutral-800 flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-bold text-white">{dossier.name}</h2>
                      {dossier.isPremium && (
                        <span className="text-xs bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded font-bold">
                          TG Premium
                        </span>
                      )}
                      {dossier.ignoreIpCollision && (
                        <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-bold">
                          В Белом Списке
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-400 flex items-center gap-3">
                      <span>TG ID: {dossier.telegramId}</span>
                      {dossier.username && <span>| @{dossier.username}</span>}
                      <span>| Зарегистрирован: {new Date(dossier.createdAt).toLocaleDateString('ru-RU')}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedUserId(null)}
                    className="text-neutral-400 hover:text-white text-lg p-1"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {/* Trust Score Banner */}
                  <div className="p-4 bg-neutral-950/80 border border-neutral-800 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div
                        className={cn(
                          'w-16 h-16 rounded-2xl flex flex-col items-center justify-center font-bold text-xl border',
                          dossier.trustScore >= 70
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : dossier.trustScore >= 50
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                        )}
                      >
                        {dossier.trustScore}
                        <span className="text-[9px] uppercase tracking-wider text-neutral-400">Trust</span>
                      </div>

                      <div className="space-y-1">
                        <div className="text-sm font-bold text-white">
                          {dossier.trustScore >= 70
                            ? 'Высокий уровень доверия (Честный игрок)'
                            : dossier.trustScore >= 50
                            ? 'Средний уровень доверия (Допустим к игре)'
                            : 'Высокий риск (Подозрение на ферму / мульт)'}
                        </div>
                        <div className="text-xs text-neutral-400">
                          {dossier.trustScore >= 50
                            ? 'Воронка Dynamic Retention (разгон 1-го депа до 1.6x) ВКЛЮЧЕНА.'
                            : 'Воронка разогрева ОТКЛЮЧЕНА. Игрок работает на строгом RTP 95%.'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleWhitelist(dossier.id)}
                        disabled={actionLoading}
                        className="px-3.5 py-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold transition flex items-center gap-1.5"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        Разблокировать и в WhiteList
                      </button>
                    </div>
                  </div>

                  {/* Trust Score Breakdown */}
                  <div>
                    <h3 className="text-xs uppercase font-bold text-neutral-400 tracking-wider mb-2.5">
                      Детализация Скоринга Доверия
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {dossier.trustBreakdown?.map((factor, i) => (
                        <div
                          key={i}
                          className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg flex items-center justify-between text-xs"
                        >
                          <span className="text-neutral-300">{factor.description}</span>
                          <span
                            className={cn(
                              'font-mono font-bold',
                              factor.delta > 0 ? 'text-emerald-400' : factor.delta < 0 ? 'text-rose-400' : 'text-neutral-400'
                            )}
                          >
                            {factor.delta > 0 ? `+${factor.delta}` : factor.delta}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Hardware & TMA Forensics */}
                  <div>
                    <h3 className="text-xs uppercase font-bold text-neutral-400 tracking-wider mb-2.5">
                      Аппаратный слепок устройства (TMA Hardware)
                    </h3>
                    <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl space-y-2 text-xs">
                      <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2">
                        <span className="text-neutral-400">Hardware Hash:</span>
                        <span className="font-mono text-cyan-400 select-all font-medium">{dossier.hardwareHash || 'Не передан'}</span>
                      </div>
                      {dossier.deviceSpecs ? (
                        <>
                          <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2">
                            <span className="text-neutral-400">Видеоядро (GPU Renderer):</span>
                            <span className="text-neutral-200 font-mono">{dossier.deviceSpecs.gpuRenderer}</span>
                          </div>
                          <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2">
                            <span className="text-neutral-400">Экран & DPI:</span>
                            <span className="text-neutral-200 font-mono">{dossier.deviceSpecs.screen}</span>
                          </div>
                          <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2">
                            <span className="text-neutral-400">Ядра CPU / Мультитач:</span>
                            <span className="text-neutral-200 font-mono">
                              {dossier.deviceSpecs.cores} cores / {dossier.deviceSpecs.touch} touch points
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-400">Платформа TMA:</span>
                            <span className="text-neutral-200 font-mono">{dossier.deviceSpecs.platform}</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-neutral-500 text-xs italic">
                          Подробные аппаратные параметры будут записаны при следующем входе.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Financial Forensics */}
                  <div>
                    <h3 className="text-xs uppercase font-bold text-neutral-400 tracking-wider mb-2.5">
                      Финансовый баланс & Реквизиты
                    </h3>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl">
                        <div className="text-[11px] text-neutral-400">Депозиты ({dossier.financials.depositsCount})</div>
                        <div className="text-base font-bold text-emerald-400 mt-1">
                          +{dossier.financials.totalDeposited.toFixed(2)} PLN
                        </div>
                      </div>

                      <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl">
                        <div className="text-[11px] text-neutral-400">Выводы ({dossier.financials.withdrawalsCount})</div>
                        <div className="text-base font-bold text-rose-400 mt-1">
                          -{dossier.financials.totalWithdrawn.toFixed(2)} PLN
                        </div>
                      </div>

                      <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl">
                        <div className="text-[11px] text-neutral-400">P&L Казино</div>
                        <div
                          className={cn(
                            'text-base font-bold mt-1',
                            dossier.financials.netProfitCasino >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          )}
                        >
                          {dossier.financials.netProfitCasino >= 0 ? '+' : ''}
                          {dossier.financials.netProfitCasino.toFixed(2)} PLN
                        </div>
                      </div>
                    </div>

                    {dossier.financials.destinations?.length > 0 && (
                      <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl">
                        <div className="text-xs font-medium text-neutral-400 mb-2">Использованные адреса выплат:</div>
                        <div className="space-y-1 font-mono text-xs">
                          {dossier.financials.destinations.map((d, i) => (
                            <div key={i} className="flex items-center justify-between text-neutral-300">
                              <span className="truncate max-w-sm select-all">{d.destination}</span>
                              <span className="text-neutral-500">{d.method}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-4 border-t border-neutral-800 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleWithdrawalLock(dossier.id, dossier.withdrawalLocked)}
                        disabled={actionLoading}
                        className={cn(
                          'px-3 py-2 text-xs rounded-lg font-medium border transition flex items-center gap-1.5',
                          dossier.withdrawalLocked
                            ? 'bg-amber-600/20 text-amber-400 border-amber-500/30'
                            : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:text-white'
                        )}
                      >
                        <Lock className="w-3.5 h-3.5" />
                        {dossier.withdrawalLocked ? 'Разморозить вывод' : 'Заморозить вывод'}
                      </button>

                      <button
                        onClick={() => handleToggleBlock(dossier.id, dossier.isBlocked)}
                        disabled={actionLoading}
                        className={cn(
                          'px-3 py-2 text-xs rounded-lg font-medium border transition flex items-center gap-1.5',
                          dossier.isBlocked
                            ? 'bg-rose-600/20 text-rose-400 border-rose-500/30'
                            : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:text-white'
                        )}
                      >
                        <UserX className="w-3.5 h-3.5" />
                        {dossier.isBlocked ? 'Разблокировать аккаунт' : 'Заблокировать аккаунт'}
                      </button>
                    </div>

                    <button
                      onClick={() => setSelectedUserId(null)}
                      className="px-4 py-2 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition"
                    >
                      Закрыть досье
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
