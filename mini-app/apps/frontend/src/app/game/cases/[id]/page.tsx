'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { GameTopBar } from '@/components/game/game-top-bar';
import { PlinkoIcon } from '@/components/ui/game-icon';
import { CasesRoulette } from '@/components/game/cases/cases-roulette';
import { useBalance } from '@/hooks/use-balance';
import { toast } from '@/store/toast-store';
import { reportApiError } from '@/lib/api/errors';
import type { CaseTier, CasePrize } from '../page';

export default function CaseOpeningPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  
  const [caseTier, setCaseTier] = useState<CaseTier | null>(null);
  const [count, setCount] = useState<number>(1);
  const [isTurbo, setIsTurbo] = useState<boolean>(false);
  
  const [isSpinning, setIsSpinning] = useState(false);
  const [winningIds, setWinningIds] = useState<string[]>([]);
  
  const { balance, fetchBalance } = useBalance();
  const activeBalance = balance?.amount ?? 10000;

  useEffect(() => {
    void fetchBalance();
    fetch('/api/games/cases/config', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.cases) {
          const found = data.cases.find((c: CaseTier) => c.id === id);
          if (found) {
            setCaseTier(found);
          } else {
            toast.warn('Кейс не найден');
            router.push('/game/cases');
          }
        }
      })
      .catch(() => {
        toast.warn('Ошибка загрузки кейса');
        router.push('/game/cases');
      });
  }, [id, router]);

  const handleOpen = async () => {
    if (!caseTier) return;
    if (isSpinning) return;
    
    const totalCost = caseTier.price * count;
    if (activeBalance < totalCost) {
      toast.warn(`Недостаточно средств. Нужно ${totalCost.toLocaleString('ru-RU')} zł`);
      return;
    }

    try {
      setIsSpinning(true);
      setWinningIds([]); // Reset
      
      const res = await fetch('/api/games/cases/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ caseId: id, count }),
      });
      
      const json = await res.json();
      if (!res.ok) {
        reportApiError(res, json, 'Could not open case');
        throw new Error(json?.message || 'Open failed');
      }
      
      const prizes = json.result.prizes as CasePrize[];
      setWinningIds(prizes.map(p => p.id));
      
      // Balance is refreshed instantly by the server, but we don't fetch it yet to keep suspense.
      // Wait actually, we can fetch it now, it's fine.
      void fetchBalance();
    } catch (err) {
      setIsSpinning(false);
      console.error(err);
    }
  };

  const handleSpinComplete = () => {
    setIsSpinning(false);
    void fetchBalance(); // Refresh balance again to be sure
    
    // Calculate total won
    if (caseTier && winningIds.length > 0) {
      let totalWon = 0;
      for (const wId of winningIds) {
        const prize = caseTier.prizes.find(p => p.id === wId);
        if (prize) totalWon += prize.amount;
      }
      
      const totalCost = caseTier.price * count;
      if (totalWon > totalCost) {
        toast.success(`Супер! Вы выиграли ${totalWon.toLocaleString('ru-RU')} zł!`);
      } else if (totalWon > 0) {
        toast.info(`Выпало ${totalWon.toLocaleString('ru-RU')} zł`);
      } else {
         toast.info(`В этот раз без крупного куша...`);
      }
    }
  };

  if (!caseTier) {
    return (
      <main className="min-h-screen w-full bg-midnight-canvas text-frost-white flex items-center justify-center">
        Загрузка...
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[800px] px-3 pt-3 pb-28 flex flex-col gap-4">
        <GameTopBar title={caseTier.name} Icon={PlinkoIcon} onBack={() => router.push('/game/cases')} />

        {/* Roulette Area */}
        <div className="w-full relative mt-4">
          <CasesRoulette 
            prizes={caseTier.prizes}
            winningPrizeIds={winningIds}
            isSpinning={isSpinning}
            isTurbo={isTurbo}
            onSpinComplete={handleSpinComplete}
          />
        </div>
        
        {/* Controls */}
        <div className="w-full rounded-2xl bg-white/[0.03] border border-white/10 p-4 backdrop-blur-xl flex flex-col gap-4 mt-2">
          
          <div className="flex items-center justify-between">
            {/* Turbo Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white/70">Турбо крутка</span>
              <button 
                onClick={() => !isSpinning && setIsTurbo(!isTurbo)}
                disabled={isSpinning}
                className={`w-12 h-6 rounded-full relative transition-colors ${isTurbo ? 'bg-green-500' : 'bg-white/10'}`}
              >
                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${isTurbo ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
            
            {/* Count Selector */}
            <div className="flex items-center gap-2 bg-black/30 rounded-xl p-1">
              {[1, 2, 3].map(c => (
                <button
                  key={c}
                  disabled={isSpinning}
                  onClick={() => setCount(c)}
                  className={`w-10 h-8 rounded-lg font-bold transition-colors ${count === c ? 'bg-white/20 text-white' : 'text-white/50 hover:bg-white/10'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          
          {/* Main Action Button */}
          <button
            onClick={handleOpen}
            disabled={isSpinning || activeBalance < (caseTier.price * count)}
            className="w-full py-4 rounded-xl bg-gradient-to-b from-[#4CAF50] to-[#2E7D32] hover:opacity-90 disabled:opacity-50 disabled:grayscale transition-all font-bold text-lg text-white shadow-lg relative overflow-hidden"
          >
            {isSpinning ? 'Открываем...' : `Открыть за ${(caseTier.price * count).toLocaleString('ru-RU')} zł`}
          </button>
        </div>

        {/* Prizes List */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-white/50 mb-3 px-1 uppercase tracking-wider">Содержимое кейса</h2>
          
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {caseTier.prizes.sort((a, b) => b.amount - a.amount).map(p => (
              <div 
                key={p.id}
                className="rounded-lg border border-white/5 bg-white/[0.03] p-3 flex flex-col items-center justify-center gap-2 relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: p.color }} />
                <span className="font-roobert font-bold text-white text-base">
                  {p.amount.toLocaleString('ru-RU')}
                </span>
                <span className="text-[10px] text-white/40 uppercase">
                  {(p.weight / 1000).toFixed(1)}% шанс
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}
