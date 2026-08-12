/**
 * F46 (unified) — per-tab WebSocket sessions for the main panel.
 *
 * The socket runs in the extension host (via the `ws` package) so the webview
 * CSP stays locked down (no arbitrary ws:/wss: connections from inside the
 * webview). Frames are streamed to the webview over postMessage scoped by
 * tabId. Token auth is applied to the handshake as an `Authorization` header.
 */
import { errorMsg } from "../core";
import {
  WebSocketClient,
  describeWsPayload,
  normalizeWsUrl,
  type WsLogEntry,
} from "../core/websocket";

interface Session {
  client: WebSocketClient;
  logId: number;
  errorLogged: boolean;
}

export class WsSessionManager {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly post: (message: any) => void,
    private readonly resolveVars: (raw: string) => string,
  ) {}

  handleMessage(msg: any): void {
    const tabId = String(msg?.tabId ?? "");
    switch (msg?.command) {
      case "wsConnect":
        this._connect(tabId, String(msg.url ?? ""), String(msg.token ?? "")).catch(
          (err) => {
            const error = errorMsg(err);
            this._log(tabId, { direction: "system", kind: "error", text: error });
          },
        );
        break;
      case "wsDisconnect":
        this._disconnect(tabId);
        break;
      case "wsSend":
        this._send(tabId, String(msg.data ?? ""), msg.binary === true);
        break;
      default:
        break;
    }
  }

  disconnectTab(tabId: string): void {
    this._disconnect(tabId);
  }

  closeAll(): void {
    for (const tabId of [...this.sessions.keys()]) {
      this._disconnect(tabId);
    }
  }

  private async _connect(tabId: string, rawUrl: string, token: string): Promise<void> {
    this._disconnect(tabId);
    this._post(tabId, { command: "wsClear", tabId });

    const url = normalizeWsUrl(this.resolveVars(rawUrl));
    const tokenResolved = this.resolveVars(token).trim();
    const headers: Record<string, string> | undefined = tokenResolved
      ? { Authorization: `Bearer ${tokenResolved}` }
      : undefined;

    this._log(tabId, {
      direction: "system",
      kind: "system",
      text: `Connecting to ${url}${tokenResolved ? " with Bearer token" : ""}…`,
    });
    this._post(tabId, { command: "wsStatus", tabId, state: "connecting" });

    const client = new WebSocketClient(
      url,
      {
        onOpen: (protocol) => {
          this._post(tabId, { command: "wsStatus", tabId, state: "connected", protocol });
          this._log(tabId, {
            direction: "system",
            kind: "system",
            text: `Connected${protocol ? ` (${protocol})` : ""}`,
          });
        },
        onMessage: (kind, data) => {
          this._log(tabId, {
            direction: "in",
            kind,
            ...describeWsPayload(kind, data),
          });
        },
        onClose: (code, reason) => {
          this._post(tabId, {
            command: "wsStatus",
            tabId,
            state: "closed",
            code,
            reason,
          });
          const session = this.sessions.get(tabId);
          if (session && !session.errorLogged) {
            this._log(tabId, {
              direction: "system",
              kind: "system",
              text: `Connection closed${reason ? ` — ${reason}` : ""} (code ${code})`,
            });
          }
        },
        onError: (err) => {
          const session = this.sessions.get(tabId);
          if (session) session.errorLogged = true;
          this._log(tabId, { direction: "system", kind: "error", text: err.message });
          this._post(tabId, { command: "wsStatus", tabId, state: "error", error: err.message });
        },
      },
      { timeoutMs: 10000, headers },
    );
    this.sessions.set(tabId, { client, logId: 0, errorLogged: false });

    const result = await client.connect();
    const session = this.sessions.get(tabId);
    if (!result.ok && result.error && session && !session.errorLogged) {
      session.errorLogged = true;
      this._log(tabId, { direction: "system", kind: "error", text: result.error });
      this._post(tabId, { command: "wsStatus", tabId, state: "error", error: result.error });
    }
    if (!result.ok && this.sessions.get(tabId)?.client === client) {
      this.sessions.delete(tabId);
    }
  }

  private _disconnect(tabId: string): void {
    const session = this.sessions.get(tabId);
    if (!session) return;
    this.sessions.delete(tabId);
    session.client.close(1000, "Disconnected by user");
  }

  private _send(tabId: string, data: string, binary: boolean): void {
    const session = this.sessions.get(tabId);
    if (!session || !session.client.isOpen) return;
    const buf = Buffer.from(data, "utf8");
    try {
      if (binary) session.client.sendBinary(buf);
      else session.client.sendText(data);
    } catch (err) {
      const error = errorMsg(err);
      this._log(tabId, { direction: "system", kind: "error", text: error });
      return;
    }
    this._log(tabId, {
      direction: "out",
      kind: binary ? "binary" : "text",
      ...describeWsPayload(binary ? "binary" : "text", buf),
    });
  }

  private _log(tabId: string, entry: Omit<WsLogEntry, "id" | "ts">): void {
    const session = this.sessions.get(tabId);
    const id = session ? ++session.logId : 1;
    this._post(tabId, {
      command: "wsLog",
      tabId,
      entry: { ...entry, id, ts: Date.now() },
    });
  }

  private _post(tabId: string, message: any): void {
    try {
      this.post({ ...message, tabId });
    } catch {
      /* panel disposed */
    }
  }
}
