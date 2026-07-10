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
  useEffect(() => {
    if (active && typeof window !== 'undefined') {
      const w = window as any;
      if (w.confetti) {
        w.confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.8 },
          zIndex: 9999
        });
      }
    }
  }, [active]);

  return (
    <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js" async />
  );
}

const liquidGlassSvg = (
  <svg style={{ display: 'none' }}>
    <filter id="displacementFilter">
      <feImage
        href="data:image/png;base64,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"
        preserveAspectRatio="none"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="turbulence"
        scale="600"
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>
  </svg>
);

export default function CaseOpeningPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  
  const [caseTier, setCaseTier] = useState<CaseTier | null>(null);
  const [count, setCount] = useState<number>(1);
  const [isTurbo, setIsTurbo] = useState<boolean>(false);
  
  const [isSpinning, setIsSpinning] = useState(false);
  const [winningIds, setWinningIds] = useState<string[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);
  
  const { balance, fetchBalance, optimisticUpdate, freezeBalance, unfreezeBalance } = useBalance();
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

  function getFakeChance(casePrice: number, prizeId: string): string {
    let boost = 0;
    if (casePrice >= 10000) boost = 3.5;
    else if (casePrice >= 5000) boost = 2.0;
    else if (casePrice >= 1000) boost = 1.0;
    else if (casePrice >= 500) boost = 0.5;
    else if (casePrice >= 100) boost = 0.2;
    else if (casePrice >= 50) boost = 0.1;

    let baseChance = 0;
    switch(prizeId) {
      case '100x': baseChance = 0.05 + (boost * 0.1); break;
      case '25x': baseChance = 0.2 + (boost * 0.2); break;
      case '10x': baseChance = 0.8 + (boost * 0.5); break;
      case '5x': baseChance = 2.0 + (boost * 1.0); break;
      case '2.5x': baseChance = 4.0 + (boost * 1.5); break;
      case '1x': baseChance = 35.0 - (boost * 1.5); break;
      case '0.5x': baseChance = 10.0 - (boost * 1.0); break;
      case '0.2x': baseChance = 12.5 - (boost * 0.5); break;
      case '0.1x': baseChance = 35.0 - (boost * 0.3); break;
      default: baseChance = 1.0;
    }
    
    // Ensure we don't go below 0
    return Math.max(0.01, baseChance).toFixed(2) + '%';
  }

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
      setShowConfetti(false); // reset
      setWinningIds([]); // Reset
      
      // Freeze global balance updates via websocket so win is deferred visually
      freezeBalance();
      // Deduct cost immediately so user sees balance drop
      optimisticUpdate(-totalCost);
      
      const res = await fetch('/api/games/cases/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ caseId: id, count }),
      });
      
      const json = await res.json();
      if (!res.ok) {
        // Revert deduction and unfreeze on error
        optimisticUpdate(totalCost);
        unfreezeBalance();
        reportApiError(res, json, 'Could not open case');
        throw new Error(json?.message || 'Open failed');
      }
      
      const prizes = json.result.prizes as CasePrize[];
      setWinningIds(prizes.map(p => p.id));
      
    } catch (err) {
      setIsSpinning(false);
      unfreezeBalance();
      console.error(err);
    }
  };

  const handleSpinComplete = () => {
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
    
    // Unfreeze balance so websocket push or fetchBalance is applied!
    unfreezeBalance();
    void fetchBalance();
    
    // Keep prizes visible for 2 seconds before allowing next spin
    setTimeout(() => {
      setIsSpinning(false);
    }, 2000);
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
      {liquidGlassSvg}
      <style dangerouslySetInnerHTML={{__html: `
        .bg-liquid-glass {
            background-color: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
        }
        @supports not (hanging-punctuation:first) {
            .bg-liquid-glass {
                backdrop-filter: url(#displacementFilter) blur(2px);
            }
        }
      `}} />
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
        
        {/* Controls Panel - Liquid Glass */}
        <div className="w-full rounded-[28px] border border-white/[0.08] p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.36)] bg-liquid-glass flex flex-col gap-6 mt-2 relative z-20">
          
          <div className="flex items-center justify-between">
            {/* Turbo Toggle */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-white/70">Турбо крутка</span>
              <div 
                onClick={() => !isSpinning && setIsTurbo(!isTurbo)}
                className={`w-[44px] h-[24px] flex items-center rounded-full p-[2px] cursor-pointer shadow-inner border border-white/5 transition-colors duration-500 ease-in-out ${isTurbo ? 'bg-emerald-500/80 border-emerald-500/50' : 'bg-white/10'}`}
                style={{ justifyContent: isTurbo ? 'flex-end' : 'flex-start' }}
              >
                <motion.div 
                  layout 
                  transition={{ type: "spring", stiffness: 700, damping: 30 }}
                  className="bg-white w-[20px] h-[20px] rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.3)]"
                />
              </div>
            </div>
            
            {/* Count Selector - Fixed Layout */}
            <div className="flex items-center gap-1 bg-black/40 rounded-full p-1 border border-white/5 shadow-inner shrink-0">
              {[1, 2, 3].map(c => (
                <button
                  key={c}
                  disabled={isSpinning}
                  onClick={() => setCount(c)}
                  className={`min-w-[40px] h-[32px] flex items-center justify-center shrink-0 rounded-full font-bold text-[15px] transition-all duration-200 ${count === c ? 'bg-white/[0.15] text-white shadow-sm' : 'text-white/40 hover:text-white/70'}`}
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
            {caseTier.prizes.map((p) => (
              <div 
                key={p.id}
                className="rounded-lg border border-white/5 bg-white/[0.03] p-3 flex flex-col items-center justify-center gap-1 relative overflow-hidden"
                style={{ borderBottom: `2px solid ${p.color}40` }}
              >
                <div className="w-14 h-14 relative z-10 mb-1">
                  <Image src={`/images/cases/${p.id}.png`} alt={p.id} fill className="object-contain drop-shadow-lg" unoptimized />
                </div>
                <div className="font-bold text-sm text-white/90 z-10">{p.id}</div>
                <div className="text-xs font-semibold text-emerald-400/90 z-10">{p.amount.toLocaleString('ru-RU')} zł</div>
                <div className="text-[10px] text-white/40 uppercase font-medium mt-1 z-10">{getFakeChance(caseTier.price, p.id)}</div>
                <div 
                  className="absolute inset-0 opacity-10 pointer-events-none"
                  style={{ background: `radial-gradient(circle at center, ${p.color} 0%, transparent 70%)` }}
                />
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
