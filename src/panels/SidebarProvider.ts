import * as vscode from 'vscode';
import * as https from 'https';
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

    // Send initial theme color kind so webview can adapt icon coloring
    try {
      webviewView.webview.postMessage({ command: 'setTheme', kind: vscode.window.activeColorTheme.kind });
    } catch (e) {
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
          const data = JSON.stringify(col, null, 2);
          // sanitize name for filesystem
          const safe = (col.name || 'collection').replace(/[^a-z0-9._-]/gi, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '');
          const defaultName = `${safe || 'collection'}-restify.collection.json`;
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(defaultName),
            filters: { 'JSON': ['json'] },
          });
          if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(data, 'utf8'));
            vscode.window.showInformationMessage('✓ Collection exported');
          }
          break;
        }
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
        collections: this.storageManager.getCollections(),
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
          label: '$(cloud-download) OpenAPI / Swagger URL',
          description: 'Fetch and import endpoints from a Swagger / OpenAPI URL',
          id: 'swagger-url',
        },
        {
          label: '$(file-zip) Restify Collection',
          description: 'Import a previously exported Restify collection JSON file',
          id: 'restify',
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
      case 'swagger-file':
        await this._importSwaggerFile();
        break;
      case 'swagger-url':
        await this._importSwaggerUrl();
        break;
    }
  }

  private async _importRestifyCollection(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
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
    const uris = await vscode.window.showOpenDialog({
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

  private async _importSwaggerFile(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
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

// ─── HTTP helper ──────────────────────────────────────────────────────────────

/** Simple GET following up to 5 redirects, returns body as string. */
function _httpGet(
  reqUrl: string,
  redirectsLeft = 5
): Promise<{ statusCode: number; body: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const parsed = new (require('url').URL)(reqUrl);
    const isHttps = parsed.protocol === 'https:';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod: typeof https = isHttps ? require('https') : require('http');
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

function _postmanV2Request(item: any): any {
  const req = item.request || {};
  const rawUrl = typeof req.url === 'string' ? req.url : req.url?.raw || '';
  const headers = (req.header || []).map((h: any) => ({ key: h.key || '', value: h.value || '' }));

  let body = '';
  let bodyType = 'none';
  if (req.body) {
    if (req.body.mode === 'raw') {
      body = req.body.raw || '';
      bodyType = 'raw';
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
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    name: req.name || 'Untitled',
    method: (req.method || 'GET').toUpperCase(),
    url: req.url || '',
    headers,
    body: req.rawModeData || '',
    bodyType: req.dataMode === 'raw' ? 'raw' : 'none',
  };
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

      if (isOpenApi3 && op.requestBody?.content) {
        const ct = Object.keys(op.requestBody.content)[0];
        if (ct) headers.push({ key: 'Content-Type', value: ct });
      } else if (isSwagger2 && op.consumes?.length) {
        headers.push({ key: 'Content-Type', value: op.consumes[0] });
      }

      const req = {
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        name: reqName,
        method: method.toUpperCase(),
        url,
        headers,
        body: '',
        bodyType: 'none',
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

