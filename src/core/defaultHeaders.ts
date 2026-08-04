import { randomUUID } from "crypto";
import { hasHeader, setHeader } from "./headers";

export interface DefaultHeadersConfig {
  userAgent: boolean;
  requestId: boolean;
  correlationId: boolean;
  date: boolean;
}

/**
 * Inject switchable default headers (User-Agent, X-Request-Id,
 * X-Correlation-Id, Date) into a request's header map. Each header is only
 * injected when the caller hasn't already set it explicitly (case-insensitive),
 * so user-defined headers always win.
 */
export function applyDefaultHeaders(
  headers: Record<string, string>,
  config: DefaultHeadersConfig | undefined,
  version: string,
  now: () => Date = () => new Date(),
): void {
  if (!config) return;

  if (config.userAgent && !hasHeader(headers, "User-Agent")) {
    setHeader(headers, "User-Agent", `Restify/${version}`);
  }
  if (config.requestId && !hasHeader(headers, "X-Request-Id")) {
    setHeader(headers, "X-Request-Id", randomUUID());
  }
  if (config.correlationId && !hasHeader(headers, "X-Correlation-Id")) {
    setHeader(headers, "X-Correlation-Id", randomUUID());
  }
  if (config.date && !hasHeader(headers, "Date")) {
    setHeader(headers, "Date", now().toUTCString());
  }
}
