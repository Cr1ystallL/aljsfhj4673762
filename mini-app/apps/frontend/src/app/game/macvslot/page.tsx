'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ShieldAlert, Sparkles, HelpCircle, Dices } from 'lucide-react';
import { GameTopBar } from '@/components/game/game-top-bar';
import { useBalance } from '@/hooks/use-balance';
import { useIsAdmin } from '@/lib/admin-probe';
import { toast } from '@/store/toast-store';
import { soundManager } from '@/lib/sound/sound-manager';
import { MacvSlotReels } from '@/components/game/macvslot/macvslot-reels';
import { MacvSlotControls } from '@/components/game/macvslot/macvslot-controls';
import { MacvSlotPaytableModal } from '@/components/game/macvslot/macvslot-paytable-modal';
import { MacvSlotBonusModal } from '@/components/game/macvslot/macvslot-bonus-modal';
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

  const pendingResultRef = useRef<SlotSpinResponse | null>(null);

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

  // Main Spin Action
  const handleSpin = useCallback(async () => {
    if (isSpinning) return;

    // Check balance if not a free spin
    const currentBalance = balance?.amount ?? 0;
    if (freeSpinsLeft <= 0 && currentBalance < betAmount) {
      toast.warn('Недостаточно средств для ставки.');
      setAutoSpinsLeft(0);
      return;
    }

    setIsSpinning(true);
    setWinningLines([]);
    setLastWin(0);

    // Audio cue
    soundManager.play('ui.click', { volume: 0.5 });

    try {
      const res = await fetch('/api/games/macvslot/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ betAmount, demoMode: false }),
      });

      const data: SlotSpinResponse = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error((data as any).error || 'Ошибка вращения');
      }

      // Store pending result to reveal when reels stop
      pendingResultRef.current = data;
      setGrid(data.grid);
      setFreeSpinsLeft(data.freeSpinsRemaining);

      void fetchBalance();
    } catch (err: any) {
      toast.error(err.message || 'Ошибка связи с сервером');
      setIsSpinning(false);
      setAutoSpinsLeft(0);
    }
  }, [isSpinning, freeSpinsLeft, balance, betAmount, fetchBalance]);

  // Callback when reels complete their spinning animation
  const handleSpinComplete = useCallback(() => {
    setIsSpinning(false);

    const result = pendingResultRef.current;
    if (!result) return;

    setWinningLines(result.winningLines);
    setLastWin(result.totalWin);

    // Win Audio & Celebrations
    if (result.totalWin > 0) {
      if (result.totalWin >= betAmount * 15) {
        soundManager.play('game.win', { volume: 0.9 });
        setBigWinAmount(result.totalWin);
      } else {
        soundManager.play('ui.success', { volume: 0.7 });
      }
    }

    // Free Spins Awarded Trigger
    if (result.freeSpinsAwarded > 0) {
      setAwardedFreeSpins(result.freeSpinsAwarded);
    }

    // Auto-spin continuation
    if (autoSpinsLeft > 0) {
      setAutoSpinsLeft((prev) => prev - 1);
      setTimeout(() => {
        void handleSpin();
      }, isTurbo ? 400 : 900);
    }

    pendingResultRef.current = null;
  }, [autoSpinsLeft, betAmount, handleSpin, isTurbo]);

  // Toggle Auto-Spins
  const handleToggleAuto = () => {
    if (autoSpinsLeft > 0) {
      setAutoSpinsLeft(0);
      toast.info('Авто-спины остановлены.');
    } else {
      setAutoSpinsLeft(25);
      toast.success('Запущено 25 авто-спинов.');
      if (!isSpinning) {
        void handleSpin();
      }
    }
  };

  // Buy Bonus Action (Guarantees 3+ scatters and triggers 10 Free Spins)
  const handleBuyBonus = useCallback(async () => {
    if (isSpinning) return;

    const cost = Math.round(betAmount * 100 * 100) / 100;
    const currentBalance = balance?.amount ?? 0;
    if (currentBalance < cost) {
      toast.warn(`Недостаточно средств. Для покупки бонуски требуется ${cost.toFixed(2)} zł.`);
      return;
    }

    setIsSpinning(true);
    setWinningLines([]);
    setLastWin(0);

    soundManager.play('ui.success', { volume: 0.8 });

    try {
      const res = await fetch('/api/games/macvslot/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ betAmount, demoMode: false, isBonusBuy: true }),
      });

      const data: SlotSpinResponse = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error((data as any).error || 'Ошибка покупки бонуски');
      }

      pendingResultRef.current = data;
      setGrid(data.grid);
      setFreeSpinsLeft(data.freeSpinsRemaining);

      void fetchBalance();
    } catch (err: any) {
      toast.error(err.message || 'Ошибка покупки бонуски');
      setIsSpinning(false);
    }
  }, [isSpinning, betAmount, balance, fetchBalance]);

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
    <main className="relative min-h-screen w-full bg-[#050608] text-white flex flex-col justify-between overflow-x-hidden select-none">
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
      <div className="relative z-20 w-full max-w-[1200px] mx-auto pt-2 px-3 sm:px-6">
        <GameTopBar
          title="MacvSpin"
          Icon={Dices}
          onHowToPlay={() => setShowPaytable(true)}
        />
      </div>

      {/* 3. Center Reel Stage */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-2 py-1">
        <MacvSlotReels
          grid={grid}
          winningLines={winningLines}
          isSpinning={isSpinning}
          isTurbo={isTurbo}
          onSpinComplete={handleSpinComplete}
        />

        {/* Strictly Centered Round Win Display under the reels frame */}
        <div className="w-full max-w-[960px] sm:max-w-[1020px] xl:max-w-[1120px] mx-auto my-2 flex flex-col items-center justify-center min-h-[50px]">
          {lastWin > 0 ? (
            <div className="px-6 py-2 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 border border-amber-400/60 backdrop-blur-md shadow-[0_0_30px_rgba(251,191,36,0.5)] flex items-center gap-2.5 animate-in zoom-in-95 duration-200">
              <span className="text-xs uppercase tracking-widest text-amber-200/90 font-extrabold">
                ВЫИГРЫШ:
              </span>
              <span className="font-brand font-black text-2xl sm:text-3xl text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]">
                +{lastWin.toFixed(2)} zł
              </span>
            </div>
          ) : freeSpinsLeft > 0 ? (
            <div className="px-4 py-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 text-black font-extrabold text-xs tracking-wider animate-pulse flex items-center gap-1.5 shadow-lg">
              <span>🔥 БОНУСНЫЙ РАУНД: ОСТАЛОСЬ {freeSpinsLeft} ФРИСПИНОВ</span>
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
          onBuyBonus={handleBuyBonus}
          isSpinning={isSpinning}
          isTurbo={isTurbo}
          onToggleTurbo={() => setIsTurbo((prev) => !prev)}
          autoSpinsLeft={autoSpinsLeft}
          onToggleAuto={handleToggleAuto}
          freeSpinsLeft={freeSpinsLeft}
          disabled={isAdmin === null}
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
