import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import { URL } from 'url';
import { StorageManager } from '../storage/StorageManager';
import { getMainPanelHtml } from '../webview/mainPanelHtml';

// Load https-proxy-agent at runtime to avoid module resolution issues
let HttpProxyAgent: any;
try {
  const proxyModule = require('https-proxy-agent');
  // Support different export shapes across versions:
  // - module.exports = HttpsProxyAgent (function/class)
  // - exports.HttpsProxyAgent = HttpsProxyAgent (named)
  // - exports.default = HttpsProxyAgent (ES module interop)
  HttpProxyAgent = proxyModule.HttpsProxyAgent || proxyModule.default || proxyModule;
} catch (e) {
  console.error('Failed to load https-proxy-agent:', e);
}

// Helper class to disable all proxy detection (direct connection only)
class NoProxyAgent extends http.Agent {
  constructor() {
    super({ keepAlive: true });
  }
}

class NoProxyAgentHttps extends https.Agent {
  constructor() {
    super({ keepAlive: true });
  }
}

const noProxyAgentHttp = new NoProxyAgent();
const noProxyAgentHttps = new NoProxyAgentHttps();

interface RequestData {
  name?: string;
  method: string;
  url: string;
  headers?: Array<{ key: string; value: string; enabled?: boolean }>;
  bodyType?: string;
  body?: string;
  formData?: Array<{
    key: string;
    value?: string;
    enabled?: boolean;
    formType?: 'text' | 'file';
    fileName?: string;
    fileContentBase64?: string;
    contentType?: string;
  }>;
  urlencoded?: Array<{ key: string; value: string; enabled?: boolean }>;
  queryParams?: Array<{ key: string; value: string; enabled?: boolean }>;
  rejectUnauthorized?: boolean;
  script?: string; // Post-response script for variable extraction
  authType?: 'none' | 'bearer' | 'basic' | 'apikey';
  authData?: {
    token?: string;
    username?: string;
    password?: string;
    keyName?: string;
    keyValue?: string;
    addTo?: 'header' | 'query';
  };
  gqlQuery?: string;
  gqlVars?: string;
  activeEnvironmentId?: string;
}

interface RequestResult {
  status: number;
  statusText: string;
  headers: Record<string, any>;
  body: string;
}

export class RestifyPanel {
  private panel: vscode.WebviewPanel;
  private context: vscode.ExtensionContext;
  private storageManager: StorageManager;
  private onDispose: (instance: RestifyPanel) => void;
  private pendingRequest: RequestData | null = null;
  private webviewReady: boolean = false;
  
  constructor(
    context: vscode.ExtensionContext,
    storageManager: StorageManager,
    onDispose: (instance: RestifyPanel) => void
  ) {
    this.context = context;
    this.storageManager = storageManager;
    this.onDispose = onDispose;

    this.panel = vscode.window.createWebviewPanel(
      'restify-main',
      'New Request',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      }
    );

    this.panel.webview.html = getMainPanelHtml(context, this.panel.webview);
    this.panel.webview.onDidReceiveMessage((msg) => {
      this._handleMessage(msg).catch((err) => {
        console.error('Error handling message:', err);
        // Send error response to webview to clear loading state
        this.panel.webview.postMessage({
          command: 'requestError',
          error: err?.message || 'An unexpected error occurred',
          duration: 0,
        });
      });
    });

    this.panel.onDidDispose(() => {
      this.onDispose(this);
    });

    this.updateMetadata();
  }

  private createSafeId(len = 8): string {
    return Math.random().toString(36).slice(2, 2 + len);
  }

  updateMetadata(): void {
    // Small delay to ensure webview is ready to receive messages
    setTimeout(() => {
      this._sendEnvironments();
      this.panel.webview.postMessage({
        command: 'collections',
        data: this.storageManager.getCollections(),
      });
      this.panel.webview.postMessage({
        command: 'loadSettings',
        settings: this.storageManager.getSettings(),
      });
    }, 100);
  }

  loadRequest(requestData: RequestData): void {
    this.pendingRequest = requestData;
    
    if (requestData && requestData.name) {
      this.panel.title = requestData.name;
    }
    
    // If webview is already ready, send immediately
    if (this.webviewReady) {
      this._sendPendingRequest();
    }
  }

  private _sendPendingRequest(): void {
    if (this.pendingRequest) {
      this.panel.webview.postMessage({
        command: 'loadRequest',
        data: this.pendingRequest,
      });
      this.pendingRequest = null;
    }
  }

  private _sendEnvironments(): void {
    this.panel.webview.postMessage({
      command: 'setEnvironments',
      environments: this.storageManager.getEnvironments(),
      activeEnvId: this.storageManager.getActiveEnvironment()?.id || null,
    });
  }

  private _shouldUseProxy(
    host: string,
    noProxyArray?: string[]
  ): boolean {
    if (!noProxyArray || !Array.isArray(noProxyArray)) return true;

    const normalizedHost = host.trim().toLowerCase();

    return !noProxyArray.some((noHost) => {
      // Accept entries like "ubstest.com", ".ubstest.com", or "https://ubstest.com:8080".
      let sanitizedNoHost = noHost.trim().toLowerCase();
      sanitizedNoHost = sanitizedNoHost.replace(/^[a-z]+:\/\//, '');
      sanitizedNoHost = sanitizedNoHost.replace(/:\d+$/, '');
      sanitizedNoHost = sanitizedNoHost.replace(/^\.+/, '');

      if (!sanitizedNoHost) return false;

      // Match exact host OR subdomain boundary (abc.ubstest.com endsWith .ubstest.com).
      return (
        normalizedHost === sanitizedNoHost ||
        normalizedHost.endsWith(`.${sanitizedNoHost}`)
      );
    });
  }

  private _getCertificatesForHost(
    host: string
  ): Record<string, Buffer> | null {
    const settings = this.storageManager.getSettings();
    const certMatch = (settings.certificates || []).find(
      (cert) => host === cert.hostname || host.endsWith('.' + cert.hostname)
    );

    if (certMatch) {
      try {
        const options: Record<string, Buffer> = {};
        if (certMatch.certPath)
          options.cert = fs.readFileSync(certMatch.certPath);
        if (certMatch.keyPath)
          options.key = fs.readFileSync(certMatch.keyPath);
        if (certMatch.caPath)
          options.ca = fs.readFileSync(certMatch.caPath);
        return options;
      } catch (err) {
        console.error(`Failed to read certificates for ${host}:`, err);
        return null;
      }
    }
    return null;
  }

  private async _handleMessage(msg: any): Promise<void> {
    switch (msg.command) {
      case 'webviewReady':
        // Webview is ready, send all initial data
        this.webviewReady = true;
        this.updateMetadata();
        // Send any pending request data
        this._sendPendingRequest();
        break;
      case 'executeRequest':
        // msg.savedRequest is the original state (no injected auth headers) — used for history.
        await this._executeRequest(msg.request, msg.savedRequest);
        break;
      case 'setScriptVariables':
        // Script extracted variables - add them to the active environment
        if (this.storageManager.getActiveEnvironment()) {
          const env = this.storageManager.getActiveEnvironment();
          if (env) {
            const existingVars = env.variables || [];
            const now = Date.now(); // Current timestamp
            // Update or add extracted variables with timestamp
            Object.entries(msg.variables).forEach(([key, value]) => {
              const existingIndex = existingVars.findIndex((v) => v.key === key);
              const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
              if (existingIndex >= 0) {
                // Update existing variable and set timestamp
                existingVars[existingIndex].value = stringValue;
                existingVars[existingIndex].timestamp = now;
              } else {
                // Add new variable with timestamp
                existingVars.push({ key, value: stringValue, timestamp: now });
              }
            });
            // Update environment using saveEnvironment
            this.storageManager.saveEnvironment({ ...env, variables: existingVars });
            // Notify webview of updated environment
            this._sendEnvironments();
          }
        }
        break;
      case 'saveToCollection':
        this._saveToCollection(msg.request, msg.collectionName);
        break;
      case 'getCollections':
        this.updateMetadata();
        break;
      case 'openSettings':
        vscode.commands.executeCommand('workbench.action.openSettings', 'restify');
        break;
      case 'configureProxy':
        await this._initializeProxySettings();
        break;
      case 'getEnvironments':
        this._sendEnvironments();
        break;
      case 'setActiveEnvironment':
        this.storageManager.setActiveEnvironment(msg.id);
        break;
      case 'updateTitle':
        this.panel.title = msg.title || 'New Request';
        break;
      case 'resolveTooltip':
        const resolved = this.storageManager.resolveVariables(msg.text);
        this.panel.webview.postMessage({
          command: 'setTooltipValue',
          value: resolved,
        });
        break;
      case 'saveSettings':
        this.storageManager.saveSettings(msg.settings);
        // Send confirmation back with the saved settings
        this.panel.webview.postMessage({
          command: 'loadSettings',
          settings: msg.settings,
        });
        vscode.window.showInformationMessage('✓ Settings saved successfully');
        break;
      case 'runScript':
        await this._runScript(msg.script, msg.response);
        break;
    }
  }

  private async _runScript(script: string, response: any): Promise<void> {
    // Execute the user script on the extension host (Node.js) using vm module
    // This bypasses the webview CSP that blocks eval/Worker.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vm = require('vm') as typeof import('vm');
    const logs: string[] = [];
    const variables: Record<string, any> = {};
    const vars = variables;

    const log = (...args: any[]) =>
      logs.push(
        args
          .map((a) => {
            try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); }
          })
          .join(' ')
      );
    const set = (k: string, v: any) => { variables[String(k)] = v; };

    let parsedBody: any = response?.body ?? '';
    try { parsedBody = JSON.parse(parsedBody); } catch { /* keep raw string */ }

    const responseObj = {
      status: response?.status ?? 0,
      statusText: response?.statusText ?? '',
      headers: response?.headers ?? {},
      body: parsedBody,
      rawBody: response?.body ?? '',
    };

    try {
      const context = vm.createContext({
        response: responseObj,
        headers: responseObj.headers,
        status: responseObj.status,
        statusText: responseObj.statusText,
        set,
        log,
        vars,
        variables,
        console: { log, warn: log, error: log, info: log },
      });

      const wrapped = '(async function(){' + script + '})();';
      // vm.runInContext with timeout only covers synchronous part; we race the promise
      const resultPromise = vm.runInContext(wrapped, context, { timeout: 5000 });

      if (resultPromise && typeof (resultPromise as any).then === 'function') {
        await Promise.race([
          resultPromise,
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('Script timed out after 5s')), 5000)
          ),
        ]);
      }

      this.panel.webview.postMessage({
        command: 'scriptResult',
        result: { success: true, variables, logs },
      });

      // Save extracted variables to active environment (reuse existing logic)
      if (Object.keys(variables).length > 0) {
        await this._handleMessage({ command: 'setScriptVariables', variables });
      }
    } catch (err: any) {
      this.panel.webview.postMessage({
        command: 'scriptResult',
        result: { success: false, variables, logs, error: err?.message ?? String(err) },
      });
    }
  }

  private async _initializeProxySettings(): Promise<void> {
    const config = vscode.workspace.getConfiguration('restify');
    const existingProxy = config.get('proxy');

    if (!existingProxy || Object.keys(existingProxy).length === 0) {
      await config.update(
        'proxy',
        {
          'http.proxyAuthorization': null,
          'http.proxy': 'https://abc.com:8080',
          'http.noProxy': ['abc.com'],
        },
        vscode.ConfigurationTarget.Global
      );
      vscode.window.showInformationMessage(
        'Proxy configuration initialized in settings.json'
      );
    }
    vscode.commands.executeCommand(
      'workbench.action.openSettings',
      'restify.proxy'
    );
  }

  private async _executeRequest(req: RequestData, savedReq?: RequestData): Promise<void> {
    // savedReq is the original request state without injected auth headers.
    // Use it when persisting to history so reloading doesn't re-duplicate auth headers.
    const historyReq = savedReq || req;
    const startTime = Date.now();
    const timings: any = { start: startTime };
    const resolveVars = (s: string | undefined) =>
      this.storageManager.resolveVariables(s || '');

    const rawUrl = resolveVars(req.url);
    const method = req.method || 'GET';
    const headers: Record<string, string> = {};

    (req.headers || []).forEach((h) => {
      if (h.key && h.enabled !== false) {
        headers[resolveVars(h.key)] = resolveVars(h.value);
      }
    });

    let body: string | Buffer | undefined = undefined;
    if (req.bodyType === 'json' && req.body) {
      body = resolveVars(req.body);
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
    } else if (req.bodyType === 'form' && req.formData) {
      const enabledFields = (req.formData || []).filter(
        (f) => f.key && f.enabled !== false
      );
      const hasFileField = enabledFields.some(
        (f) => (f.formType || 'text') === 'file'
      );

      if (hasFileField) {
        const boundary = `----RestifyFormBoundary${Date.now().toString(16)}`;
        const chunks: Buffer[] = [];

        enabledFields.forEach((field) => {
          const fieldName = resolveVars(field.key);
          const fieldType = field.formType || 'text';

          if (fieldType === 'file' && field.fileContentBase64) {
            const fileName = field.fileName || 'upload.bin';
            const contentType =
              field.contentType || 'application/octet-stream';
            const fileBuffer = Buffer.from(field.fileContentBase64, 'base64');

            chunks.push(
              Buffer.from(
                `--${boundary}\r\n` +
                  `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
                  `Content-Type: ${contentType}\r\n\r\n`
              )
            );
            chunks.push(fileBuffer);
            chunks.push(Buffer.from('\r\n'));
            return;
          }

          const fieldValue = resolveVars(field.value || '');
          chunks.push(
            Buffer.from(
              `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="${fieldName}"\r\n\r\n` +
                `${fieldValue}\r\n`
            )
          );
        });

        chunks.push(Buffer.from(`--${boundary}--\r\n`));
        body = Buffer.concat(chunks);

        headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
        headers['Content-Length'] = String(body.length);
      } else {
        const params = new URLSearchParams();
        enabledFields.forEach((f) => {
          params.append(resolveVars(f.key), resolveVars(f.value || ''));
        });
        body = params.toString();
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
      }
    } else if (req.bodyType === 'urlencoded') {
      const enabledFields = (req.urlencoded || []).filter(
        (f) => f.key && f.enabled !== false
      );
      const params = new URLSearchParams();
      enabledFields.forEach((f) => {
        params.append(resolveVars(f.key), resolveVars(f.value || ''));
      });
      body = params.toString();
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    } else if (req.bodyType === 'text' || req.bodyType === 'xml') {
      body = resolveVars(req.body);
      if (req.bodyType === 'xml' && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/xml';
      }
    }

    let finalUrl = rawUrl;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
      if (req.queryParams && req.queryParams.length > 0) {
        req.queryParams.forEach((p) => {
          if (p.key && p.enabled !== false) {
            parsedUrl.searchParams.append(
              resolveVars(p.key),
              resolveVars(p.value)
            );
          }
        });
        finalUrl = parsedUrl.toString();
      }
    } catch (e) {
      this.panel.webview.postMessage({
        command: 'requestError',
        error: 'Invalid URL',
        duration: 0,
      });
      return;
    }

    const settings = this.storageManager.getSettings();
    let proxyOpts: { proxy: string; auth?: string } | null = null;

    if (settings.proxy) {
      // Parse no-proxy list - filter out empty strings
      const noProxyArray = settings.noProxy
        ? settings.noProxy.split(',').map((h) => h.trim()).filter((h) => h.length > 0)
        : [];
      
      // Log for debugging
      console.log('Proxy check:', {
        proxyConfigured: !!settings.proxy,
        hostname: parsedUrl.hostname.toLowerCase(),
        noProxyList: noProxyArray,
        shouldUseProxy: this._shouldUseProxy(parsedUrl.hostname.toLowerCase(), noProxyArray),
      });
      
      if (this._shouldUseProxy(parsedUrl.hostname.toLowerCase(), noProxyArray)) {
        proxyOpts = {
          proxy: settings.proxy,
          auth: settings.proxyAuthorization,
        };
        console.log('✓ Proxy is ENABLED for this request');
      } else {
        console.log('✗ Proxy is DISABLED (hostname in noProxy list)');
      }
    } else {
      console.log('⚠ No proxy configured in settings');
    }

    // Send a debug log to the webview so the UI can surface diagnostic steps
    try {
      this.panel.webview.postMessage({ command: 'debugLog', data: { stage: 'preparedRequest', info: { method, url: finalUrl, headers: Object.keys(headers).slice(0,10), hasBody: !!body } } });
    } catch (e) { /* ignore postMessage failures for debug */ }

    this.panel.webview.postMessage({ command: 'requestStart' });

    try {
      const netStart = Date.now();
      const result = await this._doRequest(
        method,
        finalUrl,
        headers,
        body,
        req.rejectUnauthorized === true,
        proxyOpts
      );
      try {
        this.panel.webview.postMessage({ command: 'debugLog', data: { stage: 'receivedResponse', info: { status: result.status, size: Buffer.byteLength(result.body || '', 'utf8') } } });
      } catch (e) {}
      timings.network = Date.now() - netStart;

      const duration = Date.now() - startTime;
      const responseData = {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
        body: result.body,
        duration,
        size: Buffer.byteLength(result.body || '', 'utf8'),
      };

      // Detect mTLS usage
      const mtlsCerts = this._getCertificatesForHost(parsedUrl.hostname);

      // Build resolved headers array for display
      const resolvedHeaders = (req.headers || []).map((h) => ({
        ...h,
        key: resolveVars(h.key),
        value: resolveVars(h.value),
      }));

      // Build curl command
      let curlCommand = `curl -X ${method}`;
      
      // Add headers
      resolvedHeaders.forEach((h) => {
        if (h.enabled !== false) {
          curlCommand += ` -H "${h.key}: ${h.value}"`;
        }
      });

      // Add data/body
      if (body) {
        if (typeof body === 'string') {
          curlCommand += ` -d '${body.replace(/'/g, "'\\''")}'`;
        } else {
          curlCommand += ` --data-binary @file`;
        }
      }

      // Add URL
      curlCommand += ` "${finalUrl}"`;

      // Offload large bodies to file storage (async) to keep postMessage small
      const safeResponse = { ...responseData } as any;
      const safeRequestInfo: any = {
        method,
        url: finalUrl,
        proxyUsed: !!proxyOpts,
        proxyUrl: proxyOpts?.proxy || null,
        hasProxyAuth: !!proxyOpts?.auth,
        mtlsUsed: !!mtlsCerts,
        mtlsHostname: mtlsCerts ? parsedUrl.hostname : null,
        headers: resolvedHeaders,
        queryParams: req.queryParams,
        body: req.body,
        rejectUnauthorized: req.rejectUnauthorized === true,
        curlCommand,
      };

      // NOTE: We intentionally do NOT offload the response body to a file for the
      // webview postMessage. Doing so would set body=undefined in the webview,
      // causing JsonPrettyViewer to crash with a TypeError and blank the UI.
      // File offloading is only done inside addToHistory (StorageManager) for the
      // persistence layer, where the body is never needed in-webview.

      // Measure postMessage serialization time and size
      try {
        const pmStart = Date.now();
        // measure approximate size
        let size = 0;
        try { size = Buffer.byteLength(JSON.stringify({ response: safeResponse, requestInfo: safeRequestInfo }), 'utf8'); } catch {}
        this.panel.webview.postMessage({
          command: 'requestComplete',
          response: safeResponse,
          requestInfo: safeRequestInfo,
        });
        timings.postMessageMs = Date.now() - pmStart;
        timings.postMessageSize = size;
      } catch (pmErr) {
        console.error('postMessage failed:', pmErr);
      }

      // Measure history add time
      try {
        const hStart = Date.now();
        this.storageManager.addToHistory({
          method,
          url: finalUrl,
          name: historyReq.name || `${method} ${finalUrl}`,
          status: result.status,
          duration,
          request: historyReq,
          response: responseData,
          activeEnvironmentId: this.storageManager.getActiveEnvironment()?.id || null,
        });
        timings.addHistoryMs = Date.now() - hStart;
      } catch (hErr) {
        console.error('addToHistory failed:', hErr);
      }

      // Log timings for diagnostics
      console.log('Restify: request timings', {
        url: finalUrl,
        status: result.status,
        timings,
      });
    } catch (err: any) {
      try {
        this.panel.webview.postMessage({ command: 'debugLog', data: { stage: 'requestError', info: { message: err?.message || String(err) } } });
      } catch (e) {}
      const duration = Date.now() - startTime;
      this.panel.webview.postMessage({
        command: 'requestError',
        error: err.message,
        duration,
      });
      this.storageManager.addToHistory({
        method,
        url: finalUrl,
        name: historyReq.name || `${method} ${finalUrl}`,
        status: 0,
        error: err.message,
        duration,
        request: historyReq,
        activeEnvironmentId: this.storageManager.getActiveEnvironment()?.id || null,
      });
    }
  }

  private _doRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | Buffer | undefined,
    rejectUnauthorized: boolean,
    proxyOpts: { proxy: string; auth?: string } | null
  ): Promise<RequestResult> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';

      const rawProxyAuth = proxyOpts?.auth?.trim();
      let proxyAuthToken: string | undefined;
      let proxyAuthCredentials: string | undefined;
      if (rawProxyAuth) {
        if (/^Basic\s+/i.test(rawProxyAuth)) {
          proxyAuthToken = rawProxyAuth.replace(/^Basic\s+/i, '').trim();
        } else if (rawProxyAuth.includes(':')) {
          proxyAuthCredentials = rawProxyAuth;
          proxyAuthToken = Buffer.from(rawProxyAuth).toString('base64');
        } else {
          proxyAuthToken = rawProxyAuth;
        }

        if (!proxyAuthCredentials && proxyAuthToken) {
          try {
            const decoded = Buffer.from(proxyAuthToken, 'base64').toString('utf8');
            if (decoded.includes(':')) {
              proxyAuthCredentials = decoded;
            }
          } catch {
            // Ignore malformed auth and continue without credentials.
          }
        }
      }

      let options: https.RequestOptions & http.RequestOptions = {
        method,
        headers,
        rejectUnauthorized,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port
          ? parseInt(parsedUrl.port, 10)
          : isHttps
            ? 443
            : 80,
        path: parsedUrl.pathname + parsedUrl.search,
      };

      if (isHttps) {
        const mtlsOptions = this._getCertificatesForHost(parsedUrl.hostname);
        if (mtlsOptions) {
          Object.assign(options, mtlsOptions);
        }
      }

      if (proxyOpts && proxyOpts.proxy) {
        try {
          const normalizedProxyUrl = /^[a-z]+:\/\//i.test(proxyOpts.proxy)
            ? proxyOpts.proxy
            : `http://${proxyOpts.proxy}`;
          const parsedProxyUrl = new URL(normalizedProxyUrl);
          const isProxyHttps = parsedProxyUrl.protocol === 'https:';

          if (HttpProxyAgent) {
            const proxyUrlForAgent = new URL(parsedProxyUrl.toString());

            // Allow auth from either proxy URL or separate proxyAuthorization field.
            if (proxyAuthCredentials && !proxyUrlForAgent.username) {
              const separator = proxyAuthCredentials.indexOf(':');
              if (separator >= 0) {
                proxyUrlForAgent.username = proxyAuthCredentials.slice(0, separator);
                proxyUrlForAgent.password = proxyAuthCredentials.slice(separator + 1);
              }
            }

            try {
              options.agent = new HttpProxyAgent(proxyUrlForAgent.toString());
            } catch (agentErr) {
              console.error('Failed to create proxy agent:', agentErr);
              return reject(
                new Error(
                  `Failed to create proxy agent: ${agentErr instanceof Error ? agentErr.message : String(agentErr)}`
                )
              );
            }

            if (proxyAuthToken) {
              options.headers = { ...options.headers } as Record<string, string>;
              (options.headers as Record<string, string>)['Proxy-Authorization'] = `Basic ${proxyAuthToken}`;
            }

            console.log('Using proxy agent:', {
              proxyHost: parsedProxyUrl.hostname,
              proxyPort: parsedProxyUrl.port || (isProxyHttps ? '443' : '80'),
              hasProxyAuth: !!proxyAuthToken,
              targetUrl: url,
              rejectUnauthorized: options.rejectUnauthorized,
            });

            const lib = isHttps ? https : http;
            return this._executeProxyRequest(lib, options, body, resolve, reject);
          }

          // Fallback when proxy agent is unavailable (supports plain HTTP target requests).
          if (isHttps) {
            return reject(new Error('Proxy agent module is not available for HTTPS target requests'));
          }

          options.hostname = parsedProxyUrl.hostname;
          options.port = parsedProxyUrl.port
            ? parseInt(parsedProxyUrl.port, 10)
            : isProxyHttps
              ? 443
              : 80;
          options.path = url;

          if (proxyAuthToken) {
            options.headers = { ...options.headers } as Record<string, string>;
            (options.headers as Record<string, string>)['Proxy-Authorization'] = `Basic ${proxyAuthToken}`;
          }

          const lib = isProxyHttps ? https : http;
          return this._executeProxyRequest(lib, options, body, resolve, reject);
        } catch (e) {
          console.error('Proxy URL parsing error:', e);
          return reject(
            new Error(
              `Invalid Proxy URL configuration: ${e instanceof Error ? e.message : String(e)}`
            )
          );
        }
      }

      // IMPORTANT: If no proxy is configured, explicitly set agent to disable system proxy detection
      // This prevents Node.js from using environment variables or system-wide proxy settings
      if (!proxyOpts || !proxyOpts.proxy) {
        console.log('🔒 CRITICAL: Disabling system proxy - using direct connection ONLY');
        options.agent = isHttps ? noProxyAgentHttps : noProxyAgentHttp;
      }
      try {
        this.panel.webview.postMessage({ command: 'debugLog', data: { stage: 'doRequest-start', info: { hostname: parsedUrl.hostname, port: options.port, isHttps } } });
      } catch (e) {}

      const lib = isHttps ? https : http;
      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            this.panel.webview.postMessage({ command: 'debugLog', data: { stage: 'doRequest-end', info: { status: res.statusCode, size: Buffer.byteLength(data || '', 'utf8') } } });
          } catch (e) {}
          resolve({
            status: res.statusCode || 0,
            statusText: res.statusMessage || '',
            headers: res.headers,
            body: data,
          });
        });
      });
      req.on('error', (err) => {
        try { this.panel.webview.postMessage({ command: 'debugLog', data: { stage: 'doRequest-error', info: { message: err?.message || String(err) } } }); } catch (e) {}
        reject(err);
      });
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timed out after 30 seconds'));
      });

      if (body) req.write(body);
      req.end();
    });
  }

  private _executeProxyRequest(
    lib: typeof http | typeof https,
    options: any,
    body: string | Buffer | undefined,
    resolve: (value: RequestResult) => void,
    reject: (reason?: any) => void
  ): void {
    try {
      this.panel.webview.postMessage({ command: 'debugLog', data: { stage: 'proxyRequest-start', info: { proxyOpts: !!options.agent, path: options.path } } });
    } catch (e) {}

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => {
        try { this.panel.webview.postMessage({ command: 'debugLog', data: { stage: 'proxyRequest-end', info: { status: res.statusCode, size: Buffer.byteLength(data || '', 'utf8') } } }); } catch (e) {}
        resolve({
          status: res.statusCode || 0,
          statusText: res.statusMessage || 'Unknown',
          headers: res.headers as Record<string, string>,
          body: data,
        });
      });
    });

    req.on('error', (err) => {
      try { this.panel.webview.postMessage({ command: 'debugLog', data: { stage: 'proxyRequest-error', info: { message: err?.message || String(err) } } }); } catch (e) {}
      reject(err);
    });
    req.setTimeout(30000, () => {
      req.destroy();
      try { this.panel.webview.postMessage({ command: 'debugLog', data: { stage: 'proxyRequest-timeout', info: { timeoutMs: 30000 } } }); } catch (e) {}
      reject(new Error('Request timed out after 30 seconds'));
    });

    if (body) req.write(body);
    req.end();
  }

  private _saveToCollection(request: RequestData, collectionName: string): void {
    const collections = this.storageManager.getCollections();
    let col = collections.find((c) => c.name === collectionName);

    if (!col) {
      const newCol = {
        id: Date.now().toString(),
        name: collectionName,
        requests: [],
      };
      this.storageManager.saveCollection(newCol);
      col = this.storageManager
        .getCollections()
        .find((c) => c.name === collectionName);
    }

    if (col) {
      const requestName = request.name || `${request.method} ${request.url}`;
      
      // Check if request with the same name already exists
      const existingRequest = col.requests?.find((r) => r.name === requestName);
      
      const requestToSave = {
        ...request,
        name: requestName,
        id: existingRequest?.id || Date.now().toString(), // Use existing ID or create new
      };

      this.storageManager.addRequestToCollection(col.id, requestToSave);
      
      const action = existingRequest ? 'Updated' : 'Saved';
      vscode.window.showInformationMessage(
        `✓ ${action} "${requestName}" in collection "${collectionName}"`
      );
    }
  }
}




