'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Users, Copy, CheckCircle2, TrendingUp, DollarSign, Activity, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { partnerService } from '@/services/partner.service';
import { BrandLockup } from '@/components/ui/brand-mark';

export default function PartnerPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['partner-stats'],
    queryFn: partnerService.getStats,
  });

  const [promoInput, setPromoInput] = useState('');
  const [copiedPromo, setCopiedPromo] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [promoError, setPromoError] = useState('');

  const createPromoMutation = useMutation({
    mutationFn: partnerService.createPromo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner-stats'] });
    },
    onError: (e: Error) => {
      setPromoError(e.message);
    }
  });

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/partner/withdraw', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      setShowWithdrawModal(false);
      router.push('/balance');
    },
    onError: (e: Error) => {
      alert(e.message);
    }
  });

  const handleCopyPromo = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPromo(true);
    setTimeout(() => setCopiedPromo(false), 2000);
  };

  const handleCopyLink = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCreatePromo = (e: React.FormEvent) => {
    e.preventDefault();
    setPromoError('');
    if (!promoInput || promoInput.length < 3) {
      setPromoError('Минимум 3 символа');
      return;
    }
    createPromoMutation.mutate(promoInput);
  };

  // Derive aggregates
  const aggregate = useMemo(() => {
    if (!stats?.stats) return { clicks: 0, fds: 0, income: 0, depSum: 0 };
    return stats.stats.reduce((acc, curr) => ({
      clicks: acc.clicks + curr.clicks,
      fds: acc.fds + curr.fdCount,
      income: acc.income + curr.income,
      depSum: acc.depSum + curr.depSum,
    }), { clicks: 0, fds: 0, income: 0, depSum: 0 });
  }, [stats]);

  // Chart preparation (last 14 days)
  const chartData = useMemo(() => {
    if (!stats?.stats) return [];
    // Ensure we have at least 14 days of data for the chart padding
    const data = [...stats.stats].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const last14 = data.slice(-14);
    
    // If less than 14, pad it with empty days at the beginning
    while (last14.length < 14) {
      const firstDate = last14.length > 0 ? new Date(last14[0].date) : new Date();
      firstDate.setDate(firstDate.getDate() - 1);
      last14.unshift({
        date: firstDate.toISOString(),
        clicks: 0, fdCount: 0, rdCount: 0, depSum: 0, ggr: 0, ngr: 0, income: 0
      });
    }

    const maxIncome = Math.max(...last14.map(d => d.income), 10); // min scale 10
    
    return last14.map(d => ({
      ...d,
      heightPercent: (d.income / maxIncome) * 100,
      displayDate: new Date(d.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
    }));
  }, [stats]);

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white overflow-x-hidden">
      <AnimatePresence>
        {showWithdrawModal && stats && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#12141A] border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full"
            >
              <h3 className="text-xl font-medium mb-3">Вывод средств</h3>
              <p className="text-frost-white/80 mb-6 text-sm">
                Вы уверены, что хотите вывести средства? Выведется вся сумма ({stats.balance.toFixed(2)} zl) на ваш основной баланс.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowWithdrawModal(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-medium transition-colors"
                >
                  Нет
                </button>
                <button
                  onClick={() => withdrawMutation.mutate()}
                  disabled={withdrawMutation.isPending}
                  className="flex-1 py-3 bg-macvbet-yellow text-black hover:bg-yellow-400 rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  {withdrawMutation.isPending ? 'Запрос...' : 'Да'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-4 pt-4 pb-32 flex flex-col gap-6">
        
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-1">
          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-pill border border-white/15 bg-white/[0.04] text-frost-white/85 hover:text-frost-white hover:border-white/25 transition-colors"
          >
            <ArrowLeft size={18} strokeWidth={1.8} />
            <span className="font-roobert text-sm">Назад</span>
          </button>
          <BrandLockup size={48} />
          <span className="w-[64px]" aria-hidden />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-macvbet-yellow border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 text-center text-sm">
            Ошибка загрузки данных
          </div>
        ) : stats ? (
          <>
            {/* Balance Card */}
            <section className="relative overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.02] p-6 shadow-2xl">
              <div
                aria-hidden
                className="absolute inset-0 opacity-40 pointer-events-none"
                style={{
                  background: 'radial-gradient(120% 110% at 50% 0%, rgba(255, 172, 46, 0.15) 0%, rgba(160, 224, 171, 0.05) 50%, transparent 80%)',
                }}
              />
              <div className="relative z-10 flex flex-col gap-1">
                <span className="text-frost-white/60 text-sm font-medium uppercase tracking-wider flex items-center gap-2">
                  <DollarSign size={20} /> Доступно к выводу
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-4xl font-light tracking-tight">{stats.balance.toFixed(2)}</span>
                  <span className="text-macvbet-yellow font-medium text-lg">zl</span>
                </div>

                {stats.negativeCarryover < 0 && (
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-500/10 border border-red-500/20 w-fit">
                    <AlertCircle size={14} className="text-red-400" />
                    <span className="text-xs text-red-400 font-medium">
                      Отрицательный баланс: {stats.negativeCarryover.toFixed(2)} zl (спишется с будущей прибыли)
                    </span>
                  </div>
                )}

                <button 
                  onClick={() => setShowWithdrawModal(true)}
                  className="mt-5 w-full bg-macvbet-yellow hover:bg-yellow-400 text-black font-semibold py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(255,172,46,0.3)] hover:shadow-[0_0_30px_rgba(255,172,46,0.5)] active:scale-[0.98] text-lg"
                >
                  Запросить вывод
                </button>
                <p className="text-xs text-frost-white/40 text-center mt-3">
                  Минимальная сумма вывода {stats.minWithdrawal ?? 50} zl. Вывод производится через бота.
                </p>
              </div>
            </section>

            {/* Promo Code Generation */}
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-medium px-1">Ваша ссылка</h2>
              <div className="p-4 rounded-[16px] border border-white/5 bg-white/[0.03] flex flex-col gap-3">
                {stats.promoCode ? (
                  <>
                    <p className="text-sm text-frost-white/70">
                      Ваш промокод:
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-lg font-mono font-bold truncate text-macvbet-yellow/90">
                        {stats.promoCode}
                      </div>
                      <button 
                        onClick={() => handleCopyPromo(stats.promoCode as string)}
                        className="bg-white/10 hover:bg-white/20 p-3.5 rounded-lg transition-colors flex-shrink-0"
                      >
                        {copiedPromo ? <CheckCircle2 size={24} className="text-green-400" /> : <Copy size={24} />}
                      </button>
                    </div>

                    <p className="text-xs text-frost-white/40 mt-2">
                      Стандартная реферальная ссылка:
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-black/20 border border-white/5 rounded-lg px-3 py-2 text-xs font-mono truncate text-frost-white/60">
                        {stats.link}
                      </div>
                      <button 
                        onClick={() => handleCopyLink(stats.link)}
                        type="button"
                        className="bg-white/5 hover:bg-white/10 p-2 rounded-lg transition-colors flex-shrink-0 text-frost-white/60"
                      >
                        {copiedLink ? <CheckCircle2 size={16} className="text-green-400" /> : <Copy size={16} />}
                      </button>
                    </div>
                  </>
                ) : (
                  <form onSubmit={handleCreatePromo} className="flex flex-col gap-3">
                    <p className="text-sm text-frost-white/70">
                      Создайте красивый промокод для вашей реферальной ссылки.
                    </p>
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        value={promoInput}
                        onChange={e => setPromoInput(e.target.value)}
                        placeholder="Например: VIP2026"
                        className="flex-1 bg-black/40 border border-white/10 focus:border-macvbet-yellow rounded-lg px-4 py-3 text-base outline-none transition-colors"
                      />
                      <button 
                        type="submit"
                        disabled={createPromoMutation.isPending}
                        className="bg-macvbet-yellow text-black font-medium px-5 py-3 rounded-lg hover:bg-yellow-400 disabled:opacity-50 transition-colors"
                      >
                        {createPromoMutation.isPending ? '...' : 'Создать'}
                      </button>
                    </div>
                    {promoError && <p className="text-xs text-red-400">{promoError}</p>}
                    
                    <p className="text-xs text-frost-white/40 mt-1">
                      Или используйте стандартную ссылку по ID:
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-black/20 border border-white/5 rounded-lg px-3 py-2 text-xs font-mono truncate text-frost-white/60">
                        {stats.link}
                      </div>
                      <button 
                        onClick={() => handleCopyLink(stats.link)}
                        type="button"
                        className="bg-white/5 hover:bg-white/10 p-2 rounded-lg transition-colors flex-shrink-0 text-frost-white/60"
                      >
                        {copiedLink ? <CheckCircle2 size={16} className="text-green-400" /> : <Copy size={16} />}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </section>

            {/* Overall Stats Grid */}
            <section className="grid grid-cols-2 gap-4">
              <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 flex flex-col gap-2">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center mb-1">
                  <Users size={20} />
                </div>
                <span className="text-frost-white/60 text-xs font-medium uppercase tracking-wider">Переходы</span>
                <span className="text-3xl font-light">{aggregate.clicks}</span>
              </div>
              <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 flex flex-col gap-2">
                <div className="w-10 h-10 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center mb-1">
                  <Activity size={20} />
                </div>
                <span className="text-frost-white/60 text-xs font-medium uppercase tracking-wider">Всего рефералов</span>
                <span className="text-3xl font-light">{stats.registrations || 0}</span>
              </div>
              <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 flex flex-col gap-2">
                <div className="w-10 h-10 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center mb-1">
                  <TrendingUp size={20} />
                </div>
                <span className="text-frost-white/60 text-xs font-medium uppercase tracking-wider">Депозиты (zl)</span>
                <span className="text-3xl font-light">{aggregate.depSum.toFixed(2)}</span>
              </div>
              <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 flex flex-col gap-2">
                <div className="w-10 h-10 rounded-full bg-macvbet-yellow/20 text-macvbet-yellow flex items-center justify-center mb-1">
                  <DollarSign size={20} />
                </div>
                <span className="text-frost-white/60 text-xs font-medium uppercase tracking-wider">Доход (zl)</span>
                <span className="text-3xl font-light text-macvbet-yellow">{aggregate.income.toFixed(2)}</span>
              </div>
            </section>

            {/* Income Chart */}
            <section className="flex flex-col gap-4 mt-4">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xl font-medium">Динамика дохода</h2>
                <span className="text-xs text-frost-white/50 bg-white/5 px-3 py-1.5 rounded-md">За 14 дней</span>
              </div>
              
              <div className="h-[220px] w-full p-4 rounded-[16px] border border-white/5 bg-white/[0.02] flex items-end justify-between gap-1.5 relative overflow-hidden">
                {/* Horizontal Guide lines */}
                <div className="absolute inset-0 flex flex-col justify-between px-4 py-4 pointer-events-none">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="w-full border-b border-white/[0.03]" />
                  ))}
                </div>
                
                {/* Chart Bars */}
                {chartData.map((d, i) => (
                  <div key={i} className="relative flex flex-col justify-end items-center h-full w-full group">
                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full mb-3 opacity-0 group-hover:opacity-100 transition-opacity bg-black border border-white/10 text-sm px-3 py-1.5 rounded-lg pointer-events-none whitespace-nowrap z-20 shadow-xl">
                      {d.displayDate}: <span className="text-macvbet-yellow font-bold">{d.income.toFixed(2)} zl</span>
                    </div>
                    <motion.div 
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max(d.heightPercent, 2)}%` }} // min 2% for visual presence
                      transition={{ duration: 0.8, delay: i * 0.03, ease: "easeOut" }}
                      className="w-full max-w-[16px] bg-gradient-to-t from-macvbet-yellow/40 to-macvbet-yellow rounded-t-md z-10 hover:opacity-80 transition-opacity cursor-pointer"
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* How it works */}
            <section className="mt-6 flex flex-col gap-3">
              <h2 className="text-xl font-medium px-1">Как это работает?</h2>
              <div className="p-5 rounded-[16px] border border-white/5 bg-white/[0.02] text-frost-white/80 text-sm leading-relaxed flex flex-col gap-4">
                <p>
                  Партнерская программа MacvBet позволяет вам зарабатывать реальные деньги на привлечении новых игроков.
                </p>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 shrink-0 rounded-full bg-macvbet-yellow/20 text-macvbet-yellow flex items-center justify-center font-bold">1</div>
                  <div>
                    <h3 className="text-frost-white font-medium mb-1">Распространяйте ссылку</h3>
                    <p className="text-frost-white/60 text-xs">Делитесь вашим промокодом или реферальной ссылкой в социальных сетях, каналах или с друзьями.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 shrink-0 rounded-full bg-macvbet-yellow/20 text-macvbet-yellow flex items-center justify-center font-bold">2</div>
                  <div>
                    <h3 className="text-frost-white font-medium mb-1">Игроки регистрируются</h3>
                    <p className="text-frost-white/60 text-xs">Пользователь, перешедший по вашей ссылке или активировавший ваш промокод, навсегда закрепляется за вами.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 shrink-0 rounded-full bg-macvbet-yellow/20 text-macvbet-yellow flex items-center justify-center font-bold">3</div>
                  <div>
                    <h3 className="text-frost-white font-medium mb-1">Получайте 50% от прибыли (RevShare)</h3>
                    <p className="text-frost-white/60 text-xs leading-relaxed">
                      Вам начисляется ровно половина от чистой прибыли казино (GGR) с каждого приведенного игрока.<br/><br/>
                      <strong className="text-frost-white/80">GGR (Gross Gaming Revenue)</strong> — это разница между суммой всех ставок игрока и суммой его выигрышей. Если игрок проигрывает, 50% его проигрыша зачисляется вам на баланс. Если игрок выигрывает больше, чем поставил, ваш баланс может уйти в минус (Negative Carryover). Этот минус спишется с вашей будущей прибыли, вы ничего не должны оплачивать. Балансы партнеров обновляются автоматически каждый день по результатам активности рефералов.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : null}

      </div>
      
      <AnimatePresence>
        {showWithdrawModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#111111] border border-white/10 rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl"
            >
              <h3 className="text-xl font-medium text-frost-white">Запрос на вывод</h3>
              <p className="text-sm text-frost-white/70">
                Вы уверены, что хотите перевести {stats?.balance?.toFixed(2)} zl на ваш основной баланс?
              </p>
              {withdrawMutation.error && (
                <p className="text-xs text-red-400">{withdrawMutation.error.message}</p>
              )}
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setShowWithdrawModal(false)}
                  disabled={withdrawMutation.isPending}
                  className="flex-1 px-4 py-3 rounded-xl border border-white/10 bg-white/5 font-medium text-frost-white/80 hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  onClick={() => withdrawMutation.mutate()}
                  disabled={withdrawMutation.isPending}
                  className="flex-1 px-4 py-3 rounded-xl bg-macvbet-yellow text-black font-semibold hover:bg-yellow-400 transition-colors shadow-lg shadow-macvbet-yellow/20 disabled:opacity-50"
                >
                  {withdrawMutation.isPending ? 'Загрузка...' : 'Подтвердить'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </main>
  );
}
