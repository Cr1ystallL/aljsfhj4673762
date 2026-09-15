'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ShieldAlert, Sparkles, HelpCircle, Dices } from 'lucide-react';
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
import { MacvSlotAutoModal } from '@/components/game/macvslot/macvslot-autospin-modal';
import type { SlotSymbol, WinningLine, SlotSpinResponse } from '@/components/game/macvslot/macvslot-types';

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

  // Synchronization refs to eliminate React state closure staleness during auto-play
  const isSpinningRef = useRef(false);
  const autoSpinsLeftRef = useRef(0);
  const betAmountRef = useRef(1.0);
  const isTurboRef = useRef(false);
  const freeSpinsLeftRef = useRef(0);
  const balanceRef = useRef(balance?.amount ?? 0);
  const isBonusModeRef = useRef(false);
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

  // Sync initial state & active free spins
  useEffect(() => {
    void fetchBalance();
    fetch('/api/games/macvslot/state', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.freeSpins && data.freeSpins.remaining > 0) {
          setFreeSpinsLeft(data.freeSpins.remaining);
          freeSpinsLeftRef.current = data.freeSpins.remaining;
          setIsBonusMode(true);
          isBonusModeRef.current = true;
          const totalWon = data.freeSpins.totalWon || 0;
          setBonusTotalWon(totalWon);
          bonusTotalWonRef.current = totalWon;
          setBonusInitialSpins(10);
          bonusInitialSpinsRef.current = 10;
          if (data.freeSpins.betAmount) {
            setBetAmount(data.freeSpins.betAmount);
            betAmountRef.current = data.freeSpins.betAmount;
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
        setFreeSpinsLeft(data.freeSpinsRemaining);
        freeSpinsLeftRef.current = data.freeSpinsRemaining;

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
    void executeSpin(false);
  }, [executeSpin]);

  const handleBuyBonus = useCallback(() => {
    void executeSpin(true);
  }, [executeSpin]);

  // Callback when reels complete their spinning animation
  const handleSpinComplete = useCallback(() => {
    isSpinningRef.current = false;
    setIsSpinning(false);

    const result = pendingResultRef.current;
    if (!result) return;

    setWinningLines(result.winningLines);
    setLastWin(result.totalWin);

    const inBonus = isBonusModeRef.current || result.isFreeSpin;

    // Win Audio & Celebrations
    if (result.totalWin > 0) {
      if (result.totalWin >= betAmountRef.current * 15 && !inBonus) {
        soundManager.play('game.win', { volume: 0.9 });
        setBigWinAmount(result.totalWin);
      } else {
        soundManager.play('ui.success', { volume: 0.7 });
      }
    }

    // ========================================================================
    // A. FREE SPINS BONUS ROUND EXECUTION LOOP (Automatic Sequence)
    // ========================================================================
    if (inBonus) {
      bonusSpinsPlayedRef.current += 1;
      setBonusSpinsPlayed(bonusSpinsPlayedRef.current);

      if (result.totalWin > 0) {
        bonusTotalWonRef.current = Math.round((bonusTotalWonRef.current + result.totalWin) * 100) / 100;
        setBonusTotalWon(bonusTotalWonRef.current);
      }

      // Exact timing rules requested by user:
      // "Спины идут автоматически без нажатия кнопки спин но сначала показываются все выигрышные спины(если есть) потом идет некст спин, и если нет линий то 1 с ждет и дальше идет"
      const hasWin = result.totalWin > 0;
      const delay = hasWin
        ? (isTurboRef.current ? 950 : 1800) // Allow user to see winning lines and counter animate
        : (isTurboRef.current ? 500 : 1000);  // Exactly 1s wait if no winning lines!

      setTimeout(() => {
        if (result.freeSpinsRemaining > 0) {
          // Automatic continuation to next free spin
          if (!isSpinningRef.current) {
            void executeSpin(false);
          }
        } else {
          // All Free Spins Completed: show Grand Pragmatic-style Victory Modal!
          isBonusModeRef.current = false;
          setIsBonusMode(false);
          setVictoryBonusTotal(bonusTotalWonRef.current);
          setVictoryTotalSpins(bonusSpinsPlayedRef.current || 10);
          setShowBonusVictory(true);
          soundManager.play('game.win', { volume: 1.0 });
        }
      }, delay);

      pendingResultRef.current = null;
      return;
    }

    // ========================================================================
    // B. BASE GAME: FREE SPINS AWARD TRIGGER (3+ Scatters hit)
    // ========================================================================
    if (result.freeSpinsAwarded > 0) {
      setIsScatterAnticipating(true);
      soundManager.play('game.win', { volume: 0.95 });
      if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.HapticFeedback) {
        (window as any).Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      }

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

      // Stop normal auto spins when bonus triggers
      autoSpinsLeftRef.current = 0;
      setAutoSpinsLeft(0);
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

  const isFreeSpinActive = isBonusMode || freeSpinsLeft > 0;

  return (
    <main className="relative flex flex-col h-dvh w-full overflow-hidden bg-black select-none">
      {/* 1. Background Ambience */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[600px] h-[500px] rounded-full bg-amber-500/10 blur-[120px]" />
        <div className="absolute -bottom-[20%] left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full bg-orange-600/10 blur-[140px]" />
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
          {!isFreeSpinActive && (
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
            onSpinComplete={handleSpinComplete}
          />
        </div>

        {/* Dynamic Status / Round Win HUD under the reels */}
        <div className="w-full max-w-[960px] sm:max-w-[1020px] xl:max-w-[1120px] mx-auto my-1.5 sm:my-2 px-2 flex flex-col items-center justify-center min-h-[46px] sm:min-h-[52px]">
          {isFreeSpinActive ? (
            /* BONUS ROUND ARCADE HUD: Spins count on Left, Spin Win in Center, Rolling Total Win on Right */
            <div className="w-full flex items-center justify-between gap-2 sm:gap-4 p-2 sm:p-2.5 rounded-2xl bg-gradient-to-r from-[#181a24]/95 via-[#0d0f17]/95 to-[#181a24]/95 border-2 border-amber-500/40 shadow-[0_8px_30px_rgba(0,0,0,0.9),0_0_20px_rgba(245,158,11,0.2)]">
              {/* Left: Free Spins Remaining Badge */}
              <div className="flex flex-col items-start px-2.5 sm:px-3.5 py-1 rounded-xl bg-black/60 border border-amber-500/30">
                <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-wider text-amber-300/80 font-bold leading-none">
                  СПИНЫ
                </span>
                <span className="font-brand font-black text-sm sm:text-base text-white mt-0.5">
                  {bonusSpinsPlayed} / {bonusInitialSpins}
                </span>
              </div>

              {/* Center: Spin Win or Status */}
              <div className="flex-1 flex flex-col items-center justify-center text-center px-1">
                {lastWin > 0 ? (
                  <div className="flex items-center gap-1.5 animate-in zoom-in-95 duration-200">
                    <span className="text-[10px] sm:text-xs uppercase font-extrabold text-amber-200">
                      В СПИНЕ:
                    </span>
                    <span className="font-brand font-black text-base sm:text-2xl text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.85)]">
                      +{lastWin.toFixed(2)} zł
                    </span>
                  </div>
                ) : isSpinning ? (
                  <span className="text-xs sm:text-sm font-brand font-bold text-amber-300/90 tracking-wider animate-pulse">
                    ВРАЩЕНИЕ БАРАБАНОВ...
                  </span>
                ) : (
                  <span className="text-xs sm:text-sm font-mono text-zinc-400">
                    БОНУСНАЯ ИГРА
                  </span>
                )}
              </div>

              {/* Right: Rolling Total Bonus Win */}
              <div className="flex flex-col items-end px-2.5 sm:px-3.5 py-1 rounded-xl bg-gradient-to-b from-amber-500/20 to-black/60 border border-amber-400/50 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-wider text-amber-200 font-bold leading-none">
                  ВЫИГРЫШ
                </span>
                <span className="font-brand font-black text-sm sm:text-lg text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)] mt-0.5">
                  {animatedBonusWin.toFixed(2)} zł
                </span>
              </div>
            </div>
          ) : lastWin > 0 ? (
            /* Base Game Win Banner */
            <div className="px-5 sm:px-6 py-1.5 sm:py-2 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 border border-amber-400/60 backdrop-blur-md shadow-[0_0_30px_rgba(251,191,36,0.5)] flex items-center gap-2 sm:gap-2.5 animate-in zoom-in-95 duration-200">
              <span className="text-[10px] sm:text-xs uppercase tracking-widest text-amber-200/90 font-extrabold">
                ВЫИГРЫШ:
              </span>
              <span className="font-brand font-black text-xl sm:text-3xl text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]">
                +{lastWin.toFixed(2)} zł
              </span>
            </div>
          ) : isSpinning ? (
            <span className="text-xs text-zinc-400 font-mono tracking-widest uppercase animate-pulse">
              Вращение барабанов...
            </span>
          ) : (
            <span className="text-xs text-zinc-500 font-mono tracking-wider uppercase">
              Сделайте ставку и нажмите SPIN
            </span>
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
          disabled={isAdmin === null}
          onBuyBonus={() => {
            soundManager.play('ui.click', { volume: 0.4 });
            setShowBuyBonusConfirm(true);
          }}
          canBuyBonus={
            isAdmin !== null &&
            !isSpinning &&
            freeSpinsLeft === 0 &&
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
          bonusTotalWonRef.current = 0;
          setBonusTotalWon(0);
          bonusSpinsPlayedRef.current = 0;
          setBonusSpinsPlayed(0);
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

      {/* Big Win Toast / Celebration (Base Game) */}
      {bigWinAmount !== null && (
        <div
          onClick={() => setBigWinAmount(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md cursor-pointer animate-in zoom-in-95 duration-200"
        >
          <div className="relative p-8 rounded-3xl bg-gradient-to-b from-zinc-900 to-black border-2 border-amber-400 text-center shadow-[0_0_60px_rgba(251,191,36,0.6)]">
            <Sparkles className="w-12 h-12 text-amber-400 mx-auto mb-2 animate-bounce" />
            <h2 className="font-brand font-black text-3xl sm:text-5xl text-amber-400 uppercase tracking-wider mb-2">
              BIG WIN!
            </h2>
            <p className="font-brand font-extrabold text-4xl sm:text-6xl text-white tracking-wide">
              {bigWinAmount.toFixed(2)} zł
            </p>
            <span className="text-xs text-zinc-400 block mt-4 font-semibold uppercase tracking-widest">
              Нажмите в любом месте, чтобы продолжить
            </span>
          </div>
        </div>
      )}
    </main>
  );
}
