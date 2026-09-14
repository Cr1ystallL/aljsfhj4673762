'use client';

import Image from 'next/image';
import { X, HelpCircle, Sparkles, Zap, ShieldCheck } from 'lucide-react';
import { SYMBOL_IMAGES } from './macvslot-types';

interface MacvSlotPaytableModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PAYTABLE_ITEMS = [
  { id: 'macvjet', name: 'MacvJet (Ракетный Джет)', m3: '35x', m4: '175x', m5: '1000x', desc: 'Флагманский символ MacvBet' },
  { id: 'mines', name: 'Mines (Кристаллы & Динамит)', m3: '25x', m4: '120x', m5: '700x', desc: 'Старший символ' },
  { id: 'wheel', name: 'Wheel (Колесо Фортуны)', m3: '20x', m4: '90x', m5: '500x', desc: 'Старший символ' },
  { id: 'coinflip', name: 'Coinflip (Золотые Монеты)', m3: '15x', m4: '70x', m5: '400x', desc: 'Старший символ' },
  { id: 'a', name: 'Туз A', m3: '10x', m4: '45x', m5: '200x', desc: 'Карточный символ' },
  { id: 'k', name: 'Король K', m3: '8x', m4: '35x', m5: '160x', desc: 'Карточный символ' },
  { id: 'q', name: 'Дама Q', m3: '6x', m4: '25x', m5: '120x', desc: 'Карточный символ' },
  { id: 'j', name: 'Валет J', m3: '5x', m4: '20x', m5: '80x', desc: 'Карточный символ' },
  { id: '10', name: 'Десятка 10', m3: '4x', m4: '15x', m5: '60x', desc: 'Карточный символ' },
];

export function MacvSlotPaytableModal({ isOpen, onClose }: MacvSlotPaytableModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-[560px] max-h-[85vh] overflow-y-auto rounded-3xl bg-[#0b0e14] border border-amber-500/30 p-5 text-white shadow-2xl custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-brand font-black text-lg sm:text-xl text-white">
                Таблица выплат: MacvSpin
              </h2>
              <p className="text-xs text-zinc-400 font-roobert">
                5 барабанов • 20 фиксированных линий • RTP 96.2%
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Special Symbols Showcase */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {/* WILD */}
          <div className="p-3 rounded-2xl bg-zinc-900/90 border border-orange-500/30 flex items-center gap-3">
            <div className="relative w-14 h-14 shrink-0">
              <Image
                src={SYMBOL_IMAGES.wield}
                alt="WILD"
                fill
                unoptimized
                className="object-contain"
              />
            </div>
            <div>
              <span className="font-brand font-black text-amber-400 text-sm">WILD (Дикий)</span>
              <p className="text-[11px] text-zinc-300 leading-snug mt-0.5">
                Заменяет любой символ в линии кроме Scatter для максимального выигрыша!
              </p>
            </div>
          </div>

          {/* SCATTER */}
          <div className="p-3 rounded-2xl bg-zinc-900/90 border border-amber-500/30 flex items-center gap-3">
            <div className="relative w-14 h-14 shrink-0">
              <Image
                src={SYMBOL_IMAGES.scatter}
                alt="SCATTER"
                fill
                unoptimized
                className="object-contain"
              />
            </div>
            <div>
              <span className="font-brand font-black text-yellow-400 text-sm">SCATTER (Фриспины)</span>
              <p className="text-[11px] text-zinc-300 leading-snug mt-0.5">
                3+ символа в любом месте активируют <strong className="text-amber-300">10 Free Spins</strong> + мгновенную выплату!
              </p>
            </div>
          </div>
        </div>

        {/* Paytable Grid */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase text-zinc-400 tracking-wider">
            Множители выигрышных линий (к ставке на линию)
          </span>

          <div className="rounded-2xl border border-zinc-800 overflow-hidden divide-y divide-zinc-800/80 bg-zinc-950/60">
            {PAYTABLE_ITEMS.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="relative w-8 h-8 shrink-0">
                    <Image
                      src={SYMBOL_IMAGES[item.id as keyof typeof SYMBOL_IMAGES]}
                      alt={item.name}
                      fill
                      unoptimized
                      className="object-contain"
                    />
                  </div>
                  <div>
                    <span className="font-bold text-white block">{item.name}</span>
                    <span className="text-[10px] text-zinc-500">{item.desc}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 font-mono font-bold">
                  <span className="text-zinc-400">3x: <span className="text-zinc-200">{item.m3}</span></span>
                  <span className="text-zinc-400">4x: <span className="text-amber-300">{item.m4}</span></span>
                  <span className="text-zinc-400">5x: <span className="text-amber-400">{item.m5}</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Fair Play Info */}
        <div className="mt-5 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 flex items-center gap-2.5 text-xs text-amber-200/80">
          <ShieldCheck className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            Генерация каждого спина выполняется на сервере криптографическим генератором случайных чисел с верификацией честности.
          </span>
        </div>
      </div>
    </div>
  );
}
