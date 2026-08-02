import { describe, it, expect } from "vitest";
import {
  isRedirectStatus,
  getRedirectMethod,
  shouldSendBodyOnRedirect,
  shouldStripAuthorization,
  resolveRedirectUrl,
} from "../../src/core/redirects";

describe("isRedirectStatus", () => {
  it("recognizes 3xx redirect codes", () => {
    expect(isRedirectStatus(301)).toBe(true);
    expect(isRedirectStatus(302)).toBe(true);
    expect(isRedirectStatus(303)).toBe(true);
    expect(isRedirectStatus(307)).toBe(true);
    expect(isRedirectStatus(308)).toBe(true);
    expect(isRedirectStatus(300)).toBe(false);
    expect(isRedirectStatus(200)).toBe(false);
    expect(isRedirectStatus(304)).toBe(false);
    expect(isRedirectStatus(404)).toBe(false);
  });
});

describe("getRedirectMethod", () => {
  it("always converts 303 to GET", () => {
    expect(getRedirectMethod("POST", 303)).toBe("GET");
    expect(getRedirectMethod("PUT", 303)).toBe("GET");
    expect(getRedirectMethod("GET", 303)).toBe("GET");
  });

  it("converts POST to GET on 301/302", () => {
    expect(getRedirectMethod("POST", 301)).toBe("GET");
    expect(getRedirectMethod("POST", 302)).toBe("GET");
  });

  it("preserves non-POST methods on 301/302", () => {
    expect(getRedirectMethod("PUT", 301)).toBe("PUT");
    expect(getRedirectMethod("DELETE", 302)).toBe("DELETE");
  });

  it("preserves method on 307/308", () => {
    expect(getRedirectMethod("POST", 307)).toBe("POST");
    expect(getRedirectMethod("PUT", 308)).toBe("PUT");
  });
});

describe("shouldSendBodyOnRedirect", () => {
  it("drops the body when redirected method becomes GET", () => {
    expect(shouldSendBodyOnRedirect("POST", 302)).toBe(false);
    expect(shouldSendBodyOnRedirect("GET", 301)).toBe(false);
    expect(shouldSendBodyOnRedirect("POST", 303)).toBe(false);
  });

  it("keeps the body for preserved methods", () => {
    expect(shouldSendBodyOnRedirect("POST", 307)).toBe(true);
    expect(shouldSendBodyOnRedirect("PUT", 308)).toBe(true);
  });
});

describe("shouldStripAuthorization", () => {
  it("strips when host changes", () => {
    expect(
      shouldStripAuthorization(
        "https://api.example.com/a",
        "https://other.example.com/b",
      ),
    ).toBe(true);
  });

  it("strips when protocol changes", () => {
    expect(
      shouldStripAuthorization(
        "https://api.example.com/a",
        "http://api.example.com/b",
      ),
    ).toBe(true);
  });

  it("strips when the port changes", () => {
    expect(
      shouldStripAuthorization(
        "https://api.example.com/a",
        "https://api.example.com:8443/b",
      ),
    ).toBe(true);
  });

  it("keeps when same host and protocol (subdomain treated as different)", () => {
    expect(
      shouldStripAuthorization(
        "https://api.example.com/a",
        "https://api.example.com/b",
      ),
    ).toBe(false);
    expect(
      shouldStripAuthorization(
        "https://example.com/a",
        "https://sub.example.com/b",
      ),
    ).toBe(true);
  });

  it("defaults to stripping on invalid URLs", () => {
    expect(shouldStripAuthorization("not-a-url", "https://x.com")).toBe(true);
  });
});

describe("resolveRedirectUrl", () => {
  it("resolves absolute locations", () => {
    expect(
      resolveRedirectUrl("https://a.com/start", "https://b.com/end"),
    ).toBe("https://b.com/end");
  });

  it("resolves relative paths", () => {
    expect(resolveRedirectUrl("https://a.com/start", "/end")).toBe(
      "https://a.com/end",
    );
    expect(resolveRedirectUrl("https://a.com/dir/start", "../end")).toBe(
      "https://a.com/end",
    );
  });

  it("preserves query strings", () => {
    expect(resolveRedirectUrl("https://a.com/x", "?y=1")).toBe(
      "https://a.com/x?y=1",
    );
  });

  it("returns null for missing or invalid locations", () => {
    expect(resolveRedirectUrl("https://a.com/x", undefined)).toBeNull();
    expect(resolveRedirectUrl("https://a.com/x", "   ")).toBeNull();
    expect(resolveRedirectUrl("not-a-url", "/x")).toBeNull();
  });
});
