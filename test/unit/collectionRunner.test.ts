import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as http from "http";
import type { AddressInfo } from "net";
import {
  runCollectionRequests,
  executeRunnerRequest,
  parseIterationData,
  RunnerRequestItem,
  StoredCookie,
} from "../../src/core";

describe("collectionRunner", () => {
  let server: http.Server;
  let port = 0;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const json = (data: unknown, status = 200) => {
          res.writeHead(status, { "content-type": "application/json" });
          res.end(JSON.stringify(data));
        };
        switch (url.pathname) {
          case "/set-token":
            json({ token: "abc123" });
            return;
          case "/require-auth":
            if (req.headers.authorization !== "Bearer abc123") {
              json({ error: "missing auth" }, 401);
              return;
            }
            json({ ok: true });
            return;
          case "/set-cookie":
            res.writeHead(200, {
              "content-type": "application/json",
              "set-cookie": "sid=xyz; Path=/",
            });
            res.end("{}");
            return;
          case "/require-cookie":
            if ((req.headers.cookie || "").includes("sid=xyz")) {
              json({ ok: true });
              return;
            }
            json({ error: "missing cookie" }, 401);
            return;
          case "/status/500":
            json({ error: "boom" }, 500);
            return;
          case "/redirect":
            res.writeHead(302, { location: "/ok" });
            res.end();
            return;
          case "/ok":
            json({ ok: true });
            return;
          case "/hang":
            // Never responds so tests can abort mid-flight.
            return;
          default:
            json({ method: req.method, path: url.pathname, body });
            return;
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  const baseUrl = (path: string) => `http://127.0.0.1:${port}${path}`;

  const req = (overrides: Partial<RunnerRequestItem> & { url: string }): RunnerRequestItem => ({
    id: overrides.id || Math.random().toString(36).slice(2),
    name: overrides.name,
    method: overrides.method || "GET",
    url: overrides.url,
    headers: overrides.headers,
    queryParams: overrides.queryParams,
    bodyType: overrides.bodyType,
    body: overrides.body,
    authType: overrides.authType,
    authData: overrides.authData,
    script: overrides.script,
    preScript: overrides.preScript,
    timeout: overrides.timeout,
  });

  it("runs requests sequentially and reports per-request results", async () => {
    const results = await runCollectionRequests({
      requests: [
        req({ id: "a", name: "First", url: baseUrl("/ok") }),
        req({ id: "b", name: "Second", url: baseUrl("/status/500") }),
      ],
      timeout: 5000,
    });
    expect(results.map((r) => r.requestId)).toEqual(["a", "b"]);
    expect(results[0].status).toBe(200);
    expect(results[0].error).toBeUndefined();
    expect(results[1].status).toBe(500);
  });

  it("applies query params and resolves environment variables", async () => {
    const results = await runCollectionRequests({
      requests: [
        req({
          id: "a",
          url: baseUrl("/echo"),
          queryParams: [
            { key: "page", value: "{{page}}", enabled: true },
            { key: "skip", value: "x", enabled: false },
          ],
        }),
      ],
      variables: { page: "2" },
      timeout: 5000,
    });
    expect(results[0].status).toBe(200);
    expect(results[0].url).toContain("page=2");
    expect(results[0].url).not.toContain("skip=x");
  });

  it("chains variables from a post-script into the next request", async () => {
    const results = await runCollectionRequests({
      requests: [
        req({
          id: "a",
          url: baseUrl("/set-token"),
          script: `set('token', JSON.parse(response.body).token);`,
        }),
        req({
          id: "b",
          url: baseUrl("/require-auth"),
          headers: [{ key: "Authorization", value: "Bearer {{token}}" }],
        }),
      ],
      timeout: 5000,
    });
    expect(results[0].status).toBe(200);
    expect(results[1].status).toBe(200);
    expect(results[1].error).toBeUndefined();
  });

  it("resolves variables from pre-request scripts before the request fires", async () => {
    const results = await runCollectionRequests({
      requests: [
        req({
          id: "a",
          url: baseUrl("/require-auth"),
          preScript: `set('token', 'abc123');`,
          headers: [{ key: "Authorization", value: "Bearer {{token}}" }],
        }),
      ],
      timeout: 5000,
    });
    expect(results[0].status).toBe(200);
  });

  it("reports test results from post-scripts", async () => {
    const results = await runCollectionRequests({
      requests: [
        req({
          id: "a",
          url: baseUrl("/ok"),
          script: `
            tests['status is 200'] = response.status === 200;
            tests['has ok'] = JSON.parse(response.body).ok === true;
          `,
        }),
      ],
      timeout: 5000,
    });
    expect(results[0].testSummary).toEqual({ passed: 2, failed: 0 });
    expect(results[0].tests).toEqual({
      "status is 200": true,
      "has ok": true,
    });
  });

  it("injects bearer auth into the request header", async () => {
    const results = await runCollectionRequests({
      requests: [
        req({
          id: "a",
          url: baseUrl("/require-auth"),
          authType: "bearer",
          authData: { token: "abc123" },
        }),
      ],
      timeout: 5000,
    });
    expect(results[0].status).toBe(200);
  });

  it("captures Set-Cookie and replays it on the next request", async () => {
    const jar: StoredCookie[] = [];
    const results = await runCollectionRequests({
      requests: [
        req({ id: "a", url: baseUrl("/set-cookie") }),
        req({ id: "b", url: baseUrl("/require-cookie") }),
      ],
      cookies: jar,
      onCookiesChanged: (next) => {
        jar.length = 0;
        jar.push(...next);
      },
      timeout: 5000,
    });
    expect(results[0].status).toBe(200);
    expect(results[1].status).toBe(200);
  });

  it("marks the in-flight request cancelled when aborted mid-run", async () => {
    const controller = new AbortController();
    let progressCount = 0;
    const pending = runCollectionRequests({
      requests: [
        req({ id: "a", url: baseUrl("/ok") }),
        req({ id: "b", url: baseUrl("/hang") }),
      ],
      signal: controller.signal,
      timeout: 10000,
      onProgress: () => {
        progressCount++;
        if (progressCount === 1) {
          setTimeout(() => controller.abort(), 20);
        }
      },
    });
    const results = await pending;
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe(200);
    expect(results[1].cancelled).toBe(true);
    expect(results[1].error).toBe("Cancelled");
  });

  it("stops before starting later requests when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const results = await runCollectionRequests({
      requests: [
        req({ id: "a", url: baseUrl("/ok") }),
        req({ id: "b", url: baseUrl("/ok") }),
      ],
      signal: controller.signal,
      timeout: 5000,
    });
    expect(results).toEqual([]);
  });

  it("serializes a JSON body for POST requests", async () => {
    const results = await runCollectionRequests({
      requests: [
        req({
          id: "a",
          method: "POST",
          url: baseUrl("/echo"),
          bodyType: "json",
          body: '{"hello":"world"}',
        }),
      ],
      timeout: 5000,
    });
    expect(results[0].status).toBe(200);
  });

  it("chains script-extracted variables into the next request", async () => {
    const results = await runCollectionRequests({
      requests: [
        req({
          id: "a",
          url: baseUrl("/set-token"),
          script: `set('token', JSON.parse(response.body).token);`,
        }),
        req({
          id: "b",
          url: baseUrl("/require-auth"),
          headers: [{ key: "Authorization", value: "Bearer {{token}}" }],
        }),
      ],
      timeout: 5000,
    });
    expect(results[0].status).toBe(200);
    expect(results[1].status).toBe(200);
  });

  it("chains script-extracted variables into a later URL and query params", async () => {
    const results = await runCollectionRequests({
      requests: [
        req({
          id: "a",
          url: baseUrl("/set-token"),
          script: `set('token', JSON.parse(response.body).token);`,
        }),
        req({
          id: "b",
          url: baseUrl("/echo"),
          queryParams: [{ key: "token", value: "{{token}}", enabled: true }],
        }),
      ],
      timeout: 5000,
    });
    expect(results[1].status).toBe(200);
    expect(results[1].url).toContain("token=abc123");
  });

  it("reports an error entry when the URL is invalid", async () => {
    const results = await runCollectionRequests({
      requests: [req({ id: "a", url: "not a url" })],
      timeout: 5000,
    });
    expect(results[0].status).toBe(0);
    expect(results[0].error).toBe("Invalid URL");
  });

  it("exposes a pre-script failure as an error entry", async () => {
    const results = await runCollectionRequests({
      requests: [
        req({ id: "a", url: baseUrl("/ok"), preScript: "throw new Error('boom');" }),
      ],
      timeout: 5000,
    });
    expect(results[0].status).toBe(0);
    expect(results[0].error).toContain("Pre-request script failed");
  });

  it("follows redirects from the runner engine", async () => {
    const results = await runCollectionRequests({
      requests: [req({ id: "a", url: baseUrl("/redirect") })],
      timeout: 5000,
    });
    expect(results[0].status).toBe(200);
  });

  it("exposes executeRunnerRequest with extracted variables", async () => {
    const variables: Record<string, string> = {};
    const { entry, extractedVariables } = await executeRunnerRequest(
      req({ id: "a", url: baseUrl("/ok"), script: `set('done', true);` }),
      variables,
      { requests: [], timeout: 5000 },
    );
    expect(entry.status).toBe(200);
    expect(extractedVariables.done).toBe(true);
    expect(variables.done).toBe("true");
  });

  describe("F32 data-driven runs", () => {
    it("parses CSV iteration data with quoted fields", () => {
      const rows = parseIterationData(`name,note
"Ada,Lovelace",first
Bob,"quoted ""value"""`);
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe("Ada,Lovelace");
      expect(rows[0].note).toBe("first");
      expect(rows[1].note).toBe('quoted "value"');
    });

    it("parses JSON array iteration data", () => {
      const rows = parseIterationData(
        JSON.stringify([{ name: "Ada", n: 1 }, { name: "Bob", n: 2 }]),
        "data.json",
      );
      expect(rows).toEqual([
        { name: "Ada", n: "1" },
        { name: "Bob", n: "2" },
      ]);
    });

    it("treats a bare JSON object as a single row", () => {
      const rows = parseIterationData('{"name":"Ada"}');
      expect(rows).toEqual([{ name: "Ada" }]);
    });

    it("injects each row's variables per iteration", async () => {
      const results = await runCollectionRequests({
        requests: [req({ id: "a", url: baseUrl("/users/{{name}}") })],
        iterationData: [
          { name: "ada" },
          { name: "bob" },
          { name: "carol" },
        ],
        timeout: 5000,
      });
      expect(results).toHaveLength(3);
      expect(results.map((r) => r.url)).toEqual([
        baseUrl("/users/ada"),
        baseUrl("/users/bob"),
        baseUrl("/users/carol"),
      ]);
      expect(results.map((r) => r.iteration)).toEqual([0, 1, 2]);
    });

    it("runs every request once per row", async () => {
      const results = await runCollectionRequests({
        requests: [
          req({ id: "a", url: baseUrl("/users/{{name}}") }),
          req({ id: "b", url: baseUrl("/health") }),
        ],
        iterationData: [{ name: "x" }, { name: "y" }],
        timeout: 5000,
      });
      expect(results).toHaveLength(4);
      expect(results.map((r) => r.iteration)).toEqual([0, 0, 1, 1]);
    });

    it("keeps entries uniterated when no data is supplied", async () => {
      const results = await runCollectionRequests({
        requests: [req({ id: "a", url: baseUrl("/ok") })],
        timeout: 5000,
      });
      expect(results).toHaveLength(1);
      expect(results[0].iteration).toBeUndefined();
    });
  });
});
