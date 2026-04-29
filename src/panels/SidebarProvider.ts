import * as vscode from 'vscode';
import { StorageManager } from '../storage/StorageManager';
import { getSidebarHtml } from '../webview/sidebarHtml';

type SidebarType = 'history' | 'collections' | 'environments';

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

    webviewView.webview.onDidReceiveMessage((msg) => {
      switch (msg.command) {
        case 'loadRequest':
          vscode.commands.executeCommand('restify.openFromSidebar', msg.data);
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
        case 'deleteCollection':
          this.storageManager.deleteCollection(msg.id);
          break;
        case 'deleteCollectionRequest':
          this.storageManager.deleteRequestFromCollection(
            msg.collectionId,
            msg.requestId
          );
          break;
        case 'saveEnvironment':
          this.storageManager.saveEnvironment(msg.data);
          break;
        case 'deleteEnvironment':
          this.storageManager.deleteEnvironment(msg.id);
          break;
        case 'setActiveEnvironment':
          this.storageManager.setActiveEnvironment(msg.id);
          break;
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
    } else if (this.type === 'environments') {
      data = {
        environments: this.storageManager.getEnvironments(),
        activeEnvId:
          this.storageManager.getActiveEnvironment()?.id || null,
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
}

