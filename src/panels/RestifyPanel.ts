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
const MAX_RESPONSE_SIZE = 100 * 1024 * 1024; // 100MB

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
  script?: string; // Post-response script for variable extraction
  authType?: "none" | "bearer" | "basic" | "apikey";
  authData?: {
    token?: string;
    username?: string;
    password?: string;
    keyName?: string;
    keyValue?: string;
    addTo?: "header" | "query";
  };
  gqlQuery?: string;
  gqlVars?: string;
  activeEnvironmentId?: string;
}

interface RequestResult {
  status: number;
  statusText: string;
  headers: Record<string, string | string[]>;
  body: string;
  bodySize: number;
  isFileResponse?: boolean;
  fileDetectionSource?: "mime" | "filename";
  fileName?: string;
  fileMimeType?: string;
  fileBase64?: string;
  filePreviewType?: "text" | "csv" | "pdf" | "excel" | "none";
}

export class RestifyPanel {
  private panel: vscode.WebviewPanel;
  private context: vscode.ExtensionContext;
  private storageManager: StorageManager;
  private onDispose: (instance: RestifyPanel) => void;
  private activityProvider?: ActivityProvider;
  private pendingRequest: RequestData | null = null;
  private webviewReady: boolean = false;

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
    this.activityProvider?.append("Restify panel opened", "The request editor is ready.", "info");
    this.panel.webview.onDidReceiveMessage((msg) => {
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
      this.panel.webview.postMessage({
        command: "loadSettings",
        settings: this.storageManager.getSettings(),
      });
    }, 100);
  }

  loadRequest(requestData: RequestData): void {
    this.pendingRequest = requestData;

    if (requestData && requestData.name) {
      this.panel.title = requestData.name;
    }
    this.activityProvider?.append("Request loaded", requestData?.name || "The request editor was populated.", "info");

    // If webview is already ready, send immediately
    if (this.webviewReady) {
      this._sendPendingRequest();
    }
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

  private _canonicalHeaderName(name: string): string {
    if (name.toLowerCase() === "set-cookie") return "Set-Cookie";
    return name
      .split("-")
      .map((part) =>
        part.length > 0
          ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
          : part,
      )
      .join("-");
  }

  private _normalizeResponseHeaders(
    headers: http.IncomingHttpHeaders,
  ): Record<string, string | string[]> {
    const normalized: Record<string, string | string[]> = {};

    Object.entries(headers || {}).forEach(([rawKey, rawValue]) => {
      if (rawValue === undefined) return;
      const key = this._canonicalHeaderName(rawKey);

      if (Array.isArray(rawValue)) {
        normalized[key] = rawValue.map((v) => String(v));
      } else {
        normalized[key] = String(rawValue);
      }
    });

    return normalized;
  }

  private _getHeaderValue(
    headers: Record<string, string | string[]>,
    name: string,
  ): string {
    const hit = Object.entries(headers).find(
      ([k]) => k.toLowerCase() === name.toLowerCase(),
    )?.[1];
    if (!hit) return "";
    return Array.isArray(hit) ? hit.join("; ") : hit;
  }

  private _extractFilename(contentDisposition: string): string | undefined {
    if (!contentDisposition) return undefined;

    // Try UTF-8 RFC 5987 format: filename*=UTF-8''encoded-filename
    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      try {
        const decoded = decodeURIComponent(utf8Match[1].replace(/["']/g, "")).trim();
        if (decoded.length > 0) return decoded;
      } catch {
        const fallback = utf8Match[1].replace(/["']/g, "").trim();
        if (fallback.length > 0) return fallback;
      }
    }

    // Try standard format: filename="name.ext" or filename=name.ext
    const plainMatch = contentDisposition.match(/filename\s*=\s*"?([^";,\n]+)"?/i);
    if (plainMatch?.[1]) {
      const extracted = plainMatch[1].trim();
      if (extracted.length > 0) return extracted;
    }

    // Try alternate format without quotes: filename=name.ext (with possible spaces)
    const alternateMatch = contentDisposition.match(/filename=([^\s;,]+)/i);
    if (alternateMatch?.[1]) {
      const extracted = alternateMatch[1].trim();
      if (extracted.length > 0) return extracted;
    }

    return undefined;
  }

  private _getExtensionFromFileName(fileName?: string): string {
    if (!fileName || !fileName.includes(".")) return "";
    return fileName.split(".").pop()?.toLowerCase() || "";
  }

  private _extractFilenameFromPath(pathOrUrl: string): string | undefined {
    if (!pathOrUrl) return undefined;

    try {
      const parsed = new URL(pathOrUrl);
      pathOrUrl = parsed.pathname;
    } catch {
      // Keep path as-is if it is not a full URL.
    }

    const cleanPath = pathOrUrl.split("?")[0].split("#")[0];
    const last = cleanPath.split("/").pop();
    if (!last || !last.includes(".")) return undefined;

    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  }

  private _previewTypeFromExtension(
    ext: string,
  ): "text" | "csv" | "pdf" | "excel" | "none" {
    if (!ext) return "none";
    if (ext === "pdf") return "pdf";
    if (ext === "csv") return "csv";
    if (["xls", "xlsx", "xlsm", "ods"].includes(ext)) return "excel";
    if (
      [
        "txt",
        "log",
        "md",
        "json",
        "xml",
        "html",
        "htm",
        "yaml",
        "yml",
        "csv",
      ].includes(ext)
    )
      return "text";
    return "none";
  }

  private _guessExtension(mimeType: string): string {
    const mime = mimeType.toLowerCase();
    if (mime.includes("application/pdf")) return "pdf";
    if (mime.includes("text/csv") || mime.includes("application/csv"))
      return "csv";
    if (mime.includes("spreadsheetml") || mime.includes("application/vnd.ms-excel"))
      return "xlsx";
    if (mime.includes("application/json")) return "json";
    if (mime.includes("application/xml") || mime.includes("text/xml"))
      return "xml";
    if (mime.includes("text/plain")) return "txt";
    return "bin";
  }

  private _isTextLike(contentType: string, fileName?: string): boolean {
    const ct = contentType.toLowerCase();
    const ext = this._getExtensionFromFileName(fileName);
    return (
      ct.startsWith("text/") ||
      ct.includes("csv") ||
      ct.includes("json") ||
      ct.includes("xml") ||
      ct.includes("javascript") ||
      ct.includes("x-www-form-urlencoded") ||
      this._previewTypeFromExtension(ext) === "text" ||
      this._previewTypeFromExtension(ext) === "csv"
    );
  }

  private _isFileLikeResponse(
    contentType: string,
    contentDisposition: string,
    fileName?: string,
  ): boolean {
    const ct = contentType.toLowerCase();
    const cd = contentDisposition.toLowerCase();
    const ext = this._getExtensionFromFileName(fileName);

    if (cd.includes("attachment") || cd.includes("filename=")) return true;
    if (this._previewTypeFromExtension(ext) !== "none") return true;

    return (
      ct.includes("application/pdf") ||
      ct.includes("text/csv") ||
      ct.includes("application/csv") ||
      ct.includes("application/octet-stream") ||
      ct.includes("application/zip") ||
      ct.includes("application/vnd") ||
      ct.includes("spreadsheetml")
    );
  }

  private _getFilePreviewType(
    contentType: string,
    fileName?: string,
  ): "text" | "csv" | "pdf" | "excel" | "none" {
    const ct = contentType.toLowerCase();
    const ext = this._getExtensionFromFileName(fileName);

    if (ct.includes("application/pdf")) return "pdf";
    if (ct.includes("text/csv") || ct.includes("application/csv")) return "csv";
    if (ct.includes("spreadsheetml") || ct.includes("application/vnd.ms-excel"))
      return "excel";
    if (
      ct.startsWith("text/") ||
      ct.includes("application/json") ||
      ct.includes("application/xml") ||
      ct.includes("text/xml")
    )
      return "text";

    const byExt = this._previewTypeFromExtension(ext);
    if (byExt !== "none") return byExt;

    return "none";
  }

  private _getFileDetectionSource(
    contentType: string,
    contentDisposition: string,
    fileName?: string,
  ): "mime" | "filename" {
    const ct = contentType.toLowerCase();
    const cd = contentDisposition.toLowerCase();
    const ext = this._getExtensionFromFileName(fileName);

    const mimeSuggestsFile =
      cd.includes("attachment") ||
      cd.includes("filename=") ||
      ct.includes("application/pdf") ||
      ct.includes("text/csv") ||
      ct.includes("application/csv") ||
      ct.includes("application/octet-stream") ||
      ct.includes("application/zip") ||
      ct.includes("application/vnd") ||
      ct.includes("spreadsheetml");

    const filenameSuggestsFile = this._previewTypeFromExtension(ext) !== "none";

    if (!mimeSuggestsFile && filenameSuggestsFile) return "filename";
    return "mime";
  }

  private _buildRequestResult(
    status: number,
    statusText: string,
    headers: http.IncomingHttpHeaders,
    rawData: Buffer,
    requestPathOrUrl: string,
  ): RequestResult {
    const normalizedHeaders = this._normalizeResponseHeaders(headers);
    const contentType = this._getHeaderValue(normalizedHeaders, "Content-Type");
    const contentDisposition = this._getHeaderValue(
      normalizedHeaders,
      "Content-Disposition",
    );
    const fromDisposition = this._extractFilename(contentDisposition);
    const fromPath = this._extractFilenameFromPath(requestPathOrUrl);
    const inferredFileName = fromDisposition || fromPath;
    const isFileResponse = this._isFileLikeResponse(
      contentType,
      contentDisposition,
      inferredFileName,
    );

    if (!isFileResponse) {
      return {
        status,
        statusText,
        headers: normalizedHeaders,
        body: rawData.toString("utf8"),
        bodySize: rawData.length,
        isFileResponse: false,
      };
    }

    const safeMimeType = contentType || "application/octet-stream";
    const safeFileName =
      inferredFileName || `response.${this._guessExtension(safeMimeType)}`;
    const filePreviewType = this._getFilePreviewType(safeMimeType, safeFileName);
    const fileDetectionSource = this._getFileDetectionSource(
      contentType,
      contentDisposition,
      safeFileName,
    );
    const fileBase64 = rawData.toString("base64");
    const textBody = this._isTextLike(safeMimeType, safeFileName)
      ? rawData.toString("utf8")
      : "";

    return {
      status,
      statusText,
      headers: normalizedHeaders,
      body: textBody,
      bodySize: rawData.length,
      isFileResponse: true,
      fileDetectionSource,
      fileName: safeFileName,
      fileMimeType: safeMimeType,
      fileBase64,
      filePreviewType,
    };
  }

  private async _handleMessage(msg: any): Promise<void> {
    switch (msg.command) {
      case "webviewReady":
        // Webview is ready, send all initial data
        this.webviewReady = true;
        this.updateMetadata();
        // Send any pending request data
        this._sendPendingRequest();
        break;
      case "executeRequest":
        // msg.savedRequest is the original state (no injected auth headers) — used for history.
        await this._executeRequest(msg.request, msg.savedRequest);
        break;
      case "setScriptVariables":
        // Script extracted variables - add them to the active environment
        if (this.storageManager.getActiveEnvironment()) {
          const env = this.storageManager.getActiveEnvironment();
          if (env) {
            const existingVars = env.variables || [];
            const now = Date.now(); // Current timestamp
            // Update or add extracted variables with timestamp
            Object.entries(msg.variables).forEach(([key, value]) => {
              const existingIndex = existingVars.findIndex(
                (v) => v.key === key,
              );
              const stringValue =
                typeof value === "string" ? value : JSON.stringify(value);
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
            this.storageManager.saveEnvironment({
              ...env,
              variables: existingVars,
            });
            // Notify webview of updated environment
            this._sendEnvironments();
          }
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
        this.storageManager.saveEnvironment(env);
        this._sendEnvironments();
        break;
      }
      case "deleteEnvironment": {
        this.storageManager.deleteEnvironment(msg.id);
        this._sendEnvironments();
        break;
      }
      case "updateTitle":
        this.panel.title = msg.title || "New Request";
        break;
      case "resolveTooltip": {
        const resolved = this.storageManager.resolveVariables(msg.text);
        this.panel.webview.postMessage({
          command: "setTooltipValue",
          value: resolved,
        });
        break;
      }
      case "saveSettings":
        this.storageManager.saveSettings(msg.settings);
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
        result: { success: true, variables, logs },
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
      this.storageManager.resolveVariables(s || "");

    const rawUrl = resolveVars(req.url);
    const method = req.method || "GET";
    const headers: Record<string, string> = {};

    (req.headers || []).forEach((h) => {
      if (h.key && h.enabled !== false) {
        headers[resolveVars(h.key)] = resolveVars(h.value);
      }
    });

    let body: string | Buffer | undefined = undefined;
    if (req.bodyType === "json" && req.body) {
      body = resolveVars(req.body);
      if (!headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
      }
    } else if (req.bodyType === "form" && req.formData) {
      const enabledFields = (req.formData || []).filter(
        (f) => f.key && f.enabled !== false,
      );
      const hasFileField = enabledFields.some(
        (f) => (f.formType || "text") === "file",
      );

      if (hasFileField) {
        const boundary = `----RestifyFormBoundary${Date.now().toString(16)}`;
        const chunks: Buffer[] = [];

        enabledFields.forEach((field) => {
          const fieldName = resolveVars(field.key);
          const fieldType = field.formType || "text";

          if (fieldType === "file" && field.fileContentBase64) {
            const fileName = field.fileName || "upload.bin";
            const contentType = field.contentType || "application/octet-stream";
            const fileBuffer = Buffer.from(field.fileContentBase64, "base64");

            chunks.push(
              Buffer.from(
                `--${boundary}\r\n` +
                  `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
                  `Content-Type: ${contentType}\r\n\r\n`,
              ),
            );
            chunks.push(fileBuffer);
            chunks.push(Buffer.from("\r\n"));
            return;
          }

          const fieldValue = resolveVars(field.value || "");
          let header = `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${fieldName}"\r\n`;
          
          // Add Content-Type header for text fields with custom content type
          if (fieldType === "text" && field.contentType) {
            header += `Content-Type: ${field.contentType}\r\n`;
          }
          
          header += `\r\n`;
          
          chunks.push(Buffer.from(header));
          chunks.push(Buffer.from(fieldValue));
          chunks.push(Buffer.from("\r\n"));
        });

        chunks.push(Buffer.from(`--${boundary}--\r\n`));
        body = Buffer.concat(chunks);

        headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
        headers["Content-Length"] = String(body.length);
      } else {
        const params = new URLSearchParams();
        enabledFields.forEach((f) => {
          params.append(resolveVars(f.key), resolveVars(f.value || ""));
        });
        body = params.toString();
        if (!headers["Content-Type"]) {
          headers["Content-Type"] = "application/x-www-form-urlencoded";
        }
      }
    } else if (req.bodyType === "urlencoded") {
      const enabledFields = (req.urlencoded || []).filter(
        (f) => f.key && f.enabled !== false,
      );
      const params = new URLSearchParams();
      enabledFields.forEach((f) => {
        params.append(resolveVars(f.key), resolveVars(f.value || ""));
      });
      body = params.toString();
      if (!headers["Content-Type"]) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
      }
    } else if (req.bodyType === "text" || req.bodyType === "xml") {
      body = resolveVars(req.body);
      if (req.bodyType === "xml" && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/xml";
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
              resolveVars(p.value),
            );
          }
        });
        finalUrl = parsedUrl.toString();
      }
    } catch {
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

    const settings = this.storageManager.getSettings();
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

    this.activityProvider?.append(
      "Request started",
      [
        `Method: ${method}`,
        `URL: ${finalUrl}`,
        `Headers: ${Object.keys(headers).length}`,
        `Body: ${this._formatRequestBodySummary(body, req.bodyType)}`,
        `SSL verification: ${req.rejectUnauthorized === true ? "enabled" : "disabled"}`,
        `Proxy: ${proxyOpts ? this._redactProxyUrl(proxyOpts.proxy) : "not used"}`,
      ].join("\n"),
      "info",
    );
    this.panel.webview.postMessage({ command: "requestStart" });

    try {
      const netStart = Date.now();
      const result = await this._doRequest(
        method,
        finalUrl,
        headers,
        body,
        req.rejectUnauthorized === true,
        proxyOpts,
      );
      try {
        this.panel.webview.postMessage({
          command: "debugLog",
          data: {
            stage: "receivedResponse",
            info: {
              status: result.status,
              size: result.bodySize || Buffer.byteLength(result.body || "", "utf8"),
            },
          },
        });
      } catch {
        /* empty */
      }
      timings.network = Date.now() - netStart;

      const duration = Date.now() - startTime;
      const responseData = {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
        body: result.body,
        duration,
        size: result.bodySize || Buffer.byteLength(result.body || "", "utf8"),
        isFileResponse: result.isFileResponse,
        fileDetectionSource: result.fileDetectionSource,
        fileName: result.fileName,
        fileMimeType: result.fileMimeType,
        fileBase64: result.fileBase64,
        filePreviewType: result.filePreviewType,
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

      const isFormData = req.bodyType === "form" && Array.isArray(req.formData) && req.formData.length > 0;

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
        });
        timings.postMessageMs = Date.now() - pmStart;
        timings.postMessageSize = size;
      } catch {
        /* empty */
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
          `Status: ${result.status} ${result.statusText || "OK"}`,
          `Duration: ${duration}ms`,
          `Network: ${timings.network ?? 0}ms`,
          `Size: ${this._formatBytes(responseData.size)}`,
          `Content-Type: ${this._getHeaderValue(result.headers, "content-type") || "unknown"}`,
          `Proxy: ${proxyOpts ? this._redactProxyUrl(proxyOpts.proxy) : "not used"}`,
          `mTLS: ${mtlsCerts ? `enabled for ${parsedUrl.hostname}` : "not used"}`,
        ].join("\n"),
        result.status >= 400 ? "warning" : "info",
      );

      // Log timings for diagnostics
      // eslint-disable-next-line no-console
      console.log("Restify: request timings", {
        url: finalUrl,
        status: result.status,
        timings,
      });
    } catch (err: any) {
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
      this.storageManager.addToHistory({
        method,
        url: finalUrl,
        name: historyReq.name || `${method} ${finalUrl}`,
        status: 0,
        error: err.message,
        duration,
        request: historyReq,
        activeEnvironmentId:
          this.storageManager.getActiveEnvironment()?.id || null,
      });
    }
  }

  private _doRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | Buffer | undefined,
    rejectUnauthorized: boolean,
    proxyOpts: { proxy: string; auth?: string } | null,
  ): Promise<RequestResult> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === "https:";

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
              return reject(
                new Error(
                  `Failed to create proxy agent: ${agentErr instanceof Error ? agentErr.message : String(agentErr)}`,
                ),
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

            const lib = isHttps ? https : http;
            return this._executeProxyRequest(
              lib,
              options,
              body,
              resolve,
              reject,
            );
          }

          // Fallback when proxy agent is unavailable (supports plain HTTP target requests).
          if (isHttps) {
            return reject(
              new Error(
                "Proxy agent module is not available for HTTPS target requests",
              ),
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

          const lib = isProxyHttps ? https : http;
          return this._executeProxyRequest(lib, options, body, resolve, reject);
        } catch(e) {
          console.error("Proxy URL parsing error:", e);
          return reject(
            new Error(
              `Invalid Proxy URL configuration: ${e instanceof Error ? e.message : String(e)}`,
            ),
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

      const lib = isHttps ? https : http;
      const req = lib.request(options, (res) => {
        const chunks: Buffer[] = [];
        let totalSize = 0;
        let aborted = false;
        res.on("data", (chunk) => {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalSize += buf.length;
          if (totalSize > MAX_RESPONSE_SIZE) {
            aborted = true;
            req.destroy(new Error("Response exceeded maximum allowed size of 100MB"));
            return;
          }
          chunks.push(buf);
        });
        res.on("end", () => {
          if (aborted) return;
          const rawData = Buffer.concat(chunks);
          const result = this._buildRequestResult(
            res.statusCode || 0,
            res.statusMessage || "",
            res.headers,
            rawData,
            url,
          );
          try {
            this.panel.webview.postMessage({
              command: "debugLog",
              data: {
                stage: "doRequest-end",
                info: {
                  status: res.statusCode,
                  size: rawData.length,
                },
              },
            });
          } catch {
            /* empty */
          }
          resolve(result);
        });
      });
      req.on("error", (err) => {
        try {
          this.panel.webview.postMessage({
            command: "debugLog",
            data: {
              stage: "doRequest-error",
              info: { message: err?.message || String(err) },
            },
          });
        } catch {
          /* empty */
        }
        reject(err);
      });
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error("Request timed out after 30 seconds"));
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
    reject: (reason?: any) => void,
  ): void {
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

    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      res.on("end", () => {
        const rawData = Buffer.concat(chunks);
        const requestPathOrUrl =
          typeof options.path === "string" ? options.path : "";
        const result = this._buildRequestResult(
          res.statusCode || 0,
          res.statusMessage || "Unknown",
          res.headers,
          rawData,
          requestPathOrUrl,
        );
        try {
          this.panel.webview.postMessage({
            command: "debugLog",
            data: {
              stage: "proxyRequest-end",
              info: {
                status: res.statusCode,
                size: rawData.length,
              },
            },
          });
        } catch {
          /* empty */
        }
        resolve(result);
      });
    });

    req.on("error", (err) => {
      try {
        this.panel.webview.postMessage({
          command: "debugLog",
          data: {
            stage: "proxyRequest-error",
            info: { message: err?.message || String(err) },
          },
        });
      } catch {
        /* empty */
      }
      reject(err);
    });
    req.setTimeout(30000, () => {
      req.destroy();
      try {
        this.panel.webview.postMessage({
          command: "debugLog",
          data: { stage: "proxyRequest-timeout", info: { timeoutMs: 30000 } },
        });
      } catch {
        /* empty */
      }
      reject(new Error("Request timed out after 30 seconds"));
    });

    if (body) req.write(body);
    req.end();
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

  private async _downloadFile(payload: {
    fileName?: string;
    mimeType?: string;
    fileBase64?: string;
  }): Promise<void> {
    let fileName = payload?.fileName || "response.bin";
    const mimeType = payload?.mimeType || "application/octet-stream";
    
    // Extract just the filename (not the full path)
    fileName = path.basename(fileName);
    
    // If basename returns empty string, fall back to MIME-based filename
    if (!fileName || fileName.trim().length === 0 || fileName === ".") {
      if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('vnd.ms-excel')) {
        fileName = "response.xlsx";
      } else if (mimeType.includes('csv')) {
        fileName = "response.csv";
      } else if (mimeType.includes('pdf')) {
        fileName = "response.pdf";
      } else if (mimeType.includes('text')) {
        fileName = "response.txt";
      } else {
        fileName = "response.bin";
      }
    }
    
    const fileBase64 = payload?.fileBase64;

    if (!fileBase64) {
      vscode.window.showErrorMessage("No file payload available to download.");
      return;
    }

    let defaultUri: vscode.Uri | undefined;
    
    // Try to use workspace folder first
    const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (workspaceUri) {
      defaultUri = vscode.Uri.joinPath(workspaceUri, fileName);
    } else {
      // Fallback: create a URI from home directory (uses OS temp or user home)
      // vscode.Uri.file() will use the home directory on most systems
      defaultUri = vscode.Uri.file(path.join(os.homedir(), fileName));
    }

    const targetUri = await vscode.window.showSaveDialog({
      defaultUri,
      saveLabel: "Save Response File",
      title: "Save Response File",
    });

    if (!targetUri) return;

    try {
      const bytes = Buffer.from(fileBase64, "base64");
      await vscode.workspace.fs.writeFile(targetUri, new Uint8Array(bytes));
      const savedFileName = targetUri.fsPath.split("/").pop() || fileName;
      vscode.window.showInformationMessage(
        `Saved file: ${savedFileName}`,
      );
    } catch (err: any) {
      vscode.window.showErrorMessage(
        `Failed to save file: ${err?.message || "Unknown error"}`,
      );
    }
  }
}
