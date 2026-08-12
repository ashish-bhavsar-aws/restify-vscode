import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { URL } from "url";
import { StorageManager } from "../storage/StorageManager";
import { showSaveDialog } from "./dialogStub";
import {
  extensionForContentType,
  formatCompletionNotification,
  parseSetCookies,
  shouldNotifyOnCompletion,
  storeCookies,
  suggestResponseFilename,
  type CollectionAuthLike,
} from "../core";
import { RequestData } from "./requestTypes";

export function formatBytes(bytes: number | undefined): string {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatRequestBodySummary(
  body: string | Buffer | undefined,
  bodyType?: string,
): string {
  if (body === undefined || body === null || body === "") {
    return "none";
  }

  const size = Buffer.isBuffer(body)
    ? body.length
    : Buffer.byteLength(String(body), "utf8");
  return `${bodyType || "raw"} (${formatBytes(size)})`;
}

export function redactProxyUrl(proxyUrl: string): string {
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
export function historyName(
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

export function shouldUseProxy(
  host: string,
  noProxyArray?: string[],
): boolean {
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

export function getCertificatesForHost(
  storage: StorageManager,
  host: string,
): Record<string, Buffer> | null {
  const settings = storage.getSettings();
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

export function captureCookies(
  storage: StorageManager,
  headers: Record<string, string | string[]>,
  url: string,
): void {
  try {
    const incoming = parseSetCookies(headers, url);
    if (incoming.length === 0) return;
    const jar = storeCookies(storage.getCookies(), incoming);
    storage.saveCookies(jar);
  } catch (err) {
    console.error("Failed to store response cookies:", err);
  }
}

export function resolveCollectionAuth(
  storage: StorageManager,
  collectionId?: string,
): CollectionAuthLike | undefined {
  if (!collectionId) return undefined;
  return storage
    .getCollections()
    .find((c) => String(c.id) === String(collectionId))?.auth;
}

export function notifyRequestComplete(
  storage: StorageManager,
  opts: { method: string; url: string; status: number; durationMs: number },
): void {
  const settings = storage.getSettings();
  const testThreshold = Number(process.env.RESTIFY_TEST_NOTIFY_THRESHOLD_MS || "");
  const background = process.env.RESTIFY_TEST_NOTIFY_THRESHOLD_MS !== undefined || !vscode.window.state.focused;
  const thresholdMs = Number.isFinite(testThreshold) && testThreshold > 0 ? testThreshold : settings.longRequestThresholdMs;
  if (!shouldNotifyOnCompletion({ enabled: settings.notifyOnLongRequest, durationMs: opts.durationMs, thresholdMs, background })) return;
  vscode.window.showInformationMessage(`Request completed: ${formatCompletionNotification(opts)}`);
}

export function defaultSaveUri(fileName: string): vscode.Uri {
  const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
  return workspaceUri
    ? vscode.Uri.joinPath(workspaceUri, fileName)
    : vscode.Uri.file(path.join(os.homedir(), fileName));
}

export async function saveViaDialog(
  defaultUri: vscode.Uri,
  saveLabel: string,
  title: string,
  data: Uint8Array,
): Promise<void> {
  const targetUri = await showSaveDialog({ defaultUri, saveLabel, title });
  if (!targetUri) return;
  try {
    await vscode.workspace.fs.writeFile(targetUri, data);
    vscode.window.showInformationMessage(`Saved file: ${path.basename(targetUri.fsPath)}`);
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to save file: ${err?.message || "Unknown error"}`);
  }
}

export async function downloadFile(payload: {
  fileName?: string;
  mimeType?: string;
  fileBase64?: string;
}): Promise<void> {
  const fileBase64 = payload?.fileBase64;
  if (!fileBase64) {
    vscode.window.showErrorMessage("No file payload available to download.");
    return;
  }
  let fileName = path.basename(payload?.fileName || "");
  if (!fileName || fileName.trim().length === 0 || fileName === ".") {
    fileName = `response.${extensionForContentType(payload?.mimeType)}`;
  }
  await saveViaDialog(
    defaultSaveUri(fileName),
    "Save Response File",
    "Save Response File",
    new Uint8Array(Buffer.from(fileBase64, "base64")),
  );
}

export async function saveResponseToFile(payload: {
  body?: string;
  contentType?: string;
  suggestName?: string;
}): Promise<void> {
  const body = payload?.body;
  if (!body) {
    vscode.window.showErrorMessage("No response body available to save.");
    return;
  }
  const fileName = suggestResponseFilename(payload.suggestName, payload.contentType);
  await saveViaDialog(
    defaultSaveUri(fileName),
    "Save Response",
    "Save Response Body",
    new Uint8Array(Buffer.from(body, "utf8")),
  );
}

export async function initializeProxySettings(): Promise<void> {
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
