import { toast } from '@/store/toast-store';

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

const FRIENDLY: Record<string, { kind: 'error' | 'warn'; text: string }> = {
  INSUFFICIENT_BALANCE: {
    kind: 'warn',
    text: 'Недостаточно средств на балансе',
  },
  ACCOUNT_BLOCKED: {
    kind: 'error',
    text: 'Аккаунт заблокирован администратором',
  },
  WITHDRAWAL_LOCKED: {
    kind: 'error',
    text: 'Вывод временно заблокирован администратором',
  },
  RATE_LIMIT_EXCEEDED: {
    kind: 'warn',
    text: 'Слишком много запросов, подождите секунду',
  },
  GAME_PAUSED: {
    kind: 'warn',
    text: 'Игра временно приостановлена администратором',
  },
};

/** Translate frequent Russian server messages to a typed `code`. */
function inferCode(text: string): string | null {
  const v = text.toLowerCase();
  if (v.includes('insufficient') || v.includes('недостаточно')) {
    return 'INSUFFICIENT_BALANCE';
  }
  if (v.includes('заблокирован')) {
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
    toast[m.kind](m.text);
    if (explicitCode === 'INSUFFICIENT_BALANCE') dispatchBalanceForceSync();
    return m.text;
  }

  // Otherwise look at the message text.
  const text =
    body?.message?.trim() || body?.error?.trim() || fallback || '';
  const inferred = text ? inferCode(text) : null;
  if (inferred && FRIENDLY[inferred]) {
    const m = FRIENDLY[inferred];
    toast[m.kind](m.text);
    if (inferred === 'INSUFFICIENT_BALANCE') dispatchBalanceForceSync();
    return m.text;
  }
  if (text) {
    // Server-provided message — show it verbatim.
    toast.error(text);
    return text;
  }

  // Status-code fallback.
  const status = res?.status ?? 0;
  let msg = fallback || 'Что-то пошло не так. Попробуйте ещё раз.';
  if (status === 401) msg = 'Войдите в аккаунт ещё раз';
  else if (status === 403) msg = 'Действие запрещено администратором';
  else if (status === 429) msg = 'Слишком много запросов, подождите секунду';
  else if (status >= 500) msg = 'Внутренняя ошибка сервера, попробуйте позже';
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
    res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      ...init,
    });
  } catch {
    toast.error('Сетевая ошибка. Проверьте подключение.');
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
