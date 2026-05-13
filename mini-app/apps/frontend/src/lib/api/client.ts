/**
 * API client for HTTP requests to backend
 * Handles authentication, error handling, and request/response formatting
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds

interface RequestOptions extends RequestInit {
  token?: string;
  timeout?: number;
}

class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * Create abort controller with timeout
 */
function createAbortController(timeoutMs: number): AbortController {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller;
}

/**
 * Base API client
 */
export class APIClient {
  private baseURL: string;

  constructor(baseURL: string = API_URL) {
    this.baseURL = baseURL;
  }

  /**
   * Make HTTP request
   */
  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { token, timeout = REQUEST_TIMEOUT_MS, ...fetchOptions } = options;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Create abort controller for timeout
    const controller = createAbortController(timeout);

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new APIError(
          data.message || 'Request failed',
          response.status,
          data.code
        );
      }

      return data;
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }

      // Handle abort/timeout
      if (error instanceof Error && error.name === 'AbortError') {
        throw new APIError('Request timeout', 408);
      }
      
      throw new APIError(
        error instanceof Error ? error.message : 'Network error',
        0
      );
    }
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * PUT request
   */
  async put<T>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new APIClient();
