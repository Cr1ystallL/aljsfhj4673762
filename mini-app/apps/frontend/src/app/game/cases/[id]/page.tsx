'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { GameTopBar } from '@/components/game/game-top-bar';
import { PlinkoIcon } from '@/components/ui/game-icon';
import { CasesRoulette } from '@/components/game/cases/cases-roulette';
import { CasesHistory } from '@/components/game/cases/cases-history';
import { useBalance } from '@/hooks/use-balance';
import { toast } from '@/store/toast-store';
import { reportApiError } from '@/lib/api/errors';
import type { CaseTier, CasePrize } from '../page';

function Confetti({ active }: { active: boolean }) {
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; rot: number; color: string; delay: number }[]>([]);
  
  useEffect(() => {
    if (active) {
      const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFEB3B', '#FFC107', '#FF9800', '#FF5722'];
      const newParticles = [];
      for (let i = 0; i < 40; i++) {
        newParticles.push({
          id: i,
          x: (Math.random() - 0.5) * 400,
          y: -(Math.random() * 400 + 150),
          rot: Math.random() * 360,
          color: colors[Math.floor(Math.random() * colors.length)],
          delay: Math.random() * 0.1
        });
      }
      setParticles(newParticles);
      const timer = setTimeout(() => setParticles([]), 2500);
      return () => clearTimeout(timer);
    }
  }, [active]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[100]">
      <AnimatePresence>
        {particles.map(p => (
          <motion.div
            key={p.id}
            initial={{ opacity: 1, scale: 0, x: p.id % 2 === 0 ? '-50px' : 'calc(100vw + 50px)', y: '100%' }}
            animate={{ opacity: 0, scale: 1, x: p.id % 2 === 0 ? p.x : `calc(100vw - 50px + ${p.x}px)`, y: p.y, rotate: p.rot }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5 + Math.random(), ease: "easeOut", delay: p.delay }}
            className="absolute w-3 h-3 rounded-sm shadow-sm"
            style={{ backgroundColor: p.color }}
          />
        ))}
      </AnimatePresence>
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
    void fetchBalance();
    
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
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white relative overflow-hidden">
      <Confetti active={showConfetti} />
      <div className="mx-auto w-full max-w-[800px] px-3 pt-3 pb-28 flex flex-col gap-4 relative z-10">
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
        <div className="w-full rounded-3xl bg-white/[0.03] border border-white/[0.08] p-5 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.36)] flex flex-col gap-6 mt-2 relative z-20">
          
          <div className="flex items-center justify-between">
            {/* Turbo Toggle */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-white/70">Турбо крутка</span>
              <button 
                onClick={() => !isSpinning && setIsTurbo(!isTurbo)}
                disabled={isSpinning}
                className="relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none"
              >
                <span className={`absolute inset-0 rounded-full transition-colors duration-200 ease-in-out ${isTurbo ? 'bg-white/40' : 'bg-white/10'}`} />
                <span className={`pointer-events-none absolute left-1 h-5 w-5 transform rounded-full bg-white transition duration-200 ease-in-out shadow-sm ${isTurbo ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            
            {/* Count Selector */}
            <div className="flex items-center gap-1 bg-black/40 rounded-full p-1 border border-white/5 shadow-inner">
              {[1, 2, 3].map(c => (
                <button
                  key={c}
                  disabled={isSpinning}
                  onClick={() => setCount(c)}
                  className={`w-12 h-9 flex items-center justify-center shrink-0 rounded-full font-bold text-[15px] transition-all duration-200 ${count === c ? 'bg-white/[0.15] text-white shadow-sm' : 'text-white/40 hover:text-white/70'}`}
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
            className="w-full py-4 rounded-2xl bg-white/[0.08] hover:bg-white/[0.12] active:bg-white/[0.04] disabled:opacity-50 disabled:pointer-events-none transition-all font-semibold text-[17px] text-white/95 shadow-sm border border-white/10"
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
                style={{ borderBottom: `2px solid ${p.color}40` }}
              >
                <div className="w-16 h-16 relative">
                  <Image
                    src={`/images/cases/${p.id}.png`}
                    alt={p.id}
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </div>
                <span className="font-roobert font-bold text-white text-base">
                  {p.amount.toLocaleString('ru-RU')} zł
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-semibold text-white/50 mb-3 px-1 uppercase tracking-wider">Live История</h2>
          <CasesHistory />
        </div>

      </div>
    </main>
  );
}
