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
import { MacvSlotBonusModal, MacvSlotBuyBonusModal } from '@/components/game/macvslot/macvslot-bonus-modal';
import { MacvSlotAutoModal } from '@/components/game/macvslot/macvslot-autospin-modal';
import type { SlotSymbol, WinningLine, SlotSpinResponse } from '@/components/game/macvslot/macvslot-types';

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

  const pendingResultRef = useRef<SlotSpinResponse | null>(null);

  // Synchronization refs to eliminate React state closure staleness during auto-play
  const isSpinningRef = useRef(false);
  const autoSpinsLeftRef = useRef(0);
  const betAmountRef = useRef(1.0);
  const isTurboRef = useRef(false);
  const freeSpinsLeftRef = useRef(0);
  const balanceRef = useRef(balance?.amount ?? 0);

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

  // Sync initial state & free spins
  useEffect(() => {
    void fetchBalance();
    fetch('/api/games/macvslot/state', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.freeSpins) {
          setFreeSpinsLeft(data.freeSpins.remaining || 0);
          if (data.freeSpins.betAmount) {
            setBetAmount(data.freeSpins.betAmount);
          }
        }
      })
      .catch(() => {});
  }, [fetchBalance]);

  // Core spin runner (handles both standard spins and bonus buys without stale closures)
  const executeSpin = useCallback(
    async (isBonusBuy = false) => {
      if (isSpinningRef.current) return;

      const currentBalance = balanceRef.current;
      const currentBet = betAmountRef.current;
      const currentFree = freeSpinsLeftRef.current;

      if (isBonusBuy) {
        const cost = Math.round(currentBet * 100 * 100) / 100;
        if (currentBalance < cost) {
          toast.warn(`Недостаточно средств. Для покупки бонуски требуется ${cost.toFixed(2)} zł.`);
          return;
        }
      } else if (currentFree <= 0 && currentBalance < currentBet) {
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

        void fetchBalance();
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

    // Win Audio & Celebrations
    if (result.totalWin > 0) {
      if (result.totalWin >= betAmountRef.current * 15) {
        soundManager.play('game.win', { volume: 0.9 });
        setBigWinAmount(result.totalWin);
      } else {
        soundManager.play('ui.success', { volume: 0.7 });
      }
    }

    // Free Spins Awarded Trigger with dramatic Scatter anticipation vibration
    if (result.freeSpinsAwarded > 0) {
      setIsScatterAnticipating(true);
      soundManager.play('game.win', { volume: 0.95 });
      if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.HapticFeedback) {
        (window as any).Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      }

      // 1.8s anticipation delay before showing the bonus modal
      setTimeout(() => {
        setIsScatterAnticipating(false);
        setAwardedFreeSpins(result.freeSpinsAwarded);
      }, 1800);

      // Stop auto spins when bonus feature triggers
      autoSpinsLeftRef.current = 0;
      setAutoSpinsLeft(0);
    }

    // Auto-spin continuation using ref (avoids stale closures)
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

  const handleStartAuto = (rounds: number, turbo: boolean) => {
    setShowAutoModal(false);
    setIsTurbo(turbo);
    isTurboRef.current = turbo;
    autoSpinsLeftRef.current = rounds;
    setAutoSpinsLeft(rounds);
    toast.success(`Запущено ${rounds} авто-спинов${turbo ? ' (Турбо)' : ''}.`);
    if (!isSpinningRef.current) {
      void executeSpin(false);
    }
  };

  // Restrict access to Admins only
  if (isAdmin === false) {
    return (
      <main className="min-h-screen w-full flex items-center justify-center bg-black p-4 text-white">
        <div className="max-w-md w-full p-6 rounded-3xl bg-zinc-900 border border-amber-500/30 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="font-brand font-black text-2xl mb-2">Закрытое тестирование</h2>
          <p className="text-zinc-400 text-sm mb-6">
            Фирменный слот MacvSpin находится в разработке и на текущий момент доступен только администраторам платформы.
          </p>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold font-brand transition-all"
          >
            Вернуться на главную
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen w-full bg-[#050608] text-white flex flex-col justify-between overflow-x-hidden select-none pb-28 md:pb-8">
      {/* 1. Fullscreen Ambient Background: background.webp */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Image
          src="/MacvSlot/background.webp"
          alt="Slot Background"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center opacity-75 filter brightness-95"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black/90 pointer-events-none" />
      </div>

      {/* 2. Top Navigation Bar */}
      <GameTopBar
        title="MacvSpin"
        Icon={Dices}
        onHowToPlay={() => setShowPaytable(true)}
      />

      {/* 3. Center Reel Stage */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-1 sm:px-3 py-0 sm:py-1">
        <div className="relative w-full max-w-full sm:max-w-[960px] lg:max-w-[980px] xl:max-w-[1040px] mx-auto">
          {/* DESKTOP LUXURY BUY BONUS BUTTON - Pinned strictly to the left of the reel frame, never overlapping */}
          <button
            type="button"
            disabled={
              isAdmin === null ||
              isSpinning ||
              freeSpinsLeft > 0 ||
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

        {/* Strictly Centered Round Win / Status Display under the reels frame */}
        <div className="w-full max-w-[960px] sm:max-w-[1020px] xl:max-w-[1120px] mx-auto my-1.5 sm:my-2 flex flex-col items-center justify-center min-h-[44px] sm:min-h-[50px]">
          {lastWin > 0 ? (
            <div className="px-5 sm:px-6 py-1.5 sm:py-2 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 border border-amber-400/60 backdrop-blur-md shadow-[0_0_30px_rgba(251,191,36,0.5)] flex items-center gap-2 sm:gap-2.5 animate-in zoom-in-95 duration-200">
              <span className="text-[10px] sm:text-xs uppercase tracking-widest text-amber-200/90 font-extrabold">
                ВЫИГРЫШ:
              </span>
              <span className="font-brand font-black text-xl sm:text-3xl text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]">
                +{lastWin.toFixed(2)} zł
              </span>
            </div>
          ) : freeSpinsLeft > 0 ? (
            <div className="px-4 sm:px-5 py-1.5 sm:py-2 rounded-2xl bg-[#080a12]/95 border border-amber-500/40 backdrop-blur-2xl shadow-[0_8px_30px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(251,191,36,0.2)] flex items-center gap-2 sm:gap-3 animate-in zoom-in-95 duration-200">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.25em] text-zinc-400 font-semibold">
                BONUS ROUND
              </span>
              <div className="w-px h-3.5 bg-amber-500/30" />
              <span className="text-xs font-mono font-medium text-zinc-300">
                ОСТАЛОСЬ: <strong className="text-amber-400 font-brand font-black text-xs sm:text-sm">{freeSpinsLeft}</strong> СПИНОВ
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

      <MacvSlotBonusModal
        freeSpinsAwarded={awardedFreeSpins}
        onStartFreeSpins={() => {
          setAwardedFreeSpins(0);
          void handleSpin();
        }}
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

      {/* Big Win Toast / Celebration */}
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
