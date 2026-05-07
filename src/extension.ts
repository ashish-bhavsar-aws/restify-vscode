import * as vscode from 'vscode';
import { StorageManager } from './storage/StorageManager';
import { RestifyPanel } from './panels/RestifyPanel';
import { SidebarProvider } from './panels/SidebarProvider';

export function activate(context: vscode.ExtensionContext) {
  // Use the extension's global storage path for file-backed history persistence
  const storagePath = context.globalStorageUri?.fsPath || undefined;
  const storageManager = new StorageManager(context.globalState, storagePath);

  // Store storageManager in subscriptions so we can access it in deactivate
  context.subscriptions.push({
    dispose: () => storageManager.stopHousekeeping(),
  });

  // Track all open panels to sync data
  const openPanels = new Set<RestifyPanel>();

  const historyProvider = new SidebarProvider(context, 'history', storageManager);
  const collectionsProvider = new SidebarProvider(
    context,
    'collections',
    storageManager
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'restify-history',
      historyProvider
    ),
    vscode.window.registerWebviewViewProvider(
      'restify-collections',
      collectionsProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'restify.openMain',
      (requestData?: any) => {
        const panel = new RestifyPanel(context, storageManager, (instance) => {
          openPanels.delete(instance);
        });

        openPanels.add(panel);

        if (requestData) {
          panel.loadRequest(requestData);
        }

        historyProvider.refresh();
        collectionsProvider.refresh();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('restify.newRequest', () => {
      vscode.commands.executeCommand('restify.openMain');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('restify.newCollection', () => {
      collectionsProvider.postMessage({ command: 'openNewCollectionModal' });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('restify.importCollection', () => {
      collectionsProvider.importCollection();
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

    openPanels.forEach((p) => {
      if (p.updateMetadata) p.updateMetadata();
    });
  });
}

export function deactivate() {
  // Housekeeping is automatically stopped via context.subscriptions.dispose()
}

