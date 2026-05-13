'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
}

/**
 * Skeleton loader with subtle animation
 * Used for loading states
 */
export function Skeleton({ className, variant = 'rectangular' }: SkeletonProps) {
  const variants = {
    text: 'h-4 w-full rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-card',
  };
  
  return (
    <motion.div
      className={cn(
        'bg-white/5',
        variants[variant],
        className
      )}
      animate={{
        opacity: [0.5, 0.8, 0.5],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}

/**
 * Skeleton card for loading game cards
 */
export function SkeletonCard() {
  return (
    <div className="glass rounded-card border border-white/10 p-6 space-y-4">
      <Skeleton variant="circular" className="w-12 h-12" />
      <Skeleton variant="text" className="w-3/4" />
      <Skeleton variant="text" className="w-1/2" />
    </div>
  );
}
