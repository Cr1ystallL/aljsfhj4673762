'use client';

import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

interface GlassCardProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  intensity?: 'subtle' | 'medium' | 'strong';
}

/**
 * GlassCard Component - Monopo Saigon Style
 * 
 * DESIGN:
 * - Floating translucent glassmorphism
 * - Subtle borders (rgba(255, 255, 255, 0.1-0.3))
 * - 10px border radius for cards
 * - Depth via backdrop blur, not shadows
 * - Spacious padding (34px default)
 */
export function GlassCard({ 
  children, 
  className, 
  hover = false,
  intensity = 'medium',
  ...props 
}: GlassCardProps) {
  const intensityStyles = {
    subtle: 'bg-white/5 backdrop-blur-xl border-white/10',
    medium: 'bg-white/8 backdrop-blur-2xl border-white/15',
    strong: 'bg-white/12 backdrop-blur-2xl border-white/20',
  };
  
  return (
    <motion.div
      className={cn(
        'rounded-card border p-8',
        intensityStyles[intensity],
        hover && 'hover:border-white/25 transition-all duration-300',
        className
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      whileHover={hover ? { scale: 1.01, y: -2 } : undefined}
      whileTap={hover ? { scale: 0.99 } : undefined}
      {...props}
    >
      {children}
    </motion.div>
  );
}
