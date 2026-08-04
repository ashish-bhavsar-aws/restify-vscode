import * as vscode from 'vscode';
import { StorageManager } from './storage/StorageManager';
import { RestifyPanel } from './panels/RestifyPanel';
import { SidebarProvider } from './panels/SidebarProvider';
import { ActivityProvider } from './panels/ActivityProvider';
import { parseCurl } from './core/curlParser';

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
  const activityProvider = new ActivityProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'restify-history',
      historyProvider
    ),
    vscode.window.registerWebviewViewProvider(
      'restify-collections',
      collectionsProvider
    ),
    vscode.window.registerWebviewViewProvider(
      'restify-activity',
      activityProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'restify.openMain',
      (requestData?: any) => {
        const panel = new RestifyPanel(context, storageManager, (instance) => {
          openPanels.delete(instance);
        }, activityProvider);

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
    vscode.commands.registerCommand('restify.importCurl', async (curlArg?: string) => {
      let input = curlArg;

      if (!input) {
        // Try clipboard first
        let curlText = '';
        try {
          curlText = await vscode.env.clipboard.readText();
        } catch { /* ignore */ }

        const looksLikeCurl = /^\s*(curl\b|'\s*curl|"\s*curl)/i.test(curlText);

        input = await vscode.window.showInputBox({
          prompt: 'Paste a cURL command',
          value: looksLikeCurl ? curlText.trim() : '',
          placeHolder: "curl -X POST https://api.example.com/data -H 'Content-Type: application/json'",
          validateInput: (value) => {
            if (!value.trim()) return 'Please paste a cURL command';
            if (!/curl/i.test(value)) return 'Input does not look like a cURL command';
            return null;
          },
        });
      }

      if (!input) return;

      try {
        const parsed = parseCurl(input);
        vscode.commands.executeCommand('restify.openMain', {
          method: parsed.method,
          url: parsed.url,
          headers: parsed.headers,
          bodyType: parsed.bodyType,
          body: parsed.body,
          formData: parsed.formData,
          urlencoded: parsed.urlencoded,
          authType: parsed.authType,
          authData: parsed.authData,
          rejectUnauthorized: parsed.rejectUnauthorized,
        });
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to parse cURL: ${err.message}`);
      }
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

