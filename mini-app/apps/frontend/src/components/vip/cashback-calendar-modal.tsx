'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, X, Sparkles, Clock, CheckCircle2 } from 'lucide-react';

interface CashbackCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CashbackCalendarModal({ isOpen, onClose }: CashbackCalendarModalProps) {
  // Days of week in Russian (Monday to Sunday)
  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  // September 2026 starts on Tuesday (offset 1 in 0-indexed Mon-Sun grid)
  // Total days in September: 30
  const daysInMonth = 30;
  const startOffset = 1; // Tuesday is index 1

  // Payout Mondays in September 2026: 7, 14, 21, 28
  const payoutDays = [7, 14, 21, 28];
  const launchDay = 7;
  const todayDay = 2; // 2 September

  const cells = [];
  // Empty leading cells
  for (let i = 0; i < startOffset; i++) {
    cells.push({ day: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d,
      isPayout: payoutDays.includes(d),
      isLaunch: d === launchDay,
      isToday: d === todayDay,
    });
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 20 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="relative w-full max-w-md rounded-[28px] border border-white/15 bg-[#0f1115] p-5 sm:p-6 shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden font-roobert select-none"
          >
            {/* Background Ambient Glow */}
            <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="relative z-10 flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-[#00e87b] shadow-[0_0_15px_rgba(0,232,123,0.2)]">
                  <Calendar size={20} />
                </div>
                <div>
                  <h3 className="font-black text-lg text-white tracking-tight flex items-center gap-2">
                    <span>Календарь выплат</span>
                  </h3>
                  <p className="text-xs text-white/50">Сентябрь 2026 • Еженедельный кэшбэк</p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Calendar Grid Container */}
            <div className="relative z-10 mt-5 p-4 rounded-2xl border border-white/10 bg-black/40 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="font-extrabold text-sm text-white">Сентябрь 2026</span>
                <span className="text-[11px] font-bold text-[#00e87b] bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 rounded-full">
                  Каждый понедельник 💸
                </span>
              </div>

              {/* Day Headers */}
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-white/40 pb-2">
                {weekDays.map((wd, i) => (
                  <div key={wd} className={i === 0 ? 'text-[#00e87b]' : ''}>
                    {wd}
                  </div>
                ))}
              </div>

              {/* Days Grid */}
              <div className="grid grid-cols-7 gap-1.5 text-center">
                {cells.map((cell, idx) => {
                  if (!cell.day) {
                    return <div key={'empty-' + idx} className="h-9" />;
                  }

                  const isPayout = cell.isPayout;
                  const isLaunch = cell.isLaunch;
                  const isToday = cell.isToday;

                  return (
                    <div
                      key={'day-' + cell.day}
                      className={`relative h-9 rounded-xl flex flex-col items-center justify-center text-xs font-bold transition-all ${
                        isLaunch
                          ? 'bg-gradient-to-b from-emerald-500/30 to-emerald-600/40 border border-[#00e87b] text-white shadow-[0_0_12px_rgba(0,232,123,0.35)]'
                          : isPayout
                          ? 'bg-emerald-500/20 border border-emerald-500/40 text-[#00e87b] shadow-[0_0_8px_rgba(0,232,123,0.2)]'
                          : isToday
                          ? 'bg-white/10 border border-white/30 text-white'
                          : 'text-white/60 hover:bg-white/5'
                      }`}
                    >
                      <span>{cell.day}</span>
                      {isPayout && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00e87b] mt-0.5 shadow-[0_0_4px_#00e87b]" />
                      )}
                      {isToday && !isPayout && (
                        <span className="w-1 h-1 rounded-full bg-white/70 mt-0.5" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Payout Details Cards */}
            <div className="relative z-10 mt-4 flex flex-col gap-2.5">
              {/* Upcoming Payout Card */}
              <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Sparkles size={16} className="text-[#00e87b]" />
                  <div>
                    <span className="block font-bold text-xs text-white">
                      Ближайшая выплата: 7 сентября
                    </span>
                    <span className="text-[11px] text-white/50">
                      Официальный старт выплат кэшбэка
                    </span>
                  </div>
                </div>
                <span className="px-2 py-1 rounded-lg bg-emerald-500/20 text-[#00e87b] font-extrabold text-[11px]">
                  Понедельник
                </span>
              </div>

              {/* Rules summary note */}
              <div className="p-3 rounded-xl border border-white/10 bg-white/[0.03] text-[11.5px] text-white/60 leading-relaxed flex items-start gap-2">
                <Clock size={14} className="text-white/40 shrink-0 mt-0.5" />
                <p>
                  Кэшбэк накапливается от чистого проигрыша за 7 дней и становится доступен к выводу каждый <b>понедельник в 00:00 UTC</b> без вейджера.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
