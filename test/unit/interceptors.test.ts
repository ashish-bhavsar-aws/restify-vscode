import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as http from "http";
import type { AddressInfo } from "net";
import {
  buildRequestInterceptors,
  retryInterceptor,
  loggingInterceptor,
  runInterceptorPipeline,
  DEFAULT_INTERCEPTORS,
  type InterceptorRequest,
  type InterceptorResponse,
  type RequestInterceptor,
} from "../../src/core/interceptors";

const okResponse = (status = 200, data = Buffer.from("ok")): InterceptorResponse => ({
  status,
  statusText: status === 200 ? "OK" : "Error",
  headers: { "content-type": "text/plain" },
  data,
  timings: {} as any,
});

const makeRequest = (overrides: Partial<InterceptorRequest> = {}): InterceptorRequest => ({
  url: "https://example.com/api",
  method: "GET",
  headers: {},
  ...overrides,
});

describe("retryInterceptor", () => {
  const retry = retryInterceptor({
    maxAttempts: 3,
    retryDelayMs: 0,
    retryStatuses: [500, 502, 503],
    retryOnNetworkError: true,
  });

  it("retries a network error until maxAttempts", () => {
    expect(retry.shouldRetry?.(1, new Error("ECONNREFUSED"))).toEqual({ retry: true, delayMs: 0 });
    expect(retry.shouldRetry?.(2, new Error("ECONNREFUSED"))).toEqual({ retry: true, delayMs: 0 });
    expect(retry.shouldRetry?.(3, new Error("ECONNREFUSED"))).toEqual({ retry: false });
  });

  it("retries configured status codes", () => {
    expect(retry.shouldRetry?.(1, undefined, okResponse(500))).toEqual({ retry: true, delayMs: 0 });
    expect(retry.shouldRetry?.(1, undefined, okResponse(503))).toEqual({ retry: true, delayMs: 0 });
    expect(retry.shouldRetry?.(1, undefined, okResponse(200))).toEqual({ retry: false });
    expect(retry.shouldRetry?.(1, undefined, okResponse(404))).toEqual({ retry: false });
  });

  it("does not retry network errors when disabled", () => {
    const r = retryInterceptor({
      maxAttempts: 3,
      retryDelayMs: 0,
      retryStatuses: [500],
      retryOnNetworkError: false,
    });
    expect(r.shouldRetry?.(1, new Error("boom"))).toEqual({ retry: false });
  });

  it("returns retry:false on success", () => {
    expect(retry.shouldRetry?.(1, undefined, okResponse(200))).toEqual({ retry: false });
  });
});

describe("runInterceptorPipeline", () => {
  it("performs once when no interceptors request a retry", async () => {
    const perform = vi.fn().mockResolvedValue(okResponse(200));
    const res = await runInterceptorPipeline({
      request: makeRequest(),
      interceptors: [],
      perform,
    });
    expect(res.status).toBe(200);
    expect(perform).toHaveBeenCalledTimes(1);
  });

  it("retries on a network error and resolves on the second attempt", async () => {
    const perform = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValue(okResponse(200));
    const res = await runInterceptorPipeline({
      request: makeRequest(),
      interceptors: [retryInterceptor({ maxAttempts: 3, retryDelayMs: 0, retryStatuses: [500], retryOnNetworkError: true })],
      perform,
    });
    expect(res.status).toBe(200);
    expect(perform).toHaveBeenCalledTimes(2);
  });

  it("retries status-based failures", async () => {
    const perform = vi
      .fn()
      .mockResolvedValueOnce(okResponse(503))
      .mockResolvedValueOnce(okResponse(200));
    const res = await runInterceptorPipeline({
      request: makeRequest(),
      interceptors: [retryInterceptor({ maxAttempts: 3, retryDelayMs: 0, retryStatuses: [500, 503], retryOnNetworkError: false })],
      perform,
    });
    expect(res.status).toBe(200);
    expect(perform).toHaveBeenCalledTimes(2);
  });

  it("gives up after maxAttempts and surfaces the last error", async () => {
    const perform = vi.fn().mockRejectedValue(new Error("timeout"));
    const retry = retryInterceptor({ maxAttempts: 2, retryDelayMs: 0, retryStatuses: [500], retryOnNetworkError: true });
    await expect(
      runInterceptorPipeline({
        request: makeRequest(),
        interceptors: [retry],
        maxAttempts: 2,
        perform,
      }),
    ).rejects.toThrow("timeout");
    expect(perform).toHaveBeenCalledTimes(2);
  });

  it("honors a vetoed retry (interceptor returns retry:false)", async () => {
    const perform = vi.fn().mockRejectedValue(new Error("nope"));
    const veto: RequestInterceptor = {
      id: "veto",
      name: "Veto",
      shouldRetry: () => ({ retry: false }),
    };
    await expect(
      runInterceptorPipeline({
        request: makeRequest(),
        interceptors: [veto, retryInterceptor({ maxAttempts: 5, retryDelayMs: 0, retryStatuses: [], retryOnNetworkError: true })],
        perform,
      }),
    ).rejects.toThrow("nope");
    expect(perform).toHaveBeenCalledTimes(1);
  });

  it("aborts the retry loop when the signal fires during the delay", async () => {
    const controller = new AbortController();
    const perform = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const retry = retryInterceptor({ maxAttempts: 5, retryDelayMs: 50, retryStatuses: [], retryOnNetworkError: true });
    const promise = runInterceptorPipeline({
      request: makeRequest(),
      interceptors: [retry],
      signal: controller.signal,
      perform,
    });
    setTimeout(() => controller.abort(new Error("cancelled")), 5);
    await expect(promise).rejects.toThrow("cancelled");
  });

  it("runs beforeRequest hooks with the attempt number and lets them mutate the request", async () => {
    const hook = vi.fn();
    const mutator: RequestInterceptor = {
      id: "mut",
      name: "Mutator",
      beforeRequest(req, attempt) {
        req.headers["x-attempt"] = String(attempt);
        hook(attempt);
      },
    };
    const perform = vi.fn().mockResolvedValue(okResponse(200));
    await runInterceptorPipeline({
      request: makeRequest(),
      interceptors: [mutator],
      perform: (req) => {
        expect(req.headers["x-attempt"]).toBe("1");
        return perform(req);
      },
    });
    expect(hook).toHaveBeenCalledWith(1);
  });
});

describe("loggingInterceptor", () => {
  it("logs the request line and the response line", async () => {
    const lines: string[] = [];
    const log = loggingInterceptor((l) => lines.push(l), { logHeaders: false });
    const res = await runInterceptorPipeline({
      request: makeRequest({ method: "POST", url: "https://example.com/echo" }),
      interceptors: [log],
      perform: async () => okResponse(201, Buffer.from("created")),
    });
    expect(res.status).toBe(201);
    expect(lines).toEqual(["-> POST https://example.com/echo", "<- 201 Error (7 bytes)"]);
  });

  it("includes headers when logHeaders is enabled", async () => {
    const lines: string[] = [];
    const log = loggingInterceptor((l) => lines.push(l), { logHeaders: true });
    await log.beforeRequest?.(
      { url: "https://example.com/", method: "GET", headers: { accept: "application/json" } },
      1,
    );
    expect(lines[0]).toContain("accept: application/json");
  });

  it("annotates retry attempts with the attempt number", () => {
    const lines: string[] = [];
    const log = loggingInterceptor((l) => lines.push(l), { logHeaders: false });
    log.beforeRequest?.({ url: "https://example.com/", method: "GET", headers: {} }, 2);
    expect(lines[0]).toBe("[attempt 2] -> GET https://example.com/");
  });
});

describe("buildRequestInterceptors", () => {
  it("returns an empty list when interceptors are disabled", () => {
    expect(buildRequestInterceptors({ interceptors: DEFAULT_INTERCEPTORS })).toEqual([]);
  });

  it("builds a retry interceptor when enabled", () => {
    const list = buildRequestInterceptors({
      interceptors: { retry: { enabled: true, maxAttempts: 4, retryDelayMs: 100, retryStatuses: [429], retryOnNetworkError: true } },
    });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("retry");
    const d = list[0].shouldRetry?.(1, undefined, okResponse(429));
    expect(d).toEqual({ retry: true, delayMs: 100 });
  });

  it("builds a logging interceptor only when a log sink is provided", () => {
    const noSink = buildRequestInterceptors({
      interceptors: { logging: { enabled: true, logHeaders: false } },
    });
    expect(noSink).toHaveLength(0);

    const withSink = buildRequestInterceptors(
      { interceptors: { logging: { enabled: true, logHeaders: false } } },
      { log: () => undefined },
    );
    expect(withSink).toHaveLength(1);
    expect(withSink[0].id).toBe("logging");
  });
});

describe("retry over the wire", () => {
  let server: http.Server;
  let port = 0;
  let attempts = 0;

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      attempts++;
      if (attempts < 3) {
        res.writeHead(503, { "content-type": "text/plain" });
        res.end("unavailable");
        return;
      }
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("recovered");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("recovers from transient 503s with the retry interceptor", async () => {
    attempts = 0;
    const url = `http://127.0.0.1:${port}/`;
    const seen: number[] = [];
    const res = await runInterceptorPipeline({
      request: { url, method: "GET", headers: {} },
      interceptors: [retryInterceptor({ maxAttempts: 5, retryDelayMs: 5, retryStatuses: [503], retryOnNetworkError: true })],
      perform: async (req) => {
        const parsed = new URL(req.url);
        const raw = await new Promise<InterceptorResponse>((resolve, reject) => {
          http
            .get({ hostname: parsed.hostname, port: parsed.port, path: parsed.pathname }, (r) => {
              const chunks: Buffer[] = [];
              r.on("data", (c) => chunks.push(Buffer.from(c)));
              r.on("end", () =>
                resolve({
                  status: r.statusCode ?? 0,
                  statusText: r.statusMessage ?? "",
                  headers: r.headers,
                  data: Buffer.concat(chunks),
                  timings: {} as any,
                }),
              );
            })
            .on("error", reject);
        });
        seen.push(raw.status);
        return raw;
      },
    });
    expect(res.status).toBe(200);
    expect(res.data.toString("utf8")).toBe("recovered");
    expect(seen).toEqual([503, 503, 200]);
  });
});
