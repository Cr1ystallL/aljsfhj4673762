'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';

/**
 * Page Transition Wrapper
 *
 * Originally faded + translated 20px on every navigation, which produced a
 * noticeable repaint on mobile WebViews because each page-mount kicked off
 * a 300ms layout-shifting animation. We now run a 140ms opacity-only
 * cross-fade — composited entirely on the GPU with no layout cost — which
 * keeps the perceptual continuity between routes without taxing the
 * compositor on iPhone / Android.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
        // Hint the compositor — keeps the fade off the main paint path.
        style={{ willChange: 'opacity' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
