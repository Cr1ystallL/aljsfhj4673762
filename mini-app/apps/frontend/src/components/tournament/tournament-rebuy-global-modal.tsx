'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, X, RefreshCw, Zap } from 'lucide-react';
import { useBalanceStore } from '@/store/balance-store';
import { useAuthStore } from '@/store/auth-store';
import { toast } from '@/store/toast-store';

interface TournamentInfo {
  id: string;
  title: string;
  gameType: string;
  rebuyFee: number;
  joined: boolean;
  live: boolean;
  tournamentBalance: number | null;
  startBalance: number;
}

export function TournamentRebuyGlobalModal() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const tournamentBalances = useBalanceStore((s) => s.tournamentBalances);
  const [activeRebuyTournament, setActiveRebuyTournament] = useState<TournamentInfo | null>(null);
  const [dismissedTournaments, setDismissedTournaments] = useState<Record<string, number>>({});
  const [isBusy, setIsBusy] = useState(false);

  const checkTournaments = useCallback(async () => {
    if (!isAuthenticated) return;

    // Check if any tournament balance is 0
    const zeroBalanceItems = tournamentBalances.filter((tb) => tb.balance <= 0);
    if (zeroBalanceItems.length === 0) {
      setActiveRebuyTournament(null);
      return;
    }

    try {
      const res = await fetch('/api/tournaments', { credentials: 'include' });
      if (!res.ok) return;
      const json = await res.json();
      const tournaments: TournamentInfo[] = json.tournaments || [];

      // Find a tournament that is live, joined, has balance <= 0, and not recently dismissed
      const eligible = tournaments.find((t) => {
        if (!t.live || !t.joined || t.tournamentBalance === null || t.tournamentBalance > 0) {
          return false;
        }
        const dismissedAt = dismissedTournaments[t.id];
        // If dismissed within the last 5 minutes, do not show again
        if (dismissedAt && Date.now() - dismissedAt < 5 * 60 * 1000) {
          return false;
        }
        return true;
      });

      setActiveRebuyTournament(eligible || null);
    } catch {
      // Ignore network errors
    }
  }, [isAuthenticated, tournamentBalances, dismissedTournaments]);

  useEffect(() => {
    void checkTournaments();
  }, [checkTournaments]);

  const handleDismiss = () => {
    if (activeRebuyTournament) {
      setDismissedTournaments((prev) => ({
        ...prev,
        [activeRebuyTournament.id]: Date.now(),
      }));
    }
    setActiveRebuyTournament(null);
  };

  const handleRebuy = async () => {
    if (!activeRebuyTournament || isBusy) return;
    setIsBusy(true);

    try {
      const res = await fetch(`/api/tournaments/${activeRebuyTournament.id}/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        toast.success(`Турнирный баланс пополнен на ${activeRebuyTournament.startBalance} TM!`);
        // Refresh balance store
        try {
          const balRes = await fetch('/api/balance', { credentials: 'include' });
          if (balRes.ok) {
            const balData = await balRes.json();
            useBalanceStore.getState().setBalance(balData.balance, balData.tournamentBalances);
          }
        } catch {
          // Ignore
        }
        setActiveRebuyTournament(null);
      } else {
        toast.error(data?.error || 'Не удалось докупить турнирный баланс');
      }
    } catch {
      toast.error('Ошибка сети при докупке баланса');
    } finally {
      setIsBusy(false);
    }
  };

  if (!activeRebuyTournament) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/75 backdrop-blur-md"
          onClick={handleDismiss}
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 15 }}
          transition={{ type: 'spring', damping: 24, stiffness: 300 }}
          className="relative w-full max-w-[420px] bg-gradient-to-b from-[#181a20] to-[#0f1115] border border-amber-500/30 rounded-[28px] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.9),0_0_30px_rgba(255,172,46,0.15)] flex flex-col items-center text-center p-6 sm:p-8"
        >
          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-whisper-gray hover:text-frost-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>

          {/* Trophy Icon with animated glow */}
          <div className="relative mb-4">
            <div className="absolute inset-0 rounded-full bg-[#ffac2e]/30 blur-xl animate-pulse" />
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-[#ffac2e]/30 to-[#ff7e2e]/10 border border-[#ffac2e]/50 flex items-center justify-center text-[#ffac2e] shadow-inner">
              <Trophy size={32} strokeWidth={2.2} />
            </div>
          </div>

          {/* Title & Subtitle */}
          <h2 className="font-roobert text-[20px] sm:text-[22px] font-bold text-frost-white mb-1.5 leading-snug">
            Кончился турнирный баланс?
          </h2>
          <p className="font-roobert text-[12px] text-amber-300 font-semibold tracking-wider uppercase mb-3">
            {activeRebuyTournament.title}
          </p>

          <p className="font-roobert text-[13px] text-whisper-gray mb-6 leading-relaxed px-2">
            Не переживайте! Вы можете восстановить турнирный баланс до{' '}
            <strong className="text-frost-white">{activeRebuyTournament.startBalance} TM</strong>{' '}
            {activeRebuyTournament.rebuyFee > 0 ? (
              <>
                за <strong className="text-amber-300">{activeRebuyTournament.rebuyFee} zł</strong>
              </>
            ) : (
              <strong className="text-emerald-400">бесплатно</strong>
            )}{' '}
            и продолжить борьбу за главный куш!
          </p>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 w-full">
            <button
              onClick={handleDismiss}
              className="flex-1 h-12 rounded-pill border border-white/15 bg-white/5 font-roobert text-[13px] font-medium text-frost-white hover:bg-white/10 transition-all active:scale-[0.98] cursor-pointer"
            >
              Позже
            </button>
            <button
              onClick={handleRebuy}
              disabled={isBusy}
              className="flex-1 h-12 rounded-pill bg-gradient-to-r from-[#ffac2e] to-[#ff8e2e] text-black font-roobert text-[13px] font-bold uppercase tracking-wider hover:brightness-110 shadow-[0_0_20px_rgba(255,172,46,0.4)] active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
            >
              {isBusy ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <>
                  <Zap size={15} className="fill-black" />
                  <span>Докупить</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
