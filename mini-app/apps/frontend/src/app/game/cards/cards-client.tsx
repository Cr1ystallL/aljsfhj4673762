'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

const CARD_GAMES = [
  { key: 'hilo', title: 'HI-LO', subtitle: 'Угадай следующую карту', image: '/cardgames.png', href: '/game/hilo', active: true },
  { key: 'blackjack', title: 'BLACKJACK', subtitle: 'Premium 3D Blackjack', image: '/BLACKJACK.png', href: '/game/blackjack', active: true },
  { key: 'baccarat', title: 'BACCARAT', subtitle: 'Live против дилера (Скоро)', image: '/cardgames.png', href: '#', active: false },
];

export function CardsClient() {
  const router = useRouter();

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
          <h1 className="text-2xl font-semibold text-frost-white">Карточные игры</h1>
          <p className="text-sm text-white/70">Выберите игру для начала</p>
        </div>

        <div className="grid gap-3">
          {CARD_GAMES.map((card) => (
            <button
              key={card.key}
              type="button"
              disabled={!card.active}
              aria-disabled={!card.active}
              onClick={() => {
                if (card.active && card.href !== '#') {
                  router.push(card.href);
                }
              }}
              className={`relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] p-4 text-left transition-opacity ${
                card.active ? 'hover:opacity-90 active:scale-95 cursor-pointer' : 'opacity-60 cursor-not-allowed'
              }`}
            >
              <div
                aria-hidden
                className="absolute inset-0 opacity-40"
                style={{
                  backgroundImage: `url(${card.image})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-black/20" aria-hidden />
              <div className="relative flex flex-col gap-1">
                <span className="text-xs uppercase tracking-wide text-white/70">Игра</span>
                <span className="text-xl font-semibold text-white">{card.title}</span>
                <span className="text-sm text-white/80">{card.subtitle}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
