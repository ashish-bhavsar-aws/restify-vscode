import * as vscode from 'vscode';
import {
  WebSocketClient,
  describeWsPayload,
  normalizeWsUrl,
  type WsLogEntry,
} from '../core/websocket';
import { getWebsocketHtml } from '../webview/websocketHtml';
import type { StorageManager } from '../storage/StorageManager';

/**
 * F46 — WebSocket client panel. The socket runs in the extension host (via the
 * `ws` package); frames are streamed to the webview over postMessage so the
 * webview CSP stays locked down (no arbitrary ws:/wss: connections from inside
 * the webview).
 */
export class WebSocketPanel {
  public static readonly viewType = 'restify-websocket';

  public readonly panel: vscode.WebviewPanel;

  private readonly storageManager: StorageManager;
  private readonly onDispose: (instance: WebSocketPanel) => void;

  private client: WebSocketClient | null = null;
  private logId = 0;
  private errorLogged = false;

  constructor(
    context: vscode.ExtensionContext,
    storageManager: StorageManager,
    onDispose: (instance: WebSocketPanel) => void,
  ) {
    this.storageManager = storageManager;
    this.onDispose = onDispose;

    this.panel = vscode.window.createWebviewPanel(
      WebSocketPanel.viewType,
      'WebSocket',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      },
    );

    this.panel.webview.html = getWebsocketHtml(context, this.panel.webview);
    this.panel.webview.onDidReceiveMessage((msg) => {
      this._handleMessage(msg).catch((err) => {
        const error = err instanceof Error ? err.message : String(err);
        this._post({ command: 'wsStatus', state: 'error', error });
        this._log({ direction: 'system', kind: 'error', text: error });
      });
    });
    this.panel.onDidDispose(() => {
      this._closeClient();
      this.onDispose(this);
    });
  }

  private async _handleMessage(msg: any): Promise<void> {
    switch (msg?.command) {
      case 'wsConnect':
        await this._connect(String(msg.url ?? ''));
        break;
      case 'wsDisconnect':
        this._disconnect();
        break;
      case 'wsSend':
        this._send(String(msg.data ?? ''), msg.binary === true);
        break;
      default:
        break;
    }
  }

  private async _connect(rawUrl: string): Promise<void> {
    this._closeClient();
    this.errorLogged = false;
    this._post({ command: 'wsClear' });

    const url = normalizeWsUrl(
      await this.storageManager.resolveVariables(rawUrl, 'ws-panel')
    );
    this._log({ direction: 'system', kind: 'system', text: `Connecting to ${url}…` });
    this._post({ command: 'wsStatus', state: 'connecting' });

    const client = new WebSocketClient(
      url,
      {
        onOpen: (protocol) => {
          this._post({ command: 'wsStatus', state: 'connected', protocol });
          this._log({
            direction: 'system',
            kind: 'system',
            text: `Connected${protocol ? ` (${protocol})` : ''}`,
          });
        },
        onMessage: (kind, data) => {
          this._log({ direction: 'in', kind, ...describeWsPayload(kind, data) });
        },
        onClose: (code, reason) => {
          this._post({
            command: 'wsStatus',
            state: 'closed',
            code,
            reason,
          });
          if (!this.errorLogged) {
            this._log({
              direction: 'system',
              kind: 'system',
              text: `Connection closed${reason ? ` — ${reason}` : ''} (code ${code})`,
            });
          }
        },
        onError: (err) => {
          this.errorLogged = true;
          this._log({ direction: 'system', kind: 'error', text: err.message });
          this._post({ command: 'wsStatus', state: 'error', error: err.message });
        },
      },
      { timeoutMs: 10000 },
    );
    this.client = client;

    const result = await client.connect();
    if (!result.ok && result.error && !this.errorLogged) {
      this.errorLogged = true;
      this._log({ direction: 'system', kind: 'error', text: result.error });
      this._post({ command: 'wsStatus', state: 'error', error: result.error });
    }
    if (!result.ok && this.client === client) this.client = null;
  }

  private _disconnect(): void {
    if (!this.client) return;
    const client = this.client;
    this.client = null;
    client.close(1000, 'Disconnected by user');
  }

  private _send(data: string, binary: boolean): void {
    if (!this.client || !this.client.isOpen) return;
    const buf = Buffer.from(data, 'utf8');
    try {
      if (binary) {
        this.client.sendBinary(buf);
      } else {
        this.client.sendText(data);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this._log({ direction: 'system', kind: 'error', text: error });
      return;
    }
    this._log({
      direction: 'out',
      kind: binary ? 'binary' : 'text',
      ...describeWsPayload(binary ? 'binary' : 'text', buf),
    });
  }

  private _closeClient(): void {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }

  private _log(entry: Omit<WsLogEntry, 'id' | 'ts'>): void {
    this._post({
      command: 'wsLog',
      entry: { ...entry, id: ++this.logId, ts: Date.now() },
    });
  }

  private _post(message: any): void {
    try {
      this.panel.webview.postMessage(message);
    } catch {
      /* panel disposed */
    }
  }
}
