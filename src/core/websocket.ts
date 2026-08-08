/**
 * F46 — WebSocket client primitives.
 *
 * Pure helpers (normalizeWsUrl, describeWsPayload) live here so they are
 * unit-testable without VS Code, plus a thin `WebSocketClient` wrapper around
 * the `ws` package that the host panel drives (connect / send / close) and
 * observes via callbacks.
 */
import WebSocket from 'ws';

export type WsMessageKind = 'text' | 'binary';
export type WsLogDirection = 'in' | 'out' | 'system';

export interface WsLogEntry {
  id: number;
  ts: number;
  direction: WsLogDirection;
  kind: 'text' | 'binary' | 'system' | 'error';
  text?: string;
  hex?: string;
  byteLength?: number;
}

export interface WsClientCallbacks {
  onOpen: (protocol: string) => void;
  onMessage: (kind: WsMessageKind, data: Buffer) => void;
  onClose: (code: number, reason: string) => void;
  onError: (error: Error) => void;
}

/** Default to a sensible scheme when the user omits it. */
export function normalizeWsUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return url;
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url);
  if (!hasScheme) {
    const isLocalhost = /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?)([/:]|$)/.test(url);
    url = `${isLocalhost ? 'ws://' : 'wss://'}${url}`;
  } else {
    url = url.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  }
  return url;
}

/** Describe a received/sent payload for display in the message log. */
export function describeWsPayload(
  kind: WsMessageKind,
  data: Buffer
): { text?: string; hex?: string; byteLength: number } {
  const byteLength = data.length;
  if (kind === 'text') {
    return { text: data.toString('utf8'), byteLength };
  }
  return { hex: data.toString('hex'), byteLength };
}

function toBuffer(data: WebSocket.RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data.map((d) => Buffer.from(d)));
  return Buffer.from(data as ArrayBuffer);
}

export interface WsConnectOptions {
  headers?: Record<string, string>;
  protocols?: string[];
  timeoutMs?: number;
}

export interface WsConnectResult {
  ok: boolean;
  error?: string;
}

/**
 * Thin wrapper around `ws`. `connect()` resolves once the socket opens (or
 * rejects-style resolves with `ok:false` on timeout/error before open). Events
 * after a successful connect flow through the callbacks.
 */
export class WebSocketClient {
  private socket: WebSocket | null = null;

  constructor(
    private readonly url: string,
    private readonly callbacks: WsClientCallbacks,
    private readonly options: WsConnectOptions = {}
  ) {}

  get isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  connect(): Promise<WsConnectResult> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: WsConnectResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      };

      let socket: WebSocket;
      try {
        socket = new WebSocket(this.url, {
          headers: this.options.headers,
          handshakeTimeout: this.options.timeoutMs,
          ...(this.options.protocols && this.options.protocols.length
            ? { protocols: this.options.protocols }
            : {}),
        });
      } catch (err) {
        finish({ ok: false, error: err instanceof Error ? err.message : String(err) });
        return;
      }
      this.socket = socket;

      const timeout = setTimeout(() => {
        this._destroy();
        finish({ ok: false, error: 'Connection timed out' });
      }, this.options.timeoutMs ?? 10000);

      socket.on('open', () => {
        finish({ ok: true });
        this.callbacks.onOpen(socket.protocol);
      });
      socket.on('message', (data, isBinary) => {
        this.callbacks.onMessage(isBinary ? 'binary' : 'text', toBuffer(data));
      });
      socket.on('error', (err) => {
        finish({ ok: false, error: err.message });
        this.callbacks.onError(err);
      });
      socket.on('close', (code, reason) => {
        finish({ ok: false, error: 'Connection closed' });
        this.socket = null;
        this.callbacks.onClose(code, reason.toString());
      });
    });
  }

  sendText(text: string): void {
    this.socket?.send(text);
  }

  sendBinary(data: Buffer): void {
    this.socket?.send(data);
  }

  close(code?: number, reason?: string): void {
    try {
      this.socket?.close(code, reason);
    } catch {
      /* already closed */
    }
  }

  private _destroy(): void {
    try {
      this.socket?.terminate();
    } catch {
      /* already gone */
    }
  }
}
