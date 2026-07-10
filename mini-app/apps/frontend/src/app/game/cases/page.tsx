'use client';

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
}

export interface CaseTier {
  id: string;
  name: string;
  price: number;
  prizes: CasePrize[];
  totalWeight: number;
}

export default function CasesPage() {
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
        <GameTopBar title="Кейсы" Icon={PlinkoIcon} />

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {cases.map((c) => (
            <Link key={c.id} href={`/game/cases/${c.id}`} className="group relative rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 flex flex-col items-center justify-center gap-3 transition-transform hover:scale-105 active:scale-95 overflow-hidden">
              {/* Fallback image logic. In a real app, each case has its own image. */}
              <div className="w-32 h-32 relative flex-shrink-0">
                <Image
                  src={`/images/cases/${c.id}.png`}
                  alt={c.name}
                  fill
                  className="object-contain drop-shadow-2xl"
                  unoptimized
                />
              </div>
              
              <div className="flex flex-col items-center gap-1">
                <h3 className="font-medium text-lg text-white/90">{c.name}</h3>
                <div className="font-roobert font-medium text-[15px] bg-white/10 px-3 py-1 rounded-pill">
                  {c.price.toLocaleString('ru-RU')} zł
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-semibold text-white/50 mb-3 px-1 uppercase tracking-wider">Live История</h2>
          <CasesHistory />
        </div>
      </div>
    </main>
  );
}
