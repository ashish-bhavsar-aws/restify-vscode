import { describe, it, expect } from "vitest";
import {
  emptyTimings,
  isMeasuredTimings,
  timingStages,
  ttfbOf,
} from "../../src/core/timings";

describe("timings (F27)", () => {
  it("emptyTimings returns an all-zero record", () => {
    expect(emptyTimings()).toEqual({
      dns: 0,
      connect: 0,
      secureConnect: 0,
      send: 0,
      wait: 0,
      receive: 0,
    });
  });

  it("isMeasuredTimings is false for null/undefined/empty", () => {
    expect(isMeasuredTimings(undefined)).toBe(false);
    expect(isMeasuredTimings(null)).toBe(false);
    expect(isMeasuredTimings(emptyTimings())).toBe(false);
  });

  it("isMeasuredTimings is true when any stage is measured", () => {
    expect(isMeasuredTimings({ ...emptyTimings(), wait: 12.3 })).toBe(true);
  });

  it("ttfbOf returns the wait offset (or 0)", () => {
    expect(ttfbOf(undefined)).toBe(0);
    expect(ttfbOf(emptyTimings())).toBe(0);
    expect(ttfbOf({ ...emptyTimings(), wait: 25 })).toBe(25);
  });

  it("timingStages returns [] for null/empty timings", () => {
    expect(timingStages(undefined)).toEqual([]);
    expect(timingStages(emptyTimings())).toEqual([]);
  });

  it("timingStages computes durations as deltas between consecutive offsets", () => {
    const stages = timingStages({
      dns: 10,
      connect: 20,
      secureConnect: 30,
      send: 32,
      wait: 150,
      receive: 220,
    });
    expect(stages).toEqual([
      { id: "dns", label: "DNS Lookup", offset: 10, duration: 10 },
      { id: "connect", label: "TCP Connect", offset: 20, duration: 10 },
      { id: "tls", label: "TLS Handshake", offset: 30, duration: 10 },
      { id: "send", label: "Request Sent", offset: 32, duration: 2 },
      { id: "wait", label: "Waiting (TTFB)", offset: 150, duration: 118 },
      { id: "receive", label: "Receiving", offset: 220, duration: 70 },
    ]);
  });

  it("timingStages skips unmeasured stages (plain http has no TLS)", () => {
    const stages = timingStages({
      dns: 5,
      connect: 12,
      secureConnect: 0,
      send: 15,
      wait: 90,
      receive: 100,
    });
    expect(stages.map((s) => s.id)).toEqual([
      "dns",
      "connect",
      "send",
      "wait",
      "receive",
    ]);
    expect(stages.find((s) => s.id === "connect")?.duration).toBe(7);
    expect(stages.find((s) => s.id === "send")?.duration).toBe(3);
  });

  it("timingStages skips leading unmeasured stages", () => {
    const stages = timingStages({
      dns: 0,
      connect: 0,
      secureConnect: 0,
      send: 0,
      wait: 40,
      receive: 60,
    });
    expect(stages).toEqual([
      { id: "wait", label: "Waiting (TTFB)", offset: 40, duration: 40 },
      { id: "receive", label: "Receiving", offset: 60, duration: 20 },
    ]);
  });

  it("timingStages never yields negative durations", () => {
    const stages = timingStages({
      dns: 10,
      connect: 5,
      secureConnect: 8,
      send: 12,
      wait: 30,
      receive: 40,
    });
    expect(stages.every((s) => s.duration >= 0)).toBe(true);
    expect(stages.find((s) => s.id === "connect")?.duration).toBe(0);
  });
});
