'use client';

import { useRouter } from 'next/navigation';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { GameTopBar } from '@/components/game/game-top-bar';
import { PlinkoIcon } from '@/components/ui/game-icon'; // Reuse or create a new icon
import { CasesHistory } from '@/components/game/cases/cases-history';
import { toast } from '@/store/toast-store';
import { useBalance } from '@/hooks/use-balance';

export interface CasePrize {
  id: string;
  amount: number;
  weight: number;
  color: string;
  /** Served by the backend; prizes of a tier always add up to exactly 100. */
  probabilityPercent?: number;
}

export interface CaseTier {
  id: string;
  name: string;
  price: number;
  prizes: CasePrize[];
  totalWeight: number;
}

export default function CasesPage() {
  const router = useRouter();
  const [cases, setCases] = useState<CaseTier[]>([]);
  const { fetchBalance } = useBalance();

  useEffect(() => {
    void fetchBalance();
    fetch('/api/games/cases/config', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.cases) setCases(data.cases);
      })
      .catch((err) => {
        toast.warn('Не удалось загрузить кейсы');
      });
  }, []);

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[800px] px-3 pt-3 pb-28 flex flex-col gap-4">
        <GameTopBar
          title="Кейсы"
          Icon={PlinkoIcon}
          onHowToPlay={() => router.push('/info#faq')}
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {cases.map((c) => {
            const caseColors: Record<string, string> = {
              case_1: '#9e9e9e',
              case_2: '#4caf50',
              case_3: '#2196f3',
              case_4: '#9c27b0',
              case_5: '#e91e63',
              case_6: '#ffb300',
              case_7: '#f44336',
            };
            const color = caseColors[c.id] || '#ffffff';
            
            return (
              <Link key={c.id} href={`/game/cases/${c.id}`} className={`group relative rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 flex flex-col items-center justify-center gap-3 transition-transform hover:scale-105 active:scale-95 overflow-hidden ${c.id === 'case_7' ? 'col-span-2 sm:col-span-3 py-8' : ''}`}>
                <div 
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] opacity-20 pointer-events-none blur-[40px] rounded-full"
                  style={{ background: `radial-gradient(circle at center, ${color} 0%, transparent 60%)` }}
                />
                
                <div className="w-32 h-32 relative flex-shrink-0 z-10">
                  <Image
                    src={`/images/cases/${c.id}.png`}
                    alt={c.name}
                    fill
                    className="object-contain drop-shadow-2xl"
                    unoptimized
                  />
                </div>
                
                <div className="flex flex-col items-center gap-1 z-10">
                  <div className="font-roobert font-medium text-[15px] bg-white/10 px-3 py-1 rounded-pill shadow-inner">
                    {c.price.toLocaleString('ru-RU')} zł
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-semibold text-white/50 mb-3 px-1 uppercase tracking-wider">Live История</h2>
          <CasesHistory />
        </div>
      </div>
    </main>
  );
}
