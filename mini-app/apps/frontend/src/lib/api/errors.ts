import { toast } from '@/store/toast-store';
import { tNow } from '@/i18n/use-t';

/**
 * Centralised mapping from a server error payload to a user-facing
 * notification. Any UI handler that calls a JSON API can pass the
 * raw `Response` and (optionally) the parsed body to this helper to
 * surface a sensible Russian-language toast — and also returns the
 * error message so the caller can short-circuit on it.
 *
 * The server uses a few well-known error codes; the rest fall back to
 * either `message`, `error` or a generic phrase. Specific status
 * codes also get sane defaults:
 *
 *   401 → "Войдите в аккаунт ещё раз"
 *   403 → "Действие запрещено администратором"
 *   429 → "Слишком много запросов, подождите секунду"
 *   500 → "Внутренняя ошибка сервера"
 *
 * For 400-class errors we prefer the server-provided message because
 * those are nearly always shaped for end-user consumption (e.g.
 * "Insufficient balance").
 */

interface ApiErrorBody {
  error?: string;
  message?: string;
  code?: string;
}

const FRIENDLY: Record<string, { kind: 'error' | 'warn'; key: 'errors.insufficientBalance' | 'errors.accountBlocked' | 'errors.withdrawalLocked' | 'errors.rateLimit' | 'errors.gamePaused' }> = {
  INSUFFICIENT_BALANCE: {
    kind: 'warn',
    key: 'errors.insufficientBalance',
  },
  ACCOUNT_BLOCKED: {
    kind: 'error',
    key: 'errors.accountBlocked',
  },
  WITHDRAWAL_LOCKED: {
    kind: 'error',
    key: 'errors.withdrawalLocked',
  },
  RATE_LIMIT_EXCEEDED: {
    kind: 'warn',
    key: 'errors.rateLimit',
  },
  GAME_PAUSED: {
    kind: 'warn',
    key: 'errors.gamePaused',
  },
};

/** Translate frequent Russian server messages to a typed `code`. */
function inferCode(text: string): string | null {
  const v = text.toLowerCase();
  if (v.includes('insufficient') || v.includes('недостаточно')) {
    return 'INSUFFICIENT_BALANCE';
  }
  if (v.includes('аккаунт заблокирован')) {
    return 'ACCOUNT_BLOCKED';
  }
  if (v.includes('вывод временно')) {
    return 'WITHDRAWAL_LOCKED';
  }
  if (v.includes('rate limit') || v.includes('запросов')) {
    return 'RATE_LIMIT_EXCEEDED';
  }
  if (v.includes('приостановлена') || v.includes('paused')) {
    return 'GAME_PAUSED';
  }
  return null;
}

/**
 * Дёргаем синхронизацию баланса прямо из обработки ошибок: если
 * сервер сказал «недостаточно средств», значит наш закэшированный
 * баланс отстал от истины (обычно — игрок только что списал в боте).
 * BalanceSyncProvider слушает этот ивент и моментально перезапрашивает
 * /api/balance, чтобы пилюля наверху показала правильную сумму
 * раньше, чем игрок успеет ткнуть «играть» ещё раз.
 */
function dispatchBalanceForceSync() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event('balance:force-sync'));
  } catch {
    /* noop — старые движки без CustomEvent выпадут отсюда тихо */
  }
}

/**
 * Show a toast for the given API failure and return the human-readable
 * message. Pass either the `Response` (for status-code defaults) and
 * the parsed body, or a thrown `Error` from a fetch call.
 */
export function reportApiError(
  res: Response | null,
  body: ApiErrorBody | null,
  fallback?: string
): string {
  // Prefer an explicit code → friendly map.
  const explicitCode = body?.code ?? null;
  if (explicitCode && FRIENDLY[explicitCode]) {
    const m = FRIENDLY[explicitCode];
    const text = tNow(m.key);
    toast[m.kind](text);
    if (explicitCode === 'INSUFFICIENT_BALANCE') dispatchBalanceForceSync();
    return text;
  }

  // Otherwise look at the message text.
  const text =
    body?.message?.trim() || body?.error?.trim() || fallback || '';
  const inferred = text ? inferCode(text) : null;
  if (inferred && FRIENDLY[inferred]) {
    const m = FRIENDLY[inferred];
    const text = tNow(m.key);
    toast[m.kind](text);
    if (inferred === 'INSUFFICIENT_BALANCE') dispatchBalanceForceSync();
    return text;
  }
  if (text) {
    // Server-provided message — show it verbatim.
    toast.error(text);
    return text;
  }

  // Status-code fallback.
  const status = res?.status ?? 0;
  let msg = fallback || tNow('errors.generic');
  if (status === 401) msg = tNow('errors.unauthorized');
  else if (status === 403) msg = tNow('errors.forbidden');
  else if (status === 429) msg = tNow('errors.rateLimit');
  else if (status >= 500) msg = tNow('errors.server');
  toast.error(msg);
  return msg;
}

/**
 * Convenience: do an authenticated fetch and either return parsed
 * JSON, or surface a toast and throw on failure. Use only for action
 * handlers — not for data loaders where transient errors are okay.
 */
export async function apiAction<T = unknown>(
  url: string,
  init: RequestInit & { fallback?: string } = {}
): Promise<T> {
  let res: Response;
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((init.headers as Record<string, string>) ?? {}),
    };
    if (!headers['Authorization'] && !headers['authorization']) {
      let token: string | null = null;
      try {
        const { useAuthStore } = await import('@/store/auth-store');
        token = useAuthStore.getState().token;
      } catch {}
      if (!token && typeof window !== 'undefined') {
        token = localStorage.getItem('macvbet_token') || sessionStorage.getItem('macvbet_token');
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    res = await fetch(url, {
      credentials: 'include',
      headers,
      ...init,
    });
  } catch {
    toast.error(tNow('errors.network'));
    throw new Error('network');
  }

  let body: ApiErrorBody | null = null;
  let parsed: unknown = null;
  try {
    parsed = await res.json();
    body = parsed as ApiErrorBody;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const msg = reportApiError(res, body, init.fallback);
    throw new Error(msg);
  }
  return parsed as T;
}
