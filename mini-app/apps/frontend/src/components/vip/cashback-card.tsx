'use client';

import { motion } from 'framer-motion';
import { Percent, Clock, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';
import { useCashback } from '@/hooks/use-vip';
import { useBalance } from '@/hooks/use-balance';
import { Pressable } from '@/components/ui/pressable';

export function CashbackCard({ className }: { className?: string }) {
  const { cashback, loading, claiming, claimCashback } = useCashback();
  const { fetchBalance } = useBalance();

  if (loading || !cashback) {
    return (
      <div className="w-full h-32 rounded-[20px] border border-white/10 bg-white/[0.03] animate-pulse" />
    );
  }

  const {
    available,
    amount,
    cashbackPercent,
    netLoss,
    nextClaimAvailableAt,
    rankName,
  } = cashback;

  const handleClaim = async () => {
    const ok = await claimCashback();
    if (ok) {
      void fetchBalance();
    }
  };

  return (
    <div
      className={`relative overflow-hidden rounded-[20px] border border-emerald-500/20 bg-gradient-to-b from-emerald-950/20 via-[#0e1210] to-[#070908] p-4 sm:p-5 shadow-[inset_0_1px_0_rgba(16,185,129,0.1)] flex flex-col gap-3.5 ${
        className || ''
      }`}
    >
      {/* Glow ambient */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-12 -left-12 w-48 h-48 rounded-full bg-emerald-500/10 blur-3xl"
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <Percent size={20} strokeWidth={2.5} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-roobert text-[16px] font-extrabold text-white">
                Еженедельный Кэшбэк
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10.5px]">
                {cashbackPercent}% ({rankName})
              </span>
            </div>
            <p className="text-[11px] text-white/50 mt-0.5">
              Возврат от чистого проигрыша за неделю
            </p>
          </div>
        </div>
      </div>

      {/* Amount and Action */}
      <div className="p-3 rounded-xl border border-white/8 bg-black/40 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] text-white/50 font-medium">Накоплено к выплате</div>
          <div className="font-roobert text-[19px] font-extrabold text-emerald-400 tabular-nums">
            +{amount.toFixed(2)} <span className="text-sm font-bold text-white/80">zł</span>
          </div>
        </div>

        {available ? (
          <Pressable
            onClick={handleClaim}
            disabled={claiming}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-black font-extrabold text-[12.5px] transition-all shrink-0 shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Sparkles size={14} />
            <span>{claiming ? 'Зачисление...' : 'Забрать'}</span>
          </Pressable>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-white/40 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
            <Clock size={12} />
            <span>
              {amount <= 0
                ? 'Нет проигрыша'
                : nextClaimAvailableAt
                ? `Доступно ${new Date(nextClaimAvailableAt).toLocaleDateString()}`
                : 'Мин. 0.50 zł'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
