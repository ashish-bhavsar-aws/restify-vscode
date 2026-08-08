import { describe, it, expect } from "vitest";
import {
  parsePaste,
  parseBulkText,
  serializeBulkText,
  splitKvLine,
  isBulkPaste,
} from "../../src/core/kvParse";

describe("splitKvLine", () => {
  it("splits at the first tab", () => {
    expect(splitKvLine("foo\tbar", "params")).toEqual({
      key: "foo",
      value: "bar",
      enabled: true,
    });
  });

  it("splits params at the first =", () => {
    expect(splitKvLine("url=https://x?a=b", "params")).toEqual({
      key: "url",
      value: "https://x?a=b",
      enabled: true,
    });
  });

  it("splits headers at the first :", () => {
    expect(splitKvLine("Date: Mon, 02 Jan 2026 12:00:00 GMT", "headers")).toEqual({
      key: "Date",
      value: "Mon, 02 Jan 2026 12:00:00 GMT",
      enabled: true,
    });
  });

  it("falls back to a key-only row when no separator is present", () => {
    expect(splitKvLine("bare-token", "params")).toEqual({
      key: "bare-token",
      value: "",
      enabled: true,
    });
  });

  it("trims keys and values", () => {
    expect(splitKvLine("  key  \t  value  ", "params")).toEqual({
      key: "key",
      value: "value",
      enabled: true,
    });
  });
});

describe("parsePaste", () => {
  it("parses tab-delimited rows (Excel copy)", () => {
    const rows = parsePaste("a\t1\nb\t2\nc\t3", "params");
    expect(rows).toEqual([
      { key: "a", value: "1", enabled: true },
      { key: "b", value: "2", enabled: true },
      { key: "c", value: "3", enabled: true },
    ]);
  });

  it("parses CRLF paste", () => {
    const rows = parsePaste("a=1\r\nb=2\r\n", "params");
    expect(rows).toEqual([
      { key: "a", value: "1", enabled: true },
      { key: "b", value: "2", enabled: true },
    ]);
  });

  it("parses header-style lines", () => {
    const rows = parsePaste("Accept: application/json\nX-Custom: yes", "headers");
    expect(rows).toEqual([
      { key: "Accept", value: "application/json", enabled: true },
      { key: "X-Custom", value: "yes", enabled: true },
    ]);
  });

  it("parses query-style lines", () => {
    const rows = parsePaste("a=1\nb=hello world", "params");
    expect(rows).toEqual([
      { key: "a", value: "1", enabled: true },
      { key: "b", value: "hello world", enabled: true },
    ]);
  });

  it("skips blank lines", () => {
    const rows = parsePaste("a=1\n\nb=2", "params");
    expect(rows).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(parsePaste("", "params")).toEqual([]);
    expect(parsePaste("\n\n", "params")).toEqual([]);
  });

  it("handles a mix of separators in one paste", () => {
    const rows = parsePaste("a\t1\nb=2", "params");
    expect(rows).toEqual([
      { key: "a", value: "1", enabled: true },
      { key: "b", value: "2", enabled: true },
    ]);
  });
});

describe("isBulkPaste", () => {
  it("detects multi-row paste", () => {
    expect(isBulkPaste("a\t1\nb\t2")).toBe(true);
    expect(isBulkPaste("single")).toBe(false);
  });
});

describe("parseBulkText / serializeBulkText", () => {
  it("round-trips params text", () => {
    const items = [
      { key: "a", value: "1" },
      { key: "b", value: "2" },
    ];
    expect(serializeBulkText(items, "params")).toBe("a=1\nb=2");
    expect(parseBulkText("a=1\nb=2", "params")).toEqual([
      { key: "a", value: "1", enabled: true },
      { key: "b", value: "2", enabled: true },
    ]);
  });

  it("round-trips header text", () => {
    const items = [
      { key: "Accept", value: "application/json" },
      { key: "X-Custom", value: "yes" },
    ];
    expect(serializeBulkText(items, "headers")).toBe(
      "Accept: application/json\nX-Custom: yes",
    );
  });

  it("preserves row count when blank lines are present", () => {
    const rows = parseBulkText("a=1\n\nc=3", "params");
    expect(rows).toEqual([
      { key: "a", value: "1", enabled: true },
      { key: "", value: "", enabled: true },
      { key: "c", value: "3", enabled: true },
    ]);
  });

  it("serializes rows with empty keys as bare values", () => {
    expect(serializeBulkText([{ key: "", value: "raw" }], "params")).toBe("raw");
  });
});
