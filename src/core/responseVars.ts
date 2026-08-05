import { getHeaderArray, normalizeResponseHeaders } from "./headers";

/**
 * Request chaining — expose the last response so later requests can reference
 * it with `{{response.*}}` tokens without writing a post-script:
 *
 *   {{response.status}}                    → 200
 *   {{response.body}}                      → raw response body (string)
 *   {{response.headers.content-type}}      → header value (case-insensitive)
 *   {{response.$.token}}                   → JSONPath lookup against the parsed body
 *   {{response.$.items.0.name}}            → nested + array index
 *
 * Kept free of vscode/webview dependencies for unit-testability.
 */

export interface ResponseVarsContext {
  status?: number;
  statusText?: string;
  headers?: Record<string, string | string[] | undefined>;
  /** Raw response body (string form). */
  body?: string;
}

const TOKEN_RE = /\{\{\s*response\.([^{}]+)\s*\}\}/g;

/**
 * Navigate a dot/bracket JSONPath against an arbitrary JSON value.
 * Accepted forms: `token`, `$.token`, `a.b.c`, `items.0.name`,
 * `items[0].name`, `a["b c"]`, `a['b.c']`. Returns undefined when any
 * segment is missing or the value is absent.
 */
export function queryJsonPath(root: unknown, path: string): unknown {
  if (root === null || root === undefined) return undefined;
  let cleaned = path.trim().replace(/^\$/, "");
  if (cleaned && !cleaned.startsWith(".") && !cleaned.startsWith("[")) {
    cleaned = "." + cleaned;
  }
  const re = /\.([^.[\]"]+)|\[(\d+)\]|\["([^"]+)"\]|\['([^']+)'\]/g;
  const segments: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    segments.push(m[1] ?? m[2] ?? m[3] ?? m[4]);
  }

  let value: unknown = root;
  for (const seg of segments) {
    if (value === null || value === undefined) return undefined;
    if (Array.isArray(value)) {
      value = /^\d+$/.test(seg) ? value[Number(seg)] : undefined;
    } else if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      value = Object.prototype.hasOwnProperty.call(record, seg)
        ? record[seg]
        : undefined;
    } else {
      return undefined;
    }
  }
  return value;
}

function resolveJsonPathToken(name: string, ctx: ResponseVarsContext): string | undefined {
  let json: unknown;
  try {
    json = ctx.body ? JSON.parse(ctx.body) : undefined;
  } catch {
    json = undefined;
  }
  if (json === undefined) return undefined;
  const value = queryJsonPath(json, name.replace(/^\$/, ""));
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function resolveSimpleToken(
  name: string,
  ctx: ResponseVarsContext,
): string | undefined {
  const lower = name.toLowerCase();
  if (lower === "status") return ctx.status !== undefined ? String(ctx.status) : undefined;
  if (lower === "statustext") return ctx.statusText;
  if (lower === "body") return ctx.body;
  if (lower.startsWith("headers.") || lower.startsWith("header.")) {
    const headerName = name.slice(lower.startsWith("headers.") ? 8 : 7);
    if (ctx.headers) {
      const values = getHeaderArray(
        ctx.headers as Record<string, string | string[]>,
        headerName,
      );
      if (values.length === 0) return undefined;
      return values.join("; ");
    }
  }
  if (lower === "$" || lower.startsWith("$.") || lower.startsWith("$[")) {
    return resolveJsonPathToken(name, ctx);
  }
  return undefined;
}

/**
 * Resolve every `{{response.*}}` token in a string against the given context.
 * Unknown/missing tokens are left as-is so the user can fix them.
 */
export function resolveResponseVariables(
  text: string,
  ctx: ResponseVarsContext | undefined,
): string {
  if (!ctx) return text;
  return text.replace(TOKEN_RE, (full, name: string) => {
    const resolved = resolveSimpleToken(name.trim(), ctx);
    return resolved !== undefined ? resolved : full;
  });
}

/** List all `{{response.*}}` tokens referenced in a string (for validation). */
export function extractResponseTokens(text: string): string[] {
  const tokens: string[] = [];
  const re = new RegExp(TOKEN_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push(`response.${m[1].trim()}`);
  }
  return tokens;
}

/**
 * Build an inventory of available `{{response.*}}` tokens from a context, for
 * a picker UI. Includes status/body/header tokens plus one token per top-level
 * key of the parsed JSON body.
 */
export function collectResponseVariableTokens(
  ctx: ResponseVarsContext,
): string[] {
  const tokens: string[] = [];
  if (ctx.status !== undefined) tokens.push("response.status");
  tokens.push("response.body");
  if (ctx.headers) {
    Object.keys(ctx.headers).forEach((k) =>
      tokens.push(`response.headers.${k}`),
    );
  }
  if (ctx.body) {
    try {
      const json = JSON.parse(ctx.body);
      if (json && typeof json === "object") {
        Object.keys(json as Record<string, unknown>).forEach((k) =>
          tokens.push(`response.$.${k}`),
        );
      }
    } catch {
      /* not JSON — no path tokens */
    }
  }
  return tokens;
}

/** Normalize a raw headers object into the shape resolveResponseVariables expects. */
export function toResponseVarsContext(input: {
  status?: number;
  statusText?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
}): ResponseVarsContext {
  return {
    status: input.status,
    statusText: input.statusText,
    headers: input.headers
      ? normalizeResponseHeaders(input.headers as any)
      : undefined,
    body: input.body,
  };
}
