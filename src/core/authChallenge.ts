/**
 * Challenge-response auth retry (F12): given a 401 response advertising
 * `WWW-Authenticate`, computes the Authorization header and retries the
 * request once. Handles HTTP Digest (RFC 7616) and NTLM (Type 1 → Type 2 →
 * Type 3 handshake).
 *
 * Extracted from RestifyPanel so the panel keeps a single call site.
 */

import { getHeader, setHeader } from "./headers";
import { buildDigestAuthorization } from "./auth";
import {
  buildNtlmType1,
  buildNtlmType3,
  parseNtlmType2,
  parseWwwAuthenticateNtlm,
  ntlmAuthorizationHeader,
  type NtlmCredentials,
} from "./ntlm";

/** Minimal result shape the retry logic needs (RequestResult-compatible). */
export interface ChallengeAuthResult {
  status: number;
  headers: Record<string, string | string[]>;
}

export interface ChallengeAuthRequestOptions {
  followRedirects?: boolean;
  maxRedirects?: number;
  timeout?: number;
  signal?: AbortSignal;
}

export interface ChallengeAuthLogger {
  append(title: string, message: string, level: "info" | "error"): void;
}

export interface DigestChallengeCredentials {
  scheme: "digest";
  username: string;
  password: string;
  method: string;
  url: string;
  body?: string | Buffer;
}

export type NtlmChallengeCredentials = {
  scheme: "ntlm";
} & NtlmCredentials;

export type ChallengeCredentials =
  DigestChallengeCredentials | NtlmChallengeCredentials;

export interface ChallengeRequestContext {
  method: string;
  url: string;
  body?: string | Buffer;
}

/** Subset of `AuthDataLike` consumed by challenge-based auth types. */
export interface ChallengeAuthData {
  digestUsername?: string;
  digestPassword?: string;
  ntlmUsername?: string;
  ntlmPassword?: string;
  ntlmDomain?: string;
  ntlmWorkstation?: string;
}

/**
 * Resolve credentials for a challenge-based auth type (digest / NTLM), or null
 * for any other type. `resolve` applies variable substitution to each field.
 */
export function buildChallengeCredentials(
  authType: string,
  authData: ChallengeAuthData,
  ctx: ChallengeRequestContext,
  resolve: (value: string) => string,
): ChallengeCredentials | null {
  if (authType === "digest") {
    return {
      scheme: "digest",
      username: resolve(authData.digestUsername ?? ""),
      password: resolve(authData.digestPassword ?? ""),
      method: ctx.method,
      url: ctx.url,
      body: ctx.body,
    };
  }
  if (authType === "ntlm") {
    return {
      scheme: "ntlm",
      username: resolve(authData.ntlmUsername ?? ""),
      password: resolve(authData.ntlmPassword ?? ""),
      domain: resolve(authData.ntlmDomain ?? ""),
      workstation: resolve(authData.ntlmWorkstation ?? ""),
    };
  }
  return null;
}

/**
 * Retry a 401 response once with the computed challenge response.
 * Mutates `headers` (writes the Authorization header). `transport` must reuse
 * the same `headers` object, mirroring how the caller performs its own
 * requests. Returns the original result when no challenge applies or the retry
 * cannot be completed.
 */
export async function retryWithChallengeAuth<T extends ChallengeAuthResult>(
  initialResult: T,
  creds: ChallengeCredentials,
  headers: Record<string, string>,
  transport: (options: ChallengeAuthRequestOptions) => Promise<T>,
  options: ChallengeAuthRequestOptions,
  log?: ChallengeAuthLogger,
): Promise<T> {
  const wwwAuth = getHeader(initialResult.headers, "www-authenticate");
  if (!wwwAuth) return initialResult;

  if (creds.scheme === "digest") {
    if (!/^\s*digest\b/i.test(wwwAuth)) return initialResult;
    try {
      const authValue = buildDigestAuthorization(
        wwwAuth,
        { method: creds.method, url: creds.url, body: creds.body },
        creds,
      );
      setHeader(headers, "Authorization", authValue);
      const finalResult = await transport(options);
      log?.append(
        "Digest auth",
        "Retried the request with the digest challenge response.",
        "info",
      );
      return finalResult;
    } catch (err) {
      log?.append(
        "Digest auth failed",
        err instanceof Error ? err.message : String(err),
        "error",
      );
      return initialResult;
    }
  }

  // NTLM: Type 1 negotiate → Type 2 challenge → Type 3 authenticate.
  if (parseWwwAuthenticateNtlm(wwwAuth) === null) return initialResult;
  try {
    setHeader(
      headers,
      "Authorization",
      ntlmAuthorizationHeader(buildNtlmType1()),
    );
    const type1Result = await transport(options);
    if (type1Result.status !== 401) return type1Result;
    const type2WwwAuth = getHeader(type1Result.headers, "www-authenticate");
    const type2Token = type2WwwAuth
      ? parseWwwAuthenticateNtlm(type2WwwAuth)
      : null;
    const type2 = type2Token ? parseNtlmType2(type2Token) : null;
    if (!type2) return type1Result;
    setHeader(
      headers,
      "Authorization",
      ntlmAuthorizationHeader(buildNtlmType3(type2, creds)),
    );
    const finalResult = await transport(options);
    log?.append(
      "NTLM auth",
      "Authenticated via NTLM challenge-response.",
      "info",
    );
    return finalResult;
  } catch (err) {
    log?.append(
      "NTLM auth failed",
      err instanceof Error ? err.message : String(err),
      "error",
    );
    return initialResult;
  }
}
