import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as http from "http";
import type { AddressInfo } from "net";
import {
  getCookieHeader,
  parseSetCookies,
  storeCookies,
  type StoredCookie,
} from "../../src/core";

describe("cookie jar engine (network integration)", () => {
  let baseUrl = "";
  let jar: StoredCookie[] = [];
  const seenCookies: string[] = [];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname === "/login") {
      res.writeHead(200, {
        "Set-Cookie": [
          "session=xyz123; Path=/",
          "theme=dark; Path=/; Max-Age=3600",
        ],
      });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url.pathname === "/profile") {
      seenCookies.push(req.headers.cookie || "");
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url.pathname === "/logout") {
      res.writeHead(200, { "Set-Cookie": "session=; Path=/; Max-Age=0" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  function requestOnce(
    path: string,
    headers: Record<string, string>,
  ): Promise<http.IncomingHttpHeaders> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        `${baseUrl}${path}`,
        { method: "GET", headers },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.headers));
        },
      );
      req.on("error", reject);
      req.end();
    });
  }

  it("stores cookies from Set-Cookie and sends them on the next request", async () => {
    const loginHeaders = await requestOnce("/login", {});
    jar = storeCookies(jar, parseSetCookies(loginHeaders, `${baseUrl}/login`));
    expect(jar.map((c) => c.name).sort()).toEqual(["session", "theme"]);

    const cookieHeader = getCookieHeader(jar, `${baseUrl}/profile`);
    expect(cookieHeader).toContain("session=xyz123");
    expect(cookieHeader).toContain("theme=dark");

    await requestOnce("/profile", { Cookie: cookieHeader });
    expect(seenCookies[seenCookies.length - 1]).toContain("session=xyz123");
    expect(seenCookies[seenCookies.length - 1]).toContain("theme=dark");
  });

  it("removes the cookie when the server sends Max-Age=0", async () => {
    const logoutHeaders = await requestOnce("/logout", {});
    jar = storeCookies(jar, parseSetCookies(logoutHeaders, `${baseUrl}/logout`));
    expect(jar.some((c) => c.name === "session")).toBe(false);
    expect(jar.some((c) => c.name === "theme")).toBe(true);
  });
});
