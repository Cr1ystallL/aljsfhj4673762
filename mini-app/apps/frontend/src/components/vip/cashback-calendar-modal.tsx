'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Clock,
  HelpCircle,
} from 'lucide-react';

interface CashbackCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MONTH_NAMES_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

export function CashbackCalendarModal({ isOpen, onClose }: CashbackCalendarModalProps) {
  const [accordionOpen, setAccordionOpen] = useState(true);

  // Default month: September 2026
  const [viewDate, setViewDate] = useState(() => new Date(2026, 8, 1));

  // Weekdays (Monday to Sunday)
  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthTitle = `${MONTH_NAMES_RU[month]} ${year}`;

  const handlePrevMonth = () => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Month geometry
  const firstDay = new Date(year, month, 1);
  // (getDay() + 6) % 7 gives Monday = 0, Sunday = 6
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Current system / real date (2 September 2026 context)
  const now = new Date();
  // Check if today is a payout day (Monday = day 1 in JS)
  const isTodayPayoutDay = now.getDay() === 1;

  const cells = [];
  for (let i = 0; i < startOffset; i++) {
    cells.push({ day: null });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dayDate = new Date(year, month, d);
    // Every Monday is a payout day
    const isPayout = (dayDate.getDay() + 6) % 7 === 0;
    // Check if this cell is today
    const isToday =
      now.getFullYear() === year &&
      now.getMonth() === month &&
      now.getDate() === d;

    cells.push({
      day: d,
      isPayout,
      isToday,
    });
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="relative w-full max-w-[440px] my-auto rounded-[28px] border border-white/10 bg-[#0d1014] p-4 sm:p-5 shadow-[0_20px_60px_rgba(0,0,0,0.95)] overflow-hidden font-roobert select-none"
          >
            {/* Background Ambient Glow */}
            <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

            {/* 1. Header */}
            <div className="relative z-10 flex items-center justify-between pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-[#00e87b] shadow-[0_0_12px_rgba(0,232,123,0.15)]">
                  <Calendar size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-[16.5px] text-white tracking-tight">
                    Выплаты кэшбэка
                  </h3>
                  <p className="text-[11.5px] text-white/50">Каждый понедельник • 00:00 UTC</p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* 2. Top Card (Следующая выплата & Расчет за период) */}
            <div className="relative z-10 mt-1 rounded-[20px] border border-white/10 bg-[#12161b]/90 p-4 flex flex-col sm:flex-row gap-4 divide-y sm:divide-y-0 sm:divide-x divide-white/10">
              {/* Left Column */}
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <span className="block text-[11px] font-medium text-white/50">
                    Следующая выплата
                  </span>
                  <span className="block text-2xl font-black text-[#00e87b] tracking-tight mt-1">
                    7 сентября
                  </span>
                </div>

                <div className="mt-3 flex flex-col gap-2">
                  {/* Badge: Dark gray if not payout day today, emerald green if payout day */}
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold w-fit ${
                      isTodayPayoutDay
                        ? 'bg-emerald-950/40 border border-emerald-500/25 text-[#00e87b]'
                        : 'bg-white/5 border border-white/10 text-white/50'
                    }`}
                  >
                    <Calendar size={12} className={isTodayPayoutDay ? 'text-[#00e87b]' : 'text-white/40'} />
                    <span>Понедельник • 00:00 UTC</span>
                  </div>

                  {/* Status: Only show "Доступно к выводу" when today is payout day */}
                  {isTodayPayoutDay ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-[#00e87b] font-medium">
                      <CheckCircle2 size={13} className="text-[#00e87b]" />
                      <span>Доступно к выводу</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[11px] text-white/40 font-medium">
                      <Clock size={12} className="text-white/30" />
                      <span>Выплата в понедельник</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column */}
              <div className="flex-1 pt-3 sm:pt-0 sm:pl-4 flex flex-col justify-between">
                <div>
                  <span className="block text-[11px] font-medium text-white/50">
                    Расчёт за период
                  </span>
                  <span className="block text-[13px] font-bold text-white mt-1">
                    31 августа — 6 сентября
                  </span>
                </div>

                <p className="text-[11px] text-white/50 leading-relaxed mt-2.5">
                  Кэшбэк за последние 7 дней станет доступен к выводу 7 сентября в 00:00 UTC.
                </p>
              </div>
            </div>

            {/* 3. Calendar Grid Card */}
            <div className="relative z-10 mt-3 rounded-[20px] border border-white/10 bg-[#12161b]/90 p-4">
              {/* Month Header & Legend */}
              <div className="flex items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-sm text-white">{monthTitle}</span>
                  <div className="flex items-center gap-1 text-white/50">
                    <button
                      type="button"
                      onClick={handlePrevMonth}
                      className="p-1 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
                      title="Предыдущий месяц"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextMonth}
                      className="p-1 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
                      title="Следующий месяц"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-white/60 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00e87b]" />
                  <span>День выплаты</span>
                </div>
              </div>

              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-white/40 pb-2">
                {weekDays.map((wd, i) => (
                  <div key={wd} className={i === 0 ? 'text-[#00e87b]' : ''}>
                    {wd}
                  </div>
                ))}
              </div>

              {/* Days grid */}
              <div className="grid grid-cols-7 gap-1.5 text-center">
                {cells.map((cell, idx) => {
                  if (!cell.day) {
                    return <div key={'empty-' + idx} className="h-10" />;
                  }

                  const isPayout = cell.isPayout;
                  const isToday = cell.isToday;

                  if (isToday && !isPayout) {
                    return (
                      <div
                        key={'day-' + cell.day}
                        className="relative h-10 rounded-xl border border-white/20 bg-white/5 flex flex-col items-center justify-center"
                      >
                        <span className="text-xs font-bold text-white leading-none">{cell.day}</span>
                        <span className="text-[8px] text-white/60 leading-none mt-0.5 font-medium">
                          Сегодня
                        </span>
                      </div>
                    );
                  }

                  if (isPayout) {
                    return (
                      <div
                        key={'day-' + cell.day}
                        className="relative h-10 rounded-xl border border-[#00e87b] bg-emerald-500/10 flex flex-col items-center justify-center text-[#00e87b] font-black shadow-[0_0_10px_rgba(0,232,123,0.2)]"
                      >
                        <span className="text-xs font-extrabold leading-none">{cell.day}</span>
                        <span className="w-1 h-1 rounded-full bg-[#00e87b] mt-0.5" />
                      </div>
                    );
                  }

                  return (
                    <div
                      key={'day-' + cell.day}
                      className="h-10 rounded-xl flex items-center justify-center text-xs font-medium text-white/60 hover:bg-white/5 transition-colors"
                    >
                      <span>{cell.day}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4. Bottom Collapsible Info Card (Как работает выплата?) */}
            <div className="relative z-10 mt-3 rounded-[18px] border border-white/10 bg-[#12161b]/90 p-3.5">
              <button
                type="button"
                onClick={() => setAccordionOpen(!accordionOpen)}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <HelpCircle size={15} className="text-[#00e87b] shrink-0" />
                  <span className="font-bold text-xs text-white">Как работает выплата?</span>
                </div>
                <ChevronDown
                  size={15}
                  className={`text-white/40 transition-transform ${accordionOpen ? 'rotate-180' : ''}`}
                />
              </button>

              <AnimatePresence initial={false}>
                {accordionOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <p className="text-[11px] text-white/50 leading-relaxed pt-2.5">
                      Кэшбэк рассчитывается за предыдущие 7 дней (от чистого проигрыша) и становится доступен к выводу каждый <b className="text-white font-semibold">понедельник в 00:00 UTC</b>.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
