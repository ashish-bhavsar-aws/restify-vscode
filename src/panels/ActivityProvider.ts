import * as vscode from 'vscode';
import { getBottomViewHtml } from '../webview/bottomViewHtml';

export type ActivityLevel = 'info' | 'warning' | 'error';

export interface ActivityEntry {
  id: string;
  timestamp: string;
  level: ActivityLevel;
  title: string;
  detail?: string;
}

export class ActivityProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private readonly _entries: ActivityEntry[] = [];
  private _enabled = true;

  constructor(private readonly context: vscode.ExtensionContext) {}

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  isEnabled(): boolean {
    return this._enabled;
  }

  public append(
    title: string,
    detail?: string,
    level: ActivityLevel = 'info',
  ): void {
    if (!this._enabled) return;
    const entry: ActivityEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      level,
      title,
      detail,
    };

    this._entries.push(entry);
    if (this._entries.length > 25) {
      this._entries.splice(0, this._entries.length - 25);
    }

    this._view?.webview.postMessage({
      command: 'setEntries',
      entries: this.getEntries(),
    });
  }

  public getEntries(): ActivityEntry[] {
    return [...this._entries].slice(-25);
  }

  public clear(): void {
    this._entries.length = 0;
    this._view?.webview.postMessage({
      command: 'setEntries',
      entries: [],
    });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void | Thenable<void> {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.onDidReceiveMessage((message) => {
      if (message?.command === 'clearEntries') {
        this.clear();
      } else if (message?.command === 'activityReady') {
        webviewView.webview.postMessage({
          command: 'setEntries',
          entries: this.getEntries(),
        });
      }
    });

    webviewView.webview.html = getBottomViewHtml(this.context, webviewView.webview);

    webviewView.onDidDispose(() => {
      if (this._view === webviewView) {
        this._view = undefined;
      }
    });
  }
}
