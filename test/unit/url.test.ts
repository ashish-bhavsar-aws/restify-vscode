import { describe, it, expect } from "vitest";
import { applyQueryParams } from "../../src/core/url";

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
