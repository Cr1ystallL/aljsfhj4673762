'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Percent,
  Sparkles,
  Clock,
  Info,
  RotateCcw,
  Wallet,
  Trophy,
  CheckCircle2,
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

  // Check launch date — 7 September 2026
  const launchDate = new Date('2026-09-07T00:00:00.000Z');
  const isBeforeLaunch = Date.now() < launchDate.getTime();

  return (
    <main className="min-h-screen w-full bg-black text-frost-white flex flex-col pb-36 font-roobert select-none">
      {/* Top Bar */}
      <GameTopBar title="Кэшбэк" Icon={Percent} width="wide" />

      <div className={`mx-auto w-full ${PAGE_WIDTH.wide} px-3.5 pt-4 flex flex-col gap-4`}>
        {/* ========================================================================= */}
        {/* MAIN CASHBACK CARD (Design matching user screenshot)                      */}
        {/* ========================================================================= */}
        <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#0d0f13] p-5 sm:p-6 shadow-2xl flex flex-col gap-4">
          {/* Animated Soft Green Gradient Background Glow */}
          <motion.div
            animate={{
              opacity: [0.15, 0.28, 0.15],
              scale: [1, 1.05, 1],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            aria-hidden
            className="pointer-events-none absolute -top-24 -left-24 w-80 h-80 rounded-full bg-emerald-500 blur-3xl -z-0"
          />

          {/* TOP ROW: Rank Badge, Name, Cashback % and Table Button */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <VipBadge rankId={rank.id} size="md" showGlow={true} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-roobert text-[17px] font-black text-white tracking-tight">
                    {rank.nameRu}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-[#00e87b] font-extrabold text-[11px] border border-emerald-500/30">
                    {percent}% кешбэк
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition-colors text-[11.5px] font-medium"
            >
              <Info size={13} className="text-white/60" />
              <span>Таблице</span>
            </button>
          </div>

          {/* MIDDLE ROW: Accumulated Amount Box & Claim Button */}
          <div className="relative z-10 p-4 sm:p-5 rounded-[20px] border border-white/10 bg-black/50 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="block text-[12px] font-medium text-white/50">
                Накоплено к выплате
              </span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="font-roobert text-3xl sm:text-4xl font-black text-[#00e87b] tabular-nums tracking-tight drop-shadow-[0_0_20px_rgba(0,232,123,0.3)]">
                  {amount.toFixed(2)}
                </span>
                <span className="text-xl font-extrabold text-white/90">
                  zł
                </span>
              </div>
            </div>

            {isBeforeLaunch ? (
              <div className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs font-semibold">
                <Clock size={15} className="text-emerald-400 shrink-0" />
                <span>Старт выплат с 7 сентября</span>
              </div>
            ) : isAvailable ? (
              <Pressable
                onClick={handleClaim}
                disabled={claiming}
                className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-[#00e87b] hover:bg-[#00d670] active:scale-95 text-black font-extrabold text-[13.5px] transition-all shadow-[0_0_25px_rgba(0,232,123,0.3)] flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Sparkles size={16} />
                <span>{claiming ? 'Зачисление...' : 'Забрать кешбэк'}</span>
              </Pressable>
            ) : (
              <div className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs font-medium">
                <Clock size={15} className="text-emerald-400 shrink-0" />
                <span>
                  {amount <= 0
                    ? 'Нет проигрыша за период'
                    : cashback?.nextClaimAvailableAt
                    ? `Доступно ${new Date(cashback.nextClaimAvailableAt).toLocaleDateString()}`
                    : 'Мин. сумма: 0.50 zł'}
                </span>
              </div>
            )}
          </div>

          {/* BOTTOM ROW: 3 Distinct Stats Cards with Monochrome SVG Icons */}
          <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* 1. Оборот */}
            <div className="p-3 rounded-[16px] border border-white/10 bg-white/[0.02] flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white shrink-0">
                <RotateCcw size={18} strokeWidth={2} />
              </div>
              <div>
                <span className="block text-[11px] font-medium text-white/50">Оборот (7д)</span>
                <span className="font-roobert text-[15px] font-extrabold text-white tabular-nums">
                  {totalWagered.toLocaleString(localeTag, { maximumFractionDigits: 0 })} zł
                </span>
              </div>
            </div>

            {/* 2. Выигрыш */}
            <div className="p-3 rounded-[16px] border border-white/10 bg-white/[0.02] flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white shrink-0">
                <Wallet size={18} strokeWidth={2} />
              </div>
              <div>
                <span className="block text-[11px] font-medium text-white/50">Выигрыш</span>
                <span className="font-roobert text-[15px] font-extrabold text-white tabular-nums">
                  {totalWon.toLocaleString(localeTag, { maximumFractionDigits: 0 })} zł
                </span>
              </div>
            </div>

            {/* 3. Проигрыш */}
            <div className="p-3 rounded-[16px] border border-white/10 bg-white/[0.02] flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white shrink-0">
                <Trophy size={18} strokeWidth={2} />
              </div>
              <div>
                <span className="block text-[11px] font-medium text-white/50">Проигрыш</span>
                <span className="font-roobert text-[15px] font-extrabold text-[#00e87b] tabular-nums">
                  {netLoss.toLocaleString(localeTag, { maximumFractionDigits: 0 })} zł
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* VIP RANKS CASHBACK BREAKDOWN TABLE                                        */}
        {/* ========================================================================= */}
        <div className="rounded-[24px] border border-white/10 bg-[#0d0f13] p-5 sm:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Percent size={17} className="text-[#00e87b]" />
              <span className="font-roobert text-[15.5px] font-extrabold text-white">
                Шкала кэшбэка по VIP Рангам
              </span>
            </div>

            <button
              onClick={() => setFaqOpen(true)}
              className="text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors"
            >
              Все награды →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {VIP_RANKS.map((t) => {
              const isCurrent = rank.level === t.level;
              return (
                <div
                  key={t.id}
                  className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                    isCurrent
                      ? 'border-emerald-500/60 bg-emerald-950/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                      : 'border-white/8 bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <VipBadge rankId={t.id} size="sm" showGlow={isCurrent} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-roobert text-[13.5px] font-extrabold text-white">
                          {t.nameRu}
                        </span>
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-[#00e87b] font-extrabold text-[9px] border border-emerald-500/30">
                            Ваш ранг
                          </span>
                        )}
                      </div>
                      <span className="text-[10.5px] text-white/50 block mt-0.5">
                        Оборот от {t.wagerZl.toLocaleString('ru-RU')} zł ({t.minXp.toLocaleString('ru-RU')} XP)
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-roobert text-[16px] font-black text-[#00e87b] tabular-nums">
                      {t.cashbackPercent}%
                    </span>
                    <span className="block text-[9.5px] text-white/40 uppercase font-bold tracking-wider">
                      кэшбэк
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Informational rules card */}
        <div className="rounded-[20px] border border-white/10 bg-[#0d0f13] p-5 flex flex-col gap-3 text-xs text-white/60 leading-relaxed">
          <div className="font-bold text-white text-sm flex items-center gap-2">
            <span>ℹ️ Как работает еженедельный кэшбэк:</span>
          </div>
          <p>
            • Расчет производится от суммы чистого проигрыша за последние 7 дней: <br />
            <b className="text-white font-mono text-[11px]">Кэшбэк = (Ставки − Выигрыши) × % вашего ранга</b>.
          </p>
          <p>
            • Накопленные средства становятся доступны к выплате каждый понедельник (старт программы с <b>7 сентября 2026</b>).
          </p>
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
