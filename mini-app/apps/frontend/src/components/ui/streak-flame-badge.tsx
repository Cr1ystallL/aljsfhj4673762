'use client';

import { cn } from '@/lib/utils';

interface StreakFlameBadgeProps {
  streak?: number | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function StreakFlameBadge({
  streak,
  size = 'md',
  className = '',
}: StreakFlameBadgeProps) {
  if (!streak || streak <= 0) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-roobert font-extrabold tracking-tight select-none shadow-sm transition-all shrink-0',
        'bg-gradient-to-r from-orange-500/25 via-red-500/20 to-amber-500/25 border border-orange-500/45 text-orange-300',
        'shadow-[0_0_12px_rgba(249,115,22,0.35)]',
        size === 'sm'
          ? 'px-1.5 py-0.5 text-[10px]'
          : size === 'lg'
          ? 'px-2.5 py-1 text-[13px]'
          : 'px-2 py-0.5 text-[11px]',
        className
      )}
      title={`Серия побед: ${streak}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={cn(
          'text-orange-400 drop-shadow-[0_0_6px_rgba(249,115,22,0.8)] shrink-0',
          size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-4 h-4' : 'w-3.5 h-3.5'
        )}
      >
        <path d="M12 2C8.5 7 13 10 11 14C10.5 12.5 9 11.5 8 11.5C6 14.5 7 18 10 20.5C6.5 19.5 5 16 5.5 13.5C3.5 16.5 4 21 8.5 22C14.5 23.5 19 19.5 19 14C19 8.5 14.5 5.5 12 2Z" />
      </svg>
      <span className="font-mono font-bold leading-none">{streak}</span>
    </span>
  );
}
