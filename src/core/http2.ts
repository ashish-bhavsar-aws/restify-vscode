/**
 * F48 — HTTP/2 request transport.
 *
 * Sends a single request over an HTTP/2 session (ALPN `h2` for `https:`
 * URLs, prior-knowledge `h2c` for `http:` URLs). Kept extension-host only
 * (Node `http2`); mirrors the `RawHttpResult` / `StreamEvent` shape of the
 * HTTP/1.1 path so the panel can swap transports transparently.
 *
 * Not compatible with the HTTP proxy agent — the panel falls back to HTTP/1.1
 * whenever a proxy is configured.
 */
import * as http2 from "http2";
import { MAX_RESPONSE_SIZE } from "./constants";
import { emptyTimings } from "./timings";
import type { RawHttpResult, HttpStreamCallbacks } from "./http";

export interface Http2RequestOptions {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | Buffer;
  rejectUnauthorized?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** TLS options from a configured mTLS certificate (ca / cert / key). */
  tls?: Record<string, Buffer>;
  stream?: HttpStreamCallbacks;
}

/** HTTP/2 has no status text; map the common codes for display. */
const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  303: "See Other",
  304: "Not Modified",
  307: "Temporary Redirect",
  308: "Permanent Redirect",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  413: "Payload Too Large",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

/** Headers that are connection-level in HTTP/1.1 and illegal in HTTP/2. */
const FORBIDDEN: readonly string[] = [
  "connection",
  "host",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
];

export function performHttp2Request(
  opts: Http2RequestOptions,
): Promise<RawHttpResult> {
  return new Promise((resolve, reject) => {
    const {
      url,
      method,
      headers,
      body,
      rejectUnauthorized = true,
      timeoutMs = 30000,
      signal,
      tls,
      stream,
    } = opts;

    const timings = emptyTimings();
    const time0 = process.hrtime.bigint();
    const timeMs = (): number => Number(process.hrtime.bigint() - time0) / 1e6;

    let settled = false;
    let session: http2.ClientHttp2Session | null = null;
    let req: http2.ClientHttp2Stream | null = null;

    const cleanup = (): void => {
      if (signal) signal.removeEventListener("abort", onAbort);
      if (session) {
        try {
          session.close();
        } catch {
          /* already closed */
        }
        session = null;
      }
    };

    const finish = (fn: (value: any) => void, value: any): void => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };

    const onAbort = (): void => {
      if (req) req.destroy(new Error("Request cancelled"));
    };

    if (signal) {
      if (signal.aborted) {
        reject(new Error("Request cancelled"));
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";

    // HTTP/2 pseudo-headers + the caller's headers minus forbidden ones.
    const h2Headers: http2.OutgoingHttpHeaders = {
      ":method": method.toUpperCase(),
      ":path": parsed.pathname + parsed.search,
      ...Object.fromEntries(
        Object.entries(headers).filter(
          ([key]) => !FORBIDDEN.includes(key.toLowerCase()),
        ),
      ),
    };

    const connectOpts: http2.ClientSessionOptions &
      http2.SecureClientSessionOptions = {
      rejectUnauthorized,
      ...(tls ?? {}),
      // Plain-text prior-knowledge h2c (no upgrade dance).
      ...(isHttps ? {} : { allowHTTP1: false }),
    };

    try {
      session = http2.connect(url, connectOpts);
      session.on("error", (err) => {
        if (!settled) finish(reject, err);
      });

      req = session.request(h2Headers);
      req.setTimeout(timeoutMs, () => {
        req?.close();
        finish(
          reject,
          new Error(`Request timed out after ${timeoutMs}ms`),
        );
      });

      req.on("response", (incoming) => {
        timings.wait = timeMs();
        const status = Number(incoming[":status"] ?? 0);
        const statusText = STATUS_TEXT[status] ?? "";
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(incoming)) {
          if (key.startsWith(":")) continue;
          headers[key] = Array.isArray(value)
            ? value.join(", ")
            : String(value ?? "");
        }
        const eventBase = { status, statusText, headers };
        stream?.onResponse?.(eventBase);

        const chunks: Buffer[] = [];
        let totalSize = 0;
        let tooLarge = false;
        req!.on("data", (chunk) => {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalSize += buf.length;
          if (totalSize > MAX_RESPONSE_SIZE) {
            tooLarge = true;
            req?.destroy(
              new Error("Response exceeded maximum allowed size of 100MB"),
            );
            return;
          }
          stream?.onChunk?.({ ...eventBase, chunk: buf });
          chunks.push(buf);
        });
        req!.on("end", () => {
          if (tooLarge || settled) return;
          timings.receive = timeMs();
          finish(resolve, {
            status,
            statusText,
            headers,
            data: Buffer.concat(chunks),
            timings,
          });
        });
      });

      req.on("error", (err) => {
        finish(reject, err);
      });

      if (body !== undefined && body.length > 0) req.end(body);
      else req.end();
    } catch (err) {
      finish(reject, err);
    }
  });
}
