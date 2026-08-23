'use client';

import {
  useCallback,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

/**
 * Pressable — feedback on pointer-down, not on click.
 * Critically damped scale, cancel if the finger walks away.
 */

interface PressableProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

function hapticLight() {
  try {
    (
      window as unknown as {
        Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred?: (s: string) => void } } };
      }
    ).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light');
  } catch {
    // ignore
  }
}

export function Pressable({
  children,
  className,
  disabled,
  onPointerDown,
  onClick,
  ...rest
}: PressableProps) {
  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      hapticLight();
      onPointerDown?.(e);
    },
    [disabled, onPointerDown]
  );

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onClick={onClick}
      className={cn(
        'transition-transform duration-100 ease-out active:scale-[0.97] touch-manipulation select-none [transform:translateZ(0)]',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
