'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

const MODE_CARDS = [
  { key: 'solo' as const, title: 'SOLO', subtitle: 'Тренируйся один за столом', image: '/BLACKJACK_SOLO.png' },
  { key: 'multi' as const, title: 'MULTIPLAYER', subtitle: 'Комнаты до 6 игроков', image: '/BLACKJACK_MULTIPLAYER.png' },
];

export function BlackjackClient() {
  const router = useRouter();
  const [mode, setMode] = useState<'solo' | 'multi' | null>(null);
  const description =
    'Blackjack временно отключён: оставили только выбор режима и кнопку в меню для админских сценариев.';

  return (
    <main className="min-h-screen bg-midnight-canvas text-frost-white">
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-4 py-6">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white"
        >
          <ArrowLeft size={18} />
          На главную
        </button>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-frost-white">Blackjack</h1>
          <p className="text-sm text-white/70">{description}</p>
        </div>

        <div className="grid gap-3">
          {MODE_CARDS.map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={() => setMode(card.key)}
              className={cn(
                'relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-white/20',
                mode === card.key ? 'ring-2 ring-amber-300/70' : ''
              )}
            >
              <div
                aria-hidden
                className="absolute inset-0 opacity-60"
                style={{
                  backgroundImage: `url(${card.image})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/10" aria-hidden />
              <div className="relative flex flex-col gap-1">
                <span className="text-xs uppercase tracking-wide text-white/70">Режим</span>
                <span className="text-xl font-semibold text-white">{card.title}</span>
                <span className="text-sm text-white/80">{card.subtitle}</span>
              </div>
            </button>
          ))}
        </div>

        {mode ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/80">
            Режим <span className="font-semibold uppercase text-white">{mode}</span> выбран для дальнейших настроек
            в админке. Запуск игры отключён.
          </div>
        ) : null}
      </div>
    </main>
  );
}
