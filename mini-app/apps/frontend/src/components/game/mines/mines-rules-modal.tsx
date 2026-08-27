'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck, Bomb, Gem, Trophy } from 'lucide-react';
import { useT } from '@/i18n/use-t';

interface MinesRulesModalProps {
  open: boolean;
  onClose: () => void;
}

export function MinesRulesModal({ open, onClose }: MinesRulesModalProps) {
  const { t } = useT();

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
            className="relative w-full max-w-[500px] max-h-[85vh] flex flex-col rounded-3xl border border-white/20 bg-[#0e1117]/95 shadow-[0_25px_70px_rgba(0,0,0,0.95)] backdrop-blur-2xl overflow-hidden z-10"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/[0.03]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-300">
                  <Bomb size={18} />
                </div>
                <div>
                  <h2 className="font-roobert font-bold text-frost-white text-[17px] leading-tight">
                    Правила игры в Mines (Мины)
                  </h2>
                  <span className="text-[11px] text-whisper-gray font-roobert">
                    Поле 5×5 · Настраиваемый риск · RTP 99%
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
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 font-roobert text-frost-white/90 text-[13px] leading-relaxed custom-scrollbar">
              
              {/* 1. Суть */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-[14px]">
                  <span>🎯</span>
                  <span>Суть игры</span>
                </div>
                <p className="text-white/80">
                  Перед вами сетка <strong className="text-white">5×5 (25 клеток)</strong>. В клетках спрятаны драгоценные <strong className="text-emerald-400">алмазы 💎</strong> и опасные <strong className="text-red-400">мины 💣</strong>.
                </p>
              </div>

              {/* 2. Как играть */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-[14px]">
                  <span>🕹️</span>
                  <span>Как играть: шаг за шагом</span>
                </div>
                <div className="space-y-2 text-[12px]">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">1</span>
                    <span className="text-white/80">Укажите желаемую <strong>сумму ставки</strong> и выберите <strong>количество мин (от 1 до 24)</strong>.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">2</span>
                    <span className="text-white/80">Нажмите <strong>«Играть»</strong> и открывайте закрытые клетки по одной.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">3</span>
                    <span className="text-white/80">Каждый открытый алмаз <strong>увеличивает ваш коэффициент выигрыша</strong>.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">4</span>
                    <span className="text-white/80">Нажмите кнопку <strong>«Забрать»</strong> в любой момент, чтобы зафиксировать прибыль!</span>
                  </div>
                </div>
              </div>

              {/* 3. Риск и множители */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-[14px]">
                  <Trophy size={16} />
                  <span>Риск и множители</span>
                </div>
                <p className="text-white/80 text-[12px]">
                  Чем <strong>больше мин</strong> на поле, тем выше коэффициент за каждый открытый алмаз. Например, при 24 минах открытие единственного алмаза сразу даёт гигантский множитель <strong className="text-amber-300 font-mono">x24.75</strong>!
                </p>
              </div>

              {/* 4. Provably Fair */}
              <div className="p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-[13px]">
                  <ShieldCheck size={16} />
                  <span>Доказуемая честность (Provably Fair)</span>
                </div>
                <p className="text-white/75 text-[11.5px]">
                  Расположение мин генерируется криптографическим хэшем SHA-256 до начала раунда. Хэш отображается в реальном времени, а после окончания игры вы можете сверить позиции мин в калькуляторе.
                </p>
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
