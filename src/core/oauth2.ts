import * as http from "http";
import * as https from "https";
import * as crypto from "crypto";
import { URL } from "url";
import { performHttpRequest } from "./http";

export type OAuth2GrantType =
  | "authorization_code"
  | "client_credentials"
  | "password";

export interface OAuth2Config {
  /** OAuth2 grant type. */
  grantType: OAuth2GrantType;
  /** Authorization endpoint — required for authorization_code. */
  authUrl?: string;
  /** Token endpoint. */
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  /** Space-separated scopes. */
  scopes?: string;
  /** Resource owner username — password grant. */
  username?: string;
  /** Resource owner password — password grant. */
  password?: string;
  /** Custom redirect URI for authorization_code; defaults to the local listener. */
  redirectUrl?: string;
  /** Enable PKCE for authorization_code (default true). */
  usePkce?: boolean;
  /** Extra params merged into the authorization URL and the token request. */
  extraParams?: Record<string, string>;
}

export interface OAuth2Token {
  accessToken: string;
  refreshToken?: string;
  /** Expiration as epoch ms; undefined when unknown. */
  expiresAt?: number;
  tokenType?: string;
  scope?: string;
}

export interface OAuth2TokenCache {
  get(key: string): OAuth2Token | undefined;
  set(key: string, token: OAuth2Token): void;
}

export interface OAuth2Options {
  cache?: OAuth2TokenCache;
  cacheKey?: string;
  signal?: AbortSignal;
  /** Opens the authorization URL in a browser (authorization_code only). */
  openUrl?: (url: string) => void;
  log?: (message: string) => void;
}

export interface OAuth2Result {
  token: OAuth2Token;
  source: "cache" | "refresh" | "flow";
}

const DEFAULT_TOKEN_TIMEOUT_MS = 30000;
const DEFAULT_EXPIRY_SKEW_SECONDS = 30;

/* ── PKCE helpers ────────────────────────────────── */

export function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function sha256Base64Url(input: string): string {
  return base64UrlEncode(crypto.createHash("sha256").update(input).digest());
}

export function generateCodeVerifier(length = 64): string {
  const bytes = crypto.randomBytes(length);
  return base64UrlEncode(bytes).slice(0, length);
}

export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = generateCodeVerifier();
  return { verifier, challenge: sha256Base64Url(verifier) };
}

/* ── Token endpoint client ───────────────────────── */

async function postForm(
  urlStr: string,
  form: Record<string, string>,
  signal?: AbortSignal,
  timeoutMs = DEFAULT_TOKEN_TIMEOUT_MS,
): Promise<{ status: number; text: string }> {
  const url = new URL(urlStr);
  const lib = url.protocol === "https:" ? https : http;
  const bodyStr = new URLSearchParams(form).toString();
  const result = await performHttpRequest(
    lib,
    {
      method: "POST",
      hostname: url.hostname,
      port: url.port || undefined,
      path: url.pathname + url.search,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(bodyStr),
        Accept: "application/json",
        "User-Agent": "restify-client",
      },
      rejectUnauthorized: true,
    } as http.RequestOptions,
    bodyStr,
    timeoutMs,
    signal,
  );
  return { status: result.status, text: result.data.toString("utf8") };
}

export function parseTokenResponse(status: number, text: string): OAuth2Token {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `OAuth token endpoint returned a non-JSON response (HTTP ${status})`,
    );
  }
  if (!data || typeof data.access_token !== "string") {
    const reason =
      (typeof data?.error_description === "string"
        ? data.error_description
        : undefined) ||
      (typeof data?.error === "string" ? data.error : undefined);
    throw new Error(
      reason
        ? `OAuth token request failed: ${reason} (HTTP ${status})`
        : `OAuth token endpoint returned no access_token (HTTP ${status})`,
    );
  }
  const parsedExpiresIn =
    typeof data.expires_in === "number"
      ? data.expires_in
      : parseInt(data.expires_in, 10);
  const expiresIn = Number.isFinite(parsedExpiresIn) ? parsedExpiresIn : 0;
  return {
    accessToken: data.access_token,
    refreshToken:
      typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    expiresAt:
      expiresIn > 0 ? Date.now() + expiresIn * 1000 : undefined,
    tokenType:
      typeof data.token_type === "string" ? data.token_type : undefined,
    scope: typeof data.scope === "string" ? data.scope : undefined,
  };
}

/* ── Authorization-code flow ─────────────────────── */

function buildAuthCodeUrl(
  config: OAuth2Config,
  redirectUri: string,
  pkce?: { verifier: string; challenge: string },
): string {
  if (!config.authUrl) {
    throw new Error("OAuth 2.0 authorization code flow requires an auth URL");
  }
  const url = new URL(config.authUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  if (config.scopes) url.searchParams.set("scope", config.scopes);
  if (pkce) {
    url.searchParams.set("code_challenge", pkce.challenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  for (const [key, value] of Object.entries(config.extraParams || {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

interface RedirectCallback {
  code?: string;
  error?: string;
  errorDescription?: string;
}

async function waitForRedirect(
  signal?: AbortSignal,
  timeoutMs = 300000,
  preferredHost = "127.0.0.1",
  preferredPort?: number,
): Promise<{ url: string; callback: Promise<RedirectCallback> }> {
  const server = http.createServer((req, res) => {
    req.on("data", () => {
      /* drain request body */
    });
    req.on("end", () => {
      let callback: RedirectCallback = {};
      try {
        const url = new URL(req.url || "/", "http://127.0.0.1");
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");
        const errorDescription = url.searchParams.get("error_description");
        if (code) callback = { code };
        else if (error) callback = { error, errorDescription: errorDescription || undefined };
      } catch {
        callback = { error: "invalid_redirect", errorDescription: "Malformed redirect" };
      }
      const html =
        "<!doctype html><html><body style=\"font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f6f6f6\"><div style=\"text-align:center\"><h2>Authorization complete</h2><p>You can close this window and return to the editor.</p></div></body></html>";
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-length": Buffer.byteLength(html),
      });
      res.end(html);
      resolveCallback(callback);
    });
  });

  let resolveCallback!: (c: RedirectCallback) => void;
  let settled = false;
  const callbackPromise = new Promise<RedirectCallback>((resolve) => {
    resolveCallback = (c) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (signal) signal.removeEventListener("abort", onAbort);
      server.close();
      resolve(c);
    };
  });

  const onAbort = (): void => {
    if (settled) return;
    settled = true;
    if (timeout) clearTimeout(timeout);
    server.close();
    resolveCallback({ error: "request_cancelled", errorDescription: "OAuth flow cancelled" });
  };

  const timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    server.close();
    resolveCallback({ error: "timeout", errorDescription: `Timed out waiting for authorization redirect after ${timeoutMs / 1000}s` });
  }, timeoutMs);

  if (signal) {
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  }

  await new Promise<void>((resolve) =>
    server.listen(preferredPort ?? 0, preferredHost, resolve),
  );
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Failed to start OAuth redirect listener");
  }
  return {
    url: `http://${preferredHost}:${address.port}/callback`,
    callback: callbackPromise,
  };
}

export async function runAuthorizationCodeFlow(
  config: OAuth2Config,
  options: OAuth2Options = {},
): Promise<OAuth2Token> {
  const usePkce = config.usePkce !== false;
  const pkce = usePkce ? generatePkcePair() : undefined;

  let redirectUri = "";
  let listenerHost = "127.0.0.1";
  let listenerPort: number | undefined;

  const customRedirect = config.redirectUrl?.trim();
  if (customRedirect) {
    let parsed: URL;
    try {
      parsed = new URL(customRedirect);
    } catch {
      throw new Error("OAuth 2.0 redirect URL is not a valid URL");
    }
    const host = parsed.hostname.toLowerCase();
    if (host !== "127.0.0.1" && host !== "localhost") {
      throw new Error(
        "OAuth 2.0 redirect URL must point to http://127.0.0.1 or http://localhost so the authorization code can be captured",
      );
    }
    listenerHost = host;
    listenerPort = parsed.port ? parseInt(parsed.port, 10) : undefined;
    redirectUri = customRedirect;
  }

  const listener = await waitForRedirect(
    options.signal,
    undefined,
    listenerHost,
    listenerPort,
  );
  if (!customRedirect) {
    redirectUri = listener.url;
  }

  if (!options.openUrl) {
    throw new Error(
      "Cannot run the OAuth 2.0 authorization code flow: no browser opener available",
    );
  }
  const authUrl = buildAuthCodeUrl(config, redirectUri, pkce);
  options.log?.(`Opening browser for authorization: ${authUrl}`);
  options.openUrl(authUrl);

  const callback = await listener.callback;
  if (callback.error) {
    throw new Error(
      callback.errorDescription
        ? `Authorization failed: ${callback.errorDescription}`
        : `Authorization failed: ${callback.error}`,
    );
  }
  if (!callback.code) {
    throw new Error("Authorization redirect contained no authorization code");
  }

  const form: Record<string, string> = {
    grant_type: "authorization_code",
    code: callback.code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
  };
  if (config.clientSecret) form.client_secret = config.clientSecret;
  if (pkce) form.code_verifier = pkce.verifier;
  for (const [key, value] of Object.entries(config.extraParams || {})) {
    form[key] = value;
  }

  const { status, text } = await postForm(config.tokenUrl, form, options.signal);
  return parseTokenResponse(status, text);
}

/* ── Client-credentials & password grants ────────── */

export async function requestClientCredentialsToken(
  config: OAuth2Config,
  options: OAuth2Options = {},
): Promise<OAuth2Token> {
  const form: Record<string, string> = {
    grant_type: "client_credentials",
    client_id: config.clientId,
  };
  if (config.clientSecret) form.client_secret = config.clientSecret;
  if (config.scopes) form.scope = config.scopes;
  for (const [key, value] of Object.entries(config.extraParams || {})) {
    form[key] = value;
  }
  const { status, text } = await postForm(config.tokenUrl, form, options.signal);
  return parseTokenResponse(status, text);
}

export async function requestPasswordGrantToken(
  config: OAuth2Config,
  options: OAuth2Options = {},
): Promise<OAuth2Token> {
  if (!config.username || !config.password) {
    throw new Error(
      "OAuth 2.0 password grant requires a username and password",
    );
  }
  const form: Record<string, string> = {
    grant_type: "password",
    client_id: config.clientId,
    username: config.username,
    password: config.password,
  };
  if (config.clientSecret) form.client_secret = config.clientSecret;
  if (config.scopes) form.scope = config.scopes;
  for (const [key, value] of Object.entries(config.extraParams || {})) {
    form[key] = value;
  }
  const { status, text } = await postForm(config.tokenUrl, form, options.signal);
  return parseTokenResponse(status, text);
}

/* ── Refresh ─────────────────────────────────────── */

export function isTokenExpired(
  token: OAuth2Token,
  skewSeconds = DEFAULT_EXPIRY_SKEW_SECONDS,
): boolean {
  if (typeof token.expiresAt !== "number") return false;
  return Date.now() >= token.expiresAt - skewSeconds * 1000;
}

export async function refreshOAuth2Token(
  config: OAuth2Config,
  refreshToken: string,
  options: OAuth2Options = {},
): Promise<OAuth2Token> {
  const form: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
  };
  if (config.clientSecret) form.client_secret = config.clientSecret;
  for (const [key, value] of Object.entries(config.extraParams || {})) {
    form[key] = value;
  }
  const { status, text } = await postForm(config.tokenUrl, form, options.signal);
  return parseTokenResponse(status, text);
}

/* ── Orchestration ───────────────────────────────── */

export function oauth2CacheKey(config: OAuth2Config): string {
  return `${config.tokenUrl}|${config.clientId}|${config.scopes || ""}`;
}

export async function getOAuth2Token(
  config: OAuth2Config,
  options: OAuth2Options = {},
): Promise<OAuth2Result> {
  const cacheKey = options.cacheKey || oauth2CacheKey(config);

  if (options.cache) {
    const cached = options.cache.get(cacheKey);
    if (cached && !isTokenExpired(cached)) {
      options.log?.("Using cached OAuth token");
      return { token: cached, source: "cache" };
    }
    if (cached?.refreshToken) {
      try {
        options.log?.("Refreshing OAuth token");
        const refreshed = await refreshOAuth2Token(
          config,
          cached.refreshToken,
          options,
        );
        if (!refreshed.refreshToken) {
          refreshed.refreshToken = cached.refreshToken;
        }
        options.cache.set(cacheKey, refreshed);
        return { token: refreshed, source: "refresh" };
      } catch (err) {
        options.log?.(
          `Token refresh failed (${err instanceof Error ? err.message : String(err)}); starting a full flow`,
        );
      }
    }
  }

  options.log?.(`Running OAuth 2.0 ${config.grantType} flow`);
  let token: OAuth2Token;
  switch (config.grantType) {
    case "client_credentials":
      token = await requestClientCredentialsToken(config, options);
      break;
    case "password":
      token = await requestPasswordGrantToken(config, options);
      break;
    default:
      token = await runAuthorizationCodeFlow(config, options);
  }
  if (options.cache) options.cache.set(cacheKey, token);
  return { token, source: "flow" };
}
