import { APP_CONFIG } from '@casino/shared';
import type { WSMessage } from '@casino/shared';

/**
 * WebSocket client for real-time communication
 * Handles connection, reconnection, and message routing
 * 
 * Implementation will be completed in Phase 2
 */

type MessageHandler = (message: WSMessage) => void;
type DisconnectHandler = () => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private disconnectHandlers: Set<DisconnectHandler> = new Set();
  private isIntentionallyClosed = false;

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Connect to WebSocket server
   */
  connect(token: string): void {
    this.token = token;
    this.isIntentionallyClosed = false;
    this.createConnection();
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.isIntentionallyClosed = true;
    this.cleanup();
  }

  /**
   * Send message to server
   */
  send(message: WSMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.warn('WebSocket not connected, message not sent:', message);
      }
    }
  }

  /**
   * Subscribe to messages
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    
    // Return unsubscribe function
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  /**
   * Subscribe to disconnect events
   */
  onDisconnect(handler: DisconnectHandler): () => void {
    this.disconnectHandlers.add(handler);
    
    // Return unsubscribe function
    return () => {
      this.disconnectHandlers.delete(handler);
    };
  }

  /**
   * Create WebSocket connection
   */
  private createConnection(): void {
    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
    } catch (error) {
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.error('Failed to create WebSocket connection:', error);
      }
      this.scheduleReconnect();
    }
  }

  /**
   * Get connection status
   */
  getStatus(): 'connecting' | 'open' | 'closing' | 'closed' {
    if (!this.ws) return 'closed';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'open';
      case WebSocket.CLOSING:
        return 'closing';
      case WebSocket.CLOSED:
        return 'closed';
      default:
        return 'closed';
    }
  }

  /**
   * Handle connection open
   */
  private handleOpen(): void {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.log('WebSocket connected');
    }
    this.reconnectAttempts = 0;
    
    // Note: Authentication is handled by AuthenticatedWebSocketClient, not here
    // to avoid conflicts with sessionId-based auth vs token-based auth
    
    // Start heartbeat
    this.startHeartbeat();
  }

  /**
   * Handle incoming message
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message: WSMessage = JSON.parse(event.data);
      
      // Notify all handlers
      this.messageHandlers.forEach((handler) => {
        try {
          handler(message);
        } catch (error) {
          if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
            console.error('Message handler error:', error);
          }
        }
      });
    } catch (error) {
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.error('Failed to parse WebSocket message:', error);
      }
    }
  }

  /**
   * Handle connection error
   */
  private handleError(event: Event): void {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.error('WebSocket error:', event);
    }
  }

  /**
   * Handle connection close
   */
  private handleClose(): void {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.log('WebSocket disconnected');
    }
    
    // Notify disconnect handlers
    this.disconnectHandlers.forEach((handler) => {
      try {
        handler();
      } catch (error) {
        if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
          console.error('Disconnect handler error:', error);
        }
      }
    });
    
    this.cleanup();
    
    if (!this.isIntentionallyClosed) {
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= APP_CONFIG.WS_MAX_RECONNECT_ATTEMPTS) {
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.error('Max reconnection attempts reached');
      }
      return;
    }
    
    this.reconnectAttempts++;
    
    const delay = APP_CONFIG.WS_RECONNECT_DELAY_MS * this.reconnectAttempts;
    
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    }
    
    this.reconnectTimeout = setTimeout(() => {
      this.createConnection();
    }, delay);
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.send({
        type: 'ping',
        payload: {},
        timestamp: Date.now(),
      });
    }, APP_CONFIG.WS_HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
