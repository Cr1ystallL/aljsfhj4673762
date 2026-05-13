'use client';

import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'text';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Button Component - Monopo Saigon Style
 * 
 * DESIGN:
 * - Pill-shaped (75.024px radius)
 * - Glassmorphic with subtle borders
 * - Smooth, premium interactions
 * - No harsh shadows, depth via gradients
 */
export function Button({ 
  children, 
  variant = 'primary',
  size = 'md',
  className,
  ...props 
}: ButtonProps) {
  const baseStyles = 'rounded-pill font-roobert font-normal transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center';
  
  const variants = {
    primary: 'bg-white/10 text-frost-white border border-white/20 hover:bg-white/15 hover:border-white/30 backdrop-blur-xl',
    secondary: 'bg-misty-gray/78 text-frost-white border border-frost-white/30 hover:bg-misty-gray hover:border-frost-white/50 backdrop-blur-xl',
    ghost: 'bg-transparent text-frost-white border border-white/30 border-t hover:bg-white/5 hover:border-white/40',
    text: 'bg-transparent text-frost-white hover:text-white/80 px-0 py-0',
  };
  
  const sizes = {
    sm: 'px-4 py-2 text-caption',
    md: 'px-6 py-3 text-body',
    lg: 'px-8 py-4 text-subheading',
  };
  
  return (
    <motion.button
      className={cn(baseStyles, variants[variant], variant !== 'text' && sizes[size], className)}
      whileHover={{ scale: props.disabled ? 1 : 1.02 }}
      whileTap={{ scale: props.disabled ? 1 : 0.98 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
