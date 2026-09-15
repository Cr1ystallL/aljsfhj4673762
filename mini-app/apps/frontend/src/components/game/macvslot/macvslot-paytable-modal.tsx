'use client';

import { useState } from 'react';
import Image from 'next/image';
import { X, Sparkles, ShieldCheck, Grid3X3, Award, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SYMBOL_IMAGES, SLOT_PAYLINES } from './macvslot-types';

interface MacvSlotPaytableModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'payouts' | 'multipliers' | 'paylines' | 'rules';

const PAYTABLE_ITEMS = [
  { id: 'macvjet', name: 'MacvJet (Ракетный Джет)', m3: '10x', m4: '50x', m5: '300x', desc: 'Флагманский символ MacvBet' },
  { id: 'mines', name: 'Mines (Кристаллы & Динамит)', m3: '8x', m4: '35x', m5: '200x', desc: 'Старший символ' },
  { id: 'wheel', name: 'Wheel (Колесо Фортуны)', m3: '6x', m4: '25x', m5: '150x', desc: 'Старший символ' },
  { id: 'coinflip', name: 'Coinflip (Золотые Монеты)', m3: '5x', m4: '20x', m5: '100x', desc: 'Старший символ' },
  { id: 'a', name: 'Туз A', m3: '3x', m4: '12x', m5: '50x', desc: 'Карточный символ' },
  { id: 'k', name: 'Король K', m3: '2.5x', m4: '10x', m5: '40x', desc: 'Карточный символ' },
  { id: 'q', name: 'Дама Q', m3: '2x', m4: '8x', m5: '30x', desc: 'Карточный символ' },
  { id: 'j', name: 'Валет J', m3: '1.5x', m4: '6x', m5: '25x', desc: 'Карточный символ' },
  { id: '10', name: 'Десятка 10', m3: '1x', m4: '4x', m5: '20x', desc: 'Карточный символ' },
];

export function MacvSlotPaytableModal({ isOpen, onClose }: MacvSlotPaytableModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('payouts');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 select-none">
      <div className="relative w-full max-w-[620px] max-h-[88vh] flex flex-col rounded-3xl bg-[#0b0e17] border-2 border-amber-500/40 text-white shadow-[0_25px_80px_rgba(0,0,0,0.95),0_0_40px_rgba(245,158,11,0.2)] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-zinc-800/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-brand font-black text-base sm:text-xl text-white tracking-wide">
                MacvSpin: Справка и Правила
              </h2>
              <p className="text-[11px] sm:text-xs text-zinc-400 font-mono">
                5 барабанов • 3 ряда • 20 линий • RTP 96.2%
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-4 py-2 bg-black/40 border-b border-zinc-800/80 overflow-x-auto custom-scrollbar shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('payouts')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-brand font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5',
              activeTab === 'payouts'
                ? 'bg-amber-400 text-black shadow-md shadow-amber-500/20 scale-102'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            )}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Выплаты</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('multipliers')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-brand font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5',
              activeTab === 'multipliers'
                ? 'bg-amber-400 text-black shadow-md shadow-amber-500/20 scale-102'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            )}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Множители & Бонус</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('paylines')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-brand font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5',
              activeTab === 'paylines'
                ? 'bg-amber-400 text-black shadow-md shadow-amber-500/20 scale-102'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            )}
          >
            <Grid3X3 className="w-3.5 h-3.5" />
            <span>20 Линий</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rules')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-brand font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5',
              activeTab === 'rules'
                ? 'bg-amber-400 text-black shadow-md shadow-amber-500/20 scale-102'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            )}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Правила</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar space-y-4">
          {/* TAB 1: PAYOUTS */}
          {activeTab === 'payouts' && (
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 leading-relaxed">
                Выигрыши выплачиваются за комбинации одинаковых символов слева направо на активной линии выплат, начиная с крайнего левого барабана. Множитель применяется к <strong className="text-amber-300">ставке на одну линию</strong> (Общая ставка ÷ 20).
              </div>

              {/* Special Quick Badges */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-2.5 rounded-2xl bg-zinc-900/90 border border-amber-500/30 flex items-center gap-2.5">
                  <div className="relative w-10 h-10 shrink-0">
                    <Image src={SYMBOL_IMAGES.wield} alt="WILD" fill unoptimized className="object-contain" />
                  </div>
                  <div>
                    <span className="font-brand font-black text-amber-300 text-xs block">WILD (Дикий)</span>
                    <span className="text-[10px] text-zinc-400">Заменяет любой символ</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-2xl bg-zinc-900/90 border border-yellow-500/30 flex items-center gap-2.5">
                  <div className="relative w-10 h-10 shrink-0">
                    <Image src={SYMBOL_IMAGES.scatter} alt="SCATTER" fill unoptimized className="object-contain" />
                  </div>
                  <div>
                    <span className="font-brand font-black text-yellow-300 text-xs block">SCATTER</span>
                    <span className="text-[10px] text-zinc-400">3 шт = 10 Фриспинов</span>
                  </div>
                </div>
              </div>

              {/* Symbols Table */}
              <div className="rounded-2xl border border-zinc-800 overflow-hidden divide-y divide-zinc-800/80 bg-zinc-950/70">
                {PAYTABLE_ITEMS.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-3 py-2.5 text-xs hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative w-9 h-9 shrink-0">
                        <Image
                          src={SYMBOL_IMAGES[item.id as keyof typeof SYMBOL_IMAGES]}
                          alt={item.name}
                          fill
                          unoptimized
                          className="object-contain drop-shadow"
                        />
                      </div>
                      <div>
                        <span className="font-bold text-white block text-xs sm:text-sm">{item.name}</span>
                        <span className="text-[10px] text-zinc-500">{item.desc}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 sm:gap-4 font-mono font-bold text-xs sm:text-sm">
                      <span className="text-zinc-400">3x: <span className="text-zinc-200">{item.m3}</span></span>
                      <span className="text-zinc-400">4x: <span className="text-amber-300">{item.m4}</span></span>
                      <span className="text-zinc-400">5x: <span className="text-amber-400 font-black">{item.m5}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: MULTIPLIERS & BONUS */}
          {activeTab === 'multipliers' && (
            <div className="space-y-4">
              {/* Multiplier Symbols (x2, x3, x5) */}
              <div className="p-4 rounded-2xl bg-gradient-to-b from-[#161a26] to-[#0d1017] border border-amber-500/40 shadow-lg space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-xl bg-amber-500/20 text-amber-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-brand font-black text-amber-300 text-sm sm:text-base uppercase">
                      Множители X2, X3, X5
                    </h3>
                    <p className="text-[11px] text-zinc-400 font-mono">
                      Выпадают на 2, 3 и 4 барабанах
                    </p>
                  </div>
                </div>

                {/* Multiplier Badges Showcase */}
                <div className="flex items-center justify-center gap-4 py-2">
                  <div className="relative w-14 h-14 sm:w-16 sm:h-16 shrink-0 drop-shadow-[0_0_12px_rgba(245,158,11,0.5)]">
                    <Image src={SYMBOL_IMAGES.x2} alt="X2" fill unoptimized className="object-contain" />
                  </div>
                  <div className="relative w-14 h-14 sm:w-16 sm:h-16 shrink-0 drop-shadow-[0_0_15px_rgba(245,158,11,0.65)]">
                    <Image src={SYMBOL_IMAGES.x3} alt="X3" fill unoptimized className="object-contain" />
                  </div>
                  <div className="relative w-14 h-14 sm:w-16 sm:h-16 shrink-0 drop-shadow-[0_0_20px_rgba(245,158,11,0.85)]">
                    <Image src={SYMBOL_IMAGES.x5} alt="X5" fill unoptimized className="object-contain" />
                  </div>
                </div>

                <div className="space-y-2 text-xs text-zinc-300 leading-relaxed">
                  <div className="p-2.5 rounded-xl bg-black/50 border border-zinc-800">
                    <span className="font-black text-amber-300 block mb-0.5">В обычной игре:</span>
                    Если в состав выигрышной линии входит символ множителя, выигрыш по этой линии умножается на данный множитель. Если на одной линии выпало несколько множителей, их значения <strong className="text-white">перемножаются</strong>!
                  </div>

                  <div className="p-2.5 rounded-xl bg-black/50 border border-amber-500/30">
                    <span className="font-black text-amber-400 block mb-0.5">В бонуске (Free Spins) — Липкие множители (Sticky):</span>
                    Каждый множитель, выпавший во время бесплатных вращений, <strong className="text-amber-300">фиксируется на своей ячейке барабана</strong> до самого конца бонусного раунда и умножает выигрыши во всех последующих спинах!
                  </div>
                </div>
              </div>

              {/* Scatter & Free Spins */}
              <div className="p-4 rounded-2xl bg-zinc-900/90 border border-yellow-500/30 flex items-start gap-3.5">
                <div className="relative w-14 h-14 sm:w-16 sm:h-16 shrink-0 mt-0.5">
                  <Image src={SYMBOL_IMAGES.scatter} alt="Scatter" fill unoptimized className="object-contain drop-shadow-[0_0_12px_rgba(234,179,8,0.6)]" />
                </div>
                <div className="space-y-1">
                  <span className="font-brand font-black text-yellow-300 text-sm block">
                    SCATTER (Бонусный раунд)
                  </span>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    Выпадает только на <strong className="text-amber-300">1, 3 и 5</strong> барабанах. Выпадение 3 символов SCATTER одновременно запускает бонусную игру из <strong className="text-amber-300">10 бесплатных вращений</strong> и начисляет мгновенный бонус.
                  </p>
                </div>
              </div>

              {/* Wild */}
              <div className="p-4 rounded-2xl bg-zinc-900/90 border border-orange-500/30 flex items-start gap-3.5">
                <div className="relative w-14 h-14 sm:w-16 sm:h-16 shrink-0 mt-0.5">
                  <Image src={SYMBOL_IMAGES.wield} alt="Wild" fill unoptimized className="object-contain drop-shadow-[0_0_12px_rgba(249,115,22,0.6)]" />
                </div>
                <div className="space-y-1">
                  <span className="font-brand font-black text-orange-400 text-sm block">
                    WILD (Дикий символ)
                  </span>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    Заменяет все обычные символы для составления наивысшей возможной комбинации на каждой линии. Не заменяет SCATTER и множители.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: 20 PAYLINES (Visual Diagrams) */}
          {activeTab === 'paylines' && (
            <div className="space-y-3">
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 leading-relaxed">
                Слот содержит <strong className="text-amber-300">20 фиксированных линий выплат</strong>. Выигрыши на разных линиях суммируются. Ниже представлены схемы всех 20 линий по 5 барабанам (3 ряда):
              </div>

              {/* 20 Paylines Mini-Grid Visualizer */}
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                {SLOT_PAYLINES.map((pattern, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded-2xl bg-zinc-900/90 border border-zinc-800 hover:border-amber-500/50 flex flex-col items-center gap-1.5 transition-all shadow-md group"
                  >
                    <span className="text-[10px] font-mono font-black text-amber-300/90 tracking-wider uppercase group-hover:text-amber-300">
                      Линия {idx + 1}
                    </span>

                    {/* 5 columns x 3 rows tactile mini matrix */}
                    <div className="grid grid-cols-5 gap-1 p-1.5 rounded-xl bg-black/80 border border-zinc-800/80">
                      {[0, 1, 2, 3, 4].map((col) => (
                        <div key={col} className="flex flex-col gap-1">
                          {[0, 1, 2].map((row) => {
                            const isCellActive = pattern[col] === row;
                            return (
                              <div
                                key={row}
                                className={cn(
                                  'w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full transition-all',
                                  isCellActive
                                    ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)] scale-120 ring-1 ring-amber-300'
                                    : 'bg-zinc-800/90 opacity-30'
                                )}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: RULES */}
          {activeTab === 'rules' && (
            <div className="space-y-3.5 text-xs text-zinc-300 leading-relaxed">
              <div className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-2">
                <span className="font-brand font-black text-white text-sm block">
                  Общие правила автомата
                </span>
                <ul className="list-disc list-inside space-y-1.5 text-zinc-400">
                  <li>Все 20 линий активны на каждом спине.</li>
                  <li>Все комбинации оплачиваются слева направо, начиная с первого левого барабана.</li>
                  <li>На каждой линии выплачивается только наивысший выигрыш.</li>
                  <li>Выигрыши по разным линиям складываются.</li>
                  <li>Теоретический возврат игроку (RTP) составляет 96.2%.</li>
                </ul>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-2">
                <span className="font-brand font-black text-white text-sm block">
                  Функция покупки бонуски (Buy Bonus)
                </span>
                <p className="text-zinc-400">
                  Вы можете гарантированно запустить 10 бесплатных вращений в любой момент, нажав кнопку «Купить бонус». Стоимость покупки составляет ровно <strong className="text-amber-300">100x от текущей ставки</strong>.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2.5 text-xs text-amber-200/90">
                <ShieldCheck className="w-5 h-5 shrink-0 text-amber-400" />
                <span>
                  Честность гарантирована криптографическим генератором случайных чисел. В случае обрыва связи начатый бонусный раунд сохраняется на сервере и возобновляется при входе.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-zinc-800/80 bg-black/40 flex items-center justify-between shrink-0">
          <span className="text-[11px] font-mono text-zinc-500">
            MacvBet Casino Originals
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 font-brand font-black text-xs text-black transition-all cursor-pointer shadow-md active:scale-95"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
}
