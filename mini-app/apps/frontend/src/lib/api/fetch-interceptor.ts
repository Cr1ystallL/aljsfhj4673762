import { useAuthStore } from '@/store/auth-store';

/**
 * Global fetch interceptor for Telegram Mini App
 *
 * In Telegram WebView (iOS/Android), httpOnly cookies can be stripped or dropped
 * across navigations / iframe boundaries. This interceptor ensures that all same-origin
 * calls to `/api/` automatically include:
 * 1. `credentials: 'include'`
 * 2. `Authorization: Bearer <token>` (from Zustand or localStorage)
 * 3. `x-device-id` header
 */

let installed = false;

export function installFetchInterceptor(): void {
  if (typeof window === 'undefined' || installed) return;
  installed = true;

  const originalFetch = window.fetch;

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Only intercept same-origin /api/* calls
    const isApiCall =
      url.startsWith('/api/') ||
      (url.includes('/api/') && !url.startsWith('http://') && !url.startsWith('https://')) ||
      (typeof window !== 'undefined' && url.includes(window.location.host + '/api/'));

    if (isApiCall) {
      const headers = new Headers(
        init?.headers || (typeof input === 'object' && 'headers' in input ? input.headers : {})
      );

      if (!headers.has('Authorization') && !headers.has('authorization')) {
        let token: string | null = null;
        try {
          token = useAuthStore.getState().token;
        } catch {
          token = null;
        }

        if (!token) {
          try {
            token = localStorage.getItem('macvbet_token') || sessionStorage.getItem('macvbet_token');
          } catch {
            token = null;
          }
        }

        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
      }

      if (!headers.has('x-device-id')) {
        try {
          const deviceId = localStorage.getItem('macvbet_deviceId');
          if (deviceId) headers.set('x-device-id', deviceId);
        } catch {}
      }

      if (!headers.has('x-hardware-hash')) {
        try {
          const hwHash = localStorage.getItem('macvbet_hw_hash');
          if (hwHash) headers.set('x-hardware-hash', hwHash);
          const specs = localStorage.getItem('macvbet_device_specs');
          if (specs) headers.set('x-device-specs', encodeURIComponent(specs));
        } catch {}
      }

      return originalFetch.call(this, input, {
        ...init,
        credentials: init?.credentials || 'include',
        headers,
      });
    }

    return originalFetch.call(this, input, init);
  };
}
