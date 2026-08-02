import { describe, it, expect } from "vitest";
import {
  canonicalHeaderName,
  getHeader,
  hasHeader,
  setHeader,
  removeHeader,
  getHeaderValue,
  getHeaderArray,
  normalizeResponseHeaders,
} from "../../src/core/headers";

describe("canonicalHeaderName", () => {
  it("title-cases hyphenated names", () => {
    expect(canonicalHeaderName("content-type")).toBe("Content-Type");
    expect(canonicalHeaderName("x-api-key")).toBe("X-Api-Key");
  });

  it("keeps Set-Cookie casing", () => {
    expect(canonicalHeaderName("set-cookie")).toBe("Set-Cookie");
  });
});

describe("getHeader / hasHeader", () => {
  it("matches case-insensitively", () => {
    const headers = { "Content-Type": "application/json" };
    expect(getHeader(headers, "content-type")).toBe("application/json");
    expect(hasHeader(headers, "CONTENT-TYPE")).toBe(true);
    expect(hasHeader(headers, "missing")).toBe(false);
    expect(getHeader(headers, "missing")).toBeUndefined();
  });
});

describe("setHeader", () => {
  it("replaces existing case-insensitively", () => {
    const headers = { "content-type": "a" };
    setHeader(headers, "Content-Type", "b");
    expect(headers).toEqual({ "content-type": "b" });
  });

  it("adds new headers with given casing", () => {
    const headers: Record<string, string> = {};
    setHeader(headers, "Authorization", "Bearer x");
    expect(headers.Authorization).toBe("Bearer x");
  });
});

describe("removeHeader", () => {
  it("removes case-insensitively", () => {
    const headers = { "Content-Type": "a", Keep: "yes" };
    removeHeader(headers, "content-type");
    expect(headers).toEqual({ Keep: "yes" });
  });
});

describe("getHeaderValue / getHeaderArray", () => {
  it("joins array values with semicolons", () => {
    expect(getHeaderValue({ "Set-Cookie": ["a=1", "b=2"] }, "set-cookie")).toBe(
      "a=1; b=2",
    );
    expect(getHeaderArray({ "Set-Cookie": ["a=1", "b=2"] }, "set-cookie")).toEqual(
      ["a=1", "b=2"],
    );
  });

  it("returns empty for missing headers", () => {
    expect(getHeaderValue({}, "x")).toBe("");
    expect(getHeaderArray({}, "x")).toEqual([]);
  });
});

describe("normalizeResponseHeaders", () => {
  it("normalizes casing and stringifies values", () => {
    const out = normalizeResponseHeaders({
      "content-type": "text/html",
      "set-cookie": ["a=1", "b=2"],
      dropped: undefined,
    });
    expect(out["Content-Type"]).toBe("text/html");
    expect(out["Set-Cookie"]).toEqual(["a=1", "b=2"]);
    expect("dropped" in out).toBe(false);
  });
});
