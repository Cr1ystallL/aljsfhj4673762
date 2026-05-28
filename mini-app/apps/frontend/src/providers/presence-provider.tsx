'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';

/**
 * PresenceProvider — отправляет heartbeat на бэкенд, чтобы админ видел
 * «кто сейчас в мини-аппе и какую страницу смотрит».
 *
 * Тикает каждые 20 секунд (TTL ключа в Redis 45 секунд, поэтому
 * запас 2× на пропущенный пинг). Дополнительно бьёт мгновенно при
 * каждой навигации (`pathname` меняется) и когда пользователь
 * возвращает вкладку в видимое состояние — тогда админ моментально
 * видит, что игрок ушёл с одного экрана на другой.
 *
 * Никаких ошибок не выбрасывает: если запрос упал (Redis недоступен,
 * сеть — иначе), мы просто пропускаем тик — присутствие игрока
 * экспоративно затухнет на стороне сервера, и через 45с он исчезнет
 * из списка онлайн.
 */
const HEARTBEAT_INTERVAL_MS = 20_000;

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const pathname = usePathname() ?? '/';

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    const beat = async () => {
      if (cancelled) return;
      try {
        await fetch('/api/presence/heartbeat', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pathname }),
          cache: 'no-store',
          // Низкий приоритет — не должно мешать игровым запросам.
          keepalive: true,
        });
      } catch {
        // intentionally silent
      }
    };

    void beat();
    const id = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void beat();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAuthenticated, pathname]);

  return <>{children}</>;
}
