'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useT } from '@/i18n/use-t';

const STORAGE_KEY = 'macvbet.sportsBeta.hide';

export function SportsBetaNotice() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === '1') return;
    } catch {
      // ignore
    }
    setOpen(true);
  }, []);

  const confirm = () => {
    if (dontShow) {
      try {
        window.localStorage.setItem(STORAGE_KEY, '1');
      } catch {
        // ignore
      }
    }
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center px-3 pb-3 sm:pb-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-midnight-canvas/85 backdrop-blur-sm" />
          <motion.div
            role="dialog"
            aria-labelledby="sports-beta-title"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
            className="relative w-full max-w-[420px] rounded-card border border-white/10 p-5 shadow-2xl"
            style={{ background: 'rgba(10, 10, 10, 0.96)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="px-1.5 py-0.5 rounded-md border border-white/20 bg-white/[0.06] font-roobert text-[10px] font-semibold tracking-[0.16em] text-frost-white/80">
                {t('sports.beta')}
              </span>
              <h2
                id="sports-beta-title"
                className="font-roobert text-[17px] font-semibold text-frost-white"
              >
                {t('sports.betaTitle')}
              </h2>
            </div>
            <p className="font-roobert text-[13px] leading-relaxed text-whisper-gray">
              {t('sports.betaBody')}
            </p>
            <label className="mt-4 flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dontShow}
                onChange={(e) => setDontShow(e.target.checked)}
                className="h-4 w-4 rounded border-white/25 bg-white/[0.06] accent-frost-white"
              />
              <span className="font-roobert text-[13px] text-frost-white/80">
                {t('sports.betaDontShow')}
              </span>
            </label>
            <button
              type="button"
              onClick={confirm}
              className="mt-4 w-full inline-flex items-center justify-center px-4 py-2.5 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px] uppercase tracking-[0.22em]"
            >
              {t('common.gotIt')}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
