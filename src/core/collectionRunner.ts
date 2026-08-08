import * as http from "http";
import * as https from "https";
import { performHttpRequest, RawHttpResult, isCancelledError } from "./http";
import { CoreRequestForBody, serializeRequestBody, applyHeadersToRequest } from "./body";
import { applyQueryParams } from "./url";
import { resolveDynamicVariables } from "./dynamicVars";
import { decompressBody } from "./decompress";
import {
  normalizeResponseHeaders,
  setHeader,
  hasHeader,
  getHeaderArray,
  getHeaderValue,
  removeHeader,
} from "./headers";
import { executeUserScript } from "./script";
import {
  isRedirectStatus,
  getRedirectMethod,
  shouldSendBodyOnRedirect,
  shouldStripAuthorization,
  resolveRedirectUrl,
} from "./redirects";
import { DEFAULT_TIMEOUT_MS, DEFAULT_MAX_REDIRECTS } from "./constants";
import { applyAuthHeaders, type AuthType, type AuthDataLike } from "./auth";
import { getCookieHeader, parseSetCookies, storeCookies, StoredCookie } from "./cookies";

/**
 * Collection runner — sequential execution of a folder/collection reusing the
 * same core engine primitives as the single-request flow (body serialization,
 * redirects, decompression, cookie jar, scripts). Kept free of vscode/webview
 * dependencies so it is unit-testable in isolation.
 */

export interface RunnerHeaderItem {
  key: string;
  value: string;
  enabled?: boolean;
}

export interface RunnerRequestItem {
  id: string;
  name?: string;
  method?: string;
  url?: string;
  headers?: RunnerHeaderItem[];
  queryParams?: RunnerHeaderItem[];
  bodyType?: string;
  body?: string;
  gqlQuery?: string;
  gqlVars?: string;
  urlencoded?: RunnerHeaderItem[];
  formData?: any[];
  authType?: string;
  authData?: {
    token?: string;
    username?: string;
    password?: string;
    keyName?: string;
    keyValue?: string;
    addTo?: "header" | "query";
    accessToken?: string;
    digestUsername?: string;
    digestPassword?: string;
    awsAccessKey?: string;
    awsSecretKey?: string;
    awsSessionToken?: string;
    awsRegion?: string;
    awsService?: string;
    jwtAlgorithm?: string;
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
  timeout?: number;
  rejectUnauthorized?: boolean;
  followRedirects?: boolean;
  preScript?: string;
  script?: string;
}

export interface CollectionRunEntry {
  requestId: string;
  name: string;
  method: string;
  url: string;
  status: number;
  statusText: string;
  duration: number;
  size: number;
  error?: string;
  cancelled?: boolean;
  tests?: Record<string, boolean>;
  testSummary?: { passed: number; failed: number };
  /** 0-based iteration index when running data-driven (F32). */
  iteration?: number;
}

export interface CollectionRunnerOptions {
  requests: RunnerRequestItem[];
  variables?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
  /** Cookie jar snapshot to send with each request. */
  cookies?: StoredCookie[];
  /** Called when a Set-Cookie is received so callers can persist the jar. */
  onCookiesChanged?: (cookies: StoredCookie[]) => void;
  /** Called after each request completes (or errors). */
  onProgress?: (entry: CollectionRunEntry, index: number, total: number) => void;
  /**
   * Data-driven iterations (F32). Each row is injected as variables on top of
   * `variables` for a full pass over `requests`. When set, every emitted entry
   * carries its 0-based `iteration`.
   */
  iterationData?: Record<string, string>[];
}

export interface ExecuteRunnerResult {
  entry: CollectionRunEntry;
  extractedVariables: Record<string, any>;
  /** Decompressed response body (text). */
  bodyText?: string;
  /** Normalized response headers. */
  responseHeaders?: Record<string, string | string[]>;
}

function resolveVars(text: string, variables: Record<string, string>): string {
  let out = text || "";
  for (const [key, value] of Object.entries(variables || {})) {
    if (!key) continue;
    out = out.split(`{{${key}}}`).join(value ?? "");
  }
  return resolveDynamicVariables(out);
}

/**
 * F32: Parse a CSV or JSON data file into iteration rows (each row is a
 * set of variables to inject per pass over a collection).
 *
 * CSV: first non-empty line is the header; quoted fields and escaped quotes
 * are supported. JSON: an array of objects becomes one row per object; a
 * single object becomes one row.
 */
export function parseIterationData(
  text: string,
  filename?: string,
): Record<string, string>[] {
  const trimmed = (text || "").replace(/^\uFEFF/, "").trim();
  if (!trimmed) return [];
  const isJson =
    /\.json$/i.test(filename || "") ||
    trimmed.startsWith("[") ||
    trimmed.startsWith("{");
  if (isJson) return _jsonToRows(trimmed);
  return _csvToRows(trimmed);
}

function _normalizeRow(obj: any): Record<string, string> | null {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const row: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    row[k] =
      v === null || v === undefined
        ? ""
        : typeof v === "string"
          ? v
          : JSON.stringify(v);
  }
  return row;
}

function _jsonToRows(text: string): Record<string, string>[] {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (Array.isArray(data)) {
    return data.map(_normalizeRow).filter((r): r is Record<string, string> => r !== null);
  }
  if (data && typeof data === "object") {
    const row = _normalizeRow(data);
    return row ? [row] : [];
  }
  return [];
}

function _parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function _csvToRows(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = _parseCsvLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = _parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    header.forEach((h, idx) => {
      if (h) row[h] = (values[idx] ?? "").trim();
    });
    if (Object.keys(row).length > 0) rows.push(row);
  }
  return rows;
}

function mergeExtractedVariables(
  variables: Record<string, string>,
  extracted: Record<string, any>,
): void {
  Object.entries(extracted || {}).forEach(([k, v]) => {
    variables[k] = typeof v === "string" ? v : JSON.stringify(v);
  });
}

async function doOne(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string | Buffer | undefined,
  rejectUnauthorized: boolean,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<RawHttpResult> {
  const parsedUrl = new URL(url);
  const isHttps = parsedUrl.protocol === "https:";
  const lib = isHttps ? https : http;
  const requestOptions = {
    method,
    headers,
    rejectUnauthorized,
    hostname: parsedUrl.hostname,
    port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : isHttps ? 443 : 80,
    path: parsedUrl.pathname + parsedUrl.search,
  } as http.RequestOptions;
  return performHttpRequest(lib, requestOptions, body, timeoutMs, signal);
}

async function performWithRedirects(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string | Buffer | undefined,
  rejectUnauthorized: boolean,
  options: {
    followRedirects?: boolean;
    maxRedirects?: number;
    timeout: number;
    signal?: AbortSignal;
  },
  runnerOptions: CollectionRunnerOptions,
): Promise<RawHttpResult> {
  const maxRedirects =
    options.followRedirects === false
      ? 0
      : options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMs = options.timeout;

  let currentMethod = method;
  let currentUrl = url;
  let currentHeaders = { ...headers };
  let currentBody = body;

  const captureCookies = (result: RawHttpResult, requestUrl: string): void => {
    if (!runnerOptions.onCookiesChanged) return;
    try {
      const incoming = parseSetCookies(result.headers as any, requestUrl);
      if (incoming.length > 0) {
        const next = storeCookies(runnerOptions.cookies || [], incoming);
        runnerOptions.onCookiesChanged(next);
      }
    } catch {
      /* ignore cookie capture failures */
    }
  };

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const result = await doOne(
      currentMethod,
      currentUrl,
      currentHeaders,
      currentBody,
      rejectUnauthorized,
      timeoutMs,
      options.signal,
    );

    captureCookies(result, currentUrl);

    if (hop >= maxRedirects || !isRedirectStatus(result.status)) {
      return result;
    }

    const locations = getHeaderArray(result.headers as any, "location");
    const nextUrl = resolveRedirectUrl(currentUrl, locations[0]);
    if (!nextUrl) return result;

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
    if (sendBody && currentBody !== undefined) {
      removeHeader(nextHeaders, "content-length");
      setHeader(
        nextHeaders,
        "Content-Length",
        String(
          Buffer.isBuffer(currentBody)
            ? currentBody.length
            : Buffer.byteLength(currentBody, "utf8"),
        ),
      );
    }

    currentMethod = nextMethod;
    currentUrl = nextUrl;
    currentHeaders = nextHeaders;
    currentBody = sendBody ? currentBody : undefined;
  }

  return doOne(
    currentMethod,
    currentUrl,
    currentHeaders,
    currentBody,
    rejectUnauthorized,
    timeoutMs,
    options.signal,
  );
}

/**
 * Execute a single request with the runner's shared environment variables.
 * Environment variables are updated in place so later requests in a run can
 * consume script-extracted values (request chaining).
 */
export async function executeRunnerRequest(
  req: RunnerRequestItem,
  variables: Record<string, string>,
  options: CollectionRunnerOptions,
): Promise<ExecuteRunnerResult> {
  const startTime = Date.now();
  const method = (req.method || "GET").toUpperCase();
  const resolve = (s: string) => resolveVars(s, variables);

  const entry: CollectionRunEntry = {
    requestId: req.id,
    name: req.name || `${method} ${req.url || ""}`,
    method,
    url: req.url || "",
    status: 0,
    statusText: "",
    duration: 0,
    size: 0,
  };
  let extractedVariables: Record<string, any> = {};
  let bodyText: string | undefined;
  let responseHeaders: Record<string, string | string[]> | undefined;

  const preScript = (req.preScript || "").trim();
  if (preScript) {
    const scriptResult = await executeUserScript(
      preScript,
      { request: { ...req }, variables: {}, params: req.queryParams },
      5000,
    );
    if (!scriptResult.success) {
      entry.error = `Pre-request script failed: ${scriptResult.error}`;
      entry.statusText = "Error";
      entry.duration = Date.now() - startTime;
      return { entry, extractedVariables };
    }
    if (Object.keys(scriptResult.variables).length > 0) {
      extractedVariables = { ...extractedVariables, ...scriptResult.variables };
      mergeExtractedVariables(variables, scriptResult.variables);
    }
  }

  let url = resolve(req.url || "");
  const withParams = applyQueryParams(url, req.queryParams, resolve);
  if (withParams === null) {
    entry.error = "Invalid URL";
    entry.statusText = "Error";
    entry.duration = Date.now() - startTime;
    return { entry, extractedVariables };
  }
  url = withParams;

  const headers: Record<string, string> = {};
  (req.headers || []).forEach((h) => {
    if (h.key && h.enabled !== false) {
      setHeader(headers, resolve(h.key), resolve(h.value));
    }
  });

  let body: string | Buffer | undefined;
  const serialized = serializeRequestBody(req as CoreRequestForBody, resolve);
  if (serialized.body !== undefined) body = serialized.body;
  applyHeadersToRequest(headers, serialized.headers, serialized.forceHeaders);

  const authType = (req.authType || "none") as AuthType;
  if (authType !== "digest") {
    const applied = applyAuthHeaders(headers, authType, (req.authData || {}) as AuthDataLike, {
      resolve,
      method,
      url,
      body,
      headers,
    });
    if (applied.url) url = applied.url;
  }
  entry.url = url;

  if (!hasHeader(headers, "Accept-Encoding")) {
    setHeader(headers, "Accept-Encoding", "gzip, deflate, br");
  }

  if (!hasHeader(headers, "cookie") && options.cookies) {
    const cookieHeader = getCookieHeader(options.cookies, url);
    if (cookieHeader) setHeader(headers, "Cookie", cookieHeader);
  }

  const rejectUnauthorized = req.rejectUnauthorized !== false;
  const timeoutMs = req.timeout ?? options.timeout ?? DEFAULT_TIMEOUT_MS;

  try {
    const result = await performWithRedirects(
      method,
      url,
      headers,
      body,
      rejectUnauthorized,
      {
        followRedirects: req.followRedirects !== false,
        maxRedirects: DEFAULT_MAX_REDIRECTS,
        timeout: timeoutMs,
        signal: options.signal,
      },
      options,
    );

    const encoding = getHeaderValue(result.headers as any, "content-encoding");
    const decoded = decompressBody(result.data, encoding);
    entry.status = result.status;
    entry.statusText = result.statusText;
    entry.size = decoded.length;
    bodyText = decoded.toString("utf8");
    responseHeaders = normalizeResponseHeaders(result.headers as any) as Record<
      string,
      string | string[]
    >;

    const postScript = (req.script || "").trim();
    if (postScript) {
      const scriptResult = await executeUserScript(
        postScript,
        {
          response: {
            status: result.status,
            statusText: result.statusText,
            headers: normalizeResponseHeaders(result.headers as any),
            body: bodyText,
          },
        },
        5000,
      );
      entry.tests = scriptResult.tests;
      const total = Object.keys(scriptResult.tests || {}).length;
      const passed = Object.values(scriptResult.tests || {}).filter(Boolean).length;
      entry.testSummary = { passed, failed: total - passed };
      if (Object.keys(scriptResult.variables).length > 0) {
        extractedVariables = { ...extractedVariables, ...scriptResult.variables };
        mergeExtractedVariables(variables, scriptResult.variables);
      }
    }
  } catch (err: any) {
    entry.duration = Date.now() - startTime;
    if (isCancelledError(err)) {
      entry.cancelled = true;
      entry.statusText = "Cancelled";
      entry.error = "Cancelled";
    } else {
      entry.statusText = "Error";
      entry.error = err?.message ?? String(err);
    }
    return { entry, extractedVariables, bodyText, responseHeaders };
  }

  entry.duration = Date.now() - startTime;
  return { entry, extractedVariables, bodyText, responseHeaders };
}

/**
 * Run a list of requests sequentially, sharing a mutable environment so script
 * variables set by one request are available to the next (request chaining).
 * Aborting the signal stops execution after the in-flight request.
 *
 * When `iterationData` is provided, a full pass over `requests` runs for each
 * row with that row's variables overlaid on `variables`; emitted entries carry
 * a 0-based `iteration` so callers can group results by row.
 */
export async function runCollectionRequests(
  options: CollectionRunnerOptions,
): Promise<CollectionRunEntry[]> {
  const requests = options.requests || [];
  const iterations =
    options.iterationData && options.iterationData.length > 0
      ? options.iterationData
      : [null];
  const results: CollectionRunEntry[] = [];
  const perIterationTotal = requests.length * iterations.length;

  for (let iter = 0; iter < iterations.length; iter++) {
    const row = iterations[iter];
    const variables: Record<string, string> = {
      ...(options.variables || {}),
      ...(row || {}),
    };
    const baseIndex = results.length;

    for (let i = 0; i < requests.length; i++) {
      if (options.signal?.aborted) break;
      const { entry, extractedVariables } = await executeRunnerRequest(
        requests[i],
        variables,
        { ...options },
      );
      mergeExtractedVariables(variables, extractedVariables);
      if (row) entry.iteration = iter;
      results.push(entry);
      options.onProgress?.(entry, baseIndex + i, perIterationTotal);
    }

    if (options.signal?.aborted) break;
  }

  return results;
}
