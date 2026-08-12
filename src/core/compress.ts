/**
 * F49 — request body compression.
 *
 * Compresses the request body (gzip / deflate / brotli) and produces the
 * matching `Content-Encoding` header value so the body is encoded before it
 * hits the wire. Uses Node's built-in `zlib` (extension-host only — the
 * webview CSP never runs this).
 */
import * as zlib from "zlib";

export type RequestCompression = "gzip" | "deflate" | "br";

/** Header value that announces the given encoding (RFC 9110 `Content-Encoding`). */
export function contentEncodingHeader(encoding: RequestCompression): string {
  switch (encoding) {
    case "gzip":
      return "gzip";
    case "deflate":
      return "deflate";
    case "br":
      return "br";
  }
}

/** True when the encoding can be announced as a request `Content-Encoding`. */
export function isRequestCompression(value: unknown): value is RequestCompression {
  return value === "gzip" || value === "deflate" || value === "br";
}

/**
 * Compress the request body bytes synchronously. Empty bodies are returned
 * unchanged (there is nothing worth encoding).
 */
export function compressRequestBody(
  body: string | Buffer,
  encoding: RequestCompression,
): Buffer {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
  if (data.length === 0) return data;
  switch (encoding) {
    case "gzip":
      return zlib.gzipSync(data);
    case "deflate":
      return zlib.deflateSync(data);
    case "br":
      return zlib.brotliCompressSync(data);
  }
}
