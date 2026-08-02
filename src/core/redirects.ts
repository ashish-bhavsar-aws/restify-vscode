import { URL } from "url";
import { REDIRECT_STATUS_CODES } from "./constants";

export function isRedirectStatus(status: number): boolean {
  return (REDIRECT_STATUS_CODES as readonly number[]).includes(status);
}

/**
 * Determine the HTTP method for the redirected request.
 * - 303 See Other always becomes GET.
 * - 301/302 with POST become GET (matching curl/fetch semantics).
 * - 307/308 preserve the method.
 */
export function getRedirectMethod(method: string, status: number): string {
  const current = (method || "GET").toUpperCase();
  if (status === 303) return "GET";
  if ((status === 301 || status === 302) && current === "POST") return "GET";
  return current;
}

/** Whether the redirected request should keep a request body. */
export function shouldSendBodyOnRedirect(method: string, status: number): boolean {
  const next = getRedirectMethod(method, status);
  return next !== "GET" && next !== "HEAD";
}

/**
 * Strip the Authorization header when a redirect crosses to a different origin
 * (host, port, or protocol), preventing credential leakage to a third party.
 */
export function shouldStripAuthorization(
  originalUrl: string,
  redirectUrl: string,
): boolean {
  try {
    const from = new URL(originalUrl);
    const to = new URL(redirectUrl);
    if (from.protocol !== to.protocol) return true;
    if (from.hostname !== to.hostname) return true;
    const fromPort = from.port || (from.protocol === "https:" ? "443" : "80");
    const toPort = to.port || (to.protocol === "https:" ? "443" : "80");
    return fromPort !== toPort;
  } catch {
    return true;
  }
}

/**
 * Resolve a possibly-relative Location header against the current URL.
 * Returns null when the location is missing or unparseable.
 */
export function resolveRedirectUrl(
  baseUrl: string,
  location: string | undefined | null,
): string | null {
  if (!location || !location.trim()) return null;
  try {
    return new URL(location.trim(), baseUrl).toString();
  } catch {
    return null;
  }
}
