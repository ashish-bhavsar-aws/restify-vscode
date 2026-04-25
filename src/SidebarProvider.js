const vscode = require('vscode');
const { getSidebarHtml } = require('./sidebarHtml');

class SidebarProvider {
  constructor(context, type, storageManager) {
    this.context = context;
    this.type = type; // 'history' | 'collections' | 'environments'
    this.storageManager = storageManager;
    this._view = null;
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = getSidebarHtml(this.type);
    this._sendData();

    webviewView.webview.onDidReceiveMessage(msg => {
      switch (msg.command) {
        case 'loadRequest':
          vscode.commands.executeCommand('restify.openFromSidebar', msg.data);
          break;
        case 'deleteHistoryItem':
          this.storageManager.deleteHistoryItem(msg.id);
          break;
        case 'clearHistory':
          vscode.window.showWarningMessage('Are you sure you want to clear all history?', 'Yes', 'Cancel')
            .then(selection => {
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
          this.storageManager.deleteRequestFromCollection(msg.collectionId, msg.requestId);
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
          this.storageManager.setCollectionExpansionState(msg.id, msg.isOpen);
          break;
      }
    });

    this.storageManager.onDidChange(() => {
      if (this._view) this._sendData();
    });
  }

  _sendData() {
    if (!this._view) return;
    let data = {};
    if (this.type === 'history') {
      data = { history: this.storageManager.getHistory() };
    } else if (this.type === 'collections') {
      data = { 
        collections: this.storageManager.getCollections(),
        expansionStates: this.storageManager.getExpansionStates()
      };
    } else if (this.type === 'environments') {
      data = {
        environments: this.storageManager.getEnvironments(),
        activeEnvId: this.storageManager.getActiveEnvironment()?.id || null
      };
    }
    this._view.webview.postMessage({ command: 'setData', type: this.type, data });
  }

  refresh() {
    this._sendData();
  }
}

module.exports = { SidebarProvider };
