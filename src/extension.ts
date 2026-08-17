import * as vscode from 'vscode';
import { StorageManager } from './storage/StorageManager';
import { RestifyPanel } from './panels/RestifyPanel';
import { SidebarProvider } from './panels/sidebar/SidebarProvider';
import { OpenApiProvider } from './panels/sidebar/OpenApiProvider';
import { MockServerManager } from './panels/mockServerManager';
import { ActivityProvider } from './panels/ActivityProvider';
import { parseCurl } from './core/curlParser';
import { parseImportTextAuto, requestToHttpText } from './core/converters';
import { generateMarkdown } from './core/docsGenerator';
import { showOpenDialog, showSaveDialog } from './panels/dialogStub';

export async function activate(context: vscode.ExtensionContext) {
  // Use the extension's global storage path for file-backed history persistence
  const storagePath = context.globalStorageUri?.fsPath || undefined;
  const storageManager = new StorageManager(
    context.globalState,
    storagePath,
    context.secrets
  );
  await storageManager.hydrateSecrets();

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
  const openApiProvider = new OpenApiProvider(context, storageManager);
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
      'restify-openapi',
      openApiProvider
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
    vscode.commands.registerCommand(
      'restify.newRequest',
      () => {
  vscode.commands.executeCommand('restify.openMain');
      }
    )
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

  // F51: Open REST Client `.http` files and load a request into the main panel
  context.subscriptions.push(
    vscode.commands.registerCommand('restify.openHttpFile', async (uriArg?: vscode.Uri) => {
      let uri = uriArg;
      if (!uri) {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.fileName.toLowerCase().endsWith('.http')) {
          uri = editor.document.uri;
        }
      }
      if (!uri) {
        const picked = await showOpenDialog({
          canSelectMany: false,
          filters: { 'HTTP Files': ['http'] },
        });
        uri = picked?.[0];
      }
      if (!uri) return;

      const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
      const col = parseImportTextAuto(text, 'file.http');
      if (!col || col.requests.length === 0) {
        vscode.window.showWarningMessage('No requests found in the .http file.');
        return;
      }

      const requests = col.requests;
      if (requests.length === 1) {
        vscode.commands.executeCommand('restify.openMain', requests[0]);
        return;
      }

      const picks = requests.map((r, i) => ({
        label: `${r.method?.toUpperCase() || 'GET'} ${r.url || ''}`,
        description: r.name || `Request ${i + 1}`,
        detail: String(i),
      }));
      const chosen = await vscode.window.showQuickPick(picks, {
        placeHolder: 'Choose a request to open',
        matchOnDescription: true,
      });
      if (!chosen) return;
      vscode.commands.executeCommand('restify.openMain', requests[Number(chosen.detail)]);
    })
  );

  // F51: Export the active panel's current request to a `.http` file
  context.subscriptions.push(
    vscode.commands.registerCommand('restify.exportRequestToHttp', async () => {
      const activePanel = Array.from(openPanels).pop();
      if (!activePanel) {
        vscode.window.showWarningMessage('No active Restify panel. Open a request first.');
        return;
      }
      const req = await activePanel.getCurrentRequest();
      if (!req || !req.url) {
        vscode.window.showWarningMessage('The active request has no URL to export.');
        return;
      }
      const text = requestToHttpText({
        name: req.name,
        method: req.method,
        url: req.url,
        headers: req.headers,
        queryParams: req.queryParams,
        bodyType: req.bodyType,
        body: req.body,
        formData: req.formData,
        urlencoded: req.urlencoded,
      });

      const defaultName = (req.name || req.method || 'request')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'request';
      const base = vscode.workspace.workspaceFolders?.[0]?.uri || vscode.Uri.file(process.env.HOME || '/');
      const uri = await showSaveDialog({
        defaultUri: vscode.Uri.joinPath(base, `${defaultName}.http`),
        filters: { 'HTTP Files': ['http'] },
      });
      if (!uri) return;
      await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
      vscode.window.showInformationMessage(`Exported request to ${uri.fsPath}`);
    })
  );

  // F54: Command palette actions
  context.subscriptions.push(
    vscode.commands.registerCommand('restify.sendRequest', () => {
      const activePanel = Array.from(openPanels).pop();
      if (activePanel) {
        activePanel.sendRequest();
      } else {
        vscode.window.showWarningMessage('No active Restify panel. Open a request first.');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('restify.searchCollections', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Search collections',
        placeHolder: 'Enter search term...',
      });
      if (query) {
        collectionsProvider.search(query);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('restify.exportAllCollections', () => {
      collectionsProvider.exportAll();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('restify.openEnvironments', () => {
      vscode.commands.executeCommand('restify.openMain');
    })
  );

  // F50: reveal the shared "Restify: HTTP Log" output channel (singleton by name).
  context.subscriptions.push(
    vscode.commands.registerCommand('restify.showHttpLog', () => {
      vscode.window.createOutputChannel('Restify: HTTP Log').show();
    })
  );

  // F37: mock server manager
  const mockServerManager = new MockServerManager(context, storageManager);
  context.subscriptions.push(mockServerManager);
  context.subscriptions.push(
    vscode.commands.registerCommand('restify.startMockServer', (collectionId?: string) => {
      mockServerManager.start(collectionId);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('restify.stopMockServer', () => {
      mockServerManager.stop();
    })
  );

  // F38: documentation generation
  context.subscriptions.push(
    vscode.commands.registerCommand('restify.generateDocs', async () => {
      const collections = storageManager.getCollections();
      if (collections.length === 0) {
        vscode.window.showWarningMessage("No collections found.");
        return;
      }
      if (collections.length === 1) {
        const md = generateMarkdown(collections[0]);
        const doc = await vscode.workspace.openTextDocument({ content: md, language: "markdown" });
        await vscode.window.showTextDocument(doc);
        return;
      }
      const picks = collections.map(c => ({
        label: c.name,
        description: `${(c.requests || []).length} request(s)`,
        id: c.id,
      }));
      const chosen = await vscode.window.showQuickPick(picks, {
        placeHolder: "Select a collection to generate documentation for",
      });
      if (!chosen) return;
      const col = collections.find(c => c.id === chosen.id);
      if (col) {
        const md = generateMarkdown(col);
        const doc = await vscode.workspace.openTextDocument({ content: md, language: "markdown" });
        await vscode.window.showTextDocument(doc);
      }
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

