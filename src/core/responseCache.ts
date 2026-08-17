/**
 * F29 — response cache / offline replay.
 *
 * Pure, host-agnostic module (no `vscode` imports — see GUARDRAILS.md §3).
 * The cache stores a snapshot of a successful `RequestResult` keyed by a
 * canonical request signature (method + URL + sorted headers + body), so a
 * repeated request can be served without a network round-trip, or replayed
 * from cache when the network fails.
 */
import { createHash } from "crypto";
import type { RequestResult } from "./responseResult";
import { emptyTimings } from "./timings";

/** Upper bound on stored entries (LRU-style, oldest evicted first). */
export const MAX_CACHE_ENTRIES = 50;

/** Responses with a larger body are not cached (keeps globalState lean). */
export const MAX_CACHE_BODY_LENGTH = 500_000;

export interface CachedResponse {
  key: string;
  method: string;
  url: string;
  createdAt: number;
  status: number;
  statusText: string;
  /** Normalized response headers (name → value). */
  headers: Record<string, string | string[]>;
  body: string;
  bodySize: number;
  /** Whether the original response was served from cache already. */
  servedFromCache?: boolean;
}

export interface ResponseCacheConfig {
  enabled: boolean;
  ttlSeconds: number;
  replayOnNetworkError: boolean;
}

export const DEFAULT_RESPONSE_CACHE: ResponseCacheConfig = {
  enabled: false,
  ttlSeconds: 300,
  replayOnNetworkError: true,
};

/**
 * Canonical key for a request: METHOD, final URL, sorted (lowercased) headers,
 * and the body. Including auth/cookie headers means different credentials
 * produce different cache entries (no cross-session leakage).
 */
export function cacheKeyFor(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string | Buffer | null,
): string {
  const headerLines = Object.keys(headers)
    .map((k) => `${k.toLowerCase()}: ${headers[k]}`)
    .sort()
    .join("\n");
  const bodyText =
    body === undefined || body === null
      ? ""
      : Buffer.isBuffer(body)
        ? body.toString("base64")
        : body;
  return createHash("sha256")
    .update([method.toUpperCase(), url, headerLines, bodyText].join("\u0000"))
    .digest("hex");
}

/** True when the entry is younger than `ttlMs`. */
export function isCacheFresh(
  entry: CachedResponse,
  ttlMs: number,
  now: number = Date.now(),
): boolean {
  return now - entry.createdAt < ttlMs;
}

/** A response is worth caching: success-class status, text, bounded size. */
export function isCacheableResult(result: RequestResult): boolean {
  if (result.status < 200 || result.status >= 400) return false;
  if (result.isFileResponse) return false;
  if (typeof result.body !== "string" || result.body.length > MAX_CACHE_BODY_LENGTH) {
    return false;
  }
  return true;
}

/** Snapshot a successful result into a cache entry. */
export function cacheEntryFromResult(
  key: string,
  method: string,
  url: string,
  result: RequestResult,
  now: number = Date.now(),
): CachedResponse {
  return {
    key,
    method,
    url,
    createdAt: now,
    status: result.status,
    statusText: result.statusText,
    headers: result.headers,
    body: result.body,
    bodySize: result.bodySize,
  };
}

/** Rehydrate a viewer-ready result from a cache entry (timings cleared). */
export function requestResultFromCache(entry: CachedResponse): RequestResult {
  return {
    status: entry.status,
    statusText: entry.statusText,
    headers: entry.headers,
    body: entry.body,
    bodySize: entry.bodySize,
    isFileResponse: false,
    timings: emptyTimings(),
  };
}

/** Drop expired entries, newest-first, capped at `maxEntries`. */
export function pruneCache(
  entries: CachedResponse[],
  ttlMs: number,
  now: number = Date.now(),
  maxEntries: number = MAX_CACHE_ENTRIES,
): CachedResponse[] {
  return entries
    .filter((e) => isCacheFresh(e, ttlMs, now))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, maxEntries);
}
