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

// Simple inline confetti component
function Confetti({ active }: { active: boolean }) {
  const [particles, setParticles] = useState<{ id: number; tx: number; ty: number; rot: number; color: string; delay: number }[]>([]);
  
  useEffect(() => {
    if (active) {
      const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFEB3B', '#FFC107', '#FF9800', '#FF5722'];
      const newParticles = [];
      for (let i = 0; i < 50; i++) {
        newParticles.push({
          id: i,
          tx: (Math.random() - 0.5) * 300,
          ty: -(Math.random() * 300 + 100),
          rot: Math.random() * 360,
          color: colors[Math.floor(Math.random() * colors.length)],
          delay: Math.random() * 0.2
        });
      }
      setParticles(newParticles);
      const timer = setTimeout(() => setParticles([]), 2500);
      return () => clearTimeout(timer);
    }
  }, [active]);

  if (!active || particles.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-50">
      <div className="absolute bottom-0 left-4">
        {particles.slice(0, 25).map(p => (
          <div key={p.id} className="absolute bottom-0 w-3 h-3 rounded-sm opacity-0 animate-confetti" style={{ backgroundColor: p.color, '--tx': `${p.tx}px`, '--ty': `${p.ty}px`, '--rot': `${p.rot}deg`, animationDelay: `${p.delay}s` } as React.CSSProperties} />
        ))}
      </div>
      <div className="absolute bottom-0 right-4">
        {particles.slice(25).map(p => (
          <div key={p.id} className="absolute bottom-0 w-3 h-3 rounded-sm opacity-0 animate-confetti" style={{ backgroundColor: p.color, '--tx': `${p.tx}px`, '--ty': `${p.ty}px`, '--rot': `${p.rot}deg`, animationDelay: `${p.delay}s` } as React.CSSProperties} />
        ))}
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes confetti {
          0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) rotate(var(--rot)); opacity: 0; }
        }
        .animate-confetti { animation: confetti 2s ease-out forwards; }
      `}} />
    </div>
  );
}

export default function CaseOpeningPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  
  const [caseTier, setCaseTier] = useState<CaseTier | null>(null);
  const [count, setCount] = useState<number>(1);
  const [isTurbo, setIsTurbo] = useState<boolean>(false);
  
  const [isSpinning, setIsSpinning] = useState(false);
  const [winningIds, setWinningIds] = useState<string[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);
  
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
      setShowConfetti(false);
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
      
      void fetchBalance();
    } catch (err) {
      setIsSpinning(false);
      console.error(err);
    }
  };

  const handleSpinComplete = () => {
    setIsSpinning(false);
    void fetchBalance(); // Refresh balance again to be sure
    
    if (caseTier && winningIds.length > 0) {
      let totalWon = 0;
      for (const wId of winningIds) {
        const prize = caseTier.prizes.find(p => p.id === wId);
        if (prize) totalWon += prize.amount;
      }
      
      if (totalWon > 0) {
        setShowConfetti(true);
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
      <div className="mx-auto w-full max-w-[800px] px-3 pt-3 pb-28 flex flex-col gap-4 relative">
        <Confetti active={showConfetti} />
        <GameTopBar title={caseTier.name} Icon={PlinkoIcon} onBack={() => router.push('/game/cases')} />

        {/* Roulette Area */}
        <div className="w-full relative mt-4">
          <CasesRoulette 
            count={count}
            prizes={caseTier.prizes}
            winningPrizeIds={winningIds}
            isSpinning={isSpinning}
            isTurbo={isTurbo}
            onSpinComplete={handleSpinComplete}
          />
        </div>
        
        {/* Controls */}
        <div className="w-full rounded-2xl bg-white/[0.03] border border-white/10 p-4 backdrop-blur-xl flex flex-col gap-5 mt-2">
          
          <div className="flex items-center justify-between">
            {/* Turbo Toggle */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-white/70">Турбо крутка</span>
              <button 
                onClick={() => !isSpinning && setIsTurbo(!isTurbo)}
                disabled={isSpinning}
                className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75"
              >
                <span className={`absolute inset-0 rounded-full transition-colors duration-200 ease-in-out ${isTurbo ? 'bg-white/40' : 'bg-white/10'}`} />
                <span className={`pointer-events-none absolute left-1 h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out shadow-sm ${isTurbo ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            
            {/* Count Selector */}
            <div className="flex items-center bg-white/[0.04] rounded-lg p-1 border border-white/[0.05]">
              {[1, 2, 3].map(c => (
                <button
                  key={c}
                  disabled={isSpinning}
                  onClick={() => setCount(c)}
                  className={`w-10 h-8 rounded-md font-medium text-sm transition-all duration-200 ${count === c ? 'bg-white/15 text-white shadow-sm' : 'text-white/40 hover:text-white/70'}`}
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
            className="w-full py-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] active:bg-white/[0.04] disabled:opacity-50 disabled:pointer-events-none transition-all font-semibold text-[16px] text-white/90 shadow-sm border border-white/10"
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
