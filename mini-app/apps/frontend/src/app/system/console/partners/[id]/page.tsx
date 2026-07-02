'use client';

import { useCallback, useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, TrendingUp, Users, DollarSign, Activity, AlertCircle } from 'lucide-react';

export default function AdminPartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [revshareBalance, setRevshareBalance] = useState('');
  const [negativeCarryover, setNegativeCarryover] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(\`/api/_x/partners/\${id}\`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
        setRevshareBalance(Number(json.data.user.revshareBalance).toString());
        setNegativeCarryover(Number(json.data.user.negativeCarryover).toString());
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(\`/api/_x/partners/\${id}/balance\`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          revshareBalance: Number(revshareBalance),
          negativeCarryover: Number(negativeCarryover)
        })
      });
      if (res.ok) {
        alert('Баланс успешно обновлен');
        load();
      } else {
        alert('Ошибка при сохранении');
      }
    } catch (e) {
      alert('Ошибка');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-frost-white/40">Загрузка...</div>;
  }

  if (!data) {
    return <div className="p-6 text-red-400">Партнер не найден</div>;
  }

  const { user, stats, allTimeStats } = data;

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/system/console/partners')}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-frost-white transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-medium tracking-tight">
            {user.firstName} {user.username ? \`@\${user.username}\` : ''}
          </h1>
          <p className="text-sm text-frost-white/60">
            ID: {user.telegramId} • Рефералов: {user._count.referrals}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Editor & Promos */}
        <div className="flex flex-col gap-6">
          <div className="border border-white/10 rounded-2xl bg-white/[0.02] p-5">
            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
              <DollarSign size={18} className="text-macvbet-yellow" />
              Баланс партнера
            </h2>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-frost-white/60">RevShare Balance (zl)</label>
                <input 
                  type="number"
                  step="0.01"
                  value={revshareBalance}
                  onChange={e => setRevshareBalance(e.target.value)}
                  className="bg-black/40 border border-white/10 focus:border-macvbet-yellow rounded-xl px-4 py-2.5 outline-none transition-colors w-full"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-frost-white/60 flex items-center gap-1.5">
                  Negative Carryover (zl)
                  <AlertCircle size={14} className="text-red-400" />
                </label>
                <input 
                  type="number"
                  step="0.01"
                  value={negativeCarryover}
                  onChange={e => setNegativeCarryover(e.target.value)}
                  className="bg-black/40 border border-red-500/30 focus:border-red-400 rounded-xl px-4 py-2.5 outline-none transition-colors w-full text-red-400"
                />
              </div>
              <button 
                onClick={handleSave}
                disabled={saving}
                className="mt-2 w-full bg-white/10 hover:bg-white/15 disabled:opacity-50 text-frost-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Save size={18} />
                {saving ? 'Сохранение...' : 'Сохранить изменения'}
              </button>
            </div>
          </div>

          <div className="border border-white/10 rounded-2xl bg-white/[0.02] p-5">
            <h2 className="text-lg font-medium mb-4">Промокоды</h2>
            {user.affiliatePromoCodes.length > 0 ? (
              <div className="flex flex-col gap-2">
                {user.affiliatePromoCodes.map((p: any) => (
                  <div key={p.id} className="bg-black/20 border border-white/5 rounded-lg px-4 py-3 flex items-center justify-between">
                    <span className="font-mono text-macvbet-yellow font-medium">{p.code}</span>
                    <span className="text-xs text-frost-white/40">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-frost-white/40">У партнера нет активных промокодов.</p>
            )}
          </div>
        </div>

        {/* Right Column: Stats */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="border border-white/10 rounded-2xl bg-white/[0.02] p-4 flex flex-col gap-1">
              <span className="text-xs text-frost-white/60 uppercase tracking-wider">Доход за все время</span>
              <span className="text-2xl font-light text-macvbet-yellow">{allTimeStats.income.toFixed(2)} zl</span>
            </div>
            <div className="border border-white/10 rounded-2xl bg-white/[0.02] p-4 flex flex-col gap-1">
              <span className="text-xs text-frost-white/60 uppercase tracking-wider">GGR за все время</span>
              <span className="text-2xl font-light">{allTimeStats.ggr.toFixed(2)} zl</span>
            </div>
            <div className="border border-white/10 rounded-2xl bg-white/[0.02] p-4 flex flex-col gap-1">
              <span className="text-xs text-frost-white/60 uppercase tracking-wider">Депозиты за все время</span>
              <span className="text-2xl font-light text-green-400">{allTimeStats.depSum.toFixed(2)} zl</span>
            </div>
            <div className="border border-white/10 rounded-2xl bg-white/[0.02] p-4 flex flex-col gap-1">
              <span className="text-xs text-frost-white/60 uppercase tracking-wider">Переходы</span>
              <span className="text-2xl font-light">{allTimeStats.clicks}</span>
            </div>
            <div className="border border-white/10 rounded-2xl bg-white/[0.02] p-4 flex flex-col gap-1">
              <span className="text-xs text-frost-white/60 uppercase tracking-wider">Регистрации (FTD)</span>
              <span className="text-2xl font-light">{allTimeStats.fds}</span>
            </div>
            <div className="border border-white/10 rounded-2xl bg-white/[0.02] p-4 flex flex-col gap-1">
              <span className="text-xs text-frost-white/60 uppercase tracking-wider">Повторные (RD)</span>
              <span className="text-2xl font-light">{allTimeStats.rds}</span>
            </div>
          </div>

          <div className="border border-white/10 rounded-2xl bg-white/[0.02] overflow-hidden flex-1">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="font-medium">Статистика по дням (последние 30 дней)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-white/[0.04] border-b border-white/10 text-frost-white/60">
                  <tr>
                    <th className="px-5 py-3 font-medium">Дата</th>
                    <th className="px-5 py-3 font-medium">Переходы</th>
                    <th className="px-5 py-3 font-medium">Рег. (FTD)</th>
                    <th className="px-5 py-3 font-medium">Депозиты (zl)</th>
                    <th className="px-5 py-3 font-medium">GGR (zl)</th>
                    <th className="px-5 py-3 font-medium text-right">Доход (zl)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {stats.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-frost-white/40">Нет данных</td>
                    </tr>
                  ) : (
                    stats.map((s: any) => (
                      <tr key={s.date} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-3">{new Date(s.date).toLocaleDateString()}</td>
                        <td className="px-5 py-3">{s.clicks}</td>
                        <td className="px-5 py-3">{s.fdCount}</td>
                        <td className="px-5 py-3">{Number(s.depSum).toFixed(2)}</td>
                        <td className="px-5 py-3">{Number(s.ggr).toFixed(2)}</td>
                        <td className="px-5 py-3 text-right font-medium text-macvbet-yellow">{Number(s.income).toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
