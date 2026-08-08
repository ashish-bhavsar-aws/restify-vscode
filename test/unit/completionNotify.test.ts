import { describe, expect, it } from "vitest";
import {
  shouldNotifyOnCompletion,
  formatCompletionNotification,
} from "../../src/core/completionNotify";

describe("shouldNotifyOnCompletion", () => {
  it("notifies only when enabled and past the threshold in background", () => {
    expect(
      shouldNotifyOnCompletion({ enabled: true, durationMs: 6000, thresholdMs: 5000, background: true }),
    ).toBe(true);
    expect(
      shouldNotifyOnCompletion({ enabled: true, durationMs: 6000, thresholdMs: 5000, background: false }),
    ).toBe(false);
  });

  it("does not notify when the request is faster than the threshold", () => {
    expect(
      shouldNotifyOnCompletion({ enabled: true, durationMs: 1000, thresholdMs: 5000, background: true }),
    ).toBe(false);
  });

  it("respects the enabled toggle", () => {
    expect(
      shouldNotifyOnCompletion({ enabled: false, durationMs: 6000, thresholdMs: 5000, background: true }),
    ).toBe(false);
  });

  it("does not notify for a non-positive threshold", () => {
    expect(
      shouldNotifyOnCompletion({ enabled: true, durationMs: 6000, thresholdMs: 0, background: true }),
    ).toBe(false);
  });

  it("notifies exactly at the threshold boundary", () => {
    expect(
      shouldNotifyOnCompletion({ enabled: true, durationMs: 5000, thresholdMs: 5000, background: true }),
    ).toBe(true);
  });
});

describe("formatCompletionNotification", () => {
  it("includes method, host, path and status", () => {
    const msg = formatCompletionNotification({
      method: "GET",
      url: "http://localhost:3000/api/users?page=1",
      status: 200,
      durationMs: 6200,
    });
    expect(msg).toContain("GET");
    expect(msg).toContain("localhost:3000");
    expect(msg).toContain("/api/users");
    expect(msg).toContain("200");
    expect(msg).toContain("6.2s");
  });

  it("shows millisecond duration under one second", () => {
    const msg = formatCompletionNotification({
      method: "POST",
      url: "https://example.com/x",
      status: 201,
      durationMs: 450,
    });
    expect(msg).toContain("450ms");
  });

  it("labels failures with failed instead of a status", () => {
    const msg = formatCompletionNotification({
      method: "GET",
      url: "https://example.com/x",
      status: 0,
      durationMs: 8000,
    });
    expect(msg).toContain("failed");
    expect(msg).not.toContain("— 0");
  });

  it("falls back to the raw url when it is not parseable", () => {
    const msg = formatCompletionNotification({
      method: "GET",
      url: "not a url",
      status: 200,
      durationMs: 1000,
    });
    expect(msg).toContain("not a url");
  });
});
