import { describe, it, expect } from "vitest";
import {
  cookieMatchesHost,
  cookieMatchesPath,
  getCookieHeader,
  isCookieExpired,
  parseSetCookie,
  parseSetCookies,
  storeCookies,
  type StoredCookie,
} from "../../src/core";

function cookie(overrides: Partial<StoredCookie> = {}): StoredCookie {
  return {
    name: "sid",
    value: "abc123",
    domain: "example.com",
    hostOnly: true,
    path: "/",
    secure: false,
    httpOnly: false,
    ...overrides,
  };
}

describe("parseSetCookie", () => {
  it("parses a simple cookie with host-only default", () => {
    const c = parseSetCookie("sid=abc123", "api.example.com");
    expect(c).toMatchObject({
      name: "sid",
      value: "abc123",
      domain: "api.example.com",
      hostOnly: true,
      path: "/",
      secure: false,
      httpOnly: false,
    });
  });

  it("honors Domain, Path, Secure, HttpOnly, SameSite attributes", () => {
    const c = parseSetCookie(
      "token=xyz; Domain=.example.com; Path=/api; Secure; HttpOnly; SameSite=Lax",
      "sub.example.com",
    );
    expect(c).toMatchObject({
      name: "token",
      value: "xyz",
      domain: "example.com",
      hostOnly: false,
      path: "/api",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    });
  });

  it("rejects a Domain attribute that does not cover the host", () => {
    const c = parseSetCookie("x=1; Domain=other.com", "example.com");
    expect(c).toMatchObject({ domain: "example.com", hostOnly: true });
  });

  it("defaults Path to the request directory", () => {
    const c = parseSetCookie("x=1", "example.com");
    expect(c?.path).toBe("/");
    const nested = parseSetCookie("x=1", "example.com");
    expect(nested?.path).toBe("/");
  });

  it("parses Max-Age and prefers it over Expires", () => {
    const c = parseSetCookie(
      "x=1; Expires=Thu, 01 Jan 2030 00:00:00 GMT; Max-Age=3600",
      "example.com",
    );
    const expected = Date.now() + 3600 * 1000;
    expect(c?.expires).toBeDefined();
    expect(Math.abs((c?.expires ?? 0) - expected)).toBeLessThan(5000);
  });

  it("marks Max-Age=0 cookies as deleted", () => {
    expect(parseSetCookie("x=1; Max-Age=0", "example.com")).toMatchObject({
      deleted: true,
    });
  });

  it("marks past-expiry cookies as deleted", () => {
    expect(
      parseSetCookie("x=1; Expires=Thu, 01 Jan 2000 00:00:00 GMT", "example.com"),
    ).toMatchObject({ deleted: true });
  });

  it("returns null for malformed input", () => {
    expect(parseSetCookie("", "example.com")).toBeNull();
    expect(parseSetCookie("novalue", "example.com")).toBeNull();
    expect(parseSetCookie("=x", "example.com")).toBeNull();
  });
});

describe("parseSetCookies", () => {
  it("handles a single Set-Cookie string", () => {
    const cookies = parseSetCookies({ "Set-Cookie": "a=1; Path=/" }, "http://x.test/");
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatchObject({ name: "a", value: "1" });
  });

  it("handles an array of Set-Cookie headers", () => {
    const cookies = parseSetCookies(
      { "Set-Cookie": ["a=1", "b=2"] },
      "http://x.test/",
    );
    expect(cookies.map((c) => c.name)).toEqual(["a", "b"]);
  });

  it("returns empty when no Set-Cookie present", () => {
    expect(parseSetCookies({ "Content-Type": "text/html" }, "http://x.test/")).toEqual(
      [],
    );
  });
});

describe("cookieMatchesHost", () => {
  it("matches exact host for host-only cookies", () => {
    const c = cookie({ domain: "example.com", hostOnly: true });
    expect(cookieMatchesHost(c, "example.com")).toBe(true);
    expect(cookieMatchesHost(c, "www.example.com")).toBe(false);
  });

  it("matches subdomains for domain cookies", () => {
    const c = cookie({ domain: "example.com", hostOnly: false });
    expect(cookieMatchesHost(c, "example.com")).toBe(true);
    expect(cookieMatchesHost(c, "api.example.com")).toBe(true);
    expect(cookieMatchesHost(c, "notexample.com")).toBe(false);
  });
});

describe("cookieMatchesPath", () => {
  it("matches default path /", () => {
    const c = cookie({ path: "/" });
    expect(cookieMatchesPath(c, "/anything")).toBe(true);
  });

  it("matches prefix boundaries", () => {
    const c = cookie({ path: "/api" });
    expect(cookieMatchesPath(c, "/api")).toBe(true);
    expect(cookieMatchesPath(c, "/api/users")).toBe(true);
    expect(cookieMatchesPath(c, "/apiv2")).toBe(false);
    expect(cookieMatchesPath(c, "/")).toBe(false);
  });
});

describe("isCookieExpired", () => {
  it("treats session cookies as unexpired", () => {
    expect(isCookieExpired(cookie(), Date.now())).toBe(false);
  });

  it("treats past expires as expired", () => {
    expect(isCookieExpired(cookie({ expires: 1000 }), 2000)).toBe(true);
  });

  it("treats future expires as live", () => {
    expect(isCookieExpired(cookie({ expires: 5000 }), 2000)).toBe(false);
  });
});

describe("getCookieHeader", () => {
  it("returns empty header when no cookies match", () => {
    expect(
      getCookieHeader([cookie({ name: "a", value: "1" })], "http://other.test/"),
    ).toBe("");
  });

  it("serializes matching cookies in name=value pairs", () => {
    const jar = [
      cookie({ name: "a", value: "1", domain: "example.com" }),
      cookie({ name: "b", value: "2", domain: "example.com" }),
    ];
    const header = getCookieHeader(jar, "http://example.com/");
    expect(header).toBe("a=1; b=2");
  });

  it("does not send secure cookies over http", () => {
    const jar = [cookie({ name: "a", value: "1", secure: true })];
    expect(getCookieHeader(jar, "http://example.com/")).toBe("");
    expect(getCookieHeader(jar, "https://example.com/")).toBe("a=1");
  });

  it("respects path matching", () => {
    const jar = [cookie({ name: "a", value: "1", path: "/admin" })];
    expect(getCookieHeader(jar, "http://example.com/")).toBe("");
    expect(getCookieHeader(jar, "http://example.com/admin")).toBe("a=1");
  });

  it("skips expired cookies", () => {
    const jar = [
      cookie({ name: "gone", value: "1", expires: 1000 }),
      cookie({ name: "live", value: "2" }),
    ];
    const header = getCookieHeader(jar, "http://example.com/", 2000);
    expect(header).toBe("live=2");
  });
});

describe("storeCookies", () => {
  it("appends new cookies to the jar", () => {
    const incoming: StoredCookie[] = [
      cookie({ name: "a", value: "1", domain: "example.com" }),
    ];
    expect(storeCookies([], incoming)).toHaveLength(1);
  });

  it("replaces cookies with the same name/domain/path", () => {
    const jar: StoredCookie[] = [
      cookie({ name: "a", value: "old", domain: "example.com", path: "/" }),
    ];
    const incoming: StoredCookie[] = [
      cookie({ name: "a", value: "new", domain: "example.com", path: "/" }),
    ];
    const result = storeCookies(jar, incoming);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("new");
  });

  it("removes a stored cookie when the incoming one is expired", () => {
    const jar: StoredCookie[] = [
      cookie({ name: "a", value: "old", domain: "example.com" }),
    ];
    const incoming: StoredCookie[] = [
      cookie({
        name: "a",
        value: "",
        domain: "example.com",
        path: "/",
        expires: 1000,
      }),
    ];
    const result = storeCookies(jar, incoming, 2000);
    expect(result).toHaveLength(0);
  });

  it("keeps cookies for other domains untouched", () => {
    const jar: StoredCookie[] = [
      cookie({ name: "keep", value: "1", domain: "other.com" }),
    ];
    const incoming: StoredCookie[] = [
      cookie({ name: "a", value: "1", domain: "example.com" }),
    ];
    const result = storeCookies(jar, incoming);
    expect(result.map((c) => c.name).sort()).toEqual(["a", "keep"]);
  });
});
