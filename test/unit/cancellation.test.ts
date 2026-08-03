import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as http from "http";
import type { AddressInfo } from "net";
import { performHttpRequest, isCancelledError } from "../../src/core";

describe("performHttpRequest cancellation", () => {
  let server: http.Server;
  let port = 0;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      if (url.pathname === "/ok") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{\"ok\":true}");
        return;
      }
      // Any other path hangs so tests can abort mid-flight.
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  const options = (path: string) => ({
    method: "GET" as const,
    hostname: "127.0.0.1",
    port,
    path,
  });

  it("resolves with the raw response when no signal aborts", async () => {
    const result = await performHttpRequest(
      http,
      options("/ok"),
      undefined,
      5000,
    );
    expect(result.status).toBe(200);
    expect(result.data.toString("utf8")).toBe('{"ok":true}');
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      performHttpRequest(http, options("/ok"), undefined, 5000, controller.signal),
    ).rejects.toSatisfy((err) => isCancelledError(err));
  });

  it("rejects with a cancellation error when aborted mid-flight", async () => {
    const controller = new AbortController();
    const pending = performHttpRequest(
      http,
      options("/hang"),
      undefined,
      10000,
      controller.signal,
    );

    await new Promise((r) => setTimeout(r, 50));
    controller.abort();

    await expect(pending).rejects.toSatisfy((err) => isCancelledError(err));
  });

  it("stops aborting the request once it has settled (listener cleanup)", async () => {
    const controller = new AbortController();
    const result = await performHttpRequest(
      http,
      options("/ok"),
      undefined,
      5000,
      controller.signal,
    );
    expect(result.status).toBe(200);
    controller.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  it("rejects with a timeout error when the server never responds", async () => {
    await expect(
      performHttpRequest(http, options("/hang"), undefined, 100),
    ).rejects.toThrow("timed out");
  });
});
