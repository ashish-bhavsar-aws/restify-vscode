/**
 * Minimal RFC 6265-style cookie jar helpers.
 *
 * Persistence is owned by the storage layer; this module is pure logic so it
 * can be unit tested without any vscode/webview dependencies.
 */

export interface StoredCookie {
  name: string;
  value: string;
  /** Effective domain this cookie applies to (host-only or Domain attribute). */
  domain: string;
  /** Whether the cookie is host-only (no Domain attribute → exact host only). */
  hostOnly: boolean;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  /** Expiration epoch ms; undefined = session cookie (kept until cleared). */
  expires?: number;
  /** True when the server signalled deletion (e.g. Max-Age=0). */
  deleted?: boolean;
}

export type CookieMap = Record<string, string | string[]>;

function defaultPathFor(pathname: string): string {
  if (!pathname || !pathname.startsWith("/")) return "/";
  const idx = pathname.lastIndexOf("/");
  if (idx <= 0) return "/";
  return pathname.slice(0, idx);
}

/**
 * Parse a single `Set-Cookie` header line, defaulting Domain/Path/Secure/etc.
 * to the request host when the attributes are absent. Returns null for
 * unparseable input. Cookies the server wants deleted (Max-Age=0 / past
 * Expires) are returned with `deleted: true` so callers can prune the jar.
 */
export function parseSetCookie(
  header: string,
  defaultHostname: string,
  defaultPath = "/",
): StoredCookie | null {
  const parts = header.split(";").map((p) => p.trim());
  const first = parts.shift();
  if (!first) return null;
  const eq = first.indexOf("=");
  if (eq <= 0) return null;

  const name = first.slice(0, eq).trim();
  const value = first.slice(eq + 1).trim();
  if (!name) return null;

  const attrs: Record<string, string> = {};
  for (const part of parts) {
    const idx = part.indexOf("=");
    const key = (idx >= 0 ? part.slice(0, idx) : part).trim().toLowerCase();
    const val = idx >= 0 ? part.slice(idx + 1).trim() : "";
    if (key) attrs[key] = val;
  }

  let domain = defaultHostname.toLowerCase();
  let hostOnly = true;
  if (attrs.domain) {
    const raw = attrs.domain.toLowerCase().replace(/^\.+/, "");
    if (raw && defaultHostname.toLowerCase().endsWith(raw)) {
      domain = raw;
      hostOnly = false;
    }
  }

  const path =
    attrs.path && attrs.path.startsWith("/") ? attrs.path : defaultPath || "/";
  const secure = "secure" in attrs;
  const httpOnly = "httponly" in attrs;
  const sameSiteRaw = (attrs.samesite || "").toLowerCase();
  const sameSite =
    sameSiteRaw === "strict" || sameSiteRaw === "lax" || sameSiteRaw === "none"
      ? (sameSiteRaw[0].toUpperCase() + sameSiteRaw.slice(1) as
          | "Strict"
          | "Lax"
          | "None")
      : undefined;

  const maxAge = attrs["max-age"] !== undefined ? attrs["max-age"] : undefined;
  let expires: number | undefined;
  if (maxAge !== undefined) {
    if (/^-?\d+$/.test(maxAge.trim())) {
      expires = Date.now() + parseInt(maxAge.trim(), 10) * 1000;
    }
  } else if (attrs.expires) {
    const ms = Date.parse(attrs.expires);
    if (!Number.isNaN(ms)) expires = ms;
  }
  const deleted = expires !== undefined && expires <= Date.now();

  return {
    name,
    value,
    domain,
    hostOnly,
    path,
    secure,
    httpOnly,
    sameSite,
    expires,
    deleted,
  };
}

/**
 * Parse all `Set-Cookie` headers from a response header record for the given
 * request URL. Handles the header being either a single string or an array
 * (Node merges duplicate Set-Cookie into an array).
 */
export function parseSetCookies(
  headers: CookieMap,
  url: string,
): StoredCookie[] {
  let hostname = "";
  let pathname = "/";
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname.toLowerCase();
    pathname = parsed.pathname || "/";
  } catch {
    /* keep defaults */
  }
  const raw = headers["set-cookie"] ?? headers["Set-Cookie"];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const cookies: StoredCookie[] = [];
  for (const value of values) {
    const cookie = parseSetCookie(value, hostname, defaultPathFor(pathname));
    if (cookie) cookies.push(cookie);
  }
  return cookies;
}

/** RFC 6265 §5.1.4 domain-match. */
export function cookieMatchesHost(
  cookie: StoredCookie,
  hostname: string,
): boolean {
  const host = hostname.toLowerCase();
  const domain = cookie.domain.toLowerCase();
  if (cookie.hostOnly) return host === domain;
  return host === domain || host.endsWith(`.${domain}`);
}

/** RFC 6265 §5.1.4 path-match. */
export function cookieMatchesPath(
  cookie: StoredCookie,
  pathname: string,
): boolean {
  const path = pathname || "/";
  if (cookie.path === "/") return true;
  if (!path.startsWith(cookie.path)) return false;
  if (path === cookie.path) return true;
  return cookie.path.endsWith("/") || path[cookie.path.length] === "/";
}

export function isCookieExpired(
  cookie: StoredCookie,
  now: number = Date.now(),
): boolean {
  return (
    cookie.deleted === true ||
    (cookie.expires !== undefined && cookie.expires <= now)
  );
}

/** Match all unexpired, secure-aware cookies for a URL, serialized for the Cookie header. */
export function getCookieHeader(
  cookies: StoredCookie[],
  url: string,
  now: number = Date.now(),
): string {
  let hostname: string;
  let pathname: string;
  let secure: boolean;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    pathname = parsed.pathname || "/";
    secure = parsed.protocol === "https:";
  } catch {
    return "";
  }

  const pairs: string[] = [];
  for (const cookie of cookies) {
    if (cookie.secure && !secure) continue;
    if (isCookieExpired(cookie, now)) continue;
    if (!cookieMatchesHost(cookie, hostname)) continue;
    if (!cookieMatchesPath(cookie, pathname)) continue;
    pairs.push(`${cookie.name}=${cookie.value}`);
  }
  return pairs.join("; ");
}

/**
 * Merge parsed cookies into a jar, replacing any cookie sharing the same
 * name/domain/path. Newer entries win. Expired cookies (Max-Age=0 or past
 * Expires) remove the matching stored cookie instead of being stored.
 */
export function storeCookies(
  jar: StoredCookie[],
  incoming: StoredCookie[],
  now: number = Date.now(),
): StoredCookie[] {
  let result = [...jar];
  for (const cookie of incoming) {
    result = result.filter(
      (c) =>
        !(
          c.name === cookie.name &&
          c.domain === cookie.domain &&
          c.path === cookie.path
        ),
    );
    if (isCookieExpired(cookie, now)) continue;
    result.push(cookie);
  }
  return result;
}
