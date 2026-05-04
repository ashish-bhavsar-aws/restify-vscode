import * as vscode from 'vscode';
import { StorageManager } from '../storage/StorageManager';
import { getSidebarHtml } from '../webview/sidebarHtml';

type SidebarType = 'history' | 'collections';

export class SidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(
    private context: vscode.ExtensionContext,
    private type: SidebarType,
    private storageManager: StorageManager
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = getSidebarHtml(
      this.type,
      this.context,
      webviewView.webview
    );
    this._sendData();

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.command) {
        case 'loadRequest':
          vscode.commands.executeCommand('restify.openFromSidebar', {
            ...msg.data,
            _collectionName: msg.collectionName ?? null,
          });
          break;
        case 'loadHistoryItem': {
          // Use getHistoryItem to hydrate any body files stored on disk
          const entry = (this.storageManager as any).getHistoryItem
            ? (this.storageManager as any).getHistoryItem(msg.id)
            : this.storageManager.getHistory().find((h) => h.id === msg.id);
          if (entry) {
            vscode.commands.executeCommand('restify.openFromSidebar', entry.request || entry);
          }
          break;
        }
        case 'deleteHistoryItem':
          this.storageManager.deleteHistoryItem(msg.id);
          break;
        case 'clearHistory':
          vscode.window
            .showWarningMessage(
              'Are you sure you want to clear all history?',
              'Yes',
              'Cancel'
            )
            .then((selection) => {
              if (selection === 'Yes') {
                this.storageManager.clearHistory();
              }
            });
          break;
        case 'saveCollection':
          this.storageManager.saveCollection(msg.data);
          break;
        case 'deleteCollection': {
          const cols = this.storageManager.getCollections();
          const found = cols.find((c) => String(c.id) === String(msg.id));
          if (!found) break;
          vscode.window.showWarningMessage(
            `Delete collection "${found.name}"? This cannot be undone.`,
            'Delete', 'Cancel'
          ).then((sel) => { if (sel === 'Delete') this.storageManager.deleteCollection(msg.id); });
          break;
        }
        case 'deleteCollectionRequest': {
          const cols = this.storageManager.getCollections();
          const col = cols.find((c) => String(c.id) === String(msg.collectionId));
          if (!col) break;
          const req = (col.requests || []).find((r: any) => String(r.id) === String(msg.requestId));
          if (!req) break;
          this.storageManager.deleteRequestFromCollection(msg.collectionId, msg.requestId);
          break;
        }
        case 'copyCollectionRequest': {
          const cols = this.storageManager.getCollections();
          const srcCol = cols.find((c) => c.id === msg.collectionId);
          if (srcCol?.requests) {
            const original = srcCol.requests.find((r: any) => r.id === msg.requestId);
            if (original) {
              const { id: _id, ...rest } = original;
              this.storageManager.addRequestToCollection(msg.collectionId, {
                ...rest,
                name: `Copy of ${rest.name || 'Untitled'}`,
              });
            }
          }
          break;
        }
        case 'moveCollectionRequest': {
          const allCols = this.storageManager.getCollections();
          const fromCol = allCols.find((c) => c.id === msg.fromCollectionId);
          if (fromCol?.requests && msg.fromCollectionId !== msg.toCollectionId) {
            const request = fromCol.requests.find((r: any) => r.id === msg.requestId);
            if (request) {
              this.storageManager.deleteRequestFromCollection(msg.fromCollectionId, msg.requestId);
              this.storageManager.addRequestToCollection(msg.toCollectionId, { ...request });
            }
          }
          break;
        }
        case 'reorderCollectionRequest': {
          const cols = this.storageManager.getCollections();
          const col = cols.find((c) => c.id === msg.collectionId);
          if (col?.requests) {
            const fromIdx = col.requests.findIndex((r: any) => r.id === msg.requestId);
            if (fromIdx !== -1) {
              const [item] = col.requests.splice(fromIdx, 1);
              const insertAt = Math.min(Math.max(msg.toIndex > fromIdx ? msg.toIndex - 1 : msg.toIndex, 0), col.requests.length);
              col.requests.splice(insertAt, 0, item);
              this.storageManager.saveCollection(col);
            }
          }
          break;
        }
        case 'renameCollection': {
          const cols = this.storageManager.getCollections();
          const col = cols.find((c) => c.id === msg.id);
          if (col && msg.name?.trim()) {
            col.name = msg.name.trim();
            this.storageManager.saveCollection(col);
          }
          break;
        }
        case 'renameCollectionRequest': {
          const cols = this.storageManager.getCollections();
          const col = cols.find((c) => c.id === msg.collectionId);
          if (col?.requests) {
            const req = col.requests.find((r: any) => r.id === msg.requestId);
            if (req && msg.name?.trim()) {
              req.name = msg.name.trim();
              this.storageManager.saveCollection(col);
            }
          }
          break;
        }
        case 'saveHistoryToCollection': {
          const entry = this.storageManager.getHistory().find((h) => h.id === msg.id);
          if (entry) {
            const reqData = (entry as any).request || entry;
            const collections = this.storageManager.getCollections();
            let col = collections.find((c) => c.name === msg.collectionName);
            if (!col) {
              const newCol = { id: Date.now().toString(), name: msg.collectionName, requests: [] };
              this.storageManager.saveCollection(newCol);
              col = this.storageManager.getCollections().find((c) => c.name === msg.collectionName);
            }
            if (col) {
              const { id: _id, ...rest } = reqData;
              this.storageManager.addRequestToCollection(col.id, rest);
              vscode.window.showInformationMessage(`✓ Saved to collection "${msg.collectionName}"`);
            }
          }
          break;
        }
        case 'exportCollections': {
          const data = JSON.stringify(this.storageManager.getCollections(), null, 2);
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('restify-collections.json'),
            filters: { 'JSON': ['json'] },
          });
          if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(data, 'utf8'));
            vscode.window.showInformationMessage('✓ Collections exported');
          }
          break;
        }
        case 'importCollections': {
          const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { 'JSON': ['json'] },
            openLabel: 'Import',
          });
          if (uris && uris[0]) {
            const raw = Buffer.from(await vscode.workspace.fs.readFile(uris[0])).toString('utf8');
            try {
              const imported = JSON.parse(raw);
              const cols: any[] = Array.isArray(imported) ? imported : [];
              let count = 0;
              for (const col of cols) {
                if (col.name) {
                  const existing = this.storageManager.getCollections().find(c => c.name === col.name);
                  const toSave = { ...col, id: existing?.id || col.id || Date.now().toString() };
                  this.storageManager.saveCollection(toSave);
                  count++;
                }
              }
              vscode.window.showInformationMessage(`✓ Imported ${count} collection${count !== 1 ? 's' : ''}`);
            } catch {
              vscode.window.showErrorMessage('Import failed: invalid JSON file');
            }
          }
          break;
        }
        case 'requestData':
          this._sendData();
          break;
        case 'toggleCollectionState':
          this.storageManager.setCollectionExpansionState(
            msg.id,
            msg.isOpen
          );
          break;
      }
    });

    this.storageManager.onDidChange(() => {
      if (this._view) this._sendData();
    });
  }

  private _sendData(): void {
    if (!this._view) return;
    let data: any = {};
    if (this.type === 'history') {
      data = {
        history: this.storageManager.getHistory().map((h) => ({
          id: h.id,
          method: h.method,
          url: h.url,
          status: h.status,
          duration: h.duration,
          name: h.name,
          timestamp: h.timestamp,
        })),
      };
    } else if (this.type === 'collections') {
      data = {
        collections: this.storageManager.getCollections(),
        expansionStates: this.storageManager.getExpansionStates(),
      };
    }
    this._view.webview.postMessage({
      command: 'setData',
      type: this.type,
      data,
    });
  }

  refresh(): void {
    this._sendData();
  }

  postMessage(msg: any): void {
    this._view?.webview.postMessage(msg);
  }
}

