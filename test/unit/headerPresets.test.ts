import { describe, it, expect } from "vitest";
import { mergeHeaders, cleanPresetHeaders } from "../../src/core/headerPresets";

describe("mergeHeaders", () => {
  it("appends new headers from the preset", () => {
    const result = mergeHeaders(
      [{ key: "Accept", value: "*/*" }],
      [{ key: "X-API-Key", value: "abc" }],
    );
    expect(result).toEqual([
      { key: "Accept", value: "*/*" },
      { key: "X-API-Key", value: "abc" },
    ]);
  });

  it("replaces existing headers with the same key case-insensitively", () => {
    const result = mergeHeaders(
      [{ key: "x-api-key", value: "old" }],
      [{ key: "X-API-Key", value: "new", enabled: false }],
    );
    expect(result).toEqual([
      { key: "X-API-Key", value: "new", enabled: false },
    ]);
  });

  it("does not mutate the inputs", () => {
    const current = [{ key: "Accept", value: "*/*" }];
    const preset = [{ key: "X-API-Key", value: "abc" }];
    const result = mergeHeaders(current, preset);
    expect(current).toEqual([{ key: "Accept", value: "*/*" }]);
    expect(preset).toEqual([{ key: "X-API-Key", value: "abc" }]);
    expect(result).not.toBe(current);
  });

  it("keeps disabled flags from the preset when replacing", () => {
    const result = mergeHeaders(
      [{ key: "Accept", value: "*/*", enabled: false }],
      [{ key: "Accept", value: "application/json" }],
    );
    expect(result[0].enabled).toBeUndefined();
    expect(result[0].value).toBe("application/json");
  });
});

describe("cleanPresetHeaders", () => {
  it("drops rows without a key and leaves the rest untouched", () => {
    const result = cleanPresetHeaders([
      { key: "Accept", value: "application/json" },
      { key: "", value: "no-key" },
      { key: "  ", value: "spaces" },
      { key: "X-Test", value: "1", enabled: false },
    ]);
    expect(result).toEqual([
      { key: "Accept", value: "application/json" },
      { key: "X-Test", value: "1", enabled: false },
    ]);
  });
});
