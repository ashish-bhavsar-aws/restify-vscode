import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as http from "http";
import * as http2 from "http2";
import type { AddressInfo } from "net";
import { performRequest } from "../../src/core";

describe("performRequest (direct HTTP/1.1)", () => {
  let server: http.Server;
  let port = 0;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c: Buffer) => (body += c.toString()));
      req.on("end", () => {
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            url: req.url,
            method: req.method,
            body,
            custom: req.headers["x-test"] ?? "",
          }),
        );
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("round-trips and reports doRequest stages", async () => {
    const stages: string[] = [];
    const result = await performRequest({
      url: `http://127.0.0.1:${port}/hi?q=1`,
      method: "POST",
      headers: { "content-type": "text/plain", "x-test": "42" },
      body: "hello",
      rejectUnauthorized: true,
      timeoutMs: 5000,
      onStage: (stage) => stages.push(stage),
    });
    expect(result.status).toBe(200);
    const parsed = JSON.parse(result.data.toString("utf8"));
    expect(parsed.method).toBe("POST");
    expect(parsed.url).toBe("/hi?q=1");
    expect(parsed.body).toBe("hello");
    expect(parsed.custom).toBe("42");
    expect(stages[0]).toBe("doRequest-start");
    expect(stages).toContain("doRequest-end");
  });

  it("aborts with a cancelled error", async () => {
    const controller = new AbortController();
    const promise = performRequest({
      url: `http://127.0.0.1:${port}/hi`,
      method: "GET",
      headers: {},
      rejectUnauthorized: true,
      timeoutMs: 5000,
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toThrow("Request cancelled");
  });

  it("rejects on connection refused", async () => {
    await expect(
      performRequest({
        url: "http://127.0.0.1:1/nope",
        method: "GET",
        headers: {},
        rejectUnauthorized: true,
        timeoutMs: 2000,
      }),
    ).rejects.toThrow();
  });
});

describe("performRequest (HTTP/2)", () => {
  let server: http2.Http2Server;
  let port = 0;

  beforeAll(async () => {
    server = http2.createServer();
    server.on("stream", (stream, headers) => {
      stream.respond({ ":status": 200 });
      stream.end(`h2:${String(headers[":path"] ?? "")}`);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("uses the HTTP/2 transport when the toggle is on", async () => {
    const result = await performRequest({
      url: `http://127.0.0.1:${port}/x`,
      method: "GET",
      headers: {},
      rejectUnauthorized: true,
      timeoutMs: 5000,
      useHttp2: true,
    });
    expect(result.status).toBe(200);
    expect(result.data.toString("utf8")).toBe("h2:/x");
  });
});

describe("performRequest (proxy)", () => {
  let proxy: http.Server;
  let proxyPort = 0;
  const seen: Array<{ target: string; auth: string | undefined }> = [];
  const tunneled: string[] = [];

  beforeAll(async () => {
    proxy = http.createServer();
    // HttpsProxyAgent tunnels everything via CONNECT, even plain-HTTP targets.
    proxy.on("connect", (req, socket) => {
      seen.push({
        target: req.url ?? "",
        auth: req.headers["proxy-authorization"] as string | undefined,
      });
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      let buf = "";
      socket.on("data", (chunk: Buffer) => {
        buf += chunk.toString();
        if (buf.includes("\r\n\r\n")) {
          tunneled.push(buf.split("\r\n")[0]);
          socket.write(
            "HTTP/1.1 200 OK\r\nContent-Length: 7\r\nConnection: close\r\n\r\nproxied",
          );
          socket.end();
        }
      });
    });
    await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", () => r()));
    proxyPort = (proxy.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => proxy.close(() => r()));
  });

  it("tunnels through the proxy agent and forwards Proxy-Authorization", async () => {
    const result = await performRequest({
      url: "http://target.test/data",
      method: "GET",
      headers: {},
      rejectUnauthorized: true,
      timeoutMs: 5000,
      proxy: { proxy: `http://127.0.0.1:${proxyPort}`, auth: "user:pass" },
    });
    expect(result.status).toBe(200);
    expect(result.data.toString("utf8")).toBe("proxied");
    expect(seen[seen.length - 1].target).toBe("target.test:80");
    expect(seen[seen.length - 1].auth).toBe(
      `Basic ${Buffer.from("user:pass").toString("base64")}`,
    );
    expect(tunneled[tunneled.length - 1]).toBe("GET /data HTTP/1.1");
  });

  it("falls back to HTTP/1.1 when useHttp2 is combined with a proxy", async () => {
    const result = await performRequest({
      url: "http://target.test/data2",
      method: "GET",
      headers: {},
      rejectUnauthorized: true,
      timeoutMs: 5000,
      useHttp2: true,
      proxy: { proxy: `http://127.0.0.1:${proxyPort}` },
    });
    expect(result.data.toString("utf8")).toBe("proxied");
    expect(tunneled[tunneled.length - 1]).toBe("GET /data2 HTTP/1.1");
  });

  it("wraps invalid proxy URLs", async () => {
    await expect(
      performRequest({
        url: "http://example.com/",
        method: "GET",
        headers: {},
        rejectUnauthorized: true,
        timeoutMs: 5000,
        proxy: { proxy: "://broken" },
      }),
    ).rejects.toThrow(/Invalid Proxy URL configuration/);
  });
});
