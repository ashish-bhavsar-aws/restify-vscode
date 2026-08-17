import { describe, it, expect } from "vitest";
import {
  cacheEntryFromResult,
  cacheKeyFor,
  DEFAULT_RESPONSE_CACHE,
  isCacheFresh,
  isCacheableResult,
  MAX_CACHE_BODY_LENGTH,
  MAX_CACHE_ENTRIES,
  pruneCache,
  requestResultFromCache,
} from "../../src/core/responseCache";
import type { RequestResult } from "../../src/core/responseResult";

const mockResult: RequestResult = {
  status: 200,
  statusText: "OK",
  headers: { "content-type": "application/json" },
  body: '{"ok":true}',
  bodySize: 11,
  isFileResponse: false,
};

describe("responseCache (F29)", () => {
  describe("cacheKeyFor", () => {
    it("produces a sha256 hex string", () => {
      const key = cacheKeyFor("GET", "https://example.com/api", {});
      expect(key).toMatch(/^[a-f0-9]{64}$/);
    });

    it("same inputs produce same key", () => {
      const a = cacheKeyFor("GET", "https://example.com/api", { Accept: "application/json" });
      const b = cacheKeyFor("GET", "https://example.com/api", { Accept: "application/json" });
      expect(a).toBe(b);
    });

    it("different method produces different key", () => {
      const a = cacheKeyFor("GET", "https://example.com/api", {});
      const b = cacheKeyFor("POST", "https://example.com/api", {});
      expect(a).not.toBe(b);
    });

    it("different url produces different key", () => {
      const a = cacheKeyFor("GET", "https://example.com/a", {});
      const b = cacheKeyFor("GET", "https://example.com/b", {});
      expect(a).not.toBe(b);
    });

    it("different headers produce different key", () => {
      const a = cacheKeyFor("GET", "https://example.com/api", { Accept: "text/html" });
      const b = cacheKeyFor("GET", "https://example.com/api", { Accept: "application/json" });
      expect(a).not.toBe(b);
    });

    it("header order does not affect key", () => {
      const a = cacheKeyFor("GET", "https://example.com/api", { A: "1", B: "2" });
      const b = cacheKeyFor("GET", "https://example.com/api", { B: "2", A: "1" });
      expect(a).toBe(b);
    });

    it("header case is normalized", () => {
      const a = cacheKeyFor("GET", "https://example.com/api", { "Content-Type": "text/plain" });
      const b = cacheKeyFor("GET", "https://example.com/api", { "content-type": "text/plain" });
      expect(a).toBe(b);
    });

    it("different body produces different key", () => {
      const a = cacheKeyFor("POST", "https://example.com/api", {}, "foo");
      const b = cacheKeyFor("POST", "https://example.com/api", {}, "bar");
      expect(a).not.toBe(b);
    });

    it("buffer body is base64-encoded in key", () => {
      const strKey = cacheKeyFor("POST", "https://example.com/api", {}, "hello");
      const bufKey = cacheKeyFor("POST", "https://example.com/api", {}, Buffer.from("hello"));
      expect(strKey).not.toBe(bufKey);
    });

    it("null/undefined body is treated as empty", () => {
      const a = cacheKeyFor("GET", "https://example.com/api", {});
      const b = cacheKeyFor("GET", "https://example.com/api", {}, null);
      const c = cacheKeyFor("GET", "https://example.com/api", {}, undefined);
      expect(a).toBe(b);
      expect(a).toBe(c);
    });
  });

  describe("isCacheFresh", () => {
    const entry = { createdAt: 1000 } as any;

    it("returns true when within TTL", () => {
      expect(isCacheFresh(entry, 5000, 2000)).toBe(true);
    });

    it("returns false when TTL exceeded", () => {
      expect(isCacheFresh(entry, 5000, 7000)).toBe(false);
    });

    it("returns false exactly at boundary", () => {
      expect(isCacheFresh(entry, 5000, 6000)).toBe(false);
    });
  });

  describe("isCacheableResult", () => {
    it("caches 200 OK", () => {
      expect(isCacheableResult(mockResult)).toBe(true);
    });

    it("caches 201 Created", () => {
      expect(isCacheableResult({ ...mockResult, status: 201 })).toBe(true);
    });

    it("caches 304 Not Modified", () => {
      expect(isCacheableResult({ ...mockResult, status: 304 })).toBe(true);
    });

    it("rejects 400", () => {
      expect(isCacheableResult({ ...mockResult, status: 400 })).toBe(false);
    });

    it("rejects 500", () => {
      expect(isCacheableResult({ ...mockResult, status: 500 })).toBe(false);
    });

    it("rejects 1xx", () => {
      expect(isCacheableResult({ ...mockResult, status: 100 })).toBe(false);
    });

    it("rejects file responses", () => {
      expect(isCacheableResult({ ...mockResult, isFileResponse: true })).toBe(false);
    });

    it("accepts empty body (cacheable)", () => {
      expect(isCacheableResult({ ...mockResult, body: "" })).toBe(true);
    });

    it("rejects body exceeding max size", () => {
      expect(
        isCacheableResult({ ...mockResult, body: "x".repeat(MAX_CACHE_BODY_LENGTH + 1) }),
      ).toBe(false);
    });

    it("accepts body at max size", () => {
      expect(
        isCacheableResult({ ...mockResult, body: "x".repeat(MAX_CACHE_BODY_LENGTH) }),
      ).toBe(true);
    });
  });

  describe("cacheEntryFromResult", () => {
    it("creates entry with correct fields", () => {
      const entry = cacheEntryFromResult("key1", "GET", "https://example.com", mockResult, 1234);
      expect(entry.key).toBe("key1");
      expect(entry.method).toBe("GET");
      expect(entry.url).toBe("https://example.com");
      expect(entry.createdAt).toBe(1234);
      expect(entry.status).toBe(200);
      expect(entry.statusText).toBe("OK");
      expect(entry.headers).toEqual(mockResult.headers);
      expect(entry.body).toBe('{"ok":true}');
      expect(entry.bodySize).toBe(11);
    });
  });

  describe("requestResultFromCache", () => {
    it("rehydrates result from cache entry", () => {
      const entry = cacheEntryFromResult("k", "GET", "https://x.com", mockResult, 100);
      const result = requestResultFromCache(entry);
      expect(result.status).toBe(200);
      expect(result.statusText).toBe("OK");
      expect(result.body).toBe('{"ok":true}');
      expect(result.isFileResponse).toBe(false);
      expect(result.timings).toBeDefined();
    });
  });

  describe("pruneCache", () => {
    const makeEntry = (createdAt: number) =>
      ({ key: `k${createdAt}`, createdAt }) as any;

    it("removes expired entries", () => {
      const entries = [makeEntry(1000), makeEntry(2000), makeEntry(3000)];
      const pruned = pruneCache(entries, 1500, 4000);
      expect(pruned).toHaveLength(1);
      expect(pruned[0].createdAt).toBe(3000);
    });

    it("caps at maxEntries", () => {
      const entries = Array.from({ length: 60 }, (_, i) => makeEntry(i * 100));
      const pruned = pruneCache(entries, Infinity, 0, MAX_CACHE_ENTRIES);
      expect(pruned.length).toBeLessThanOrEqual(MAX_CACHE_ENTRIES);
    });

    it("returns newest first", () => {
      const entries = [makeEntry(1000), makeEntry(3000), makeEntry(2000)];
      const pruned = pruneCache(entries, Infinity, 5000);
      expect(pruned[0].createdAt).toBe(3000);
      expect(pruned[1].createdAt).toBe(2000);
      expect(pruned[2].createdAt).toBe(1000);
    });

    it("empty input returns empty", () => {
      expect(pruneCache([], 5000, 6000)).toEqual([]);
    });
  });

  describe("DEFAULT_RESPONSE_CACHE", () => {
    it("disabled by default", () => {
      expect(DEFAULT_RESPONSE_CACHE.enabled).toBe(false);
    });

    it("5-minute TTL", () => {
      expect(DEFAULT_RESPONSE_CACHE.ttlSeconds).toBe(300);
    });

    it("replay on network error enabled by default", () => {
      expect(DEFAULT_RESPONSE_CACHE.replayOnNetworkError).toBe(true);
    });
  });
});
