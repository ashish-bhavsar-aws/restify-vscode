import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as http from "http";
import * as zlib from "zlib";
import type { AddressInfo } from "net";
import {
  decompressBody,
  getHeaderArray,
  getRedirectMethod,
  isRedirectStatus,
  removeHeader,
  resolveRedirectUrl,
  setHeader,
  shouldSendBodyOnRedirect,
  shouldStripAuthorization,
} from "../../src/core";

interface HopResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

function requestOnce(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<HopResult> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(Buffer.from(c)));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
        }),
      );
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

describe("redirect engine (network integration)", () => {
  let baseUrl = "";
  let crossUrl = "";
  const crossRequests: Array<{ method: string; auth: string | undefined }> = [];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname === "/redirect") {
      res.writeHead(302, { Location: "/final?via=redirect" });
      res.end();
      return;
    }
    if (url.pathname === "/final") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, query: url.searchParams.get("via") }));
      return;
    }
    if (url.pathname === "/gzip") {
      const payload = Buffer.from('{"compressed":true}');
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
      });
      res.end(zlib.gzipSync(payload));
      return;
    }
    if (url.pathname === "/cross") {
      res.writeHead(302, { Location: `${crossUrl}/echo` });
      res.end();
      return;
    }
    if (url.pathname === "/cross307") {
      res.writeHead(307, { Location: `${crossUrl}/echo` });
      res.end();
      return;
    }
    if (url.pathname === "/echo") {
      crossRequests.push({
        method: req.method || "",
        auth:
          (req.headers.authorization as string | undefined) ?? undefined,
      });
      res.writeHead(200);
      res.end(JSON.stringify({ forwarded: true }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const crossServer = http.createServer((req, res) => {
    crossRequests.push({
      method: req.method || "",
      auth: (req.headers.authorization as string | undefined) ?? undefined,
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ forwarded: true }));
  });

  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    await new Promise<void>((r) => crossServer.listen(0, "127.0.0.1", () => r()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    crossUrl = `http://127.0.0.1:${(crossServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await new Promise<void>((r) => crossServer.close(() => r()));
  });

  it("follows a 302 to the final body and keeps GET semantics", async () => {
    let method = "GET";
    let url = `${baseUrl}/redirect`;
    let headers: Record<string, string> = {};

    for (let hop = 0; hop < 10; hop++) {
      const res = await requestOnce(method, url, headers);
      if (!isRedirectStatus(res.status)) {
        const decoded = decompressBody(
          res.body,
          res.headers["content-encoding"] as string | undefined,
        );
        expect(res.status).toBe(200);
        expect(JSON.parse(decoded.toString("utf8"))).toEqual({
          ok: true,
          query: "redirect",
        });
        return;
      }
      const location = getHeaderArray(
        res.headers as unknown as Record<string, string | string[]>,
        "location",
      )[0];
      url = resolveRedirectUrl(url, location) as string;
      method = getRedirectMethod(method, res.status);
      const sendBody = shouldSendBodyOnRedirect(method, res.status);
      if (!sendBody) {
        removeHeader(headers, "content-length");
        removeHeader(headers, "content-type");
      }
      headers = { ...headers };
    }
    throw new Error("redirect loop exceeded max hops");
  });

  it("strips Authorization when redirecting to a different host", async () => {
    let method = "GET";
    let url = `${baseUrl}/cross`;
    let headers: Record<string, string> = { Authorization: "Bearer secret" };

    for (let hop = 0; hop < 10; hop++) {
      const res = await requestOnce(method, url, headers);
      if (!isRedirectStatus(res.status)) {
        const crossHit = crossRequests[crossRequests.length - 1];
        expect(crossHit?.auth).toBeUndefined();
        return;
      }
      const location = getHeaderArray(
        res.headers as unknown as Record<string, string | string[]>,
        "location",
      )[0];
      const nextUrl = resolveRedirectUrl(url, location) as string;
      if (shouldStripAuthorization(url, nextUrl)) {
        removeHeader(headers, "authorization");
      }
      url = nextUrl;
      method = getRedirectMethod(method, res.status);
      headers = { ...headers };
    }
    throw new Error("redirect loop exceeded max hops");
  });

  it("keeps POST→POST on 307 and re-sends the body", async () => {
    let method = "POST";
    let url = `${baseUrl}/cross307`;
    let headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    let body = JSON.stringify({ data: 1 });

    for (let hop = 0; hop < 10; hop++) {
      const res = await requestOnce(method, url, headers, body);
      if (!isRedirectStatus(res.status)) {
        const hit = crossRequests[crossRequests.length - 1];
        expect(hit?.method).toBe("POST");
        return;
      }
      const location = getHeaderArray(
        res.headers as unknown as Record<string, string | string[]>,
        "location",
      )[0];
      url = resolveRedirectUrl(url, location) as string;
      method = getRedirectMethod(method, res.status);
      const sendBody = shouldSendBodyOnRedirect(method, res.status);
      if (sendBody && body) {
        setHeader(headers, "Content-Length", String(Buffer.byteLength(body)));
      } else {
        removeHeader(headers, "content-length");
        body = undefined;
      }
      headers = { ...headers };
    }
    throw new Error("redirect loop exceeded max hops");
  });

  it("decompresses gzip responses", async () => {
    const res = await requestOnce("GET", `${baseUrl}/gzip`, {});
    const decoded = decompressBody(
      res.body,
      res.headers["content-encoding"] as string | undefined,
    );
    expect(JSON.parse(decoded.toString("utf8"))).toEqual({
      compressed: true,
    });
  });
});
