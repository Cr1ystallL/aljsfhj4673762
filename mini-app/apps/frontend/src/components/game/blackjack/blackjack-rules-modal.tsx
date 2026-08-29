'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck, Gamepad2, Award } from 'lucide-react';

interface BlackjackRulesModalProps {
  open: boolean;
  onClose: () => void;
}

export function BlackjackRulesModal({ open, onClose }: BlackjackRulesModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <div
            onClick={onClose}
            className="fixed inset-0 bg-black/85 backdrop-blur-md"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="relative w-full max-w-[540px] max-h-[85vh] flex flex-col rounded-3xl border border-white/20 bg-[#0e1117]/95 shadow-[0_25px_70px_rgba(0,0,0,0.95)] backdrop-blur-2xl overflow-hidden z-10"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/[0.03]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-300">
                  <Gamepad2 size={18} />
                </div>
                <div>
                  <h2 className="font-roobert font-bold text-frost-white text-[17px] leading-tight">
                    Правила игры в Блэкджек
                  </h2>
                  <span className="text-[11px] text-whisper-gray font-roobert">
                    Европейский Blackjack S17 · 6 колод
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full border border-white/15 bg-white/[0.06] flex items-center justify-center text-whisper-gray hover:text-white hover:border-white/30 active:scale-95 transition-all touch-manipulation cursor-pointer"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 font-roobert text-frost-white/90 text-[13px] leading-relaxed custom-scrollbar">
              
              {/* 1. Цель */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-[14px]">
                  <span>🎯</span>
                  <span>Главная цель</span>
                </div>
                <p className="text-white/80">
                  Обыграть дилера, набрав сумму очков ближе к <strong className="text-white">21</strong>, чем у него, но не превысив <strong className="text-white">21</strong> (перебор / Bust).
                </p>
              </div>

              {/* 2. Номиналы карт */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-[14px]">
                  <span>🃏</span>
                  <span>Номиналы карт</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[12px]">
                  <div className="p-2 rounded-xl bg-black/40 border border-white/10 text-center">
                    <span className="text-white/50 block text-[10px]">Карты 2 – 10</span>
                    <span className="font-bold text-white text-sm">По номиналу</span>
                    <span className="text-[10px] text-white/40 block">2 = 2 очка ... 10 = 10</span>
                  </div>
                  <div className="p-2 rounded-xl bg-black/40 border border-white/10 text-center">
                    <span className="text-white/50 block text-[10px]">Валет, Дама, Король</span>
                    <span className="font-bold text-amber-300 text-sm">10 очков</span>
                    <span className="text-[10px] text-white/40 block">J, Q, K = 10</span>
                  </div>
                  <div className="p-2 rounded-xl bg-black/40 border border-white/10 text-center">
                    <span className="text-white/50 block text-[10px]">Туз (Ace)</span>
                    <span className="font-bold text-emerald-400 text-sm">11 или 1</span>
                    <span className="text-[10px] text-white/40 block">Авто-подсчет руки</span>
                  </div>
                </div>
              </div>

              {/* 3. Блэкджек */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-black/40 to-black/40 border border-amber-400/30 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-[14px]">
                  <Award size={16} />
                  <span>Blackjack (Натуральный Блэкджек)</span>
                </div>
                <p className="text-white/85 text-[12.5px]">
                  Комбинация из первых двух карт: <strong>Туз + любая десятка (10, J, Q, K) = 21 очко</strong>. Оплачивается по повышенному тарифу <strong>3 к 2 (коэффициент x2.5 к ставке)</strong>!
                </p>
              </div>

              {/* 4. Действия игрока */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-[14px]">
                  <span>🕹️</span>
                  <span>Действия игрока в свой ход (15 сек)</span>
                </div>
                <div className="space-y-2 text-[12px]">
                  <div className="flex items-start gap-2.5">
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold shrink-0">
                      ЕЩЁ (Hit)
                    </span>
                    <span className="text-white/80">Взять еще одну карту из колоды, чтобы увеличить сумму очков.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="px-2 py-0.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 font-bold shrink-0">
                      ХВАТИТ (Stand)
                    </span>
                    <span className="text-white/80">Остановиться на текущей сумме и передать ход следующему игроку.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold shrink-0">
                      УДВОИТЬ (2X)
                    </span>
                    <span className="text-white/80">Удвоить ставку, получить ровно одну карту и автоматически завершить ход.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="px-2 py-0.5 rounded-lg bg-white/10 border border-white/20 text-white/70 font-bold shrink-0">
                      СДАТЬСЯ
                    </span>
                    <span className="text-white/80">Сбросить карты в начале своего первого хода и вернуть 50% ставки.</span>
                  </div>
                </div>
              </div>

              {/* 5. Правило дилера */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-[14px]">
                  <span>👔</span>
                  <span>Обязательное правило дилера (Stand on 17)</span>
                </div>
                <ul className="list-disc list-inside text-white/80 space-y-1 text-[12px]">
                  <li>Дилер открывает скрытую карту только после ходов всех игроков.</li>
                  <li>Дилер <strong className="text-white">ОБЯЗАН добирать карты</strong>, пока сумма его руки меньше <strong className="text-amber-300">17</strong>.</li>
                  <li>Дилер <strong className="text-white">ОБЯЗАН остановиться</strong>, как только набрал <strong className="text-amber-300">17 или больше</strong> (17, 18, 19, 20, 21).</li>
                </ul>
              </div>

              {/* 6. Таблица выплат */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-[14px]">
                  <span>💰</span>
                  <span>Выплаты и исходы</span>
                </div>
                <div className="space-y-1.5 text-[12px]">
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/40">
                    <span className="text-white/80">Победа над дилером (очков больше)</span>
                    <span className="font-bold text-emerald-400 font-mono">1:1 (x2.0 к ставке)</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/40">
                    <span className="text-amber-300 font-medium">Натуральный Блэкджек (BJ)</span>
                    <span className="font-bold text-amber-300 font-mono">3:2 (x2.5 к ставке)</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/40">
                    <span className="text-white/80">Ничья с дилером (Push)</span>
                    <span className="font-bold text-sky-300 font-mono">Возврат ставки (x1.0)</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/40">
                    <span className="text-white/80">Перебор (Bust {'>'} 21) или меньше дилера</span>
                    <span className="font-bold text-red-400 font-mono">Проигрыш (0)</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 bg-white/[0.02] flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-6 py-2.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-black font-roobert font-bold text-[13px] hover:from-amber-300 hover:to-amber-400 active:scale-95 transition-all shadow-lg cursor-pointer touch-manipulation"
              >
                Понятно, к игре!
              </button>
            </div>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
