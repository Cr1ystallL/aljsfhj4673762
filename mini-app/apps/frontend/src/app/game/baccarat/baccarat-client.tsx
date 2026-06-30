'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Clock, Spade } from 'lucide-react';
import { GameTopBar } from '@/components/game/game-top-bar';

export function BaccaratClient() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-midnight-canvas text-frost-white pb-20">
      <GameTopBar title="Baccarat" Icon={Spade} />
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-4 pt-4">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-6 rounded-full bg-white/5 p-4 text-white/20">
            <Clock size={48} strokeWidth={1} />
          </div>
          <h1 className="mb-2 text-2xl font-semibold">Baccarat (Live)</h1>
          <p className="max-w-xs text-sm text-white/50">
            Разработка многопользовательского режима идет полным ходом. 
            Совсем скоро вы сможете играть против живого дилера вместе с другими игроками.
          </p>
          <button
            onClick={() => router.push('/')}
            className="mt-8 rounded-full bg-white/10 px-6 py-2 text-sm font-medium hover:bg-white/15"
          >
            Вернуться на главную
          </button>
        </div>
      </div>
    </main>
  );
}
