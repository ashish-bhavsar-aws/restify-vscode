import { describe, it, expect } from "vitest";
import {
  applyDefaultHeaders,
  type DefaultHeadersConfig,
} from "../../src/core/defaultHeaders";

const GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALL_OFF: DefaultHeadersConfig = {
  userAgent: false,
  requestId: false,
  correlationId: false,
  date: false,
};

const ALL_ON: DefaultHeadersConfig = {
  userAgent: true,
  requestId: true,
  correlationId: true,
  date: true,
};

const FIXED_NOW = () => new Date("2026-08-03T21:00:00.000Z");

describe("applyDefaultHeaders", () => {
  it("injects nothing when config is undefined or all disabled", () => {
    const headers: Record<string, string> = {};
    applyDefaultHeaders(headers, undefined, "1.0.26", FIXED_NOW);
    expect(headers).toEqual({});

    applyDefaultHeaders(headers, ALL_OFF, "1.0.26", FIXED_NOW);
    expect(headers).toEqual({});
  });

  it("injects User-Agent as Restify/<version>", () => {
    const headers: Record<string, string> = {};
    applyDefaultHeaders(headers, { ...ALL_ON, requestId: false, correlationId: false, date: false }, "2.3.4", FIXED_NOW);
    expect(headers["User-Agent"]).toBe("Restify/2.3.4");
  });

  it("injects a fresh UUID for X-Request-Id", () => {
    const headers: Record<string, string> = {};
    applyDefaultHeaders(headers, { ...ALL_ON, userAgent: false, correlationId: false, date: false }, "1.0.0", FIXED_NOW);
    expect(GUID_RE.test(headers["X-Request-Id"])).toBe(true);
  });

  it("injects a fresh UUID for X-Correlation-Id", () => {
    const headers: Record<string, string> = {};
    applyDefaultHeaders(headers, { ...ALL_ON, userAgent: false, requestId: false, date: false }, "1.0.0", FIXED_NOW);
    expect(GUID_RE.test(headers["X-Correlation-Id"])).toBe(true);
  });

  it("injects Date as an RFC 1123 UTC string", () => {
    const headers: Record<string, string> = {};
    applyDefaultHeaders(headers, { ...ALL_ON, userAgent: false, requestId: false, correlationId: false }, "1.0.0", FIXED_NOW);
    expect(headers["Date"]).toBe("Mon, 03 Aug 2026 21:00:00 GMT");
  });

  it("injects all four defaults when enabled", () => {
    const headers: Record<string, string> = {};
    applyDefaultHeaders(headers, ALL_ON, "1.0.0", FIXED_NOW);
    expect(headers["User-Agent"]).toBe("Restify/1.0.0");
    expect(GUID_RE.test(headers["X-Request-Id"])).toBe(true);
    expect(GUID_RE.test(headers["X-Correlation-Id"])).toBe(true);
    expect(headers["Date"]).toBe("Mon, 03 Aug 2026 21:00:00 GMT");
  });

  it("does not override an existing header (case-insensitive)", () => {
    const headers: Record<string, string> = { "user-agent": "custom-agent" };
    applyDefaultHeaders(headers, ALL_ON, "1.0.0", FIXED_NOW);
    expect(headers["user-agent"]).toBe("custom-agent");
    expect(Object.keys(headers).filter((k) => k.toLowerCase() === "user-agent")).toHaveLength(1);
    expect(GUID_RE.test(headers["X-Request-Id"])).toBe(true);
  });

  it("does not inject a second X-Request-Id when one already exists", () => {
    const headers: Record<string, string> = { "x-request-id": "existing-id" };
    applyDefaultHeaders(headers, ALL_ON, "1.0.0", FIXED_NOW);
    expect(headers["x-request-id"]).toBe("existing-id");
  });
});
