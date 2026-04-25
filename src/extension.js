const vscode = require('vscode');
const { RestifyPanel } = require('./RestifyPanel');
const { SidebarProvider } = require('./SidebarProvider');
const { StorageManager } = require('./StorageManager');

let mainPanel = null;

function activate(context) {
  const storageManager = new StorageManager(context.globalState);

  // Register sidebar providers
  const historyProvider = new SidebarProvider(context, 'history', storageManager);
  const collectionsProvider = new SidebarProvider(context, 'collections', storageManager);
  const environmentsProvider = new SidebarProvider(context, 'environments', storageManager);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('restify-history', historyProvider),
    vscode.window.registerWebviewViewProvider('restify-collections', collectionsProvider),
    vscode.window.registerWebviewViewProvider('restify-environments', environmentsProvider)
  );

  // Command: open main panel
  context.subscriptions.push(
    vscode.commands.registerCommand('restify.openMain', (requestData) => {
      if (mainPanel) {
        mainPanel.panel.reveal(vscode.ViewColumn.One);
        if (requestData) {
          mainPanel.loadRequest(requestData);
        }
      } else {
        mainPanel = new RestifyPanel(context, storageManager, () => { mainPanel = null; });
        if (requestData) {
          mainPanel.loadRequest(requestData);
        }
      }

      // Notify sidebars to refresh
      historyProvider.refresh();
      collectionsProvider.refresh();
      environmentsProvider.refresh();
    })
  );

  // Command: new request
  context.subscriptions.push(
    vscode.commands.registerCommand('restify.newRequest', () => {
      vscode.commands.executeCommand('restify.openMain');
    })
  );

  // Auto-open main panel when sidebar is first viewed
  context.subscriptions.push(
    vscode.commands.registerCommand('restify.openFromSidebar', (data) => {
      vscode.commands.executeCommand('restify.openMain', data);
    })
  );
  
  // Actually execute the command to open the panel
  vscode.commands.executeCommand('restify.openMain');

  // Set up message passing between sidebar and main panel
  storageManager.onDidChange(() => {
    historyProvider.refresh();
    collectionsProvider.refresh();
    environmentsProvider.refresh();
  });
}

function deactivate() {}

module.exports = { activate, deactivate };
