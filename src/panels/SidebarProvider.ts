import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { StorageManager } from '../storage/StorageManager';
import { getSidebarHtml } from '../webview/sidebarHtml';
import { runCollectionRequests, parseIterationData } from '../core';
import {
  parseImportText,
  collectionToPostman,
  collectionToOpenApi,
  collectionToHar,
  collectionToHttpText,
  ImportSource,
  ImportedCollection,
} from '../core/converters';
import { showOpenDialog, showSaveDialog } from './dialogStub';

type SidebarType = 'history' | 'collections';

export class SidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _searchQuery?: string;
  private _runController?: AbortController;

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
          const format = await this._chooseExportFormat();
          if (!format) break;
          await this._writeExportFile(col, format);
          break;
        }
        case 'exportAllCollections':
          await this.exportAll();
          break;
        case 'importCollections':
        case 'showImportOptions':
          await this.importCollection();
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
          const grp = _findGroupInline(col.groups || [], msg.groupId);
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
          await this._runCollection(msg.collectionId, msg.groupId ?? null);
          break;
        case 'cancelCollectionRun':
          this._runController?.abort();
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

  postMessage(msg: any): void {
    this._view?.webview.postMessage(msg);
  }

  search(query: string): void {
    this._searchQuery = query;
    if (this._view) {
      this._view.webview.postMessage({ command: 'searchCollections', query });
    }
  }

  private async _chooseExportFormat(): Promise<string | undefined> {
    const choice = await vscode.window.showQuickPick(
      [
        { label: '$(file-json) Restify JSON', description: 'Native Restify collection format', id: 'restify' },
        { label: '$(file-code) Postman Collection', description: 'Postman v2.1 collection JSON', id: 'postman' },
        { label: '$(file-code) OpenAPI 3.0', description: 'OpenAPI / Swagger 3.0 document (YAML-style JSON)', id: 'openapi' },
        { label: '$(file-binary) HAR', description: 'HAR 1.2 HTTP archive JSON', id: 'har' },
        { label: '$(file-text) REST Client .http', description: 'REST Client `.http` document', id: 'http' },
      ],
      { placeHolder: 'Select export format' }
    ) as { id: string } | undefined;
    return choice?.id;
  }

  private async _writeExportFile(col: any, format: string): Promise<void> {
    const safe = (col.name || 'collection').replace(/[^a-z0-9._-]/gi, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '');
    const extensions: Record<string, string[]> = {
      restify: ['json'],
      postman: ['json'],
      openapi: ['json'],
      har: ['har'],
      http: ['http'],
    };
    const defaultExt = (extensions[format] || ['json'])[0];
    const data = (() => {
      switch (format) {
        case 'postman':
          return JSON.stringify(collectionToPostman(col as ImportedCollection), null, 2);
        case 'openapi':
          return JSON.stringify(collectionToOpenApi(col as ImportedCollection), null, 2);
        case 'har':
          return JSON.stringify(collectionToHar(col as ImportedCollection), null, 2);
        case 'http':
          return collectionToHttpText(col as ImportedCollection);
        default:
          return JSON.stringify(col, null, 2);
      }
    })();

    const uri = await showSaveDialog({
      defaultUri: vscode.Uri.joinPath(
        vscode.workspace.workspaceFolders?.[0]?.uri || vscode.Uri.file(os.homedir()),
        `${safe || 'collection'}.${defaultExt}`
      ),
      filters: { [format.toUpperCase()]: extensions[format] },
    });
    if (!uri) return;
    await vscode.workspace.fs.writeFile(uri, Buffer.from(data, 'utf8'));
    vscode.window.showInformationMessage(`\u2713 Collection exported to ${uri.fsPath}`);
  }

  async exportAll(): Promise<void> {
    const cols = this.storageManager.getCollections();
    if (!cols.length) {
      vscode.window.showWarningMessage('No collections to export');
      return;
    }
    const data = JSON.stringify(cols, null, 2);
    const defaultName = 'restify.collections.json';
    const fileName = await vscode.window.showInputBox({
      prompt: 'Enter a filename for the exported collections',
      value: defaultName,
      validateInput: (v) => v.trim() ? null : 'Filename cannot be empty',
    });
    if (!fileName) return;
    const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    const targetUri = wsFolder
      ? vscode.Uri.joinPath(wsFolder, fileName)
      : vscode.Uri.file(path.join(os.homedir(), fileName));
    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(data, 'utf8'));
    vscode.window.showInformationMessage(`✓ Exported ${cols.length} collection${cols.length !== 1 ? 's' : ''}`);
  }

  // ─── Collection runner (F31) ──────────────────────────────
  /**
   * F32: Let the user pick a CSV/JSON data file for a data-driven run, or run
   * without one. Returns `null` when the run should be cancelled.
   */
  private async _pickIterationData(): Promise<Record<string, string>[] | null> {
    const choice = await vscode.window.showQuickPick(
      [
        {
          label: '$(circle-slash) Run without data',
          description: 'Execute each request once',
          id: 'none',
        },
        {
          label: '$(file-text) Run with data file...',
          description: 'Iterate over CSV / JSON rows (each row injects variables)',
          id: 'data',
        },
      ],
      { placeHolder: 'Data-driven run' }
    );
    if (!choice) return null;
    if (choice.id === 'none') return [];

    const uris = await showOpenDialog({
      canSelectMany: false,
      filters: { 'CSV / JSON': ['csv', 'json'] },
      openLabel: 'Select Data File',
    });
    if (!uris || !uris[0]) return null;
    const raw = Buffer.from(
      await vscode.workspace.fs.readFile(uris[0])
    ).toString('utf8');
    const rows = parseIterationData(raw, uris[0].fsPath);
    if (rows.length === 0) {
      vscode.window.showWarningMessage('No data rows found in the selected file.');
      return null;
    }
    return rows;
  }

  private async _runCollection(collectionId: string, groupId: string | null): Promise<void> {
    const cols = this.storageManager.getCollections();
    const col = cols.find((c) => String(c.id) === String(collectionId));
    if (!col) return;
    if (this._runController) {
      vscode.window.showWarningMessage('A collection run is already in progress');
      return;
    }

    const requests = _flattenCollectionRequests(col, groupId);
    if (requests.length === 0) {
      vscode.window.showWarningMessage('This collection has no requests to run');
      return;
    }

    const iterationData = await this._pickIterationData();
    if (iterationData === null) return;

    const controller = new AbortController();
    this._runController = controller;
    this.postMessage({
      command: 'collectionRunStarted',
      collectionId,
      groupId,
      total: requests.length * Math.max(1, iterationData.length),
    });

    let cookies = this.storageManager.getCookies();
    try {
      const results = await runCollectionRequests({
        requests,
        variables: this.storageManager.getActiveEnvironmentVariables(),
        signal: controller.signal,
        cookies,
        iterationData,
        onCookiesChanged: (next) => {
          cookies = next;
          this.storageManager.saveCookies(next);
        },
        onProgress: (entry, index, total) => {
          this.postMessage({
            command: 'collectionRunProgress',
            entry,
            index,
            total,
          });
        },
      });
      this.postMessage({
        command: 'collectionRunComplete',
        results,
        collectionId,
        groupId,
        cancelled: controller.signal.aborted,
      });
    } catch (err: any) {
      this.postMessage({
        command: 'collectionRunComplete',
        results: [],
        collectionId,
        groupId,
        error: err?.message ?? String(err),
      });
    } finally {
      this._runController = undefined;
    }
  }

  async importCollection(): Promise<void> {
    const choice = await vscode.window.showQuickPick(
      [
        {
          label: '$(file-code) Postman Collection',
          description: 'Import requests from a Postman Collection JSON file',
          id: 'postman',
        },
        {
          label: '$(file-code) OpenAPI / Swagger File',
          description: 'Import endpoints from a Swagger / OpenAPI JSON file',
          id: 'swagger-file',
        },
        {
          label: '$(globe) WSDL / SOAP Service',
          description: 'Import SOAP operations from a WSDL document',
          id: 'wsdl',
        },
        {
          label: '$(cloud-download) WSDL / SOAP Service URL',
          description: 'Fetch and import SOAP operations from a WSDL URL',
          id: 'wsdl-url',
        },
        {
          label: '$(cloud-download) OpenAPI / Swagger URL',
          description: 'Fetch and import endpoints from a Swagger / OpenAPI URL',
          id: 'swagger-url',
        },
        {
          label: '$(file-zip) Restify Collection',
          description: 'Import a previously exported Restify collection JSON file',
          id: 'restify',
        },
        {
          label: '$(file-binary) HAR File',
          description: 'Import requests captured in a HAR (HTTP Archive) JSON file',
          id: 'har',
        },
        {
          label: '$(bug) Insomnia Export',
          description: 'Import requests from an Insomnia JSON export',
          id: 'insomnia',
        },
        {
          label: '$(file-text) REST Client .http File',
          description: 'Import requests from a REST Client `.http` document',
          id: 'http',
        },
      ],
      { placeHolder: 'Select import source' }
    ) as { label: string; description: string; id: string } | undefined;

    if (!choice) return;

    switch (choice.id) {
      case 'restify':
        await this._importRestifyCollection();
        break;
      case 'postman':
        await this._importPostmanCollection();
        break;
      case 'wsdl':
        await this._importWsdlFile();
        break;
      case 'wsdl-url':
        await this._importWsdlUrl();
        break;
      case 'swagger-file':
        await this._importSwaggerFile();
        break;
      case 'swagger-url':
        await this._importSwaggerUrl();
        break;
      case 'har':
      case 'insomnia':
      case 'http':
        await this._importConvertedFile(choice.id);
        break;
    }
  }

  private async _importConvertedFile(source: Exclude<ImportSource, null>): Promise<void> {
    const labels: Record<string, { filter: { [k: string]: string[] }; title: string }> = {
      har: { filter: { 'HAR (HTTP Archive)': ['har', 'json'] }, title: 'Import HAR File' },
      insomnia: { filter: { 'Insomnia Export': ['json'] }, title: 'Import Insomnia Export' },
      http: { filter: { 'REST Client (.http)': ['http'] }, title: 'Import .http File' },
    };
    const cfg = labels[source];
    const uris = await showOpenDialog({
      canSelectMany: false,
      filters: cfg.filter,
      openLabel: cfg.title,
    });
    if (!uris || !uris[0]) return;

    const raw = Buffer.from(await vscode.workspace.fs.readFile(uris[0])).toString('utf8');
    const collection = parseImportText(raw, source);
    if (!collection) {
      vscode.window.showErrorMessage(
        `Import failed: file does not look like a valid ${source} document`
      );
      return;
    }
    await this._saveImportedCollection(collection);
    const total = _countImportedRequests(collection);
    vscode.window.showInformationMessage(
      `\u2713 Imported "${collection.name}" with ${total} request(s)`
    );
  }

  private async _saveImportedCollection(collection: ImportedCollection): Promise<void> {
    const existing = this.storageManager
      .getCollections()
      .find((c) => c.name === collection.name);
    this.storageManager.saveCollection({
      ..._normalizeImported(collection),
      id: existing?.id || collection.id,
    });
  }

  private async _importRestifyCollection(): Promise<void> {
    const uris = await showOpenDialog({
      canSelectMany: false,
      filters: { 'Restify Collection JSON': ['json'] },
      openLabel: 'Import Restify Collection',
    });
    if (!uris || !uris[0]) return;
    const raw = Buffer.from(await vscode.workspace.fs.readFile(uris[0])).toString('utf8');
    try {
      const imported = JSON.parse(raw);
      const cols: any[] = Array.isArray(imported) ? imported : [imported];
      let count = 0;
      for (const col of cols) {
        if (col.name) {
          const existing = this.storageManager.getCollections().find((c) => c.name === col.name);
          const toSave = { ...col, id: existing?.id || col.id || Date.now().toString() };
          this.storageManager.saveCollection(toSave);
          count++;
        }
      }
      vscode.window.showInformationMessage(`\u2713 Imported ${count} collection${count !== 1 ? 's' : ''}`);
    } catch {
      vscode.window.showErrorMessage('Import failed: invalid Restify collection file');
    }
  }

  private async _importPostmanCollection(): Promise<void> {
    const uris = await showOpenDialog({
      canSelectMany: false,
      filters: { 'Postman Collection JSON': ['json'] },
      openLabel: 'Import Postman Collection',
    });
    if (!uris || !uris[0]) return;
    const raw = Buffer.from(await vscode.workspace.fs.readFile(uris[0])).toString('utf8');
    try {
      const data = JSON.parse(raw);
      const collection = _parsePostmanCollection(data);
      if (!collection) {
        vscode.window.showErrorMessage('Import failed: file does not look like a Postman Collection');
        return;
      }
      const existing = this.storageManager.getCollections().find((c) => c.name === collection.name);
      this.storageManager.saveCollection({
        ...collection,
        id: existing?.id || collection.id,
      });
      vscode.window.showInformationMessage(
        `\u2713 Imported "${collection.name}" with ${collection.requests.length} request(s)`
      );
    } catch {
      vscode.window.showErrorMessage('Import failed: invalid or unsupported Postman Collection file');
    }
  }

  private async _importWsdlFile(): Promise<void> {
    const uris = await showOpenDialog({
      canSelectMany: false,
      filters: { 'WSDL / SOAP Service': ['wsdl', 'xml'] },
      openLabel: 'Import WSDL / SOAP Service',
    });
    if (!uris || !uris[0]) return;

    const raw = Buffer.from(await vscode.workspace.fs.readFile(uris[0])).toString('utf8');
    const collection = parseImportText(raw, 'wsdl');
    if (!collection) {
      vscode.window.showErrorMessage('Import failed: file does not look like a valid WSDL document');
      return;
    }
    await this._saveImportedCollection(collection);
    const total = _countImportedRequests(collection);
    vscode.window.showInformationMessage(
      `\u2713 Imported "${collection.name}" with ${total} request(s)`,
    );
  }

  private async _importWsdlUrl(): Promise<void> {
    const url = await vscode.window.showInputBox({
      prompt: 'Enter the WSDL / SOAP Service URL',
      placeHolder: 'https://example.com/service?wsdl',
      validateInput: (v) => {
        try {
          const u = new URL(v);
          if (u.protocol !== 'https:' && u.protocol !== 'http:') {
            return 'URL must use http or https';
          }
          return undefined;
        } catch {
          return 'Enter a valid URL';
        }
      },
    });
    if (!url) return;

    try {
      const { statusCode, body } = await _httpGet(url);
      if (statusCode < 200 || statusCode >= 300) {
        vscode.window.showErrorMessage(`Import failed: server responded with ${statusCode}`);
        return;
      }
      const collection = parseImportText(body, 'wsdl');
      if (!collection) {
        vscode.window.showErrorMessage('Import failed: URL did not return a valid WSDL document');
        return;
      }
      await this._saveImportedCollection(collection);
      const total = _countImportedRequests(collection);
      vscode.window.showInformationMessage(
        `\u2713 Imported "${collection.name}" with ${total} request(s)`,
      );
    } catch {
      vscode.window.showErrorMessage('Import failed: could not fetch the WSDL from the URL');
    }
  }

  private async _importSwaggerFile(): Promise<void> {
    const uris = await showOpenDialog({
      canSelectMany: false,
      filters: { 'OpenAPI / Swagger (JSON or YAML)': ['json', 'yaml', 'yml'] },
      openLabel: 'Import Swagger / OpenAPI File',
    });
    if (!uris || !uris[0]) return;
    const raw = Buffer.from(await vscode.workspace.fs.readFile(uris[0])).toString('utf8');
    try {
      const isYaml = /\.(yaml|yml)$/i.test(uris[0].fsPath);
      let data: any;
      if (isYaml) {
        data = _parseYamlOpenApi(raw);
      } else {
        data = JSON.parse(raw);
      }
      const collection = _parseOpenApiCollection(data);
      if (!collection) {
        vscode.window.showErrorMessage('Import failed: file does not look like an OpenAPI / Swagger document');
        return;
      }
      const existing = this.storageManager.getCollections().find((c) => c.name === collection.name);
      this.storageManager.saveCollection({
        ...collection,
        id: existing?.id || collection.id,
      });
      const total = collection.requests.length + (collection.groups || []).reduce((s: number, g: any) => s + (g.requests?.length || 0), 0);
      const groupCount = (collection.groups || []).length;
      vscode.window.showInformationMessage(
        `\u2713 Imported "${collection.name}" with ${total} endpoint(s)${groupCount ? ` in ${groupCount} group(s)` : ''}`
      );
    } catch {
      vscode.window.showErrorMessage('Import failed: invalid or unsupported OpenAPI / Swagger file');
    }
  }

  private async _importSwaggerUrl(): Promise<void> {
    const url = await vscode.window.showInputBox({
      prompt: 'Enter the OpenAPI / Swagger URL (must return JSON)',
      placeHolder: 'https://petstore.swagger.io/v2/swagger.json',
      validateInput: (v) => {
        try {
          const u = new URL(v);
          if (u.protocol !== 'https:' && u.protocol !== 'http:') {
            return 'URL must use http or https';
          }
          return undefined;
        } catch {
          return 'Enter a valid URL';
        }
      },
    });
    if (!url) return;

    try {
      const { statusCode, body, contentType } = await _httpGet(url);
      if (statusCode < 200 || statusCode >= 300) {
        vscode.window.showErrorMessage(`Import failed: server responded with ${statusCode}`);
        return;
      }
      let data: any;
      if (contentType.includes('yaml') || contentType.includes('x-yaml') || contentType.includes('text/plain')) {
        data = _parseYamlOpenApi(body);
      } else {
        data = JSON.parse(body);
      }
      const collection = _parseOpenApiCollection(data);
      if (!collection) {
        vscode.window.showErrorMessage('Import failed: URL did not return a valid OpenAPI / Swagger document');
        return;
      }
      const existing = this.storageManager.getCollections().find((c) => c.name === collection.name);
      this.storageManager.saveCollection({
        ...collection,
        id: existing?.id || collection.id,
      });
      const total = collection.requests.length + (collection.groups || []).reduce((s: number, g: any) => s + (g.requests?.length || 0), 0);
      const groupCount = (collection.groups || []).length;
      vscode.window.showInformationMessage(
        `\u2713 Imported "${collection.name}" with ${total} endpoint(s)${groupCount ? ` in ${groupCount} group(s)` : ''}`
      );
    } catch (e: any) {
      vscode.window.showErrorMessage(`Import failed: ${e?.message || 'network error'}`);
    }
  }
}

// ─── Group tree helper (inline, no import needed) ────────────────────────────

/** Ensure every imported request/group carries a stable id for storage. */
function _normalizeImported(col: ImportedCollection): any {
  const _reqId = () =>
    Date.now().toString() + Math.random().toString(36).slice(2);
  const normalizeRequest = (r: any) => (r?.id ? r : { ...r, id: _reqId() });
  const normalizeGroups = (groups: any[] | undefined): any[] =>
    (groups || []).map((g) => ({
      ...g,
      id: g.id || _reqId(),
      requests: (g.requests || []).map(normalizeRequest),
      groups: normalizeGroups(g.groups),
    }));
  return {
    id: col.id,
    name: col.name,
    requests: (col.requests || []).map(normalizeRequest),
    groups: normalizeGroups(col.groups),
  };
}

function _countImportedRequests(col: ImportedCollection): number {
  let count = (col.requests || []).length;
  const visit = (groups: any[] | undefined) => {
    for (const g of groups || []) {
      count += (g.requests || []).length;
      visit(g.groups);
    }
  };
  visit(col.groups);
  return count;
}

function _findGroupInline(groups: any[], id: string): any {
  for (const g of groups) {
    if (String(g.id) === String(id)) return g;
    if (g.groups?.length) {
      const found = _findGroupInline(g.groups, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** Flatten a collection (or a single group within it) into a list of requests. */
function _flattenCollectionRequests(col: any, groupId: string | null): any[] {
  const out: any[] = [];
  const visit = (requests: any[] | undefined) => {
    for (const r of requests || []) out.push(r);
  };

  if (groupId) {
    const group = _findGroupInline(col.groups || [], groupId);
    if (group) {
      visit(group.requests);
      const visitSubGroups = (groups: any[] | undefined) => {
        for (const g of groups || []) {
          visit(g.requests);
          visitSubGroups(g.groups);
        }
      };
      visitSubGroups(group.groups);
    }
    return out;
  }

  visit(col.requests);
  const visitGroups = (groups: any[] | undefined) => {
    for (const g of groups || []) {
      visit(g.requests);
      visitGroups(g.groups);
    }
  };
  visitGroups(col.groups);
  return out;
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

/** Simple GET following up to 5 redirects, returns body as string. */
function _httpGet(
  reqUrl: string,
  redirectsLeft = 5
): Promise<{ statusCode: number; body: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(reqUrl);
    const isHttps = parsed.protocol === 'https:';
    const mod: typeof https = isHttps ? https : (http as any);
    const req = mod.get(
      reqUrl,
      { headers: { Accept: 'application/json, application/yaml, text/yaml, */*' } },
      (res) => {
        const statusCode = res.statusCode ?? 0;
        const contentType = (res.headers['content-type'] || '').toLowerCase();
        // Follow redirects
        if (statusCode >= 300 && statusCode < 400 && res.headers.location && redirectsLeft > 0) {
          res.resume();
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : `${parsed.protocol}//${parsed.host}${res.headers.location}`;
          resolve(_httpGet(next, redirectsLeft - 1));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ statusCode, body: Buffer.concat(chunks).toString('utf8'), contentType }));
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// ─── YAML minimal parser ───────────────────────────────────────────────────────

/**
 * Minimal YAML → object parser sufficient for OpenAPI/Swagger documents.
 * Handles string scalars, numbers, booleans, block sequences, and nested mappings.
 * Not a full YAML spec — designed for well-formed OpenAPI files.
 */
function _parseYamlOpenApi(yaml: string): any {
  // Normalise line endings
  const lines = yaml.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let pos = 0;

  function _peek(): string | undefined { return lines[pos]; }
  function _next(): string { return lines[pos++]; }

  function getIndent(line: string): number {
    let i = 0;
    while (i < line.length && line[i] === ' ') i++;
    return i;
  }

  function isBlankOrComment(line: string): boolean {
    return /^\s*(#.*)?$/.test(line);
  }

  function parseScalar(raw: string): any {
    const s = raw.trim();
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null' || s === '~') return null;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
    // strip quotes
    if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
      return s.slice(1, -1);
    }
    // strip inline comment
    return s.replace(/\s+#.*$/, '').trim();
  }

  function parseValue(valueStr: string, indent: number): any {
    const trimmed = valueStr.trim();
    if (trimmed === '' || trimmed === '|' || trimmed === '>') {
      // block scalar or nested — parse children
      return parseBlock(indent);
    }
    if (trimmed === '-') return parseBlock(indent);
    return parseScalar(trimmed);
  }

  function parseBlock(minIndent: number): any {
    // peek at the first meaningful line to decide: mapping or sequence
    while (pos < lines.length && isBlankOrComment(lines[pos])) pos++;
    if (pos >= lines.length) return null;

    const firstLine = lines[pos];
    const indent = getIndent(firstLine);
    if (indent <= minIndent && minIndent !== -1) return null;

    const stripped = firstLine.trim();
    if (stripped.startsWith('- ') || stripped === '-') {
      return parseSequence(indent);
    }
    return parseMapping(indent);
  }

  function parseSequence(indent: number): any[] {
    const result: any[] = [];
    while (pos < lines.length) {
      while (pos < lines.length && isBlankOrComment(lines[pos])) pos++;
      if (pos >= lines.length) break;
      const line = lines[pos];
      const lineIndent = getIndent(line);
      if (lineIndent < indent) break;
      const stripped = line.trim();
      if (!stripped.startsWith('- ') && stripped !== '-') break;
      pos++;
      const valueStr = stripped.slice(2).trim();
      if (valueStr === '' || valueStr.includes(': ')) {
        // nested mapping or empty
        const nested: any = {};
        if (valueStr.includes(': ')) {
          // inline first key
          const colonIdx = valueStr.indexOf(': ');
          const k = valueStr.slice(0, colonIdx).trim();
          const v = valueStr.slice(colonIdx + 2).trim();
          nested[k] = v === '' ? parseBlock(lineIndent + 2) : parseScalar(v);
        }
        // continue mapping at same or deeper indent
        const rest = parseMapping(lineIndent + 2);
        result.push({ ...nested, ...(typeof rest === 'object' && rest !== null ? rest : {}) });
      } else {
        result.push(parseScalar(valueStr));
      }
    }
    return result;
  }

  function parseMapping(indent: number): Record<string, any> {
    const result: Record<string, any> = {};
    while (pos < lines.length) {
      while (pos < lines.length && isBlankOrComment(lines[pos])) pos++;
      if (pos >= lines.length) break;
      const line = lines[pos];
      const lineIndent = getIndent(line);
      if (lineIndent < indent) break;
      const stripped = line.trim();
      // sequence item means we're out of this mapping
      if (stripped.startsWith('- ')) break;
      // find key: value
      const colonIdx = stripped.indexOf(': ');
      const isKeyOnly = stripped.endsWith(':') && !stripped.startsWith('-');
      if (colonIdx === -1 && !isKeyOnly) { pos++; continue; }
      pos++;
      const key = isKeyOnly ? stripped.slice(0, -1).trim() : stripped.slice(0, colonIdx).trim();
      // Remove surrounding quotes from key
      const cleanKey = key.replace(/^['"]|['"]$/g, '');
      if (isKeyOnly) {
        result[cleanKey] = parseBlock(lineIndent);
      } else {
        const valStr = stripped.slice(colonIdx + 2);
        result[cleanKey] = parseValue(valStr, lineIndent);
      }
    }
    return result;
  }

  const root = parseBlock(-1);
  return root;
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

function _parsePostmanCollection(data: any): { id: string; name: string; requests: any[] } | null {
  // Detect Postman Collection v2.x (has info.schema) or v1 (has requests[])
  const isV2 = data?.info?.schema?.includes('collection') && Array.isArray(data?.item);
  const isV1 = data?.requests && Array.isArray(data.requests);
  if (!isV2 && !isV1) return null;

  const name = data.info?.name || data.name || 'Postman Import';
  const requests: any[] = [];

  if (isV2) {
    _collectPostmanItems(data.item || [], requests);
  } else {
    // v1
    for (const req of data.requests as any[]) {
      requests.push(_postmanV1Request(req));
    }
  }

  return { id: Date.now().toString(), name, requests };
}

function _collectPostmanItems(items: any[], out: any[]): void {
  for (const item of items) {
    if (Array.isArray(item.item)) {
      // Folder — recurse (flatten into the collection)
      _collectPostmanItems(item.item, out);
    } else if (item.request) {
      out.push(_postmanV2Request(item));
    }
  }
}

function _detectPostmanRawBodyType(headers: Array<{ key?: string; value?: string }>, languageHint?: string): 'json' | 'xml' | 'text' | 'graphql' {
  const language = (languageHint || '').toLowerCase();
  if (language === 'json') return 'json';
  if (language === 'xml') return 'xml';
  if (language === 'graphql') return 'graphql';

  const contentTypeHeader = headers.find((h) => (h.key || '').toLowerCase() === 'content-type');
  const contentType = (contentTypeHeader?.value || '').toLowerCase();
  if (contentType.includes('application/json')) return 'json';
  if (contentType.includes('application/xml') || contentType.includes('text/xml')) return 'xml';
  if (contentType.includes('application/graphql')) return 'graphql';
  return 'text';
}

function _postmanV2Request(item: any): any {
  const req = item.request || {};
  const rawUrl = typeof req.url === 'string' ? req.url : req.url?.raw || '';
  const headers = (req.header || []).map((h: any) => ({ key: h.key || '', value: h.value || '' }));

  let body = '';
  let bodyType = 'none';
  if (req.body) {
    if (req.body.mode === 'raw') {
      body = req.body.raw || '';
      bodyType = _detectPostmanRawBodyType(headers, req.body?.options?.raw?.language);
      // Try to detect content type from headers for body language
    } else if (req.body.mode === 'urlencoded') {
      bodyType = 'form';
      body = (req.body.urlencoded || [])
        .map((p: any) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value || '')}`)
        .join('&');
    } else if (req.body.mode === 'formdata') {
      bodyType = 'form';
    }
  }

  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    name: item.name || 'Untitled',
    method: (req.method || 'GET').toUpperCase(),
    url: rawUrl,
    headers,
    body,
    bodyType,
  };
}

function _postmanV1Request(req: any): any {
  const headers = (req.headerData || []).map((h: any) => ({ key: h.key || '', value: h.value || '' }));
  const rawType = _detectPostmanRawBodyType(headers, req.dataMode === 'raw' ? req.dataMode : undefined);
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    name: req.name || 'Untitled',
    method: (req.method || 'GET').toUpperCase(),
    url: req.url || '',
    headers,
    body: req.rawModeData || '',
    bodyType: req.dataMode === 'raw' ? rawType : 'none',
  };
}

interface OpenApiBodySeed {
  bodyType: 'none' | 'json' | 'text' | 'xml' | 'form' | 'urlencoded';
  body: string;
  formData?: Array<{ key: string; value: string; enabled: boolean; formType?: 'text' | 'file'; contentType?: string }>;
  urlencoded?: Array<{ key: string; value: string; enabled: boolean }>;
  contentType?: string;
}

function _resolveOpenApiRef(doc: any, ref: string): any {
  if (!ref.startsWith('#/')) return undefined;
  return ref
    .slice(2)
    .split('/')
    .reduce((obj: any, part: string) => obj?.[part.replace(/~1/g, '/').replace(/~0/g, '~')], doc);
}

function _resolveOpenApiSchema(doc: any, schema: any, seen = new Set<string>()): any {
  if (!schema || typeof schema !== 'object') return schema;

  if (schema.$ref) {
    if (seen.has(schema.$ref)) return {};
    seen.add(schema.$ref);
    const resolved = _resolveOpenApiRef(doc, schema.$ref);
    return _resolveOpenApiSchema(doc, resolved, seen) || {};
  }

  if (Array.isArray(schema.allOf)) {
    return schema.allOf.reduce((merged: any, part: any) => {
      const resolved = _resolveOpenApiSchema(doc, part, new Set(seen)) || {};
      return {
        ...merged,
        ...resolved,
        properties: { ...(merged.properties || {}), ...(resolved.properties || {}) },
        required: [...(merged.required || []), ...(resolved.required || [])],
      };
    }, { ...schema, allOf: undefined });
  }

  const alternative = schema.oneOf?.[0] || schema.anyOf?.[0];
  if (alternative) return _resolveOpenApiSchema(doc, alternative, seen);

  return schema;
}

function _resolveOpenApiObject(doc: any, obj: any): any {
  return obj?.$ref ? (_resolveOpenApiRef(doc, obj.$ref) || obj) : obj;
}

function _sampleFromOpenApiSchema(doc: any, schema: any, seen = new Set<any>()): any {
  schema = _resolveOpenApiSchema(doc, schema);
  if (!schema || typeof schema !== 'object') return null;
  if (seen.has(schema)) return null;
  seen.add(schema);

  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.examples) && schema.examples.length > 0) return schema.examples[0];
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (schema.const !== undefined) return schema.const;

  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  const inferredType = type || (schema.properties ? 'object' : schema.items ? 'array' : undefined);

  switch (inferredType) {
    case 'object': {
      const out: Record<string, any> = {};
      for (const [key, propSchema] of Object.entries(schema.properties || {})) {
        out[key] = _sampleFromOpenApiSchema(doc, propSchema, new Set(seen));
      }
      if (Object.keys(out).length === 0 && schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        out.property = _sampleFromOpenApiSchema(doc, schema.additionalProperties, new Set(seen));
      }
      return out;
    }
    case 'array':
      return [_sampleFromOpenApiSchema(doc, schema.items || {}, new Set(seen))];
    case 'integer':
    case 'number':
      return schema.minimum ?? 0;
    case 'boolean':
      return false;
    case 'string':
      if (schema.format === 'date-time') return new Date(0).toISOString();
      if (schema.format === 'date') return '1970-01-01';
      if (schema.format === 'email') return 'user@example.com';
      if (schema.format === 'uuid') return '00000000-0000-0000-0000-000000000000';
      if (schema.format === 'binary') return '';
      return '';
    default:
      return null;
  }
}

function _openApiSchemaToKv(doc: any, schema: any): Array<{ key: string; value: string; enabled: boolean }> {
  const resolved = _resolveOpenApiSchema(doc, schema);
  const sample = _sampleFromOpenApiSchema(doc, resolved);
  const obj = sample && typeof sample === 'object' && !Array.isArray(sample) ? sample : {};
  const keys = Object.keys(obj).length ? Object.keys(obj) : Object.keys(resolved?.properties || {});
  return keys.map((key) => {
    const value = obj[key] !== undefined ? obj[key] : _sampleFromOpenApiSchema(doc, resolved.properties?.[key]);
    return {
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value ?? ''),
      enabled: true,
    };
  });
}

function _openApiSchemaToFormData(
  doc: any,
  schema: any
): Array<{ key: string; value: string; enabled: boolean; formType: 'text' | 'file'; contentType?: string }> {
  const resolved = _resolveOpenApiSchema(doc, schema);
  return _openApiSchemaToKv(doc, resolved).map((item) => {
    const propSchema = _resolveOpenApiSchema(doc, resolved?.properties?.[item.key]);
    const isFile = propSchema?.type === 'string' && (propSchema.format === 'binary' || propSchema.format === 'base64');
    return {
      ...item,
      value: isFile ? '' : item.value,
      formType: isFile ? 'file' : 'text',
      contentType: isFile ? 'application/octet-stream' : undefined,
    };
  });
}

function _sampleToXml(value: any, tagName = 'root'): string {
  const safeTag = tagName.replace(/[^A-Za-z0-9_.-]/g, '') || 'item';
  if (Array.isArray(value)) {
    return value.map((item) => _sampleToXml(item, safeTag)).join('');
  }
  if (value && typeof value === 'object') {
    const children = Object.entries(value)
      .map(([key, child]) => _sampleToXml(child, key))
      .join('');
    return `<${safeTag}>${children}</${safeTag}>`;
  }
  return `<${safeTag}>${String(value ?? '')}</${safeTag}>`;
}

function _pickOpenApiContent(content: Record<string, any> = {}): { contentType: string; media: any } | null {
  const contentTypes = Object.keys(content);
  const normalized = (ct: string) => ct.toLowerCase().split(';')[0].trim();
  const preferred =
    contentTypes.find((ct) => normalized(ct).includes('json')) ||
    contentTypes.find((ct) => normalized(ct) === 'application/x-www-form-urlencoded') ||
    contentTypes.find((ct) => normalized(ct) === 'multipart/form-data') ||
    contentTypes.find((ct) => normalized(ct).includes('xml')) ||
    contentTypes.find((ct) => normalized(ct).startsWith('text/')) ||
    contentTypes[0];
  return preferred ? { contentType: preferred, media: content[preferred] } : null;
}

function _bodySeedFromContent(doc: any, contentType: string, media: any): OpenApiBodySeed {
  const normalizedContentType = contentType.toLowerCase().split(';')[0].trim();
  const schema = media?.schema;
  const firstNamedExample = Object.values(media?.examples || {})[0] as any;
  const mediaExample = media?.example ?? firstNamedExample?.value;
  const sample = mediaExample !== undefined ? mediaExample : _sampleFromOpenApiSchema(doc, schema);

  if (normalizedContentType === 'application/x-www-form-urlencoded') {
    return { bodyType: 'urlencoded', body: '', urlencoded: _openApiSchemaToKv(doc, schema), contentType };
  }
  if (normalizedContentType === 'multipart/form-data') {
    return {
      bodyType: 'form',
      body: '',
      formData: _openApiSchemaToFormData(doc, schema),
      contentType,
    };
  }
  if (normalizedContentType.includes('json')) {
    return { bodyType: 'json', body: JSON.stringify(sample ?? {}, null, 2), contentType };
  }
  if (normalizedContentType.includes('xml')) {
    const root = schema?.xml?.name || 'root';
    return { bodyType: 'xml', body: typeof sample === 'string' ? sample : _sampleToXml(sample ?? {}, root), contentType };
  }
  if (normalizedContentType.startsWith('text/')) {
    return { bodyType: 'text', body: typeof sample === 'string' ? sample : JSON.stringify(sample ?? ''), contentType };
  }
  return { bodyType: 'text', body: typeof sample === 'string' ? sample : JSON.stringify(sample ?? {}, null, 2), contentType };
}

function _buildOpenApiRequestBody(doc: any, op: any, pathItem: any, isOpenApi3: boolean): OpenApiBodySeed {
  const requestBody = _resolveOpenApiObject(doc, op.requestBody);
  if (isOpenApi3 && requestBody?.content) {
    const picked = _pickOpenApiContent(requestBody.content);
    if (picked) return _bodySeedFromContent(doc, picked.contentType, picked.media);
  }

  const parameters = [...(pathItem?.parameters || []), ...(op.parameters || [])].map((p) => _resolveOpenApiObject(doc, p));
  const consumes = op.consumes || doc.consumes || [];
  const contentType = consumes[0] || 'application/json';
  const bodyParam = parameters.find((p: any) => p?.in === 'body' && p.schema);
  if (bodyParam) {
    return _bodySeedFromContent(doc, contentType, { schema: bodyParam.schema, example: bodyParam.example });
  }

  const formParams = parameters.filter((p: any) => p?.in === 'formData');
  if (formParams.length > 0) {
    const normalizedContentType = contentType.toLowerCase().split(';')[0].trim();
    const items = formParams.map((p: any) => {
      const value = p.example ?? p.default ?? (Array.isArray(p.enum) ? p.enum[0] : '');
      return { key: p.name || '', value: String(value ?? ''), enabled: true };
    });
    if (normalizedContentType === 'multipart/form-data') {
      return {
        bodyType: 'form',
        body: '',
        formData: formParams.map((p: any, index: number) => ({
          ...items[index],
          formType: p.type === 'file' ? 'file' as const : 'text' as const,
          contentType: p.type === 'file' ? 'application/octet-stream' : undefined,
        })),
        contentType,
      };
    }
    return { bodyType: 'urlencoded', body: '', urlencoded: items, contentType: 'application/x-www-form-urlencoded' };
  }

  return { bodyType: 'none', body: '' };
}

function _parseOpenApiCollection(data: any): { id: string; name: string; requests: any[]; groups: any[] } | null {
  const isOpenApi3 = typeof data?.openapi === 'string' && data.openapi.startsWith('3');
  const isSwagger2 = data?.swagger === '2.0';
  if (!isOpenApi3 && !isSwagger2) return null;

  const name = data.info?.title || 'OpenAPI Import';

  let baseUrl = '';
  if (isOpenApi3) {
    baseUrl = (data.servers?.[0]?.url || '').replace(/\/$/, '');
  } else {
    const scheme = (data.schemes?.[0] || 'https') as string;
    const host = (data.host || '') as string;
    const basePath = (data.basePath || '') as string;
    baseUrl = `${scheme}://${host}${basePath}`.replace(/\/$/, '');
  }

  // Group requests by their first tag
  const tagMap = new Map<string, any[]>(); // tag → requests[]
  const untagged: any[] = [];

  const paths: Record<string, any> = data.paths || {};
  const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];
  for (const [path, methods] of Object.entries(paths)) {
    for (const method of HTTP_METHODS) {
      const op = (methods as any)[method];
      if (!op) continue;

      const reqName = op.summary || op.operationId || `${method.toUpperCase()} ${path}`;
      const url = `${baseUrl}${path}`;
      const headers: { key: string; value: string }[] = [];
      const bodySeed = _buildOpenApiRequestBody(data, op, methods, isOpenApi3);

      if (bodySeed.contentType) {
        headers.push({ key: 'Content-Type', value: bodySeed.contentType });
      }

      const req = {
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        name: reqName,
        method: method.toUpperCase(),
        url,
        headers,
        body: bodySeed.body,
        bodyType: bodySeed.bodyType,
        formData: bodySeed.formData || [],
        urlencoded: bodySeed.urlencoded || [],
      };

      const tag = (op.tags?.[0] as string | undefined) || '';
      if (tag) {
        if (!tagMap.has(tag)) tagMap.set(tag, []);
        tagMap.get(tag)!.push(req);
      } else {
        untagged.push(req);
      }
    }
  }

  // Build groups from tags
  const groups: any[] = [];
  for (const [tag, reqs] of tagMap.entries()) {
    groups.push({
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      name: tag,
      requests: reqs,
      groups: [],
    });
  }

  return { id: Date.now().toString(), name, requests: untagged, groups };
}
