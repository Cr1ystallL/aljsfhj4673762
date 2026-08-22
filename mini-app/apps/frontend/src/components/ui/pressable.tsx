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
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  onClick,
  ...rest
}: PressableProps) {
  const [pressed, setPressed] = useState(false);
  const armed = useRef(false);

  const down = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      armed.current = true;
      setPressed(true);
      hapticLight();
      onPointerDown?.(e);
    },
    [disabled, onPointerDown]
  );

  const up = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      setPressed(false);
      onPointerUp?.(e);
    },
    [onPointerUp]
  );

  const cancel = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      armed.current = false;
      setPressed(false);
      onPointerCancel?.(e);
    },
    [onPointerCancel]
  );

  const leave = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      setPressed(false);
      onPointerLeave?.(e);
    },
    [onPointerLeave]
  );

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={cancel}
      onPointerLeave={leave}
      onClick={onClick}
      className={cn(
        'transition-transform duration-150 ease-out [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]',
        pressed && !disabled ? 'scale-[0.97]' : 'scale-100',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
