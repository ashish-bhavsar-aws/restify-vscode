import * as http from "http";
import * as https from "https";
import * as net from "net";
import * as tls from "tls";
import { MAX_RESPONSE_SIZE } from "./constants";
import { emptyTimings, type RequestTimings } from "./timings";

export interface RawHttpResult {
  status: number;
  statusText: string;
  headers: http.IncomingHttpHeaders;
  data: Buffer;
  /** F27: per-stage timings measured from the request start. */
  timings: RequestTimings;
}

const CANCELLED_ERROR = "Request cancelled";

export function isCancelledError(err: unknown): boolean {
  return err instanceof Error && err.message === CANCELLED_ERROR;
}

/**
 * Perform a single HTTP(S) request with timeout and abort support.
 * Resolves with the raw response bytes; caller is responsible for
 * decompression and content-negotiation.
 */
export function performHttpRequest(
  lib: typeof http | typeof https,
  options: http.RequestOptions,
  body: string | Buffer | undefined,
  timeoutMs: number,
  signal?: AbortSignal,
  onStage?: (stage: string, info: Record<string, unknown>) => void,
): Promise<RawHttpResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let req: http.ClientRequest | null = null;
    const timings = emptyTimings();
    const time0 = process.hrtime.bigint();
    const timeMs = (): number => Number(process.hrtime.bigint() - time0) / 1e6;

    const finish = (fn: (value: any) => void, value: any): void => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener("abort", onAbort);
      fn(value);
    };

    const onAbort = (): void => {
      if (req) req.destroy(new Error(CANCELLED_ERROR));
    };

    if (signal) {
      if (signal.aborted) {
        reject(new Error(CANCELLED_ERROR));
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      req = lib.request(options, (res) => {
        // First response byte (TTFB).
        timings.wait = timeMs();
        const chunks: Buffer[] = [];
        let totalSize = 0;
        let aborted = false;
        res.on("data", (chunk) => {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalSize += buf.length;
          if (totalSize > MAX_RESPONSE_SIZE) {
            aborted = true;
            req?.destroy(
              new Error("Response exceeded maximum allowed size of 100MB"),
            );
            return;
          }
          chunks.push(buf);
        });
        res.on("end", () => {
          if (aborted || settled) return;
          timings.receive = timeMs();
          onStage?.("end", {
            status: res.statusCode,
            size: Buffer.concat(chunks).length,
          });
          finish(resolve, {
            status: res.statusCode || 0,
            statusText: res.statusMessage || "",
            headers: res.headers,
            data: Buffer.concat(chunks),
            timings,
          });
        });
      });
    } catch (err) {
      finish(reject, err);
      return;
    }

    // F27: capture DNS / TCP / TLS stage timings off the underlying socket.
    req.on("socket", (socket: net.Socket) => {
      const onLookup = (): void => {
        timings.dns = timeMs();
      };
      const onConnect = (): void => {
        timings.connect = timeMs();
      };
      const onSecureConnect = (): void => {
        timings.secureConnect = timeMs();
      };
      socket.once("lookup", onLookup);
      socket.once("connect", onConnect);
      (socket as tls.TLSSocket).once("secureConnect", onSecureConnect);
      // Avoid leaking `once` listeners when a request is aborted before the
      // socket ever fires these events (e.g. cancelled during connection).
      req.once("close", () => {
        socket.removeListener("lookup", onLookup);
        socket.removeListener("connect", onConnect);
        socket.removeListener("secureConnect", onSecureConnect);
      });
    });
    // Request headers + body flushed.
    req.once("finish", () => {
      timings.send = timeMs();
    });

    req.on("error", (err) => {
      onStage?.("error", { message: err?.message || String(err) });
      finish(reject, err);
    });
    req.setTimeout(timeoutMs, () => {
      req?.destroy();
      onStage?.("timeout", { timeoutMs });
      finish(reject, new Error(`Request timed out after ${timeoutMs}ms`));
    });

    if (body) req.write(body);
    req.end();
  });
}
