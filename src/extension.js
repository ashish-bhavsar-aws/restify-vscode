const vscode = require('vscode');
const { RestifyPanel } = require('./RestifyPanel');
const { SidebarProvider } = require('./SidebarProvider');
const { StorageManager } = require('./StorageManager');

function activate(context) {
  const storageManager = new StorageManager(context.globalState);
  
  // Track all open panels to sync data (like environment changes) across all tabs
  const openPanels = new Set();

  const historyProvider = new SidebarProvider(context, 'history', storageManager);
  const collectionsProvider = new SidebarProvider(context, 'collections', storageManager);
  const environmentsProvider = new SidebarProvider(context, 'environments', storageManager);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('restify-history', historyProvider),
    vscode.window.registerWebviewViewProvider('restify-collections', collectionsProvider),
    vscode.window.registerWebviewViewProvider('restify-environments', environmentsProvider)
  );

  // Updated Command: Always creates a NEW instance
  context.subscriptions.push(
    vscode.commands.registerCommand('restify.openMain', (requestData) => {
      // Pass a disposal callback to remove the panel from our Set when closed
      const panel = new RestifyPanel(context, storageManager, (instance) => {
        openPanels.delete(instance);
      });

      openPanels.add(panel);

      if (requestData) {
        panel.loadRequest(requestData);
      }

      historyProvider.refresh();
      collectionsProvider.refresh();
      environmentsProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('restify.newRequest', () => {
      vscode.commands.executeCommand('restify.openMain');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('restify.openFromSidebar', (data) => {
      vscode.commands.executeCommand('restify.openMain', data);
    })
  );
  
  vscode.commands.executeCommand('restify.openMain');

  storageManager.onDidChange(() => {
    historyProvider.refresh();
    collectionsProvider.refresh();
    environmentsProvider.refresh();
    
    // Sync environment/collection data across ALL open request tabs
    openPanels.forEach(p => {
        if (p.updateMetadata) p.updateMetadata();
    });
  });
}

function deactivate() {}

module.exports = { activate, deactivate };