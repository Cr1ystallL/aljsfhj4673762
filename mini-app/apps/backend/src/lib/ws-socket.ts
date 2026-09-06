/**
 * Minimal socket shape used by our WS routes.
 * Avoids `import type { WebSocket } from 'ws'` so `tsc` works when
 * NODE_ENV=production skipped @types/ws (devDependency).
 */
export interface WsSocket {
  readyState: number;
  send(data: string | Buffer, cb?: (err?: Error) => void): void;
  close(code?: number, reason?: string): void;
  on(event: 'message', listener: (message: Buffer) => void): this;
  on(event: 'close', listener: (...args: unknown[]) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: string, listener: (...args: unknown[]) => void): this;
}
