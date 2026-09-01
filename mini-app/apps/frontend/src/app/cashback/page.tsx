'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Percent,
  Sparkles,
  Clock,
  Crown,
  Info,
  ChevronRight,
  TrendingDown,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { GameTopBar } from '@/components/game/game-top-bar';
import { PAGE_WIDTH } from '@/components/layout/page-width';
import { useCashback, useVip } from '@/hooks/use-vip';
import { useBalance } from '@/hooks/use-balance';
import { VipBadge } from '@/components/vip/vip-badge';
import { VipFaqModal } from '@/components/vip/vip-faq-modal';
import { Pressable } from '@/components/ui/pressable';
import { VIP_RANKS } from '@/lib/vip';
import { useT } from '@/i18n/use-t';

export default function CashbackPage() {
  const { t, localeTag } = useT();
  const { cashback, loading: cbLoading, claiming, claimCashback } = useCashback();
  const { status: vipStatus } = useVip();
  const { refetch: fetchBalance } = useBalance();
  const [faqOpen, setFaqOpen] = useState(false);

  const handleClaim = async () => {
    const ok = await claimCashback();
    if (ok) {
      void fetchBalance();
    }
  };

  const rank = vipStatus?.currentTier || VIP_RANKS[0];
  const amount = cashback?.amount || 0;
  const isAvailable = !!cashback?.available && amount > 0;
  const netLoss = cashback?.netLoss || 0;
  const totalWagered = cashback?.totalWagered || 0;
  const totalWon = cashback?.totalWon || 0;
  const percent = cashback?.cashbackPercent || rank.cashbackPercent;

  return (
    <main className="min-h-screen w-full bg-black text-frost-white flex flex-col pb-36 font-roobert">
      {/* Top Bar */}
      <GameTopBar title="Кэшбэк" Icon={Percent} width="wide" />

      <div className={`mx-auto w-full ${PAGE_WIDTH.wide} px-3.5 pt-4 flex flex-col gap-4`}>
        {/* ========================================================================= */}
        {/* HERO CASHBACK CARD                                                        */}
        {/* ========================================================================= */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[24px] border border-emerald-500/30 bg-gradient-to-b from-emerald-950/30 via-[#0e1310] to-[#070908] p-5 sm:p-6 shadow-[0_12px_40px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(16,185,129,0.15)] flex flex-col gap-5"
        >
          {/* Ambient Glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full bg-emerald-500/15 blur-3xl"
          />

          {/* Top Rank Badge & Info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <VipBadge rankId={rank.id} size="md" showGlow={true} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-roobert text-lg font-extrabold text-white">
                    {rank.nameRu}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-extrabold text-[11px] border border-emerald-500/30">
                    {percent}% кэшбэк
                  </span>
                </div>
                <p className="text-[11.5px] text-white/50 mt-0.5">
                  Ваш текущий VIP статус программы лояльности
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setFaqOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition-colors text-[11px] font-bold"
            >
              <Info size={13} />
              <span>Таблица</span>
            </button>
          </div>

          {/* Amount Box */}
          <div className="p-4 rounded-2xl border border-white/10 bg-black/60 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-white/50">
                Накоплено к выплате
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-roobert text-3xl sm:text-4xl font-black text-emerald-400 tabular-nums tracking-tight drop-shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                  +{amount.toFixed(2)}
                </span>
                <span className="text-lg font-extrabold text-white/80 uppercase">
                  zł
                </span>
              </div>
            </div>

            {isAvailable ? (
              <Pressable
                onClick={handleClaim}
                disabled={claiming}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500 hover:brightness-110 text-black font-extrabold text-[14px] transition-all shadow-xl shadow-emerald-500/25 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Sparkles size={16} />
                <span>{claiming ? 'Зачисление...' : 'Забрать кэшбэк'}</span>
              </Pressable>
            ) : (
              <div className="flex items-center gap-2 text-[12px] font-medium text-white/50 bg-white/5 px-4 py-3 rounded-xl border border-white/5">
                <Clock size={15} className="text-emerald-400 shrink-0" />
                <span>
                  {amount <= 0
                    ? 'Нет чистого проигрыша за период'
                    : cashback?.nextClaimAvailableAt
                    ? `Доступно ${new Date(cashback.nextClaimAvailableAt).toLocaleDateString()}`
                    : 'Мин. сумма к выплате: 0.50 zł'}
                </span>
              </div>
            )}
          </div>

          {/* 7-Day Stats Overview */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10 text-center">
            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
              <span className="block text-[10px] uppercase font-bold text-white/40">Оборот (7д)</span>
              <span className="font-roobert text-[13px] font-bold text-white tabular-nums mt-0.5 block">
                {totalWagered.toLocaleString(localeTag, { maximumFractionDigits: 0 })} zł
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
              <span className="block text-[10px] uppercase font-bold text-white/40">Выигрыши</span>
              <span className="font-roobert text-[13px] font-bold text-white tabular-nums mt-0.5 block">
                {totalWon.toLocaleString(localeTag, { maximumFractionDigits: 0 })} zł
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
              <span className="block text-[10px] uppercase font-bold text-white/40">Проигрыш</span>
              <span className="font-roobert text-[13px] font-bold text-emerald-400 tabular-nums mt-0.5 block">
                {netLoss.toLocaleString(localeTag, { maximumFractionDigits: 0 })} zł
              </span>
            </div>
          </div>
        </motion.div>

        {/* ========================================================================= */}
        {/* HOW CASHBACK WORKS & VIP TIERS                                            */}
        {/* ========================================================================= */}
        <div className="rounded-[20px] border border-white/10 bg-[#101216] p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-roobert text-[15px] font-bold text-white flex items-center gap-2">
              <Percent size={16} className="text-emerald-400" />
              <span>Шкала кэшбэка по VIP Рангам</span>
            </h3>
            <button
              onClick={() => setFaqOpen(true)}
              className="text-[11px] font-bold text-amber-400 hover:text-amber-300 transition-colors"
            >
              Все привилегии →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {VIP_RANKS.map((t) => {
              const isCurrent = rank.level === t.level;
              return (
                <div
                  key={t.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                    isCurrent
                      ? 'border-emerald-500/50 bg-emerald-950/20'
                      : 'border-white/5 bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <VipBadge rankId={t.id} size="sm" />
                    <div>
                      <div className="font-roobert text-[12.5px] font-bold text-white">
                        {t.nameRu}
                      </div>
                      <div className="text-[10px] text-white/50">
                        Оборот от {t.wagerZl.toLocaleString('ru-RU')} zł
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-roobert text-[13.5px] font-extrabold text-emerald-400">
                      {t.cashbackPercent}%
                    </span>
                    {isCurrent && (
                      <span className="block text-[8.5px] uppercase font-bold text-emerald-300 tracking-wider">
                        Текущий
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3.5 rounded-xl border border-white/5 bg-black/40 text-[11.5px] text-white/60 leading-relaxed">
            💡 Кэшбэк начисляется автоматически каждый понедельник и рассчитывается по формуле: <br />
            <b className="text-white">Кэшбэк = (Сумма ставок − Сумма выигрышей) × Ваш % ранга</b>.
          </div>
        </div>
      </div>

      <VipFaqModal
        isOpen={faqOpen}
        onClose={() => setFaqOpen(false)}
        currentLevel={rank.level}
      />
    </main>
  );
}
