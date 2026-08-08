import * as vscode from "vscode";
import * as https from "https";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { URL } from "url";
import { StorageManager } from "../storage/StorageManager";
import { getMainPanelHtml } from "../webview/mainPanelHtml";
import { ActivityProvider } from "./ActivityProvider";
import {
  DEFAULT_MAX_REDIRECTS,
  DEFAULT_TIMEOUT_MS,
  applyDefaultHeaders,
  applyHeadersToRequest,
  applyQueryParams,
  executeUserScript,
  getHeaderValue,
  getHeaderArray,
  getCookieHeader,
  hasHeader,
  isRedirectStatus,
  parseSetCookies,
  removeHeader,
  resolveRedirectUrl,
  serializeRequestBody,
  setHeader,
  shouldSendBodyOnRedirect,
  shouldStripAuthorization,
  getRedirectMethod,
  performHttpRequest,
  storeCookies,
  getOAuth2Token,
  oauth2CacheKey,
  applyWsseSecurity,
  decryptSoapMessage,
  looksEncrypted,
  resolveSoapSecurity,
  applyAuthHeaders,
  buildDigestAuthorization,
  resolveAuthForRequest,
  getHeader,
  buildRequestResult,
  validateResponseIfEnabled,
  extensionForContentType,
  suggestResponseFilename,
  shouldNotifyOnCompletion,
  formatCompletionNotification,
  type CoreRequestForBody,
  type OAuth2Config,
  type ResolvedSoapSecurity,
  type RequestResult,
  type AuthType,
  type CollectionAuthLike,
} from "../core";
import {
  parsePostmanEnvironment,
  parseRestifyEnvironment,
  environmentToPostman,
} from "../core/converters";
import { showOpenDialog, showSaveDialog } from "./dialogStub";

// Load https-proxy-agent at runtime to avoid module resolution issues
let HttpProxyAgent: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const proxyModule = require("https-proxy-agent");
  // Support different export shapes across versions:
  // - module.exports = HttpsProxyAgent (function/class)
  // - exports.HttpsProxyAgent = HttpsProxyAgent (named)
  // - exports.default = HttpsProxyAgent (ES module interop)
  HttpProxyAgent =
    proxyModule.HttpsProxyAgent || proxyModule.default || proxyModule;
} catch(e) {
  console.error("Failed to load https-proxy-agent:", e);
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
  id?: string;
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
    formType?: "text" | "file";
    fileName?: string;
    fileContentBase64?: string;
    contentType?: string;
  }>;
  urlencoded?: Array<{ key: string; value: string; enabled?: boolean }>;
  queryParams?: Array<{ key: string; value: string; enabled?: boolean }>;
  rejectUnauthorized?: boolean;
  preScript?: string;
  script?: string; // Post-response script for variable extraction
  authType?:
    | "none"
    | "bearer"
    | "basic"
    | "apikey"
    | "oauth2"
    | "digest"
    | "awssigv4"
    | "jwt"
    | "hawk"
    | "inherit";
  authData?: {
    token?: string;
    username?: string;
    password?: string;
    keyName?: string;
    keyValue?: string;
    addTo?: "header" | "query";
    // OAuth 2.0 configuration + cached token
    oauth2GrantType?: "authorization_code" | "client_credentials" | "password";
    oauth2AuthUrl?: string;
    oauth2TokenUrl?: string;
    oauth2ClientId?: string;
    oauth2ClientSecret?: string;
    oauth2Scopes?: string;
    oauth2Username?: string;
    oauth2Password?: string;
    oauth2RedirectUrl?: string;
    oauth2UsePkce?: boolean;
    oauth2ExtraParams?: Record<string, string>;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: number;
    tokenType?: string;
    tokenScope?: string;
    digestUsername?: string;
    digestPassword?: string;
    awsAccessKey?: string;
    awsSecretKey?: string;
    awsSessionToken?: string;
    awsRegion?: string;
    awsService?: string;
    jwtAlgorithm?: "HS256" | "HS384" | "HS512" | "RS256" | "RS384" | "RS512" | "ES256" | "ES384" | "ES512";
    jwtSecret?: string;
    jwtPrivateKey?: string;
    jwtKeyId?: string;
    jwtIssuer?: string;
    jwtSubject?: string;
    jwtAudience?: string;
    jwtClaims?: string;
    jwtExpiresIn?: string;
    jwtHeaderName?: string;
    hawkId?: string;
    hawkKey?: string;
    hawkAlgorithm?: "sha256" | "sha1";
  };
  _collectionId?: string;
  gqlQuery?: string;
  gqlVars?: string;
  followRedirects?: boolean;
  timeout?: number;
  activeEnvironmentId?: string;
  soapMeta?: { isSoap12: boolean };
  /** Validate JSON responses against a JSON Schema (draft-07). */
  validateSchema?: boolean;
  schema?: string;
}

export class RestifyPanel {
  private panel: vscode.WebviewPanel;
  private context: vscode.ExtensionContext;
  private storageManager: StorageManager;
  private onDispose: (instance: RestifyPanel) => void;
  private activityProvider?: ActivityProvider;
  private pendingRequest: RequestData | null = null;
  private webviewReady: boolean = false;
  private pendingRequestFetch: ((request: any) => void) | null = null;
  private _activeController: AbortController | null = null;
  private readonly extensionVersion: string;
  /** Window session id (generated by the webview and set on its window). Chain
   *  variables are scoped to it; a new window gets a new id → scope terminates. */
  private sessionId: string = "";

  constructor(
    context: vscode.ExtensionContext,
    storageManager: StorageManager,
    onDispose: (instance: RestifyPanel) => void,
    activityProvider?: ActivityProvider,
  ) {
    this.context = context;
    this.storageManager = storageManager;
    this.onDispose = onDispose;
    this.activityProvider = activityProvider;
    this.extensionVersion =
      this.context.extension.packageJSON?.version || "dev";

    this.panel = vscode.window.createWebviewPanel(
      "restify-main",
      "New Request",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      },
    );

    this.panel.webview.html = getMainPanelHtml(context, this.panel.webview);
    this.panel.webview.onDidReceiveMessage((msg) => {
      if (msg?.sessionId) this.sessionId = msg.sessionId;
      this._handleMessage(msg).catch((err) => {
        console.error("Error handling message:", err);
        // Send error response to webview to clear loading state
        this.panel.webview.postMessage({
          command: "requestError",
          error: err?.message || "An unexpected error occurred",
          duration: 0,
        });
      });
    });

    this.panel.onDidDispose(() => {
      if (this.sessionId) this.storageManager.clearSessionChainVars(this.sessionId);
      this.onDispose(this);
    });

    // Post theme kind and listen for changes so webview can adapt icon coloring
    try {
      this.panel.webview.postMessage({
        command: "setTheme",
        kind: vscode.window.activeColorTheme.kind,
      });
    } catch {
      /* empty */
    }
    const themeListener = vscode.window.onDidChangeActiveColorTheme((t) => {
      this.panel.webview.postMessage({ command: "setTheme", kind: t.kind });
    });
    this.panel.onDidDispose(() => themeListener.dispose());

    this.updateMetadata();
  }

  private createSafeId(len = 8): string {
    return Math.random()
      .toString(36)
      .slice(2, 2 + len);
  }

  updateMetadata(): void {
    // Small delay to ensure webview is ready to receive messages
    setTimeout(() => {
      this._sendEnvironments();
      this.panel.webview.postMessage({
        command: "collections",
        data: this.storageManager.getCollections(),
      });
      const settings = this.storageManager.getSettings();
      this.panel.webview.postMessage({
        command: "loadSettings",
        settings,
      });
      // Sync activity log enabled state
      this.activityProvider?.setEnabled(settings.showActivityLog !== false);
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

  sendRequest(): void {
    if (this.webviewReady) {
      this.panel.webview.postMessage({ command: 'triggerSendRequest' });
    }
  }

  /** Ask the webview for its current request state (used by exports). */
  getCurrentRequest(): Promise<any> {
    return new Promise((resolve) => {
      if (!this.webviewReady) {
        resolve(this.pendingRequest);
        return;
      }
      this.pendingRequestFetch = resolve;
      this.panel.webview.postMessage({ command: 'getCurrentRequest', id: 'export' });
    });
  }

  private _sendPendingRequest(): void {
    if (this.pendingRequest) {
      this.panel.webview.postMessage({
        command: "loadRequest",
        data: this.pendingRequest,
      });
      this.pendingRequest = null;
    }
  }

  private _sendEnvironments(): void {
    this.panel.webview.postMessage({
      command: "setEnvironments",
      environments: this.storageManager.getEnvironments(),
      activeEnvId: this.storageManager.getActiveEnvironment()?.id || null,
    });
  }

  /** Push the window session's chain variables so the webview can render
   *  `{{var}}` tokens as resolved (with hover values). */
  private _sendSessionChainVars(): void {
    if (!this.sessionId) return;
    try {
      this.panel.webview.postMessage({
        command: "sessionChainVarsUpdated",
        variables: this.storageManager.getSessionChainVars(this.sessionId),
      });
    } catch {
      /* ignore */
    }
  }

  // F44: Import an environment from a Postman or Restify environment JSON file.
  private async _importEnvironment(): Promise<void> {
    const uris = await showOpenDialog({
      canSelectMany: false,
      filters: { "Environment (Postman / Restify JSON)": ["json"] },
      openLabel: "Import Environment",
    });
    if (!uris || !uris[0]) return;
    const raw = Buffer.from(
      await vscode.workspace.fs.readFile(uris[0]),
    ).toString("utf8");

    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      vscode.window.showErrorMessage("Import failed: file is not valid JSON.");
      return;
    }
    const imported = parsePostmanEnvironment(data) || parseRestifyEnvironment(data);
    if (!imported) {
      vscode.window.showErrorMessage(
        "Import failed: not a recognized Postman or Restify environment file.",
      );
      return;
    }
    await this.storageManager.saveEnvironment({
      id: "",
      name: imported.name,
      variables: imported.variables.map((v) => ({
        key: v.key,
        value: v.value,
        isSecret: v.isSecret,
      })),
    });
    this._sendEnvironments();
    vscode.window.showInformationMessage(
      `\u2713 Imported environment "${imported.name}"`,
    );
  }

  // F44: Export an environment as a Postman environment JSON file.
  private async _exportEnvironment(env: any): Promise<void> {
    if (!env || !env.name) return;
    const safe =
      env.name
        .toLowerCase()
        .replace(/[^a-z0-9._-]/gi, "-")
        .replace(/-+/g, "-")
        .replace(/(^-|-$)/g, "") || "environment";
    const uri = await showSaveDialog({
      defaultUri: vscode.Uri.joinPath(
        vscode.workspace.workspaceFolders?.[0]?.uri ||
          vscode.Uri.file(os.homedir()),
        `${safe}.postman_environment.json`,
      ),
      filters: { "Postman Environment JSON": ["json"] },
    });
    if (!uri) return;
    const out = environmentToPostman({
      name: env.name,
      variables: (env.variables || []).map((v: any) => ({
        key: v.key,
        value: v.value || "",
        isSecret: !!v.isSecret,
      })),
    });
    await vscode.workspace.fs.writeFile(
      uri,
      Buffer.from(JSON.stringify(out, null, 2), "utf8"),
    );
    vscode.window.showInformationMessage(
      `\u2713 Environment exported to ${uri.fsPath}`,
    );
  }

  private _shouldUseProxy(host: string, noProxyArray?: string[]): boolean {
    if (!noProxyArray || !Array.isArray(noProxyArray)) return true;

    const normalizedHost = host.trim().toLowerCase();

    return !noProxyArray.some((noHost) => {
      // Accept entries like "ubstest.com", ".ubstest.com", or "https://ubstest.com:8080".
      let sanitizedNoHost = noHost.trim().toLowerCase();
      sanitizedNoHost = sanitizedNoHost.replace(/^[a-z]+:\/\//, "");
      sanitizedNoHost = sanitizedNoHost.replace(/:\d+$/, "");
      sanitizedNoHost = sanitizedNoHost.replace(/^\.+/, "");

      if (!sanitizedNoHost) return false;

      // Match exact host OR subdomain boundary (abc.ubstest.com endsWith .ubstest.com).
      return (
        normalizedHost === sanitizedNoHost ||
        normalizedHost.endsWith(`.${sanitizedNoHost}`)
      );
    });
  }

  private _getCertificatesForHost(host: string): Record<string, Buffer> | null {
    const settings = this.storageManager.getSettings();
    const certMatch = (settings.certificates || []).find(
      (cert) => host === cert.hostname || host.endsWith("." + cert.hostname),
    );

    if (certMatch) {
      try {
        const options: Record<string, Buffer> = {};
        if (certMatch.certPath)
          options.cert = fs.readFileSync(certMatch.certPath);
        if (certMatch.keyPath) options.key = fs.readFileSync(certMatch.keyPath);
        if (certMatch.caPath) options.ca = fs.readFileSync(certMatch.caPath);
        return options;
      } catch (err) {
        console.error(`Failed to read certificates for ${host}:`, err);
        return null;
      }
    }
    return null;
  }

  private _captureCookies(
    headers: Record<string, string | string[]>,
    url: string,
  ): void {
    try {
      const incoming = parseSetCookies(headers, url);
      if (incoming.length === 0) return;
      const jar = storeCookies(this.storageManager.getCookies(), incoming);
      this.storageManager.saveCookies(jar);
    } catch (err) {
      console.error("Failed to store response cookies:", err);
    }
  }

  private _cancelActiveRequest(): void {
    const controller = this._activeController;
    if (controller && !controller.signal.aborted) {
      controller.abort();
    }
  }

  private _resolveCollectionAuth(collectionId?: string): CollectionAuthLike | undefined {
    if (!collectionId) return undefined;
    return this.storageManager.getCollections().find((c) => String(c.id) === String(collectionId))?.auth;
  }

  private async _handleGetOAuthToken(config: OAuth2Config): Promise<void> {
    const postResult = (payload: Record<string, unknown>) => {
      this.panel.webview.postMessage({ command: "oauthTokenResult", ...payload });
    };
    try {
      const result = await getOAuth2Token(config, {
        cache: {
          get: (key) => this.storageManager.getOAuthTokenCache(key),
          set: (key, token) => this.storageManager.setOAuthTokenCache(key, token),
        },
        cacheKey: oauth2CacheKey(config),
        openUrl: (url) => {
          if (process.env.RESTIFY_TEST_OPEN_URL === "fetch") {
            // Test hook: perform the redirect server-side instead of opening a
            // browser (the mock auth server 302-redirects to the loopback).
            void fetch(url).catch((err) => {
              console.error("OAuth test openUrl fetch failed:", err);
            });
            return;
          }
          void vscode.env.openExternal(vscode.Uri.parse(url));
          this.activityProvider?.append(
            "OAuth 2.0",
            `Opening browser for authorization:\n${url}`,
            "info",
          );
        },
        log: (message) =>
          this.activityProvider?.append("OAuth 2.0", message, "info"),
      });
      postResult({
        accessToken: result.token.accessToken,
        refreshToken: result.token.refreshToken,
        expiresAt: result.token.expiresAt,
        tokenType: result.token.tokenType,
        scope: result.token.scope,
        source: result.source,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.activityProvider?.append("OAuth 2.0", `Error: ${message}`, "error");
      postResult({ error: message });
    }
  }

  private async _handleMessage(msg: any): Promise<void> {
    switch (msg.command) {
      case "webviewReady":
        // Webview is ready, send all initial data
        this.webviewReady = true;
        this.updateMetadata();
        // Send any pending request data
        this._sendPendingRequest();
        // Sync any existing chain variables into the freshly-loaded window
        this._sendSessionChainVars();
        break;
      case "currentRequest":
        if (this.pendingRequestFetch) {
          const resolve = this.pendingRequestFetch;
          this.pendingRequestFetch = null;
          resolve(msg.request);
        }
        break;
      case "executeRequest":
        // msg.savedRequest is the original state (no injected auth headers) — used for history.
        await this._executeRequest(msg.request, msg.savedRequest);
        break;
      case "getOAuthToken":
        await this._handleGetOAuthToken(msg.config);
        break;
      case "cancelRequest":
        this._cancelActiveRequest();
        break;
      case "setScriptVariables":
        // Script extracted variables - store them scoped to this window session
        // (Postman-style chaining). Same window → unlimited requests; a new
        // window gets a fresh scope.
        if (this.sessionId) {
          this.storageManager.setSessionChainVars(this.sessionId, msg.variables);
          this._sendSessionChainVars();
        }
        break;
      case "saveToCollection":
        this._saveToCollection(msg.request, msg.collectionName, msg.groupId);
        break;
      case "getCollections":
        this.updateMetadata();
        break;
      case "openSettings":
        vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "restify",
        );
        break;
      case "configureProxy":
        await this._initializeProxySettings();
        break;
      case "downloadFile":
        await this._downloadFile(msg.payload);
        break;
      case "saveResponseToFile":
        await this._saveResponseToFile(msg.payload);
        break;
      case "getEnvironments":
        this._sendEnvironments();
        break;
      case "setActiveEnvironment":
        this.storageManager.setActiveEnvironment(msg.id);
        break;
      case "saveEnvironment": {
        const env = { ...msg.data };
        if (Array.isArray(env.variables)) {
          env.variables = env.variables.filter(
            (v: any) =>
              (v.key || "").toString().trim() !== "" ||
              (v.value || "").toString().trim() !== "",
          );
        }
        await this.storageManager.saveEnvironment(env);
        this._sendEnvironments();
        break;
      }
      case "deleteEnvironment": {
        await this.storageManager.deleteEnvironment(msg.id);
        this._sendEnvironments();
        break;
      }
      case "importEnvironment":
        await this._importEnvironment();
        break;
      case "exportEnvironment":
        await this._exportEnvironment(msg.env);
        break;
      case "getEnvSecretValue": {
        const value = await this.storageManager.getSecretValue(
          msg.envId,
          msg.varKey,
        );
        this.panel.webview.postMessage({
          command: "envSecretValue",
          id: msg.id,
          value: value ?? "",
        });
        break;
      }
      case "updateTitle":
        this.panel.title = msg.title || "New Request";
        break;
      case "saveSettings":
        this.storageManager.saveSettings(msg.settings);
        // Sync activity log enabled state
        this.activityProvider?.setEnabled(msg.settings.showActivityLog !== false);
        // Send confirmation back with the saved settings
        this.panel.webview.postMessage({
          command: "loadSettings",
          settings: msg.settings,
        });
        vscode.window.showInformationMessage("✓ Settings saved successfully");
        break;
      case "runScript":
        this.activityProvider?.append("Script started", "Executing post-response script.", "info");
        await this._runScript(msg.script, msg.response);
        break;
    }
  }

  private async _runScript(script: string, response: any): Promise<void> {
    // Execute the user script on the extension host (Node.js) using vm module
    // This bypasses the webview CSP that blocks eval/Worker.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const vm = require("vm") as typeof import("vm");
    const logs: string[] = [];
    const variables: Record<string, any> = {};
    const tests: Record<string, boolean> = {};
    const vars = variables;

    const log = (...args: any[]) =>
      logs.push(
        args
          .map((a) => {
            try {
              return typeof a === "string" ? a : JSON.stringify(a);
            } catch {
              return String(a);
            }
          })
          .join(" "),
      );
    const set = (k: string, v: any) => {
      variables[String(k)] = v;
    };

    let parsedBody: any = response?.body ?? "";
    try {
      parsedBody = JSON.parse(parsedBody);
    } catch {
      /* keep raw string */
    }

    const responseObj = {
      status: response?.status ?? 0,
      statusText: response?.statusText ?? "",
      headers: response?.headers ?? {},
      body: parsedBody,
      rawBody: response?.body ?? "",
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
        tests,
        console: { log, warn: log, error: log, info: log },
      });

      const wrapped = "(async function(){" + script + "})();";
      // vm.runInContext with timeout only covers synchronous part; we race the promise
      const resultPromise = vm.runInContext(wrapped, context, {
        timeout: 5000,
      });

      if (resultPromise && typeof (resultPromise as any).then === "function") {
        await Promise.race([
          resultPromise,
          new Promise<void>((_, reject) =>
            setTimeout(
              () => reject(new Error("Script timed out after 5s")),
              5000,
            ),
          ),
        ]);
      }

      this.panel.webview.postMessage({
        command: "scriptResult",
        result: { success: true, variables, logs, tests },
      });
      this.activityProvider?.append(
        "Script completed",
        [
          "Result: success",
          `Logs: ${logs.length}`,
          `Variables set: ${Object.keys(variables).length}`,
          ...(Object.keys(variables).length > 0 ? [`Variable names: ${Object.keys(variables).join(", ")}`] : []),
        ].join("\n"),
        "info",
      );

      // Save extracted variables to active environment (reuse existing logic)
      if (Object.keys(variables).length > 0) {
        await this._handleMessage({ command: "setScriptVariables", variables });
      }
    } catch (err: any) {
      this.panel.webview.postMessage({
        command: "scriptResult",
        result: {
          success: false,
          variables,
          logs,
          tests,
          error: err?.message ?? String(err),
        },
      });
      this.activityProvider?.append(
        "Script failed",
        [
          "Result: failed",
          `Logs before error: ${logs.length}`,
          `Variables set: ${Object.keys(variables).length}`,
          `Error: ${err?.message ?? String(err)}`,
        ].join("\n"),
        "error",
      );
    }
  }

  private _formatBytes(bytes: number | undefined): string {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  private _formatRequestBodySummary(
    body: string | Buffer | undefined,
    bodyType?: string,
  ): string {
    if (body === undefined || body === null || body === "") {
      return "none";
    }

    const size = Buffer.isBuffer(body)
      ? body.length
      : Buffer.byteLength(String(body), "utf8");
    return `${bodyType || "raw"} (${this._formatBytes(size)})`;
  }

  private _redactProxyUrl(proxyUrl: string): string {
    try {
      const parsed = new URL(proxyUrl);
      if (parsed.username || parsed.password) {
        parsed.username = parsed.username ? "***" : "";
        parsed.password = parsed.password ? "***" : "";
      }
      return parsed.toString();
    } catch {
      return proxyUrl;
    }
  }

  /**
   * Display name for a history entry. A nameless request (empty name or the
   * default "New Request" placeholder) is labelled from method + URL path only
   * (no protocol/host/query — the full URL is already shown on the history
   * item's meta line).
   */
  private _historyName(
    req: RequestData,
    method: string,
    url: string,
  ): string {
    const n = req?.name?.trim();
    if (n && n !== "New Request") return n;
    try {
      const parsed = new URL(url);
      return `${method} ${parsed.pathname || "/"}`;
    } catch {
      return method;
    }
  }

  private async _initializeProxySettings(): Promise<void> {
    const config = vscode.workspace.getConfiguration("restify");
    const existingProxy = config.get("proxy");

    if (!existingProxy || Object.keys(existingProxy).length === 0) {
      await config.update(
        "proxy",
        {
          "http.proxyAuthorization": null,
          "http.proxy": "https://abc.com:8080",
          "http.noProxy": ["abc.com"],
        },
        vscode.ConfigurationTarget.Global,
      );
      vscode.window.showInformationMessage(
        "Proxy configuration initialized in settings.json",
      );
    }
    vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "restify.proxy",
    );
  }

  private async _executeRequest(
    req: RequestData,
    savedReq?: RequestData,
  ): Promise<void> {
    // savedReq is the original request state without injected auth headers.
    // Use it when persisting to history so reloading doesn't re-duplicate auth headers.
    const historyReq = savedReq || req;
    const startTime = Date.now();
    const timings: any = { start: startTime };
    const resolveVars = (s: string | undefined) =>
      this.storageManager.resolveVariables(s || "", this.sessionId);

    const executionReq: RequestData = {
      ...req,
      headers: Array.isArray(req.headers)
        ? req.headers.map((h) => ({ ...h }))
        : [],
      queryParams: Array.isArray(req.queryParams)
        ? req.queryParams.map((p) => ({ ...p }))
        : [],
      formData: Array.isArray(req.formData)
        ? req.formData.map((f) => ({ ...f }))
        : [],
      urlencoded: Array.isArray(req.urlencoded)
        ? req.urlencoded.map((u) => ({ ...u }))
        : [],
      authData: { ...req.authData },
    };

    const requestData = executionReq;
    const preScript = (requestData.preScript || "").trim();
    if (preScript) {
      const scriptResult = await executeUserScript(
        preScript,
        {
          request: requestData,
          variables: {},
          params: requestData.queryParams,
        },
        5000,
      );

      if (!scriptResult.success) {
        const duration = Date.now() - startTime;
        this.panel.webview.postMessage({
          command: "requestError",
          error: `Pre-request script failed: ${scriptResult.error}`,
          duration,
        });
        this.activityProvider?.append(
          "Pre-request script failed",
          [`Method: ${req.method || "GET"}`, `URL: ${req.url || ""}`, `Error: ${scriptResult.error}`].join("\n"),
          "error",
        );
        this.storageManager.addToHistory({
          method: req.method || "GET",
          url: req.url || "",
          name: this._historyName(historyReq, req.method || "GET", req.url || ""),
          status: 0,
          error: `Pre-request script failed: ${scriptResult.error}`,
          duration,
          request: historyReq,
          activeEnvironmentId:
            this.storageManager.getActiveEnvironment()?.id || null,
        });
        if (Object.keys(scriptResult.variables).length > 0) {
          await this._handleMessage({
            command: "setScriptVariables",
            variables: scriptResult.variables,
          });
        }
        return;
      }

      if (Object.keys(scriptResult.variables).length > 0) {
        await this._handleMessage({
          command: "setScriptVariables",
          variables: scriptResult.variables,
        });
      }
    }

    const rawUrl = resolveVars(requestData.url);
    const method = requestData.method || "GET";
    const headers: Record<string, string> = {};

    // Use requestData.headers (the clone the pre-script can mutate), so that
    // header changes made by a pre-request script are actually sent.
    (requestData.headers || []).forEach((h) => {
      if (h.key && h.enabled !== false) {
        headers[resolveVars(h.key)] = resolveVars(h.value);
      }
    });

    let body: string | Buffer | undefined = undefined;
    const serialized = serializeRequestBody(
      requestData as CoreRequestForBody,
      (s) => this.storageManager.resolveVariables(s || "", this.sessionId),
    );
    if (serialized.body !== undefined) {
      body = serialized.body;
    }
    applyHeadersToRequest(headers, serialized.headers, serialized.forceHeaders);

    // WS-Security: inject UsernameToken credentials and/or encrypt the body
    // host-side only (Node crypto is unavailable in the webview).
    let resolvedWs: ResolvedSoapSecurity | null = null;
    try {
      resolvedWs = resolveSoapSecurity(
        rawUrl,
        this.storageManager.getSettings().soapSecurity || [],
        (path) => fs.readFileSync(path),
        (s) => this.storageManager.resolveVariables(s || "", this.sessionId),
      );
    } catch (wsseLoadErr) {
      this.activityProvider?.append(
        "WS-Security key load failed",
        wsseLoadErr instanceof Error ? wsseLoadErr.message : String(wsseLoadErr),
        "error",
      );
    }
    if (resolvedWs && typeof body === "string") {
      try {
        const wsse = applyWsseSecurity(body, {
          username: resolvedWs.username,
          password: resolvedWs.password,
          encrypt: resolvedWs.encrypt,
          publicKeyPem: resolvedWs.publicKeyPem,
        });
        body = wsse.xml;
        if (wsse.encrypted) {
          setHeader(headers, "Content-Type", "text/xml; charset=utf-8");
        }
      } catch (wsseErr) {
        this.activityProvider?.append(
          "WS-Security failed",
          `Error: ${wsseErr instanceof Error ? wsseErr.message : String(wsseErr)}`,
          "error",
        );
      }
    }

    // Ask the server for compressed responses only when we can decode them.
    if (!hasHeader(headers, "Accept-Encoding")) {
      setHeader(headers, "Accept-Encoding", "gzip, deflate, br");
    }

    let finalUrl = rawUrl;
    const withParams = applyQueryParams(rawUrl, requestData.queryParams, resolveVars);
    if (withParams === null) {
      this.activityProvider?.append(
        "Invalid request URL",
        [
          `Method: ${method}`,
          `URL: ${rawUrl || "(empty)"}`,
          "Error: URL must include a valid protocol and host.",
        ].join("\n"),
        "error",
      );
      this.panel.webview.postMessage({
        command: "requestError",
        error: "Invalid URL",
        duration: 0,
      });
      return;
    }
    finalUrl = withParams;
    const parsedUrl = new URL(finalUrl);

    const settings = this.storageManager.getSettings();
    applyDefaultHeaders(headers, settings.defaultHeaders, this.extensionVersion, undefined, resolveVars);

    // Apply auth host-side (F12); digest's header is computed after a 401 round-trip.
    let authTypeToApply = (requestData.authType || "none") as AuthType;
    let authDataToApply = requestData.authData || {};
    if (authTypeToApply === "inherit") {
      const resolved = resolveAuthForRequest("inherit", {}, this._resolveCollectionAuth(requestData._collectionId));
      authTypeToApply = resolved.authType;
      authDataToApply = resolved.authData;
    }
    let digestCreds: { username: string; password: string } | null = null;
    if (authTypeToApply === "digest") {
      digestCreds = {
        username: resolveVars(authDataToApply.digestUsername || ""),
        password: resolveVars(authDataToApply.digestPassword || ""),
      };
    } else {
      const applied = applyAuthHeaders(headers, authTypeToApply, authDataToApply, {
        resolve: resolveVars, method, url: finalUrl, body, headers,
      });
      if (applied.url) finalUrl = applied.url;
    }
    let proxyOpts: { proxy: string; auth?: string } | null = null;

    if (settings.proxy) {
      // Parse no-proxy list - filter out empty strings
      const noProxyArray = settings.noProxy
        ? settings.noProxy
            .split(",")
            .map((h) => h.trim())
            .filter((h) => h.length > 0)
        : [];

      // Log for debugging
      // eslint-disable-next-line no-console
      console.log("Proxy check:", {
        proxyConfigured: !!settings.proxy,
        hostname: parsedUrl.hostname.toLowerCase(),
        noProxyList: noProxyArray,
        shouldUseProxy: this._shouldUseProxy(
          parsedUrl.hostname.toLowerCase(),
          noProxyArray,
        ),
      });

      if (
        this._shouldUseProxy(parsedUrl.hostname.toLowerCase(), noProxyArray)
      ) {
        proxyOpts = {
          proxy: settings.proxy,
          auth: settings.proxyAuthorization,
        };
        // eslint-disable-next-line no-console
        console.log("✓ Proxy is ENABLED for this request");
      } else {
        // eslint-disable-next-line no-console
        console.log("✗ Proxy is DISABLED (hostname in noProxy list)");
      }
    } else {
      // eslint-disable-next-line no-console
      console.log("⚠ No proxy configured in settings");
    }

    // Send a debug log to the webview so the UI can surface diagnostic steps
    try {
      this.panel.webview.postMessage({
        command: "debugLog",
        data: {
          stage: "preparedRequest",
          info: {
            method,
            url: finalUrl,
            headers: Object.keys(headers).slice(0, 10),
            hasBody: !!body,
          },
        },
      });
    } catch {
      /* ignore postMessage failures for debug */
    }

    const verifySsl = requestData.rejectUnauthorized !== false;
    const timeoutMs = requestData.timeout ?? settings.defaultTimeout ?? DEFAULT_TIMEOUT_MS;

    this.activityProvider?.append(
      "Request started",
      [
        `Method: ${method}`,
        `URL: ${finalUrl}`,
        `Headers: ${Object.keys(headers).length}`,
        `Body: ${this._formatRequestBodySummary(body, requestData.bodyType)}`,
        `SSL verification: ${verifySsl ? "enabled" : "disabled"}`,
        `Follow redirects: ${requestData.followRedirects === false ? "off" : "on (${DEFAULT_MAX_REDIRECTS} max)"}`,
        `Timeout: ${timeoutMs}ms`,
        `Proxy: ${proxyOpts ? this._redactProxyUrl(proxyOpts.proxy) : "not used"}`,
      ].join("\n"),
      "info",
    );
    this.panel.webview.postMessage({ command: "requestStart" });

    const controller = new AbortController();
    this._activeController = controller;

    try {
      const netStart = Date.now();
      const result = await this._doRequest(
        method,
        finalUrl,
        headers,
        body,
        verifySsl,
        proxyOpts,
        {
          followRedirects: req.followRedirects !== false,
          maxRedirects: DEFAULT_MAX_REDIRECTS,
          timeout: timeoutMs,
          signal: controller.signal,
        },
      );

      // HTTP Digest (RFC 7616): first attempt gets a 401 challenge, then we
      // compute the Authorization header and retry once.
      let finalResult = result;
      if (digestCreds && result.status === 401) {
        const challenge = getHeader(result.headers, "www-authenticate");
        if (challenge && /^\s*digest\b/i.test(challenge)) {
          try {
            const authValue = buildDigestAuthorization(challenge, { method, url: finalUrl, body }, digestCreds);
            setHeader(headers, "Authorization", authValue);
            finalResult = await this._doRequest(method, finalUrl, headers, body, verifySsl, proxyOpts, {
              followRedirects: req.followRedirects !== false,
              maxRedirects: DEFAULT_MAX_REDIRECTS,
              timeout: timeoutMs,
              signal: controller.signal,
            });
            this.activityProvider?.append("Digest auth", "Retried the request with the digest challenge response.", "info");
          } catch (digestErr) {
            this.activityProvider?.append("Digest auth failed", digestErr instanceof Error ? digestErr.message : String(digestErr), "error");
          }
        }
      }
      try {
        this.panel.webview.postMessage({
          command: "debugLog",
          data: {
            stage: "receivedResponse",
            info: {
            status: finalResult.status,
            size: finalResult.bodySize || Buffer.byteLength(finalResult.body || "", "utf8"),
            },
          },
        });
      } catch {
        /* empty */
      }
      timings.network = Date.now() - netStart;

      const duration = Date.now() - startTime;
      // WS-Security: decrypt an encrypted SOAP response when a matching
      // settings entry provides a private key; otherwise show it as-is.
      let responseBody = finalResult.body;
      let decrypted = false;
      if (
        resolvedWs?.decrypt &&
        resolvedWs?.privateKeyPem &&
        typeof finalResult.body === "string"
      ) {
        try {
          if (looksEncrypted(finalResult.body)) {
            const plain = decryptSoapMessage(finalResult.body, resolvedWs.privateKeyPem);
            if (plain) {
              responseBody = plain;
              decrypted = true;
            }
          }
        } catch (wsseErr) {
          this.activityProvider?.append(
            "WS-Security decrypt failed",
            wsseErr instanceof Error ? wsseErr.message : String(wsseErr),
            "error",
          );
        }
      }
      if (
        !decrypted &&
        typeof finalResult.body === "string" &&
        looksEncrypted(finalResult.body)
      ) {
        this.activityProvider?.append(
          "Encrypted response",
          "Response body is WS-Security encrypted; configure a decrypt keystore for this host in Settings → SOAP Security to view it decrypted.",
          "warning",
        );
      }
      const responseData = {
        status: finalResult.status,
        statusText: finalResult.statusText,
        headers: finalResult.headers,
        body: responseBody,
        duration,
        size: finalResult.bodySize || Buffer.byteLength(String(responseBody || ""), "utf8"),
        isFileResponse: finalResult.isFileResponse,
        fileDetectionSource: finalResult.fileDetectionSource,
        fileName: finalResult.fileName,
        fileMimeType: finalResult.fileMimeType,
        fileBase64: finalResult.fileBase64,
        filePreviewType: finalResult.filePreviewType,
      };

      const schemaValidation = validateResponseIfEnabled(req, responseBody);

      // Detect mTLS usage
      const mtlsCerts = this._getCertificatesForHost(parsedUrl.hostname);

      // Build resolved headers array for display
      const resolvedHeaders = (requestData.headers || []).map((h) => ({
        ...h,
        key: resolveVars(h.key),
        value: resolveVars(h.value),
      }));

      // Build curl command
      let curlCommand = `curl -X ${method}`;

      const isFormData = requestData.bodyType === "form" && Array.isArray(requestData.formData) && requestData.formData.length > 0;

      // Add headers (omit Content-Type for multipart form-data so curl sets boundary)
      resolvedHeaders.forEach((h) => {
        if (h.enabled === false) return;
        if (isFormData && h.key && h.key.toLowerCase() === "content-type") return;
        curlCommand += ` -H "${h.key}: ${h.value}"`;
      });

      // Form-data: produce -F entries using actual file paths when present
      if (isFormData) {
        (req.formData || []).forEach((field) => {
          if (!field.key || field.enabled === false) return;
          const name = resolveVars(field.key);
          const fieldType = field.formType || "text";
          if (fieldType === "file") {
            const candidatePath = field.fileName || "";
            const contentType = field.contentType || "application/octet-stream";
            if (candidatePath && path.isAbsolute(candidatePath)) {
              const safePath = candidatePath.replace(/"/g, '\\"');
              curlCommand += ` -F "${name}=@${safePath};type=${contentType}"`;
            } else if (candidatePath) {
              // Not absolute — include as-is (user may have relative path)
              const safePath = candidatePath.replace(/"/g, '\\"');
              curlCommand += ` -F "${name}=@${safePath};type=${contentType}"`;
            } else {
              // No path available: include a placeholder path so command is executable after user adjusts
              curlCommand += ` -F "${name}=@/path/to/${field.fileName || 'file'};type=${contentType}"`;
            }
          } else {
            const val = resolveVars(field.value || "");
            const escaped = String(val).replace(/"/g, '\\"');
            if (field.contentType) {
              curlCommand += ` -F "${name}=${escaped};type=${field.contentType}"`;
            } else {
              curlCommand += ` -F "${name}=${escaped}"`;
            }
          }
        });
      } else {
        // Non-form bodies: prefer minified JSON when possible
        if (body) {
          if (typeof body === "string") {
            let outBody = body;
            const contentTypeHeader = Object.keys(headers).find((k) => k.toLowerCase() === "content-type");
            const contentType = contentTypeHeader ? headers[contentTypeHeader] : "";
            const looksLikeJson = (req.bodyType === "json") || (typeof contentType === "string" && contentType.toLowerCase().includes("application/json"));
            if (looksLikeJson) {
              try {
                outBody = JSON.stringify(JSON.parse(outBody));
              } catch {
                // leave as-is if parse fails
              }
            }
            curlCommand += ` -d '${outBody.replace(/'/g, "'\\''")}'`;
          } else {
            // Buffer bodies: include as --data-binary @file placeholder (no temp files)
            curlCommand += ` --data-binary @/path/to/body.bin`;
          }
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
        rejectUnauthorized: req.rejectUnauthorized !== false,
        curlCommand,
      };

      // NOTE: We intentionally do NOT offload the response body to a file for
      // postMessage (it would blank JsonPrettyViewer); file offloading is only
      // done inside addToHistory for the persistence layer.

      // Measure postMessage serialization time and size
      try {
        const pmStart = Date.now();
        // measure approximate size
        let size = 0;
        try {
          size = Buffer.byteLength(
            JSON.stringify({
              response: safeResponse,
              requestInfo: safeRequestInfo,
            }),
            "utf8",
          );
        } catch {
          /* empty */
        }
        this.panel.webview.postMessage({
          command: "requestComplete",
          response: safeResponse,
          requestInfo: safeRequestInfo,
          schemaValidation,
        });
        timings.postMessageMs = Date.now() - pmStart;
        timings.postMessageSize = size;
      } catch {
        /* empty */
      }

      this._notifyRequestComplete({ method, url: finalUrl, status: finalResult.status, durationMs: duration });

      // Measure history add time
      try {
        const hStart = Date.now();
        this.storageManager.addToHistory({
          method,
          url: finalUrl,
          name: this._historyName(historyReq, method, finalUrl),
          status: finalResult.status,
          duration,
          request: historyReq,
          response: responseData,
          activeEnvironmentId:
            this.storageManager.getActiveEnvironment()?.id || null,
        });
        timings.addHistoryMs = Date.now() - hStart;
      } catch (hErr) {
        console.error("addToHistory failed:", hErr);
      }

      this.activityProvider?.append(
        "Request completed",
        [
          `Method: ${method}`,
          `URL: ${finalUrl}`,
          `Status: ${finalResult.status} ${finalResult.statusText || "OK"}`,
          `Duration: ${duration}ms`,
          `Network: ${timings.network ?? 0}ms`,
          `Size: ${this._formatBytes(responseData.size)}`,
          `Content-Type: ${getHeaderValue(finalResult.headers, "content-type") || "unknown"}`,
          `Proxy: ${proxyOpts ? this._redactProxyUrl(proxyOpts.proxy) : "not used"}`,
          `mTLS: ${mtlsCerts ? `enabled for ${parsedUrl.hostname}` : "not used"}`,
        ].join("\n"),
        finalResult.status >= 400 ? "warning" : "info",
      );

      // Log timings for diagnostics
      // eslint-disable-next-line no-console
      console.log("Restify: request timings", {
        url: finalUrl,
        status: finalResult.status,
        timings,
      });
    } catch (err: any) {
      if (controller.signal.aborted) {
        const duration = Date.now() - startTime;
        try {
          this.panel.webview.postMessage({
            command: "debugLog",
            data: {
              stage: "requestCancelled",
              info: { duration },
            },
          });
        } catch {
          /* empty */
        }
        this.activityProvider?.append(
          "Request cancelled",
          [
            `Method: ${method}`,
            `URL: ${finalUrl}`,
            `Duration: ${duration}ms`,
            "Cancelled by user.",
          ].join("\n"),
          "warning",
        );
        this.panel.webview.postMessage({
          command: "requestCancelled",
          duration,
        });
        this.storageManager.addToHistory({
          method,
          url: finalUrl,
          name: this._historyName(historyReq, method, finalUrl),
          status: 0,
          error: "Cancelled",
          duration,
          request: historyReq,
          activeEnvironmentId:
            this.storageManager.getActiveEnvironment()?.id || null,
        });
        return;
      }
      try {
        this.panel.webview.postMessage({
          command: "debugLog",
          data: {
            stage: "requestError",
            info: { message: err?.message || String(err) },
          },
        });
      } catch {
        /* empty */
      }
      const duration = Date.now() - startTime;
      this.activityProvider?.append(
        "Request failed",
        [
          `Method: ${method}`,
          `URL: ${finalUrl}`,
          `Duration: ${duration}ms`,
          `Proxy: ${proxyOpts ? this._redactProxyUrl(proxyOpts.proxy) : "not used"}`,
          `Error: ${err?.message || String(err)}`,
        ].join("\n"),
        "error",
      );
      this.panel.webview.postMessage({
        command: "requestError",
        error: err.message,
        duration,
      });
      this._notifyRequestComplete({ method, url: finalUrl, status: 0, durationMs: duration });
      this.storageManager.addToHistory({
        method,
        url: finalUrl,
        name: this._historyName(historyReq, method, finalUrl),
        status: 0,
        error: err.message,
        duration,
        request: historyReq,
        activeEnvironmentId:
          this.storageManager.getActiveEnvironment()?.id || null,
      });
    } finally {
      if (this._activeController === controller) {
        this._activeController = null;
      }
    }
  }

  private async _doRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | Buffer | undefined,
    rejectUnauthorized: boolean,
    proxyOpts: { proxy: string; auth?: string } | null,
    options: {
      followRedirects?: boolean;
      maxRedirects?: number;
      timeout?: number;
      signal?: AbortSignal;
    } = {},
  ): Promise<RequestResult> {
    const maxRedirects =
      options.followRedirects === false
        ? 0
        : options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;

    let currentMethod = method;
    let currentUrl = url;
    let currentHeaders = { ...headers };
    let currentBody = body;

    for (let hop = 0; hop <= maxRedirects; hop++) {
      const result = await this._doRequestOnce(
        currentMethod,
        currentUrl,
        currentHeaders,
        currentBody,
        rejectUnauthorized,
        proxyOpts,
        timeoutMs,
        options.signal,
      );

      // Capture Set-Cookie from every hop so redirects accumulate cookies too.
      this._captureCookies(result.headers, currentUrl);

      if (hop >= maxRedirects || !isRedirectStatus(result.status)) {
        return result;
      }

      const locations = getHeaderArray(result.headers, "location");
      const nextUrl = resolveRedirectUrl(currentUrl, locations[0]);
      if (!nextUrl) {
        return result;
      }

      const nextMethod = getRedirectMethod(currentMethod, result.status);
      const sendBody = shouldSendBodyOnRedirect(currentMethod, result.status);

      const nextHeaders = { ...currentHeaders };
      if (shouldStripAuthorization(currentUrl, nextUrl)) {
        removeHeader(nextHeaders, "authorization");
        removeHeader(nextHeaders, "proxy-authorization");
      }
      if (!sendBody) {
        removeHeader(nextHeaders, "content-length");
        removeHeader(nextHeaders, "content-type");
        removeHeader(nextHeaders, "transfer-encoding");
      }
      // Content-Length no longer matches if we keep the body.
      if (sendBody && currentBody !== undefined) {
        removeHeader(nextHeaders, "content-length");
        if (Buffer.isBuffer(currentBody)) {
          setHeader(nextHeaders, "Content-Length", String(currentBody.length));
        } else {
          setHeader(
            nextHeaders,
            "Content-Length",
            String(Buffer.byteLength(currentBody, "utf8")),
          );
        }
      }

      try {
        this.panel.webview.postMessage({
          command: "debugLog",
          data: {
            stage: "redirect",
            info: {
              from: currentUrl,
              to: nextUrl,
              status: result.status,
              method: nextMethod,
            },
          },
        });
      } catch {
        /* empty */
      }

      currentMethod = nextMethod;
      currentUrl = nextUrl;
      currentHeaders = nextHeaders;
      currentBody = sendBody ? currentBody : undefined;
    }

    // Unreachable: loop bounded by maxRedirects above.
    return this._doRequestOnce(
      currentMethod,
      currentUrl,
      currentHeaders,
      currentBody,
      rejectUnauthorized,
      proxyOpts,
      timeoutMs,
      options.signal,
    );
  }

  private async _doRequestOnce(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | Buffer | undefined,
    rejectUnauthorized: boolean,
    proxyOpts: { proxy: string; auth?: string } | null,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<RequestResult> {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === "https:";
    const lib = isHttps ? https : http;

    // Inject matching cookies from the jar unless the user supplied their own.
    if (!hasHeader(headers, "cookie")) {
      const cookieHeader = getCookieHeader(
        this.storageManager.getCookies(),
        url,
      );
      if (cookieHeader) setHeader(headers, "Cookie", cookieHeader);
    }

    const rawProxyAuth = proxyOpts?.auth?.trim();
    let proxyAuthToken: string | undefined;
    let proxyAuthCredentials: string | undefined;
    if (rawProxyAuth) {
      if (/^Basic\s+/i.test(rawProxyAuth)) {
        proxyAuthToken = rawProxyAuth.replace(/^Basic\s+/i, "").trim();
      } else if (rawProxyAuth.includes(":")) {
        proxyAuthCredentials = rawProxyAuth;
        proxyAuthToken = Buffer.from(rawProxyAuth).toString("base64");
      } else {
        proxyAuthToken = rawProxyAuth;
      }

      if (!proxyAuthCredentials && proxyAuthToken) {
        try {
          const decoded = Buffer.from(proxyAuthToken, "base64").toString(
            "utf8",
          );
          if (decoded.includes(":")) {
            proxyAuthCredentials = decoded;
          }
        } catch {
          /* empty */
        }
      }
    }

    const options: https.RequestOptions & http.RequestOptions = {
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
        const isProxyHttps = parsedProxyUrl.protocol === "https:";

        if (HttpProxyAgent) {
          const proxyUrlForAgent = new URL(parsedProxyUrl.toString());

          // Allow auth from either proxy URL or separate proxyAuthorization field.
          if (proxyAuthCredentials && !proxyUrlForAgent.username) {
            const separator = proxyAuthCredentials.indexOf(":");
            if (separator >= 0) {
              proxyUrlForAgent.username = proxyAuthCredentials.slice(
                0,
                separator,
              );
              proxyUrlForAgent.password = proxyAuthCredentials.slice(
                separator + 1,
              );
            }
          }

          try {
            options.agent = new HttpProxyAgent(proxyUrlForAgent.toString());
          } catch (agentErr) {
            console.error("Failed to create proxy agent:", agentErr);
            throw new Error(
              `Failed to create proxy agent: ${agentErr instanceof Error ? agentErr.message : String(agentErr)}`,
            );
          }

          if (proxyAuthToken) {
            options.headers = { ...options.headers } as Record<
              string,
              string
            >;
            (options.headers as Record<string, string>)[
              "Proxy-Authorization"
            ] = `Basic ${proxyAuthToken}`;
          }

          // eslint-disable-next-line no-console
          console.log("Using proxy agent:", {
            proxyHost: parsedProxyUrl.hostname,
            proxyPort: parsedProxyUrl.port || (isProxyHttps ? "443" : "80"),
            hasProxyAuth: !!proxyAuthToken,
            targetUrl: url,
            rejectUnauthorized: options.rejectUnauthorized,
          });

          try {
            this.panel.webview.postMessage({
              command: "debugLog",
              data: {
                stage: "proxyRequest-start",
                info: { proxyOpts: !!options.agent, path: options.path },
              },
            });
          } catch {
            /* empty */
          }

          const raw = await performHttpRequest(
            lib,
            options,
            body,
            timeoutMs,
            signal,
            (stage, info) => {
              try {
                this.panel.webview.postMessage({
                  command: "debugLog",
                  data: { stage: `proxyRequest-${stage}`, info },
                });
              } catch {
                /* empty */
              }
            },
          );
          return buildRequestResult(
            raw.status,
            raw.statusText,
            raw.headers,
            raw.data,
            typeof options.path === "string" ? options.path : "",
          );
        }

        // Fallback when proxy agent is unavailable (supports plain HTTP target requests).
        if (isHttps) {
          throw new Error(
            "Proxy agent module is not available for HTTPS target requests",
          );
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
          (options.headers as Record<string, string>)["Proxy-Authorization"] =
            `Basic ${proxyAuthToken}`;
        }

        try {
          this.panel.webview.postMessage({
            command: "debugLog",
            data: {
              stage: "proxyRequest-start",
              info: { proxyOpts: !!options.agent, path: options.path },
            },
          });
        } catch {
          /* empty */
        }

        const raw = await performHttpRequest(
          isProxyHttps ? https : http,
          options,
          body,
          timeoutMs,
          signal,
          (stage, info) => {
            try {
              this.panel.webview.postMessage({
                command: "debugLog",
                data: { stage: `proxyRequest-${stage}`, info },
              });
            } catch {
              /* empty */
            }
          },
        );
        return buildRequestResult(
          raw.status,
          raw.statusText,
          raw.headers,
          raw.data,
          typeof options.path === "string" ? options.path : "",
        );
      } catch (e) {
        console.error("Proxy URL parsing error:", e);
        if (
          e instanceof Error &&
          (e.message.startsWith("Failed to create proxy agent") ||
            e.message ===
              "Proxy agent module is not available for HTTPS target requests")
        ) {
          throw e;
        }
        throw new Error(
          `Invalid Proxy URL configuration: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // IMPORTANT: If no proxy is configured, explicitly set agent to disable system proxy detection
    // This prevents Node.js from using environment variables or system-wide proxy settings
    if (!proxyOpts || !proxyOpts.proxy) {
      // eslint-disable-next-line no-console
      console.log(
        "🔒 CRITICAL: Disabling system proxy - using direct connection ONLY",
      );
      options.agent = isHttps ? noProxyAgentHttps : noProxyAgentHttp;
    }
    try {
      this.panel.webview.postMessage({
        command: "debugLog",
        data: {
          stage: "doRequest-start",
          info: { hostname: parsedUrl.hostname, port: options.port, isHttps },
        },
      });
    } catch {
      /* empty */
    }

    const raw = await performHttpRequest(
      lib,
      options,
      body,
      timeoutMs,
      signal,
      (stage, info) => {
        try {
          this.panel.webview.postMessage({
            command: "debugLog",
            data: { stage: `doRequest-${stage}`, info },
          });
        } catch {
          /* empty */
        }
      },
    );
    return buildRequestResult(
      raw.status,
      raw.statusText,
      raw.headers,
      raw.data,
      url,
    );
  }

  private _saveToCollection(
    request: RequestData,
    collectionName: string,
    groupId?: string,
  ): void {
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

      if (groupId) {
        // Save into a specific folder within the collection
        const requestToSave = {
          ...request,
          name: requestName,
          id: request.id || Date.now().toString(),
        };
        this.storageManager.addRequestToGroup(col.id, groupId, requestToSave);
        vscode.window.showInformationMessage(
          `✓ Saved "${requestName}" in collection "${collectionName}"`,
        );
      } else {
        // Save to collection root
        const existingRequest = col.requests?.find(
          (r) => r.name === requestName,
        );

        const requestToSave = {
          ...request,
          name: requestName,
          id: existingRequest?.id || Date.now().toString(),
        };

        this.storageManager.addRequestToCollection(col.id, requestToSave);

        const action = existingRequest ? "Updated" : "Saved";
        vscode.window.showInformationMessage(
          `✓ ${action} "${requestName}" in collection "${collectionName}"`,
        );
      }
    }
  }

  private _notifyRequestComplete(opts: { method: string; url: string; status: number; durationMs: number }): void {
    const settings = this.storageManager.getSettings();
    const testThreshold = Number(process.env.RESTIFY_TEST_NOTIFY_THRESHOLD_MS || "");
    const background = process.env.RESTIFY_TEST_NOTIFY_THRESHOLD_MS !== undefined || !vscode.window.state.focused;
    const thresholdMs = Number.isFinite(testThreshold) && testThreshold > 0 ? testThreshold : settings.longRequestThresholdMs;
    if (!shouldNotifyOnCompletion({ enabled: settings.notifyOnLongRequest, durationMs: opts.durationMs, thresholdMs, background })) return;
    vscode.window.showInformationMessage(`Request completed: ${formatCompletionNotification(opts)}`);
  }

  private _defaultSaveUri(fileName: string): vscode.Uri {
    const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    return workspaceUri
      ? vscode.Uri.joinPath(workspaceUri, fileName)
      : vscode.Uri.file(path.join(os.homedir(), fileName));
  }

  private async _saveViaDialog(defaultUri: vscode.Uri, saveLabel: string, title: string, data: Uint8Array): Promise<void> {
    const targetUri = await showSaveDialog({ defaultUri, saveLabel, title });
    if (!targetUri) return;
    try {
      await vscode.workspace.fs.writeFile(targetUri, data);
      vscode.window.showInformationMessage(`Saved file: ${path.basename(targetUri.fsPath)}`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to save file: ${err?.message || "Unknown error"}`);
    }
  }

  private async _downloadFile(payload: { fileName?: string; mimeType?: string; fileBase64?: string }): Promise<void> {
    const fileBase64 = payload?.fileBase64;
    if (!fileBase64) {
      vscode.window.showErrorMessage("No file payload available to download.");
      return;
    }
    let fileName = path.basename(payload?.fileName || "");
    if (!fileName || fileName.trim().length === 0 || fileName === ".") {
      fileName = `response.${extensionForContentType(payload?.mimeType)}`;
    }
    await this._saveViaDialog(this._defaultSaveUri(fileName), "Save Response File", "Save Response File", new Uint8Array(Buffer.from(fileBase64, "base64")));
  }

  private async _saveResponseToFile(payload: { body?: string; contentType?: string; suggestName?: string }): Promise<void> {
    const body = payload?.body;
    if (!body) {
      vscode.window.showErrorMessage("No response body available to save.");
      return;
    }
    const fileName = suggestResponseFilename(payload.suggestName, payload.contentType);
    await this._saveViaDialog(this._defaultSaveUri(fileName), "Save Response", "Save Response Body", new Uint8Array(Buffer.from(body, "utf8")));
  }
}
