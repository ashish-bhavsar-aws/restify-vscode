import * as zlib from "zlib";

/**
 * Decode a response body according to its Content-Encoding. Falls back to the
 * raw bytes when the payload is corrupt or the encoding is unsupported so the
 * viewer can still show something useful.
 */
export function decompressBody(
  raw: Buffer,
  contentEncoding: string | string[] | undefined,
): Buffer {
  if (!raw || raw.length === 0) return raw;

  const encoding = (
    Array.isArray(contentEncoding)
      ? contentEncoding.join(",")
      : (contentEncoding || "").trim()
  ).toLowerCase();

  // Encodings are applied in listed order, so the recipient decodes them in
  // reverse order (RFC 7231 §3.1.2.1).
  const encodings = encoding
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .reverse();

  let decoded = raw;
  for (const enc of encodings) {
    try {
      if (enc === "gzip" || enc === "x-gzip") {
        decoded = zlib.gunzipSync(decoded);
      } else if (enc === "deflate") {
        try {
          decoded = zlib.inflateSync(decoded);
        } catch {
          // Some servers send raw DEFLATE (no zlib wrapper).
          decoded = zlib.inflateRawSync(decoded);
        }
      } else if (enc === "br") {
        decoded = zlib.brotliDecompressSync(decoded);
      }
      // Unknown encodings are skipped; the body stays as-is.
    } catch {
      return raw;
    }
  }
  return decoded;
}
