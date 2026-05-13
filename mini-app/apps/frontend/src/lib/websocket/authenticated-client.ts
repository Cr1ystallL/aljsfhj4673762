import { WebSocketClient } from './client';
import { useAuthStore } from '@/store/auth-store';
import type { WSMessage } from '@casino/shared';

/**
 * Authenticated WebSocket Client
 * 
 * SECURITY:
 * - Authenticates using sessionId from auth store
 * - Handles authentication errors
 * - Supports reconnection with existing session
 * - Auto-reconnects on connection loss
 */

export class AuthenticatedWebSocketClient extends WebSocketClient {
  private sessionId: string | null = null;
  private authPromise: Promise<boolean> | null = null;

  /**
   * Connect and authenticate
   */
  async connectAuthenticated(sessionId: string): Promise<boolean> {
    this.sessionId = sessionId;
    
    // Connect to WebSocket
    this.connect(''); // Token not needed, we'll use sessionId

    // Wait for connection to open
    await this.waitForConnection();

    // Authenticate
    return this.authenticate();
  }

  /**
   * Wait for WebSocket connection to open
   */
  private waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 5000);

      const checkConnection = () => {
        if (this.getStatus() === 'open') {
          clearTimeout(timeout);
          resolve();
        } else if (this.getStatus() === 'closed') {
          clearTimeout(timeout);
          reject(new Error('Connection failed'));
        } else {
          setTimeout(checkConnection, 100);
        }
      };

      checkConnection();
    });
  }

  /**
   * Authenticate WebSocket connection
   */
  private authenticate(): Promise<boolean> {
    if (this.authPromise) {
      return this.authPromise;
    }

    this.authPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Authentication timeout'));
      }, 10000);

      // Listen for auth response
      const unsubscribe = this.onMessage((message: WSMessage) => {
        if (message.type === 'auth_success') {
          clearTimeout(timeout);
          unsubscribe();
          this.authPromise = null;
          resolve(true);
        } else if (message.type === 'auth_error') {
          clearTimeout(timeout);
          unsubscribe();
          this.authPromise = null;
          reject(new Error((message.payload as any).message || 'Authentication failed'));
        }
      });

      // Send auth message
      this.send({
        type: 'auth',
        payload: {
          sessionId: this.sessionId,
        },
        timestamp: Date.now(),
      });
    });

    return this.authPromise;
  }

  /**
   * Reconnect with authentication
   */
  async reconnect(): Promise<boolean> {
    if (!this.sessionId) {
      throw new Error('No session ID available for reconnection');
    }

    return this.connectAuthenticated(this.sessionId);
  }
}

/**
 * Create authenticated WebSocket client
 */
export function createAuthenticatedWebSocket(wsUrl: string): AuthenticatedWebSocketClient {
  return new AuthenticatedWebSocketClient(wsUrl);
}
