import { describe, it, expect } from "vitest";
import * as zlib from "zlib";
import { decompressBody } from "../../src/core/decompress";

describe("decompressBody", () => {
  const payload = Buffer.from('{"hello":"world"}');

  it("returns raw bytes when no encoding is present", () => {
    expect(decompressBody(payload, undefined)).toEqual(payload);
    expect(decompressBody(payload, "")).toEqual(payload);
  });

  it("decodes gzip", () => {
    const gz = zlib.gzipSync(payload);
    expect(decompressBody(gz, "gzip").toString("utf8")).toBe(
      '{"hello":"world"}',
    );
  });

  it("decodes deflate (zlib wrapper)", () => {
    const deflated = zlib.deflateSync(payload);
    expect(decompressBody(deflated, "deflate").toString("utf8")).toBe(
      '{"hello":"world"}',
    );
  });

  it("decodes raw deflate fallback", () => {
    const raw = zlib.deflateRawSync(payload);
    expect(decompressBody(raw, "deflate").toString("utf8")).toBe(
      '{"hello":"world"}',
    );
  });

  it("decodes brotli", () => {
    const br = zlib.brotliCompressSync(payload);
    expect(decompressBody(br, "br").toString("utf8")).toBe(
      '{"hello":"world"}',
    );
  });

  it("decodes stacked encodings in order", () => {
    const encoded = zlib.gzipSync(zlib.brotliCompressSync(payload));
    expect(decompressBody(encoded, "br, gzip").toString("utf8")).toBe(
      '{"hello":"world"}',
    );
  });

  it("falls back to raw bytes on corrupt data", () => {
    const corrupt = Buffer.from("not-gzip-at-all-xxxxxxxx");
    expect(decompressBody(corrupt, "gzip")).toEqual(corrupt);
  });

  it("ignores unknown encodings", () => {
    expect(decompressBody(payload, "zstd")).toEqual(payload);
  });

  it("returns empty buffer unchanged", () => {
    expect(decompressBody(Buffer.alloc(0), "gzip")).toEqual(Buffer.alloc(0));
  });
});
