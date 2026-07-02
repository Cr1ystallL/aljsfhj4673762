'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ExternalLink } from 'lucide-react';
import { HelpButton } from '@/components/admin/help-button';

export default function AdminPartnersPage() {
  const router = useRouter();
  const [partners, setPartners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/_x/partners', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.ok) {
        const json = await res.json();
        setPartners(json.data || []);
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = partners.filter(p => 
    p.firstName?.toLowerCase().includes(search.toLowerCase()) ||
    p.username?.toLowerCase().includes(search.toLowerCase()) ||
    String(p.telegramId).includes(search)
  );

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-medium tracking-tight">Партнеры</h1>
          <p className="text-sm text-frost-white/60">
            Список партнеров и их статистика
          </p>
        </div>
        <HelpButton topic="partners" />
      </div>

      <div className="flex flex-col gap-4">
        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-pill border border-white/15 bg-white/[0.04] w-full max-w-sm">
          <Search size={16} className="text-frost-white/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск (Имя, юзернейм, ID)..."
            className="flex-1 bg-transparent border-none outline-none text-sm text-frost-white placeholder:text-frost-white/30"
          />
        </div>

        {/* Table */}
        <div className="border border-white/10 rounded-2xl bg-white/[0.02] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white/[0.04] border-b border-white/10 text-frost-white/60">
                <tr>
                  <th className="px-5 py-3.5 font-medium">Пользователь</th>
                  <th className="px-5 py-3.5 font-medium">Рефералов</th>
                  <th className="px-5 py-3.5 font-medium">Баланс (zl)</th>
                  <th className="px-5 py-3.5 font-medium">Carryover (zl)</th>
                  <th className="px-5 py-3.5 font-medium text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-frost-white/40">
                      Загрузка...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-frost-white/40">
                      Партнеры не найдены
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-frost-white">
                            {p.firstName} {p.username ? `@${p.username}` : ''}
                          </span>
                          <span className="text-xs text-frost-white/40">{p.telegramId}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">{p._count.referrals}</td>
                      <td className="px-5 py-3 text-macvbet-yellow font-medium">
                        {Number(p.revshareBalance).toFixed(2)}
                      </td>
                      <td className="px-5 py-3">
                        {p.negativeCarryover < 0 ? (
                          <span className="text-red-400 font-medium">{Number(p.negativeCarryover).toFixed(2)}</span>
                        ) : (
                          <span className="text-frost-white/40">0.00</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => router.push(`/system/console/partners/${p.id}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-frost-white transition-colors text-xs font-medium"
                        >
                          Подробнее <ExternalLink size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
