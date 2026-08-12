/**
 * F50 — Interceptors / middleware.
 *
 * A small pipeline of hooks that wrap the request lifecycle (before the
 * request is sent, after the response arrives) plus a retry decision point.
 * Host-agnostic (`src/core` — no `vscode` imports) so it is shared by the
 * main panel and the collection runner, and unit-testable in isolation.
 *
 * Built-in interceptors:
 *   - retry   : retry transient failures (network errors and/or status codes)
 *   - logging : emit one line per request/response to a caller-supplied sink
 *
 * The pipeline (`runInterceptorPipeline`) drives a single "send attempt"
 * function. On each attempt it runs `beforeRequest` hooks, performs the
 * request, runs `afterResponse` hooks, then asks every interceptor for a
 * retry decision — the first non-undefined decision wins.
 */
import type { RawHttpResult } from "./http";

/** Normalized snapshot of the outgoing request passed to every hook. */
export interface InterceptorRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | Buffer;
}

/** Response shape observed by hooks. Alias of the transport result. */
export type InterceptorResponse = RawHttpResult;

export interface RetryDecision {
  retry: boolean;
  /** Delay before the next attempt, in ms. */
  delayMs?: number;
}

export interface RequestInterceptor {
  id: string;
  name: string;
  /**
   * Runs before each send attempt. May mutate `req` in place (e.g. inject a
   * header) — mutations persist across attempts.
   */
  beforeRequest?(req: InterceptorRequest, attempt: number): void | Promise<void>;
  /** Runs after a response is received on a given attempt. */
  afterResponse?(
    res: InterceptorResponse,
    attempt: number,
  ): void | Promise<void>;
  /**
   * Asked after each attempt (success or failure). Return `{ retry: true }`
   * to retry, `{ retry: false }` to veto, or `undefined` for no opinion.
   */
  shouldRetry?(
    attempt: number,
    error?: Error,
    res?: InterceptorResponse,
  ): RetryDecision | undefined | Promise<RetryDecision | undefined>;
}

/** Retry interceptor configuration (also the persisted settings shape). */
export interface RetryInterceptorSettings {
  enabled: boolean;
  /** Total attempts including the first (1 = no retries). */
  maxAttempts: number;
  /** Delay between attempts, in ms. */
  retryDelayMs: number;
  /** Status codes that trigger a retry. */
  retryStatuses: number[];
  /** Retry on transport/network errors too. */
  retryOnNetworkError: boolean;
}

/** Logging interceptor configuration. */
export interface LoggingInterceptorSettings {
  enabled: boolean;
  /** Include the request headers in the log line. */
  logHeaders: boolean;
}

export interface InterceptorSettings {
  retry: RetryInterceptorSettings;
  logging: LoggingInterceptorSettings;
}

export const DEFAULT_RETRY_INTERCEPTOR: RetryInterceptorSettings = {
  enabled: false,
  maxAttempts: 3,
  retryDelayMs: 500,
  retryStatuses: [429, 500, 502, 503, 504],
  retryOnNetworkError: true,
};

export const DEFAULT_LOGGING_INTERCEPTOR: LoggingInterceptorSettings = {
  enabled: false,
  logHeaders: false,
};

export const DEFAULT_INTERCEPTORS: InterceptorSettings = {
  retry: { ...DEFAULT_RETRY_INTERCEPTOR },
  logging: { ...DEFAULT_LOGGING_INTERCEPTOR },
};

/** Build the active interceptor list from persisted settings. */
export function buildRequestInterceptors(
  settings: { interceptors?: Partial<InterceptorSettings> },
  opts: { log?: (line: string) => void } = {},
): RequestInterceptor[] {
  const interceptors: RequestInterceptor[] = [];
  const retry = settings.interceptors?.retry;
  if (retry?.enabled) {
    interceptors.push(
      retryInterceptor({
        maxAttempts: Math.max(1, retry.maxAttempts ?? DEFAULT_RETRY_INTERCEPTOR.maxAttempts),
        retryDelayMs: Math.max(0, retry.retryDelayMs ?? DEFAULT_RETRY_INTERCEPTOR.retryDelayMs),
        retryStatuses: retry.retryStatuses ?? DEFAULT_RETRY_INTERCEPTOR.retryStatuses,
        retryOnNetworkError: retry.retryOnNetworkError ?? DEFAULT_RETRY_INTERCEPTOR.retryOnNetworkError,
      }),
    );
  }
  const logging = settings.interceptors?.logging;
  if (logging?.enabled && opts.log) {
    interceptors.push(
      loggingInterceptor(opts.log, {
        logHeaders: logging.logHeaders ?? DEFAULT_LOGGING_INTERCEPTOR.logHeaders,
      }),
    );
  }
  return interceptors;
}

export function retryInterceptor(config: {
  maxAttempts: number;
  retryDelayMs: number;
  retryStatuses: number[];
  retryOnNetworkError: boolean;
}): RequestInterceptor {
  return {
    id: "retry",
    name: "Retry",
    shouldRetry(attempt, error, res) {
      if (attempt >= config.maxAttempts) return { retry: false };
      if (error) {
        return config.retryOnNetworkError
          ? { retry: true, delayMs: config.retryDelayMs }
          : { retry: false };
      }
      if (res && config.retryStatuses.includes(res.status)) {
        return { retry: true, delayMs: config.retryDelayMs };
      }
      return { retry: false };
    },
  };
}

function formatHeadersForLog(headers: Record<string, string>): string {
  return Object.entries(headers)
    .filter(([, v]) => typeof v === "string")
    .map(([k, v]) => `    ${k}: ${v}`)
    .join("\n");
}

function responseSizeBytes(res: InterceptorResponse): number {
  return res.data?.length ?? 0;
}

export function loggingInterceptor(
  log: (line: string) => void,
  config: { logHeaders: boolean },
): RequestInterceptor {
  return {
    id: "logging",
    name: "HTTP Log",
    beforeRequest(req, attempt) {
      const prefix = attempt > 1 ? `[attempt ${attempt}] ` : "";
      const line = `${prefix}-> ${req.method} ${req.url}`;
      if (config.logHeaders && Object.keys(req.headers).length > 0) {
        log(`${line}\n${formatHeadersForLog(req.headers)}`);
      } else {
        log(line);
      }
    },
    afterResponse(res, attempt) {
      const prefix = attempt > 1 ? `[attempt ${attempt}] ` : "";
      const size = responseSizeBytes(res);
      log(
        `${prefix}<- ${res.status} ${res.statusText || ""} (${size} bytes)`,
      );
    },
  };
}

function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Aborted"));
      return;
    }
    if (!signal) {
      setTimeout(resolve, ms);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export interface InterceptorPipelineOptions {
  request: InterceptorRequest;
  interceptors: RequestInterceptor[];
  /** Performs a single send attempt. */
  perform: (req: InterceptorRequest) => Promise<InterceptorResponse>;
  /** Overall attempt cap (safety net above interceptor configs). */
  maxAttempts?: number;
  signal?: AbortSignal;
}

/**
 * Drive the interceptor pipeline around `perform`. Retries when an
 * interceptor requests one, honoring the abort signal between attempts.
 */
export async function runInterceptorPipeline(
  opts: InterceptorPipelineOptions,
): Promise<InterceptorResponse> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 10);
  const interceptors = opts.interceptors || [];
  let attempt = 1;

  for (;;) {
    if (opts.signal?.aborted) {
      throw opts.signal.reason ?? new Error("Request cancelled");
    }

    for (const interceptor of interceptors) {
      await interceptor.beforeRequest?.(opts.request, attempt);
    }

    let error: Error | undefined;
    let response: InterceptorResponse | undefined;
    try {
      response = await opts.perform(opts.request);
      for (const interceptor of interceptors) {
        await interceptor.afterResponse?.(response, attempt);
      }
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
    }

    let decision: RetryDecision | undefined;
    for (const interceptor of interceptors) {
      const d = await interceptor.shouldRetry?.(attempt, error, response);
      if (d !== undefined) {
        decision = d;
        break;
      }
    }

    if (decision?.retry && attempt < maxAttempts) {
      const delay = decision.delayMs ?? 0;
      if (delay > 0) {
        await sleepWithSignal(delay, opts.signal);
      }
      attempt++;
      continue;
    }

    if (error) throw error;
    return response as InterceptorResponse;
  }
}
