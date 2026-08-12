import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as http from "http";
import type { AddressInfo } from "net";
import {
  performHttpRequest,
  isEventStreamContentType,
  type StreamEvent,
} from "../../src/core";

describe("isEventStreamContentType", () => {
  it("detects text/event-stream regardless of case", () => {
    expect(isEventStreamContentType("text/event-stream")).toBe(true);
    expect(isEventStreamContentType("Text/Event-Stream")).toBe(true);
    expect(
      isEventStreamContentType("text/event-stream; charset=utf-8"),
    ).toBe(true);
  });

  it("returns false for other content types and undefined", () => {
    expect(isEventStreamContentType("application/json")).toBe(false);
    expect(isEventStreamContentType(undefined)).toBe(false);
    expect(isEventStreamContentType("")).toBe(false);
  });
});

describe("performHttpRequest streaming (F28)", () => {
  let server: http.Server;
  let port = 0;

  const SSE_BODY = ["data: hello\n\n", "data: world\n\n", "data: done\n\n"];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      if (url.pathname === "/sse") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        });
        SSE_BODY.forEach((part, i) => {
          setTimeout(() => {
            res.write(part);
            if (i === SSE_BODY.length - 1) res.end();
          }, i * 20);
        });
        return;
      }
      if (url.pathname === "/json") {
        res.writeHead(200, { "content-type": "application/json" });
        res.write('{"a":');
        setTimeout(() => {
          res.write("1}");
          res.end();
        }, 20);
        return;
      }
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
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

  interface Capture {
    response: Omit<StreamEvent, "chunk"> | null;
    chunks: Buffer[];
  }

  function capture(): Capture {
    return { response: null, chunks: [] };
  }

  it("fires onResponse with headers before any chunk", async () => {
    const c = capture();
    const result = await performHttpRequest(
      http,
      options("/sse"),
      undefined,
      5000,
      undefined,
      undefined,
      {
        onResponse: (event) => {
          c.response = event;
        },
        onChunk: (event) => {
          if (!c.response) throw new Error("chunk before onResponse");
          c.chunks.push(event.chunk!);
        },
      },
    );

    expect(c.response).not.toBeNull();
    expect(c.response!.status).toBe(200);
    expect(c.response!.headers["content-type"]).toContain("text/event-stream");
    expect(result.status).toBe(200);
    expect(result.data.toString("utf8")).toBe(SSE_BODY.join(""));
  });

  it("delivers body chunks incrementally", async () => {
    const c = capture();
    await performHttpRequest(
      http,
      options("/sse"),
      undefined,
      5000,
      undefined,
      undefined,
      {
        onResponse: (event) => {
          c.response = event;
        },
        onChunk: (event) => {
          c.chunks.push(event.chunk!);
        },
      },
    );

    expect(c.chunks.length).toBeGreaterThanOrEqual(2);
    expect(Buffer.concat(c.chunks).toString("utf8")).toBe(SSE_BODY.join(""));
  });

  it("includes status and headers on each chunk event", async () => {
    const seen: StreamEvent[] = [];
    await performHttpRequest(
      http,
      options("/sse"),
      undefined,
      5000,
      undefined,
      undefined,
      {
        onChunk: (event) => {
          seen.push(event);
        },
      },
    );

    expect(seen.length).toBeGreaterThan(0);
    for (const event of seen) {
      expect(event.status).toBe(200);
      expect(event.chunk).toBeInstanceOf(Buffer);
      expect(event.headers["content-type"]).toContain("text/event-stream");
    }
  });

  it("streams regardless of content type (gating is upstream)", async () => {
    const c = capture();
    const result = await performHttpRequest(
      http,
      options("/json"),
      undefined,
      5000,
      undefined,
      undefined,
      {
        onResponse: (event) => {
          c.response = event;
        },
        onChunk: (event) => {
          c.chunks.push(event.chunk!);
        },
      },
    );

    expect(c.response!.headers["content-type"]).toContain("application/json");
    expect(c.chunks.length).toBeGreaterThanOrEqual(2);
    expect(Buffer.concat(c.chunks).toString("utf8")).toBe('{"a":1}');
    expect(result.data.toString("utf8")).toBe('{"a":1}');
  });

  it("behaves exactly as before when no stream callbacks are passed", async () => {
    const result = await performHttpRequest(http, options("/json"), undefined, 5000);
    expect(result.status).toBe(200);
    expect(result.data.toString("utf8")).toBe('{"a":1}');
  });
});
