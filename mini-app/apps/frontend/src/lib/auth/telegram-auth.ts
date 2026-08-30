/**
 * Telegram Authentication Client
 * 
 * SECURITY:
 * - Sends initData to backend for server-side validation
 * - Never trusts client-side Telegram data
 * - Uses httpOnly cookies for session management
 */

import { apiClient } from '../api/client';

export interface TelegramAuthResponse {
  success: boolean;
  sessionId: string;
  accessToken?: string;
  user: {
    id: string;
    telegramId: number;
    username?: string;
    firstName?: string;
    lastName?: string;
    isPremium: boolean;
  };
}

/**
 * Authenticate using Telegram Mini App
 * 
 * SECURITY: initData is validated server-side using HMAC-SHA256
 */
export async function authenticateWithTelegram(
  initData: string
): Promise<TelegramAuthResponse> {
  return apiClient.post<TelegramAuthResponse>('/api/auth/telegram', {
    initData,
  });
}

/**
 * Authenticate using Telegram Login Widget (web fallback)
 */
export async function authenticateWithTelegramWeb(
  authData: Record<string, string>
): Promise<TelegramAuthResponse> {
  return apiClient.post<TelegramAuthResponse>('/api/auth/web', authData);
}

/**
 * Refresh access token
 * 
 * SECURITY: Uses httpOnly refresh token cookie
 */
export async function refreshAccessToken(): Promise<{ success: boolean }> {
  return apiClient.post<{ success: boolean }>('/api/auth/refresh', {});
}

/**
 * Get current user
 */
export async function getCurrentUser() {
  return apiClient.get('/api/auth/me');
}

/**
 * Logout
 */
export async function logout(): Promise<{ success: boolean }> {
  return apiClient.post<{ success: boolean }>('/api/auth/logout', {});
}

/**
 * Logout from all devices
 */
export async function logoutAll(): Promise<{ success: boolean }> {
  return apiClient.post<{ success: boolean }>('/api/auth/logout-all', {});
}

/**
 * Get all active sessions
 */
export async function getSessions() {
  return apiClient.get('/api/auth/sessions');
}
