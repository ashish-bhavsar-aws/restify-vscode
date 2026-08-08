import { describe, it, expect } from "vitest";
import { applyQueryParams, extractBasicAuthFromUrl } from "../../src/core/url";

describe("applyQueryParams", () => {
  it("appends enabled params", () => {
    const url = applyQueryParams(
      "https://api.example.com/users",
      [
        { key: "page", value: "2", enabled: true },
        { key: "q", value: "a b", enabled: true },
        { key: "skip", value: "yes", enabled: false },
      ],
      (s) => s,
    );
    expect(url).toBe("https://api.example.com/users?page=2&q=a+b");
  });

  it("merges into an existing query string", () => {
    const url = applyQueryParams(
      "https://api.example.com/search?limit=10",
      [{ key: "offset", value: "20", enabled: true }],
      (s) => s,
    );
    expect(url).toBe("https://api.example.com/search?limit=10&offset=20");
  });

  it("resolves values through the callback", () => {
    const url = applyQueryParams(
      "https://api.example.com/x",
      [{ key: "token", value: "{{tok}}", enabled: true }],
      (s) => (s === "{{tok}}" ? "abc" : s),
    );
    expect(url).toBe("https://api.example.com/x?token=abc");
  });

  it("returns null for invalid URLs", () => {
    expect(applyQueryParams("not-a-url", [], (s) => s)).toBeNull();
  });

  it("returns the url unchanged when params are empty", () => {
    expect(applyQueryParams("https://a.com/", [], (s) => s)).toBe(
      "https://a.com/",
    );
  });
});

describe("extractBasicAuthFromUrl", () => {
  it("extracts user and password and strips them from the URL", () => {
    const result = extractBasicAuthFromUrl("https://alice:s3cret@api.example.com/users");
    expect(result).toEqual({
      url: "https://api.example.com/users",
      username: "alice",
      password: "s3cret",
    });
  });

  it("handles a username without a password", () => {
    const result = extractBasicAuthFromUrl("https://alice@api.example.com/");
    expect(result).toEqual({
      url: "https://api.example.com/",
      username: "alice",
      password: "",
    });
  });

  it("decodes percent-encoded credentials", () => {
    const result = extractBasicAuthFromUrl("https://us%40er:p%3Ass@api.example.com/");
    expect(result.username).toBe("us@er");
    expect(result.password).toBe("p:ss");
  });

  it("preserves port, path and query string", () => {
    const result = extractBasicAuthFromUrl("https://u:p@api.example.com:8443/v1?a=1&b=2");
    expect(result.url).toBe("https://api.example.com:8443/v1?a=1&b=2");
  });

  it("returns the URL untouched when there is no userinfo", () => {
    const url = "https://api.example.com/v1";
    expect(extractBasicAuthFromUrl(url)).toEqual({
      url,
      username: "",
      password: "",
    });
  });

  it("returns the URL untouched for an unparseable string", () => {
    const url = "not-a-url";
    expect(extractBasicAuthFromUrl(url)).toEqual({
      url,
      username: "",
      password: "",
    });
  });

  it("does not mistake a lone @ in the path for userinfo", () => {
    const url = "https://api.example.com/x@y";
    expect(extractBasicAuthFromUrl(url).username).toBe("");
  });
});
