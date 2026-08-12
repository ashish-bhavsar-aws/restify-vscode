import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as http from "http";
import * as zlib from "zlib";
import type { AddressInfo } from "net";
import {
  compressRequestBody,
  contentEncodingHeader,
  isRequestCompression,
  performHttpRequest,
} from "../../src/core";

const SAMPLE = '{"hello":"world","padding":"'.padEnd(64, "x") + '"}';

describe("compressRequestBody", () => {
  it("round-trips gzip", () => {
    const out = compressRequestBody(SAMPLE, "gzip");
    expect(zlib.gunzipSync(out).toString("utf8")).toBe(SAMPLE);
    expect(out.length).toBeLessThan(SAMPLE.length);
  });

  it("round-trips deflate", () => {
    const out = compressRequestBody(SAMPLE, "deflate");
    expect(zlib.inflateSync(out).toString("utf8")).toBe(SAMPLE);
  });

  it("round-trips brotli", () => {
    const out = compressRequestBody(SAMPLE, "br");
    expect(zlib.brotliDecompressSync(out).toString("utf8")).toBe(SAMPLE);
  });

  it("handles Buffer input", () => {
    const out = compressRequestBody(Buffer.from(SAMPLE, "utf8"), "gzip");
    expect(zlib.gunzipSync(out).toString("utf8")).toBe(SAMPLE);
  });

  it("returns empty input unchanged", () => {
    expect(compressRequestBody("", "gzip").length).toBe(0);
    expect(compressRequestBody(Buffer.alloc(0), "deflate").length).toBe(0);
  });
});

describe("contentEncodingHeader", () => {
  it("maps encodings to their Content-Encoding values", () => {
    expect(contentEncodingHeader("gzip")).toBe("gzip");
    expect(contentEncodingHeader("deflate")).toBe("deflate");
    expect(contentEncodingHeader("br")).toBe("br");
  });
});

describe("isRequestCompression", () => {
  it("accepts only the supported encodings", () => {
    expect(isRequestCompression("gzip")).toBe(true);
    expect(isRequestCompression("deflate")).toBe(true);
    expect(isRequestCompression("br")).toBe(true);
    expect(isRequestCompression("none")).toBe(false);
    expect(isRequestCompression(undefined)).toBe(false);
    expect(isRequestCompression("zip")).toBe(false);
  });
});

describe("compressed request over the wire", () => {
  let server: http.Server;
  let port = 0;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(Buffer.from(c)));
      req.on("end", () => {
        const raw = Buffer.concat(chunks);
        const encoding = (req.headers["content-encoding"] as string) || "";
        let decoded = raw.toString("utf8");
        if (encoding === "gzip") decoded = zlib.gunzipSync(raw).toString("utf8");
        else if (encoding === "deflate") decoded = zlib.inflateSync(raw).toString("utf8");
        else if (encoding === "br") decoded = zlib.brotliDecompressSync(raw).toString("utf8");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            encoding,
            length: raw.length,
            decoded,
          }),
        );
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  const requestOptions = () => ({
    method: "POST" as const,
    hostname: "127.0.0.1",
    port,
    path: "/",
  });

  async function sendCompressed(body: string, encoding: string): Promise<any> {
    const compressed = compressRequestBody(body, encoding as any);
    const result = await performHttpRequest(http, {
      ...requestOptions(),
      headers: {
        "content-type": "application/json",
        "content-encoding": encoding,
        "content-length": String(compressed.length),
      },
    }, compressed, 5000);
    return JSON.parse(result.data.toString("utf8"));
  }

  it("sends a gzip-encoded body with Content-Encoding and correct length", async () => {
    const out = await sendCompressed(SAMPLE, "gzip");
    expect(out.encoding).toBe("gzip");
    expect(out.length).toBe(compressRequestBody(SAMPLE, "gzip").length);
    expect(out.decoded).toBe(SAMPLE);
  });

  it("sends a deflate-encoded body", async () => {
    const out = await sendCompressed(SAMPLE, "deflate");
    expect(out.encoding).toBe("deflate");
    expect(out.decoded).toBe(SAMPLE);
  });

  it("sends a brotli-encoded body", async () => {
    const out = await sendCompressed(SAMPLE, "br");
    expect(out.encoding).toBe("br");
    expect(out.decoded).toBe(SAMPLE);
  });
});
