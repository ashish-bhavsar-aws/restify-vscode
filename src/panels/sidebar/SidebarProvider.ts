import * as vscode from 'vscode';
import { StorageManager } from '../../storage/StorageManager';
import { getSidebarHtml } from '../../webview/sidebarHtml';
import { findGroupInline } from './sidebarHelpers';
import { CollectionImporter } from './sidebarImporter';
import { CollectionRunner } from './sidebarRunner';
type SidebarType = 'history' | 'collections';

export class SidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _searchQuery?: string;
  private importer: CollectionImporter;
  private runner: CollectionRunner;

  constructor(
    private context: vscode.ExtensionContext,
    private type: SidebarType,
    private storageManager: StorageManager
  ) {
    this.importer = new CollectionImporter(this.storageManager);
    this.runner = new CollectionRunner(this.storageManager, (msg) => this.postMessage(msg));
  }

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

    // Send initial theme color kind so webview can adapt icon coloring
    try {
      webviewView.webview.postMessage({ command: 'setTheme', kind: vscode.window.activeColorTheme.kind });
    } catch{
      /* empty */
    }

    // Keep webview updated when the active color theme changes
    const themeListener = vscode.window.onDidChangeActiveColorTheme((t) => {
      webviewView.webview.postMessage({ command: 'setTheme', kind: t.kind });
    });
    webviewView.onDidDispose(() => themeListener.dispose());

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
        case 'toggleHistoryPin':
          this.storageManager.toggleHistoryPin(msg.id);
          break;
        case 'newRequest':
          vscode.commands.executeCommand('restify.newRequest');
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
              if (msg.groupId) {
                this.storageManager.addRequestToGroup(col.id, msg.groupId, rest);
              } else {
                this.storageManager.addRequestToCollection(col.id, rest);
              }
              vscode.window.showInformationMessage(`✓ Saved to collection "${msg.collectionName}"`);
            }
          }
          break;
        }
        case 'exportCollection': {
          const cols = this.storageManager.getCollections();
          const col = cols.find((c) => String(c.id) === String(msg.id));
          if (!col) break;
          await this.importer.exportCollection(col);
          break;
        }
        case 'exportAllCollections':
          await this.importer.exportAll();
          break;
        case 'importCollections':
        case 'showImportOptions':
          await this.importer.importCollection();
          break;
        case 'saveGroup': {
          // msg.collectionId, msg.group { id, name }, msg.parentGroupId?
          this.storageManager.saveGroup(msg.collectionId, msg.group, msg.parentGroupId);
          break;
        }
        case 'deleteGroup': {
          const cols = this.storageManager.getCollections();
          const col = cols.find((c) => String(c.id) === String(msg.collectionId));
          if (!col) break;
          const grpName = msg.groupName || 'this group';
          vscode.window.showWarningMessage(
            `Delete folder "${grpName}" and all its contents?`,
            'Delete', 'Cancel'
          ).then((sel) => {
            if (sel === 'Delete') this.storageManager.deleteGroup(msg.collectionId, msg.groupId);
          });
          break;
        }
        case 'renameGroup':
          this.storageManager.renameGroup(msg.collectionId, msg.groupId, msg.name);
          break;
        case 'addRequestToGroup':
          this.storageManager.addRequestToGroup(msg.collectionId, msg.groupId, msg.request);
          break;
        case 'deleteRequestFromGroup': {
          this.storageManager.deleteRequestFromGroup(msg.collectionId, msg.groupId, msg.requestId);
          break;
        }
        case 'moveRequestToGroup': {
          this.storageManager.moveRequestToGroup(
            msg.collectionId,
            msg.requestId,
            msg.fromGroupId ?? null,
            msg.toGroupId ?? null
          );
          break;
        }
        case 'moveRequestAcrossCollections': {
          this.storageManager.moveRequestAcrossCollections(
            msg.fromCollectionId,
            msg.toCollectionId,
            msg.requestId,
            msg.fromGroupId ?? null,
            msg.toGroupId ?? null
          );
          break;
        }
        case 'renameGroupRequest': {
          const cols = this.storageManager.getCollections();
          const col = cols.find((c) => String(c.id) === String(msg.collectionId));
          if (!col) break;
          const grp = findGroupInline(col.groups || [], msg.groupId);
          if (grp?.requests) {
            const req = grp.requests.find((r: any) => String(r.id) === String(msg.requestId));
            if (req && msg.name?.trim()) {
              req.name = msg.name.trim();
              this.storageManager.saveCollection(col);
            }
          }
          break;
        }
        case 'requestData':
          this._sendData();
          break;
        case 'runCollection':
          await this.runner.runCollection(msg.collectionId, msg.groupId ?? null);
          break;
        case 'cancelCollectionRun':
          this.runner.cancel();
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
          pinned: !!h.pinned,
        })),
        collections: this.storageManager.getCollections(),
      };
    } else if (this.type === 'collections') {
      data = {
        collections: this.storageManager.getCollections(),
        expansionStates: this.storageManager.getExpansionStates(),
        search: this._searchQuery ?? '',
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

  importCollection(): Promise<void> {
    return this.importer.importCollection();
  }

  exportAll(): Promise<void> {
    return this.importer.exportAll();
  }

  postMessage(msg: any): void {
    this._view?.webview.postMessage(msg);
  }

  search(query: string): void {
    this._searchQuery = query;
    if (this._view) {
      this._view.webview.postMessage({ command: 'searchCollections', query });
    }
  }

}
