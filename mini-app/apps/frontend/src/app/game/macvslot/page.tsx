'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ShieldAlert, HelpCircle, Dices } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GameTopBar } from '@/components/game/game-top-bar';
import { useBalance } from '@/hooks/use-balance';
import { useIsAdmin } from '@/lib/admin-probe';
import { toast } from '@/store/toast-store';
import { soundManager } from '@/lib/sound/sound-manager';
import { MacvSlotReels } from '@/components/game/macvslot/macvslot-reels';
import { MacvSlotControls } from '@/components/game/macvslot/macvslot-controls';
import { MacvSlotPaytableModal } from '@/components/game/macvslot/macvslot-paytable-modal';
import {
  MacvSlotBonusModal,
  MacvSlotBonusVictoryModal,
  MacvSlotBuyBonusModal,
} from '@/components/game/macvslot/macvslot-bonus-modal';
import { MacvSlotBigWinModal } from '@/components/game/macvslot/macvslot-bigwin-modal';
import { MacvSlotAutoModal } from '@/components/game/macvslot/macvslot-autospin-modal';
import type { SlotSymbol, WinningLine, SlotSpinResponse, StickyMultiplier } from '@/components/game/macvslot/macvslot-types';

// Smooth animated number hook for live rolling increment during bonus
function useAnimatedNumber(targetValue: number, duration = 600) {
  const [displayValue, setDisplayValue] = useState(targetValue);
  const prevValueRef = useRef(targetValue);

  useEffect(() => {
    const startValue = prevValueRef.current;
    const diff = targetValue - startValue;
    if (Math.abs(diff) < 0.001) {
      setDisplayValue(targetValue);
      prevValueRef.current = targetValue;
      return;
    }
    const startTime = performance.now();
    let animId: number;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // easeOutCubic curve
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(startValue + diff * ease);

      if (progress < 1) {
        animId = requestAnimationFrame(tick);
      } else {
        setDisplayValue(targetValue);
        prevValueRef.current = targetValue;
      }
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [targetValue, duration]);

  return displayValue;
}

// Default initial grid
const INITIAL_GRID: SlotSymbol[][] = [
  ['macvjet', 'a', '10'],
  ['mines', 'k', 'wheel'],
  ['scatter', 'wield', 'coinflip'],
  ['wheel', 'q', 'macvjet'],
  ['coinflip', 'j', 'mines'],
];

export default function MacvSlotPage() {
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const { balance, fetchBalance } = useBalance();

  // Game state
  const [grid, setGrid] = useState<SlotSymbol[][]>(INITIAL_GRID);
  const [spinId, setSpinId] = useState<string>('init');
  const [winningLines, setWinningLines] = useState<WinningLine[]>([]);
  const [betAmount, setBetAmount] = useState<number>(1.0);
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [isTurbo, setIsTurbo] = useState<boolean>(false);
  const [autoSpinsLeft, setAutoSpinsLeft] = useState<number>(0);
  const [lastWin, setLastWin] = useState<number>(0);
  const [freeSpinsLeft, setFreeSpinsLeft] = useState<number>(0);
  const [awardedFreeSpins, setAwardedFreeSpins] = useState<number>(0);
  const [showPaytable, setShowPaytable] = useState<boolean>(false);
  const [bigWinAmount, setBigWinAmount] = useState<number | null>(null);
  const [isScatterAnticipating, setIsScatterAnticipating] = useState<boolean>(false);
  const [showBuyBonusConfirm, setShowBuyBonusConfirm] = useState<boolean>(false);
  const [showAutoModal, setShowAutoModal] = useState<boolean>(false);
  const [stickyMultipliers, setStickyMultipliers] = useState<StickyMultiplier[]>([]);
  const [isBonusPaused, setIsBonusPaused] = useState<boolean>(false);

  // Bonus Game Tracking
  const [isBonusMode, setIsBonusMode] = useState<boolean>(false);
  const [bonusTotalWon, setBonusTotalWon] = useState<number>(0);
  const [bonusInitialSpins, setBonusInitialSpins] = useState<number>(10);
  const [bonusSpinsPlayed, setBonusSpinsPlayed] = useState<number>(0);
  const [showBonusVictory, setShowBonusVictory] = useState<boolean>(false);
  const [victoryBonusTotal, setVictoryBonusTotal] = useState<number>(0);
  const [victoryTotalSpins, setVictoryTotalSpins] = useState<number>(10);

  // Rolling counter for total bonus win
  const animatedBonusWin = useAnimatedNumber(bonusTotalWon, 700);

  const pendingResultRef = useRef<SlotSpinResponse | null>(null);
  const bigWinTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Synchronization refs to eliminate React state closure staleness during auto-play
  const isSpinningRef = useRef(false);
  const autoSpinsLeftRef = useRef(0);
  const betAmountRef = useRef(1.0);
  const isTurboRef = useRef(false);
  const freeSpinsLeftRef = useRef(0);
  const balanceRef = useRef(balance?.amount ?? 0);
  const isBonusModeRef = useRef(false);
  const isBonusPausedRef = useRef(false);
  const bonusTotalWonRef = useRef(0);
  const bonusSpinsPlayedRef = useRef(0);
  const bonusInitialSpinsRef = useRef(10);

  useEffect(() => {
    isSpinningRef.current = isSpinning;
  }, [isSpinning]);

  useEffect(() => {
    autoSpinsLeftRef.current = autoSpinsLeft;
  }, [autoSpinsLeft]);

  useEffect(() => {
    betAmountRef.current = betAmount;
  }, [betAmount]);

  useEffect(() => {
    isTurboRef.current = isTurbo;
  }, [isTurbo]);

  useEffect(() => {
    freeSpinsLeftRef.current = freeSpinsLeft;
  }, [freeSpinsLeft]);

  useEffect(() => {
    balanceRef.current = balance?.amount ?? 0;
  }, [balance?.amount]);

  useEffect(() => {
    isBonusModeRef.current = isBonusMode;
  }, [isBonusMode]);

  useEffect(() => {
    isBonusPausedRef.current = isBonusPaused;
  }, [isBonusPaused]);

  // Sync initial state & active free spins (Paused on re-entry/exit)
  useEffect(() => {
    void fetchBalance();
    fetch('/api/games/macvslot/state', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.freeSpins && data.freeSpins.remaining > 0) {
          const fs = data.freeSpins;
          const initial = fs.initialSpins || 10;
          const remaining = fs.remaining;
          const played = Math.max(0, initial - remaining);

          setFreeSpinsLeft(remaining);
          freeSpinsLeftRef.current = remaining;
          setBonusInitialSpins(initial);
          bonusInitialSpinsRef.current = initial;
          setBonusSpinsPlayed(played);
          bonusSpinsPlayedRef.current = played;
          setBonusTotalWon(fs.totalWon || 0);
          bonusTotalWonRef.current = fs.totalWon || 0;
          setStickyMultipliers(fs.stickyMultipliers || []);

          // Restore bonus mode in PAUSED state so user can resume at their own pace
          setIsBonusMode(true);
          isBonusModeRef.current = true;
          setIsBonusPaused(true);
          isBonusPausedRef.current = true;

          if (fs.betAmount) {
            setBetAmount(fs.betAmount);
            betAmountRef.current = fs.betAmount;
          }
        }
      })
      .catch(() => {});
  }, [fetchBalance]);

  // Core spin runner (handles standard spins, bonus buys, and free spins without stale closures)
  const executeSpin = useCallback(
    async (isBonusBuy = false) => {
      if (isSpinningRef.current) return;

      const currentBalance = balanceRef.current;
      const currentBet = betAmountRef.current;
      const currentFree = freeSpinsLeftRef.current;
      const inBonus = isBonusModeRef.current;

      if (isBonusBuy) {
        const cost = Math.round(currentBet * 100 * 100) / 100;
        if (currentBalance < cost) {
          toast.warn(`Недостаточно средств. Для покупки бонуски требуется ${cost.toFixed(2)} zł.`);
          return;
        }
      } else if (!inBonus && currentFree <= 0 && currentBalance < currentBet) {
        toast.warn('Недостаточно средств для ставки.');
        autoSpinsLeftRef.current = 0;
        setAutoSpinsLeft(0);
        return;
      }

      isSpinningRef.current = true;
      setIsSpinning(true);
      setWinningLines([]);
      setLastWin(0);

      soundManager.play(isBonusBuy ? 'ui.success' : 'ui.click', { volume: 0.6 });

      try {
        const res = await fetch('/api/games/macvslot/spin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            betAmount: currentBet,
            demoMode: false,
            isBonusBuy,
          }),
        });

        const data: SlotSpinResponse = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error((data as any).error || 'Ошибка вращения');
        }

        // Store pending result and notify reels to begin their calibrated sequential stop
        pendingResultRef.current = data;
        setGrid(data.grid);
        setSpinId(data.roundId);
        if (inBonus || isBonusModeRef.current) {
          setFreeSpinsLeft(data.freeSpinsRemaining);
          freeSpinsLeftRef.current = data.freeSpinsRemaining;
        }

        // In normal play, sync balance immediately.
        // During bonus game, balance is credited at the end after the victory modal is dismissed!
        if (!inBonus && !data.isFreeSpin) {
          void fetchBalance();
        }
      } catch (err: any) {
        toast.error(err.message || 'Ошибка связи с сервером');
        isSpinningRef.current = false;
        setIsSpinning(false);
        autoSpinsLeftRef.current = 0;
        setAutoSpinsLeft(0);
      }
    },
    [fetchBalance]
  );

  const handleSpin = useCallback(() => {
    if (isBonusModeRef.current && isBonusPausedRef.current) {
      isBonusPausedRef.current = false;
      setIsBonusPaused(false);
      void executeSpin(false);
      return;
    }
    void executeSpin(false);
  }, [executeSpin]);

  const handleBuyBonus = useCallback(() => {
    void executeSpin(true);
  }, [executeSpin]);

  // Handler when Big Win modal is dismissed: resume next spin or end bonus
  const handleBigWinClose = useCallback(() => {
    setBigWinAmount(null);
    const result = pendingResultRef.current;
    if (!result) return;

    const inBonus = isBonusModeRef.current || result.isFreeSpin;

    if (inBonus) {
      if (result.freeSpinsRemaining > 0) {
        setTimeout(() => {
          if (!isSpinningRef.current && !isBonusPausedRef.current) {
            void executeSpin(false);
          }
        }, 600);
      } else {
        // Bonus finished on a Big Win
        isBonusModeRef.current = false;
        setIsBonusMode(false);
        setVictoryBonusTotal(bonusTotalWonRef.current);
        setVictoryTotalSpins(Math.max(10, bonusInitialSpinsRef.current || 10));
        setShowBonusVictory(true);
        soundManager.play('game.win', { volume: 1.0 });
      }
      pendingResultRef.current = null;
      return;
    }

    // 1. If this spin awarded free spins, open the Bonus announcement modal now!
    if (result.freeSpinsAwarded > 0) {
      setIsScatterAnticipating(false);
      setAwardedFreeSpins(result.freeSpinsAwarded);
      bonusInitialSpinsRef.current = result.freeSpinsAwarded;
      setBonusInitialSpins(result.freeSpinsAwarded);
      bonusSpinsPlayedRef.current = 0;
      setBonusSpinsPlayed(0);
      bonusTotalWonRef.current = 0;
      setBonusTotalWon(0);
      pendingResultRef.current = null;
      return;
    }

    // Base game auto spins continuation
    if (autoSpinsLeftRef.current > 0 && result.freeSpinsAwarded <= 0) {
      autoSpinsLeftRef.current -= 1;
      setAutoSpinsLeft(autoSpinsLeftRef.current);
      setTimeout(() => {
        if (autoSpinsLeftRef.current >= 0 && !isSpinningRef.current) {
          void executeSpin(false);
        }
      }, 600);
    }

    pendingResultRef.current = null;
  }, [executeSpin]);

  // Callback when reels complete their spinning animation
  const handleSpinComplete = useCallback(() => {
    isSpinningRef.current = false;
    setIsSpinning(false);

    const result = pendingResultRef.current;
    if (!result) return;

    setWinningLines(result.winningLines);
    setLastWin(result.totalWin);
    setStickyMultipliers(result.stickyMultipliers || []);

    const inBonus = isBonusModeRef.current || result.isFreeSpin;
    const isBigWin = result.totalWin >= betAmountRef.current * 5;

    // A. SCATTER BONUS TRIGGER:
    // If 3+ scatters hit, immediately animate/pulse all scatters on board!
    if (result.freeSpinsAwarded > 0) {
      setIsScatterAnticipating(true);
      soundManager.play('game.win', { volume: 0.95 });
      if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.HapticFeedback) {
        (window as any).Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      }
      autoSpinsLeftRef.current = 0;
      setAutoSpinsLeft(0);
    }

    // ========================================================================
    // 1. BIG WIN SEQUENCE:
    // First display winning lines on reels for 2.0s so the user sees what hit,
    // then display big win banner with slow rolling counter.
    // Spins are completely on hold during this time until banner is closed.
    // If bonus was awarded, handleBigWinClose will launch the bonus modal!
    // ========================================================================
    if (isBigWin) {
      soundManager.play('game.win', { volume: 0.9 });

      if (inBonus) {
        bonusSpinsPlayedRef.current += 1;
        setBonusSpinsPlayed(bonusSpinsPlayedRef.current);

        if (result.totalWin > 0) {
          bonusTotalWonRef.current = Math.round((bonusTotalWonRef.current + result.totalWin) * 100) / 100;
          setBonusTotalWon(bonusTotalWonRef.current);
        }
      }

      // Display winning lines and glowing scatters first for 2.0s, then show Big Win banner
      if (bigWinTimeoutRef.current) clearTimeout(bigWinTimeoutRef.current);
      bigWinTimeoutRef.current = setTimeout(() => {
        setBigWinAmount(result.totalWin);
      }, 2000);

      // Keep pendingResultRef active so handleBigWinClose can resume spins or open bonus modal
      return;
    }

    // ========================================================================
    // B. FREE SPINS BONUS ROUND EXECUTION LOOP (Automatic Sequence)
    // ========================================================================
    if (inBonus) {
      bonusSpinsPlayedRef.current += 1;
      setBonusSpinsPlayed(bonusSpinsPlayedRef.current);

      if (result.totalWin > 0) {
        soundManager.play('ui.success', { volume: 0.7 });
        bonusTotalWonRef.current = Math.round((bonusTotalWonRef.current + result.totalWin) * 100) / 100;
        setBonusTotalWon(bonusTotalWonRef.current);
      }

      const hasWin = result.totalWin > 0;
      const delay = hasWin
        ? (isTurboRef.current ? 950 : 1800) // Allow user to see winning lines and counter animate
        : (isTurboRef.current ? 500 : 1000);  // Exactly 1s wait if no winning lines!

      setTimeout(() => {
        if (result.freeSpinsRemaining > 0) {
          if (!isSpinningRef.current && !isBonusPausedRef.current) {
            void executeSpin(false);
          }
        } else {
          // All Free Spins Completed: show Grand Pragmatic-style Victory Modal!
          isBonusModeRef.current = false;
          setIsBonusMode(false);
          setVictoryBonusTotal(bonusTotalWonRef.current);
          setVictoryTotalSpins(Math.max(10, bonusInitialSpinsRef.current || 10));
          setShowBonusVictory(true);
          soundManager.play('game.win', { volume: 1.0 });
        }
      }, delay);

      pendingResultRef.current = null;
      return;
    }

    if (result.totalWin > 0) {
      soundManager.play('ui.success', { volume: 0.7 });
    }

    // ========================================================================
    // C. BASE GAME: NON-BIG-WIN FREE SPINS AWARD TRIGGER
    // ========================================================================
    if (result.freeSpinsAwarded > 0) {
      // 1.8s anticipation celebration before showing the bonus announcement modal
      setTimeout(() => {
        setIsScatterAnticipating(false);
        setAwardedFreeSpins(result.freeSpinsAwarded);
        bonusInitialSpinsRef.current = result.freeSpinsAwarded;
        setBonusInitialSpins(result.freeSpinsAwarded);
        bonusSpinsPlayedRef.current = 0;
        setBonusSpinsPlayed(0);
        bonusTotalWonRef.current = 0;
        setBonusTotalWon(0);
      }, 1800);
    }

    // Normal base game auto-spin continuation
    if (autoSpinsLeftRef.current > 0 && result.freeSpinsAwarded <= 0) {
      autoSpinsLeftRef.current -= 1;
      setAutoSpinsLeft(autoSpinsLeftRef.current);
      const delay = isTurboRef.current ? 350 : 850;
      setTimeout(() => {
        if (autoSpinsLeftRef.current >= 0 && !isSpinningRef.current) {
          void executeSpin(false);
        }
      }, delay);
    }

    pendingResultRef.current = null;
  }, [executeSpin]);

  // Dismiss Victory Modal and credit the entire won amount to balance
  const handleDismissVictory = useCallback(() => {
    setShowBonusVictory(false);
    soundManager.play('ui.success', { volume: 0.9 });
    // Refetch balance to update user's live funds with the whole accumulated bonus sum
    void fetchBalance();
    setWinningLines([]);
    setLastWin(0);
    setStickyMultipliers([]);
  }, [fetchBalance]);

  // Toggle Auto-Spins / Open settings modal
  const handleToggleAuto = () => {
    if (autoSpinsLeftRef.current > 0) {
      autoSpinsLeftRef.current = 0;
      setAutoSpinsLeft(0);
      soundManager.play('ui.click', { volume: 0.35 });
      toast.info('Авто-спины остановлены.');
    } else {
      soundManager.play('ui.click', { volume: 0.4 });
      setShowAutoModal(true);
    }
  };

  const handleStartAuto = (spins: number) => {
    setShowAutoModal(false);
    autoSpinsLeftRef.current = spins;
    setAutoSpinsLeft(spins);
    toast.success(`Запущено ${spins} авто-спинов`);
    void handleSpin();
  };

  const isFreeSpinActive = isBonusMode;

  return (
    <main className="relative flex flex-col h-dvh w-full overflow-hidden bg-black select-none">
      {/* 1. Background Ambience: Smooth transition ONLY after bonus modal is accepted */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {/* Base Game Slot Background Image */}
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-1000 ease-in-out',
            isBonusMode ? 'opacity-35 scale-105' : 'opacity-100 scale-100'
          )}
          style={{ transitionProperty: 'opacity, transform' }}
        >
          <Image
            src="/MacvSlot/background.webp"
            alt="Slot Background"
            fill
            priority
            unoptimized
            className="object-cover object-center filter brightness-95"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70" />
        </div>

        {/* Free Spins Glowing Bonus Atmosphere (Smooth Fade In after starting bonus) */}
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-1000 ease-in-out pointer-events-none',
            isBonusMode ? 'opacity-100' : 'opacity-0'
          )}
        >
          <div className="absolute -top-[15%] left-1/2 -translate-x-1/2 w-[700px] h-[550px] rounded-full bg-amber-500/25 blur-[120px] animate-pulse" />
          <div className="absolute -bottom-[20%] left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-red-600/20 blur-[140px]" />
          <div className="absolute inset-0 bg-gradient-to-b from-amber-950/20 via-transparent to-black/80" />
        </div>
      </div>

      {/* 2. Top Bar */}
      <div className="relative z-20 shrink-0">
        <GameTopBar
          title="MacvSlot"
          onHowToPlay={() => setShowPaytable(true)}
        />
      </div>

      {/* Admin-only Guard Banner */}
      {isAdmin === false && (
        <div className="relative z-30 w-full bg-red-950/90 border-b border-red-500/40 px-4 py-2 text-center flex items-center justify-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-xs sm:text-sm text-red-200 font-semibold">
            Игра находится в режиме закрытого тестирования. Доступ открыт только администраторам.
          </span>
        </div>
      )}

      {/* 3. Main Stage: Reels & Status HUD */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-1 sm:px-3 py-0 sm:py-1">
        <div className="relative w-full max-w-full sm:max-w-[960px] lg:max-w-[980px] xl:max-w-[1040px] mx-auto">
          {/* DESKTOP LUXURY BUY BONUS BUTTON - Pinned strictly to the left of the reel frame (hidden during bonus) */}
          {!isBonusMode && !showBonusVictory && awardedFreeSpins === 0 && (
            <button
              type="button"
              disabled={
                isAdmin === null ||
                isSpinning ||
                (balance?.amount ?? 0) < Math.round(betAmount * 100 * 100) / 100
              }
              onClick={() => {
                soundManager.play('ui.click', { volume: 0.4 });
                setShowBuyBonusConfirm(true);
              }}
              className={cn(
                'z-30 hidden lg:flex flex-col items-center justify-center rounded-3xl transition-all duration-300 cursor-pointer select-none active:scale-95 disabled:opacity-30',
                'bg-gradient-to-b from-[#141926]/98 via-[#090b12]/98 to-[#0f121d]/98 border-2 border-amber-500/50 hover:border-amber-400 shadow-[0_14px_45px_rgba(0,0,0,0.95),0_0_24px_rgba(251,191,36,0.3)] backdrop-blur-2xl group text-center',
                'absolute right-full mr-4 xl:mr-6 top-1/2 -translate-y-1/2 p-4 w-28 lg:w-32 xl:w-36'
              )}
              title="Купить 10 фриспинов (100x)"
            >
              <div className="relative w-14 h-14 lg:w-16 lg:h-16 xl:w-20 xl:h-20 shrink-0 mb-2">
                <Image
                  src="/MacvSlot/scatter.webp"
                  alt="Bonus"
                  fill
                  unoptimized
                  className="object-contain drop-shadow-[0_0_15px_rgba(251,191,36,0.85)] group-hover:scale-110 transition-transform"
                />
              </div>
              <div className="flex flex-col items-center leading-tight gap-1">
                <span className="text-xs lg:text-sm uppercase font-brand font-black tracking-wider text-amber-200 drop-shadow">
                  КУПИТЬ
                </span>
                <span className="text-[11px] lg:text-xs uppercase font-mono tracking-widest text-amber-400 font-black">
                  БОНУС
                </span>
                <span className="font-mono font-black text-sm lg:text-base text-white mt-1 drop-shadow">
                  {(Math.round(betAmount * 100 * 100) / 100).toFixed(0)} zł
                </span>
                <span className="text-[10px] font-mono text-amber-300 font-black px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 mt-1 shadow-inner">
                  100x
                </span>
              </div>
            </button>
          )}

          <MacvSlotReels
            grid={grid}
            spinId={spinId}
            winningLines={winningLines}
            isSpinning={isSpinning}
            isTurbo={isTurbo}
            isScatterAnticipating={isScatterAnticipating}
            stickyMultipliers={stickyMultipliers}
            onSpinComplete={handleSpinComplete}
          />
        </div>

        {/* Dynamic Status / Round Win HUD under the reels - Anti-AI-Slop Borderless Arcade Typography */}
        <div className="w-full max-w-[960px] sm:max-w-[1020px] xl:max-w-[1120px] mx-auto my-1 sm:my-1.5 px-3 sm:px-6 flex items-center justify-between min-h-[38px]">
          {isBonusMode ? (
            /* BONUS ROUND CLEAN ARCADE HUD: Seamless, borderless physical casino HUD */
            <div className="w-full flex items-center justify-between">
              {/* Left: Free Spins Remaining */}
              <div className="flex items-baseline gap-1.5 shrink-0">
                <span className="text-[10px] sm:text-xs font-mono font-bold tracking-widest text-zinc-400 uppercase">
                  СПИНЫ:
                </span>
                <span className="font-brand font-black text-sm sm:text-lg text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]">
                  {bonusSpinsPlayed} / {bonusInitialSpins}
                </span>
              </div>

              {/* Center: Spin Win or Status */}
              <div className="flex-1 flex items-center justify-center text-center px-2">
                {lastWin > 0 ? (
                  <div className="flex items-center gap-1.5 animate-in zoom-in-95 duration-200">
                    <span className="text-[10px] sm:text-xs uppercase font-extrabold text-amber-200/80">
                      В СПИНЕ:
                    </span>
                    <span className="font-brand font-black text-base sm:text-xl text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.85)]">
                      +{lastWin.toFixed(2)} zł
                    </span>
                  </div>
                ) : isBonusPaused ? (
                  <span className="text-xs sm:text-sm font-brand font-bold text-amber-400/90 tracking-widest animate-pulse">
                    ПАУЗА — НАЖМИТЕ SPIN
                  </span>
                ) : isSpinning ? (
                  <span className="text-xs sm:text-sm font-mono text-zinc-400 tracking-widest uppercase animate-pulse">
                    Вращение барабанов...
                  </span>
                ) : null}
              </div>

              {/* Right: Rolling Total Bonus Win */}
              <div className="flex items-baseline gap-1.5 shrink-0">
                <span className="text-[10px] sm:text-xs font-mono font-bold tracking-widest text-zinc-400 uppercase">
                  ВЫИГРЫШ:
                </span>
                <span className="font-brand font-black text-sm sm:text-lg text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.7)]">
                  +{animatedBonusWin.toFixed(2)} zł
                </span>
              </div>
            </div>
          ) : lastWin > 0 ? (
            /* Base Game Win Clean Typography (No Card/Border) */
            <div className="w-full flex items-center justify-center gap-2 animate-in zoom-in-95 duration-200">
              <span className="text-xs sm:text-sm uppercase tracking-widest text-amber-200/80 font-extrabold">
                ВЫИГРЫШ:
              </span>
              <span className="font-brand font-black text-xl sm:text-2xl text-amber-300 drop-shadow-[0_0_15px_rgba(251,191,36,0.85)]">
                +{lastWin.toFixed(2)} zł
              </span>
            </div>
          ) : isSpinning ? (
            <div className="w-full flex items-center justify-center">
              <span className="text-xs text-zinc-400 font-mono tracking-widest uppercase animate-pulse">
                Вращение барабанов...
              </span>
            </div>
          ) : (
            <div className="w-full flex items-center justify-center">
              <span className="text-xs text-zinc-500 font-mono tracking-wider uppercase">
                Сделайте ставку и нажмите SPIN
              </span>
            </div>
          )}
        </div>

        {/* 4. Controls Dock */}
        <MacvSlotControls
          balance={balance?.amount ?? 0}
          betAmount={betAmount}
          onBetChange={setBetAmount}
          onSpin={handleSpin}
          isSpinning={isSpinning}
          isTurbo={isTurbo}
          onToggleTurbo={() => setIsTurbo((prev) => !prev)}
          autoSpinsLeft={autoSpinsLeft}
          onToggleAuto={handleToggleAuto}
          freeSpinsLeft={freeSpinsLeft}
          isBonusMode={isBonusMode || showBonusVictory || awardedFreeSpins > 0}
          disabled={isAdmin === null}
          onBuyBonus={() => {
            soundManager.play('ui.click', { volume: 0.4 });
            setShowBuyBonusConfirm(true);
          }}
          canBuyBonus={
            isAdmin !== null &&
            !isSpinning &&
            freeSpinsLeft === 0 &&
            !isBonusMode &&
            !showBonusVictory &&
            awardedFreeSpins === 0 &&
            (balance?.amount ?? 0) >= Math.round(betAmount * 100 * 100) / 100
          }
          buyBonusCost={Math.round(betAmount * 100 * 100) / 100}
        />
      </div>

      {/* 5. Modals */}
      <MacvSlotPaytableModal
        isOpen={showPaytable}
        onClose={() => setShowPaytable(false)}
      />

      {/* Bonus Start Celebration Modal */}
      <MacvSlotBonusModal
        freeSpinsAwarded={awardedFreeSpins}
        onStartFreeSpins={() => {
          setAwardedFreeSpins(0);
          setIsBonusMode(true);
          isBonusModeRef.current = true;
          setIsBonusPaused(false);
          isBonusPausedRef.current = false;
          setFreeSpinsLeft(bonusInitialSpinsRef.current);
          freeSpinsLeftRef.current = bonusInitialSpinsRef.current;
          bonusTotalWonRef.current = 0;
          setBonusTotalWon(0);
          bonusSpinsPlayedRef.current = 0;
          setBonusSpinsPlayed(0);
          setStickyMultipliers([]);
          // Automatically launch first free spin
          void executeSpin(false);
        }}
      />

      {/* Pragmatic Play Style Bonus Victory Modal (End of Free Spins) */}
      <MacvSlotBonusVictoryModal
        isOpen={showBonusVictory}
        totalWon={victoryBonusTotal}
        totalSpins={victoryTotalSpins}
        onDismiss={handleDismissVictory}
      />

      <MacvSlotAutoModal
        isOpen={showAutoModal}
        onClose={() => setShowAutoModal(false)}
        onStartAuto={handleStartAuto}
        currentTurbo={isTurbo}
      />

      {/* Feature Buy Modal (Casino Arcade Grade) */}
      <MacvSlotBuyBonusModal
        isOpen={showBuyBonusConfirm}
        onClose={() => setShowBuyBonusConfirm(false)}
        onConfirm={() => {
          setShowBuyBonusConfirm(false);
          void handleBuyBonus();
        }}
        betAmount={betAmount}
        onBetChange={setBetAmount}
        balance={balance?.amount ?? 0}
        isSpinning={isSpinning}
      />

      {/* Big Win Banner Modal (>= 5x Bet Celebration with spinning coin animation) */}
      <MacvSlotBigWinModal
        winAmount={bigWinAmount}
        onClose={handleBigWinClose}
      />
    </main>
  );
}
