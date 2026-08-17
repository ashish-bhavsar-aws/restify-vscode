import * as vscode from 'vscode';
import { getSidebarHtml } from '../../webview/sidebarHtml';
import { parseOpenApiViewerSpec, type OpenApiViewerSpec } from '../../core/openapiViewer';
import { parseOpenApiCollection } from '../../core/converters/openapi';
import { parseYaml } from '../../core/converters/yaml';
import { httpGet } from './sidebarHelpers';
import { StorageManager } from '../../storage/StorageManager';

export class OpenApiProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _spec: OpenApiViewerSpec | null = null;
  private _expansionStates: Record<string, boolean> = {};

  constructor(
    private context: vscode.ExtensionContext,
    private storageManager: StorageManager
  ) {
    const saved = this.context.globalState.get<Record<string, boolean>>('restify.openapi.expansionStates');
    if (saved) this._expansionStates = saved;
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
    webviewView.webview.html = getSidebarHtml('openapi', this.context, webviewView.webview);

    try {
      webviewView.webview.postMessage({ command: 'setTheme', kind: vscode.window.activeColorTheme.kind });
    } catch { /* empty */ }
    const themeListener = vscode.window.onDidChangeActiveColorTheme((t) => {
      webviewView.webview.postMessage({ command: 'setTheme', kind: t.kind });
    });
    webviewView.onDidDispose(() => themeListener.dispose());

    this._sendData();

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.command) {
        case 'requestData':
          this._sendData();
          break;
        case 'loadSpecFile':
          await this._loadFromFile();
          break;
        case 'loadSpecUrl':
          await this._loadFromUrl();
          break;
        case 'loadEndpoint':
          this._loadEndpoint(msg.endpoint);
          break;
        case 'importAsCollection':
          this._importAsCollection();
          break;
        case 'toggleExpansion':
          this._expansionStates[msg.id] = msg.isOpen;
          this.context.globalState.update('restify.openapi.expansionStates', this._expansionStates);
          this._view?.webview.postMessage({
            command: 'expansionStates',
            states: this._expansionStates,
          });
          break;
      }
    });
  }

  private async _loadFromFile(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'OpenAPI / Swagger': ['json', 'yaml', 'yml'] },
      openLabel: 'Open API Spec',
    });
    if (!uris?.[0]) return;
    const raw = Buffer.from(await vscode.workspace.fs.readFile(uris[0])).toString('utf8');
    try {
      const isYaml = /\.(yaml|yml)$/i.test(uris[0].fsPath);
      const data = isYaml ? parseYaml(raw) : JSON.parse(raw);
      this._setSpec(data);
    } catch {
      vscode.window.showErrorMessage('Failed to parse OpenAPI spec');
    }
  }

  private async _loadFromUrl(): Promise<void> {
    const url = await vscode.window.showInputBox({
      prompt: 'Enter OpenAPI spec URL',
      placeHolder: 'https://petstore.swagger.io/v2/swagger.json',
      validateInput: (v) => {
        try { const u = new URL(v); return (u.protocol === 'http:' || u.protocol === 'https:') ? undefined : 'Use http or https'; }
        catch { return 'Enter a valid URL'; }
      },
    });
    if (!url) return;
    try {
      const { statusCode, body, contentType } = await httpGet(url);
      if (statusCode < 200 || statusCode >= 300) {
        vscode.window.showErrorMessage(`Server responded with ${statusCode}`);
        return;
      }
      const data = (contentType.includes('yaml') || contentType.includes('x-yaml'))
        ? parseYaml(body) : JSON.parse(body);
      this._setSpec(data);
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to load spec: ${e?.message || 'network error'}`);
    }
  }

  private _setSpec(data: any): void {
    const spec = parseOpenApiViewerSpec(data);
    if (!spec) {
      vscode.window.showErrorMessage('Not a valid OpenAPI / Swagger document');
      return;
    }
    this._spec = spec;
    this._expansionStates = {};
    this._sendData();
    vscode.window.showInformationMessage(`Loaded "${spec.title}" — ${spec.totalEndpoints} endpoint(s)`);
  }

  private _loadEndpoint(endpoint: any): void {
    if (!endpoint) return;
    const url = this._spec ? `${this._spec.baseUrl}${endpoint.path}` : endpoint.path;
    vscode.commands.executeCommand('restify.openMain', {
      method: endpoint.method,
      url,
      name: endpoint.summary || `${endpoint.method} ${endpoint.path}`,
      headers: endpoint.requestBody?.contentType
        ? [{ key: 'Content-Type', value: endpoint.requestBody.contentType }]
        : [],
      queryParams: (endpoint.parameters || [])
        .filter((p: any) => p.in === 'query')
        .map((p: any) => ({
          key: p.name,
          value: p.example !== undefined ? String(p.example) : '',
          enabled: true,
        })),
      bodyType: endpoint.requestBody?.contentType?.includes('json') ? 'json'
        : endpoint.requestBody?.contentType?.includes('form-urlencoded') ? 'urlencoded'
        : endpoint.requestBody?.contentType?.includes('form-data') ? 'form'
        : endpoint.requestBody?.contentType?.includes('xml') ? 'xml'
        : endpoint.requestBody ? 'text' : 'none',
      body: endpoint.requestBody?.example !== undefined
        ? (typeof endpoint.requestBody.example === 'string'
          ? endpoint.requestBody.example
          : JSON.stringify(endpoint.requestBody.example, null, 2))
        : '',
    });
  }

  private _importAsCollection(): void {
    if (!this._spec?.raw) {
      vscode.window.showWarningMessage('No spec loaded');
      return;
    }
    const collection = parseOpenApiCollection(this._spec.raw);
    if (!collection) {
      vscode.window.showWarningMessage('Failed to convert spec to collection');
      return;
    }
    const existing = this.storageManager.getCollections().find(c => c.name === collection.name);
    this.storageManager.saveCollection({ ...collection, id: existing?.id || collection.id });
    const total = collection.requests.length + (collection.groups || []).reduce((s: number, g: any) => s + (g.requests?.length || 0), 0);
    vscode.window.showInformationMessage(`Imported "${collection.name}" as collection with ${total} request(s)`);
  }

  private _sendData(): void {
    if (!this._view) return;
    this._view.webview.postMessage({
      command: 'setData',
      type: 'openapi',
      data: {
        spec: this._spec ? {
          id: this._spec.id,
          title: this._spec.title,
          version: this._spec.version,
          description: this._spec.description,
          baseUrl: this._spec.baseUrl,
          tags: this._spec.tags,
          untagged: this._spec.untagged,
          totalEndpoints: this._spec.totalEndpoints,
        } : null,
        expansionStates: this._expansionStates,
      },
    });
  }

  refresh(): void { this._sendData(); }
}
