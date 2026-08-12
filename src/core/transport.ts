/**
 * Unified request transport (HTTP/1.1 + HTTP/2 + proxy).
 *
 * Owns the full connection decision tree so the panel holds no transport
 * boilerplate:
 *
 *   HTTP/2 toggle  → HTTP/2 session (F48), bypasses the proxy
 *   proxy          → HTTPS proxy agent when the module is available
 *   proxy          → plain-HTTP forward when the agent module is missing
 *   none           → direct connection with system-proxy detection disabled
 *
 * Host-agnostic (`src/core` — no `vscode` imports). Every branch resolves to
 * the same `RawHttpResult` shape, and progress is reported through a single
 * `onStage` hook so callers log each path uniformly.
 */
import * as http from "http";
import * as https from "https";
import {
  performHttpRequest,
  type HttpStreamCallbacks,
  type RawHttpResult,
} from "./http";
import { performHttp2Request } from "./http2";

export interface ProxyConfig {
  proxy: string;
  auth?: string;
}

export interface RequestTransportOptions {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | Buffer;
  rejectUnauthorized: boolean;
  timeoutMs: number;
  signal?: AbortSignal;
  /** F48: send over HTTP/2 instead of HTTP/1.1 (ignored when a proxy is set). */
  useHttp2?: boolean;
  /** mTLS bundle for the target host (ca / cert / key buffers). */
  tls?: Record<string, Buffer>;
  /** F28: forward response headers/body chunks incrementally. */
  stream?: HttpStreamCallbacks;
  /** Progress hook; stage strings match the panel's old debug log. */
  onStage?: (stage: string, info: Record<string, unknown>) => void;
  proxy?: ProxyConfig;
}

// Lazy-loaded so extension-host modules that don't need the proxy never pay
// for the require. Supports both export shapes across versions.
let proxyAgentCtor: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const proxyModule = require("https-proxy-agent");
  proxyAgentCtor =
    proxyModule.HttpsProxyAgent || proxyModule.default || proxyModule;
} catch (err) {
  console.error("Failed to load https-proxy-agent:", err);
}

// Keep-alive agents that deliberately ignore system/env proxy configuration.
let directHttpAgent: http.Agent;
let directHttpsAgent: https.Agent;

function getDirectAgent(isHttps: boolean): http.Agent {
  if (isHttps) {
    directHttpsAgent ??= new https.Agent({ keepAlive: true });
    return directHttpsAgent;
  }
  directHttpAgent ??= new http.Agent({ keepAlive: true });
  return directHttpAgent;
}

/**
 * Parse a proxy-auth value into the `Proxy-Authorization` token and the
 * `user:pass` pair used to embed credentials in the agent's proxy URL.
 * Accepts "user:pass", "Basic <base64>", or a bare base64 token.
 */
function resolveProxyAuth(
  auth?: string,
): { token?: string; credentials?: string } {
  const raw = auth?.trim();
  if (!raw) return {};

  let token: string | undefined;
  let credentials: string | undefined;
  if (/^Basic\s+/i.test(raw)) {
    token = raw.replace(/^Basic\s+/i, "").trim();
  } else if (raw.includes(":")) {
    credentials = raw;
    token = Buffer.from(raw).toString("base64");
  } else {
    token = raw;
  }

  if (!credentials && token) {
    try {
      const decoded = Buffer.from(token, "base64").toString("utf8");
      if (decoded.includes(":")) credentials = decoded;
    } catch {
      /* not base64 — keep the token as-is */
    }
  }
  return { token, credentials };
}

function withProxyAuthorization(
  headers: http.OutgoingHttpHeaders | readonly string[] | undefined,
  token?: string,
): http.OutgoingHttpHeaders {
  const base: http.OutgoingHttpHeaders = {};
  if (headers && !Array.isArray(headers)) Object.assign(base, headers);
  if (token) base["Proxy-Authorization"] = `Basic ${token}`;
  return base;
}

/** Build a proxy URL that embeds credentials for the agent, when supplied. */
function buildProxyAgentUrl(proxy: string, credentials?: string): string {
  const url = new URL(/^[a-z]+:\/\//i.test(proxy) ? proxy : `http://${proxy}`);
  if (credentials && !url.username) {
    const sep = credentials.indexOf(":");
    if (sep >= 0) {
      url.username = credentials.slice(0, sep);
      url.password = credentials.slice(sep + 1);
    }
  }
  return url.toString();
}

/**
 * Perform a single request. The transport (HTTP/2, proxy, or direct) is chosen
 * here so callers stay transport-agnostic. Rejects on connection failure,
 * timeout, or abort (with a "Request cancelled" error).
 */
export async function performRequest(
  opts: RequestTransportOptions,
): Promise<RawHttpResult> {
  const {
    url,
    method,
    headers,
    body,
    rejectUnauthorized,
    timeoutMs,
    signal,
    useHttp2,
    tls,
    stream,
    onStage,
  } = opts;

  const parsedUrl = new URL(url);
  const isHttps = parsedUrl.protocol === "https:";
  const lib = isHttps ? https : http;

  // F48: HTTP/2 — no proxy support, so only when none is configured.
  if (useHttp2 && !opts.proxy?.proxy) {
    return performHttp2Request({
      url,
      method,
      headers,
      body,
      rejectUnauthorized,
      timeoutMs,
      signal,
      tls,
      stream,
    });
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

  if (isHttps && tls) Object.assign(options, tls);

  if (opts.proxy?.proxy) {
    try {
      const { token, credentials } = resolveProxyAuth(opts.proxy.auth);
      const proxyUrl = new URL(
        /^[a-z]+:\/\//i.test(opts.proxy.proxy)
          ? opts.proxy.proxy
          : `http://${opts.proxy.proxy}`,
      );
      const isProxyHttps = proxyUrl.protocol === "https:";

      if (proxyAgentCtor) {
        try {
          options.agent = new proxyAgentCtor(
            buildProxyAgentUrl(proxyUrl.toString(), credentials),
          );
        } catch (agentErr) {
          throw new Error(
            `Failed to create proxy agent: ${agentErr instanceof Error ? agentErr.message : String(agentErr)}`,
          );
        }
        options.headers = withProxyAuthorization(options.headers, token);
        onStage?.("proxyRequest-start", {
          proxyOpts: true,
          path: options.path,
        });
        return performHttpRequest(
          lib,
          options,
          body,
          timeoutMs,
          signal,
          (stage, info) => onStage?.(`proxyRequest-${stage}`, info),
          stream,
        );
      }

      // Fallback without the agent module (plain-HTTP targets only).
      if (isHttps) {
        throw new Error(
          "Proxy agent module is not available for HTTPS target requests",
        );
      }
      options.hostname = proxyUrl.hostname;
      options.port = proxyUrl.port
        ? parseInt(proxyUrl.port, 10)
        : isProxyHttps
          ? 443
          : 80;
      options.path = url;
      options.headers = withProxyAuthorization(options.headers, token);
      onStage?.("proxyRequest-start", {
        proxyOpts: false,
        path: options.path,
      });
      return performHttpRequest(
        isProxyHttps ? https : http,
        options,
        body,
        timeoutMs,
        signal,
        (stage, info) => onStage?.(`proxyRequest-${stage}`, info),
        stream,
      );
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.startsWith("Failed to create proxy agent") ||
          err.message ===
            "Proxy agent module is not available for HTTPS target requests")
      ) {
        throw err;
      }
      throw new Error(
        `Invalid Proxy URL configuration: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Direct connection: pin a no-proxy agent so Node ignores env/system proxies.
  options.agent = getDirectAgent(isHttps);
  onStage?.("doRequest-start", {
    hostname: parsedUrl.hostname,
    port: options.port,
    isHttps,
  });
  return performHttpRequest(
    lib,
    options,
    body,
    timeoutMs,
    signal,
    (stage, info) => onStage?.(`doRequest-${stage}`, info),
    stream,
  );
}
