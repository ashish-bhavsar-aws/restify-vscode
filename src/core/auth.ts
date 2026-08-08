/**
 * Authentication header builders (F12).
 *
 * Pure host-side logic (Node `crypto`) so the webview never needs to sign or
 * hash anything. Each builder is a pure function of its inputs and the request
 * context, which keeps the module unit-testable in isolation.
 *
 * Supported schemes:
 *  - bearer / basic / apikey / oauth2 (moved here from the webview + runner)
 *  - jwt (HS256/384/512, RS256/384/512, ES256/384/512)
 *  - awssigv4 (AWS Signature Version 4)
 *  - digest (RFC 7616 — round-trip driven by the caller)
 *  - hawk (basic MAC authentication)
 */

import { createHash, createHmac, createSign, randomBytes } from "crypto";

import { setHeader, hasHeader } from "./headers";
import { extractBasicAuthFromUrl } from "./url";

export type JwtAlgorithm =
  | "HS256"
  | "HS384"
  | "HS512"
  | "RS256"
  | "RS384"
  | "RS512"
  | "ES256"
  | "ES384"
  | "ES512";

export interface AuthDataLike {
  token?: string;
  username?: string;
  password?: string;
  keyName?: string;
  keyValue?: string;
  addTo?: "header" | "query";
  accessToken?: string;
  digestUsername?: string;
  digestPassword?: string;
  awsAccessKey?: string;
  awsSecretKey?: string;
  awsSessionToken?: string;
  awsRegion?: string;
  awsService?: string;
  jwtAlgorithm?: JwtAlgorithm;
  jwtSecret?: string;
  jwtPrivateKey?: string;
  jwtKeyId?: string;
  jwtIssuer?: string;
  jwtSubject?: string;
  jwtAudience?: string;
  jwtClaims?: string;
  jwtExpiresIn?: string;
  jwtHeaderName?: string;
  hawkId?: string;
  hawkKey?: string;
  hawkAlgorithm?: "sha256" | "sha1";
}

export type AuthType =
  | "none"
  | "bearer"
  | "basic"
  | "apikey"
  | "oauth2"
  | "digest"
  | "awssigv4"
  | "jwt"
  | "hawk"
  | "inherit";

export interface ApplyAuthContext {
  resolve: (s: string) => string;
  method: string;
  url: string;
  body?: string | Buffer;
  headers?: Record<string, string>;
  now?: Date;
}

export interface ApplyAuthResult {
  headers: Record<string, string>;
  /** Updated URL when the scheme appends a query parameter. */
  url?: string;
}

/* ─────────────────────────────────────────────────────────────
 * Shared helpers
 * ───────────────────────────────────────────────────────────── */

function hex(data: string | Buffer, algorithm = "sha256"): string {
  return createHash(algorithm).update(data).digest("hex");
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(
    padded + "=".repeat((4 - (padded.length % 4)) % 4),
    "base64",
  );
}

function parseDuration(value: string): number {
  const trimmed = value.trim();
  const match = /^(\d+)\s*([smhd]?)$/i.exec(trimmed);
  if (!match) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : 3600;
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case "s":
      return amount;
    case "m":
      return amount * 60;
    case "h":
      return amount * 3600;
    case "d":
      return amount * 86400;
    default:
      return amount;
  }
}

/* ─────────────────────────────────────────────────────────────
 * JWT (RFC 7519)
 * ───────────────────────────────────────────────────────────── */

const HMAC_ALGORITHM: Record<string, "sha256" | "sha384" | "sha512"> = {
  HS256: "sha256",
  HS384: "sha384",
  HS512: "sha512",
};

const SIGN_HASH: Record<string, "sha256" | "sha384" | "sha512"> = {
  RS256: "sha256",
  RS384: "sha384",
  RS512: "sha512",
  ES256: "sha256",
  ES384: "sha384",
  ES512: "sha512",
};

/**
 * Convert a DER-encoded ECDSA signature (as produced by Node's `crypto.sign`)
 * into the raw R||S form required by JOSE ES* algorithms.
 */
function derToRawSignature(sig: Buffer, keyBytes: number): Buffer {
  let offset = 0;
  if (sig[offset] !== 0x30) throw new Error("Invalid DER signature");
  offset += 2;
  if (sig[offset] !== 0x02) throw new Error("Invalid DER signature");
  let len = sig[offset + 1];
  offset += 2;
  if (len > 0x80) {
    const numBytes = len - 0x80;
    len = Number(sig.subarray(offset, offset + numBytes).readUIntBE(0, numBytes));
    offset += numBytes;
  }
  let r = sig.subarray(offset, offset + len);
  offset += len;
  if (sig[offset] !== 0x02) throw new Error("Invalid DER signature");
  len = sig[offset + 1];
  offset += 2;
  if (len > 0x80) {
    const numBytes = len - 0x80;
    len = Number(sig.subarray(offset, offset + numBytes).readUIntBE(0, numBytes));
    offset += numBytes;
  }
  let s = sig.subarray(offset, offset + len);
  // Strip leading zero bytes used for positive-integer padding.
  while (r.length > keyBytes && r[0] === 0) r = r.subarray(1);
  while (s.length > keyBytes && s[0] === 0) s = s.subarray(1);
  if (r.length > keyBytes || s.length > keyBytes) {
    throw new Error("ECDSA signature component too long");
  }
  const result = Buffer.alloc(keyBytes * 2);
  r.copy(result, keyBytes - r.length);
  s.copy(result, keyBytes * 2 - s.length);
  return result;
}

export interface SignJwtOptions {
  algorithm: JwtAlgorithm;
  secret?: string;
  privateKey?: string;
  keyId?: string;
  issuer?: string;
  subject?: string;
  audience?: string;
  claims?: string;
  expiresIn?: string;
  now?: Date;
}

/** Sign a JWT with the configured algorithm and return the compact token. */
export function signJwt(options: SignJwtOptions): string {
  const nowSec = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const header: Record<string, string> = { alg: options.algorithm, typ: "JWT" };
  if (options.keyId) header.kid = options.keyId;
  const payload: Record<string, unknown> = { iat: nowSec };
  if (options.issuer) payload.iss = options.issuer;
  if (options.subject) payload.sub = options.subject;
  if (options.audience) payload.aud = options.audience;
  if (options.claims) {
    try {
      const extra = JSON.parse(options.claims);
      if (extra && typeof extra === "object") Object.assign(payload, extra);
    } catch {
      /* ignore malformed claims */
    }
  }
  if (options.expiresIn) payload.exp = nowSec + parseDuration(options.expiresIn);

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload),
  )}`;

  let signature: Buffer;
  if (options.algorithm in HMAC_ALGORITHM) {
    signature = createHmac(HMAC_ALGORITHM[options.algorithm], options.secret ?? "")
      .update(signingInput)
      .digest();
  } else {
    if (!options.privateKey) throw new Error("JWT: private key required for signing");
    const sign = createSign(SIGN_HASH[options.algorithm]);
    sign.update(signingInput);
    sign.end();
    const der = sign.sign(options.privateKey);
    if (options.algorithm.startsWith("ES")) {
      const bits = Number(options.algorithm.slice(2));
      const keyBytes = Math.ceil(bits / 8);
      signature = derToRawSignature(der, keyBytes);
    } else {
      signature = der;
    }
  }

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

/** Verify an HMAC JWT (used by tests). Asymmetric verification requires keys. */
export function verifyHmacJwt(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  try {
    const header = JSON.parse(base64UrlDecode(headerB64).toString("utf8")) as { alg: string };
    if (!(header.alg in HMAC_ALGORITHM)) return null;
    const expected = createHmac(HMAC_ALGORITHM[header.alg], secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");
    if (expected !== sigB64) return null;
    return JSON.parse(base64UrlDecode(payloadB64).toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────
 * AWS Signature Version 4
 * ───────────────────────────────────────────────────────────── */

const AWS_UNRESERVED = /[A-Za-z0-9\-_.~]/;

function awsUriEncode(value: string, encodeSlash = false): string {
  let out = "";
  for (const ch of value) {
    if (AWS_UNRESERVED.test(ch) || (!encodeSlash && ch === "/")) {
      out += ch;
    } else {
      for (const byte of Buffer.from(ch, "utf8")) {
        out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
      }
    }
  }
  return out;
}

function canonicalPath(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => awsUriEncode(segment))
    .join("/");
}

function canonicalQueryString(url: string): string {
  const qIndex = url.indexOf("?");
  if (qIndex === -1) return "";
  const params: Array<[string, string]> = [];
  for (const pair of url.slice(qIndex + 1).split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const key = eq === -1 ? pair : pair.slice(0, eq);
    const value = eq === -1 ? "" : pair.slice(eq + 1);
    params.push([awsUriEncode(key), awsUriEncode(value)]);
  }
  params.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return params.map(([k, v]) => `${k}=${v}`).join("&");
}

function canonicalHeaders(
  headers: Record<string, string>,
  url: string,
): { canonical: string; signed: string[] } {
  const parsed = new URL(url);
  const host = parsed.hostname + (parsed.port ? `:${parsed.port}` : "");
  const included: Record<string, string> = { host };
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (lower === "host" || lower.startsWith("proxy-")) continue;
    if (
      lower === "user-agent" ||
      lower === "accept-encoding" ||
      lower === "connection" ||
      lower === "content-length" ||
      lower === "transfer-encoding" ||
      lower === "authorization" ||
      lower === "cookie" ||
      lower === "accept"
    ) {
      continue;
    }
    included[lower] = value.trim().replace(/\s+/g, " ");
  }
  const signed = Object.keys(included).sort();
  const canonical = signed.map((k) => `${k}:${included[k]}\n`).join("");
  return { canonical, signed };
}

export interface SigV4Options {
  accessKey: string;
  secretKey: string;
  sessionToken?: string;
  region: string;
  service: string;
}

export function buildSigV4Headers(
  options: SigV4Options,
  ctx: Pick<ApplyAuthContext, "method" | "url" | "body" | "now" | "headers">,
): Record<string, string> {
  const method = ctx.method.toUpperCase();
  const now = ctx.now ?? new Date();
  const amzDate = now
    .toISOString()
    .replace(/[:-]/g, "")
    .replace(/\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const parsed = new URL(ctx.url);
  const payloadHash =
    ctx.body !== undefined && ctx.body !== ""
      ? hex(ctx.body)
      : hex("");
  const scope = `${dateStamp}/${options.region}/${options.service}/aws4_request`;

  // Temporary header set includes the auth headers we are about to add, plus
  // the user-supplied request headers, so the canonical headers reflect what
  // the server will actually see.
  const candidate: Record<string, string> = {
    ...(ctx.headers ?? {}),
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
  };
  if (options.sessionToken) {
    candidate["x-amz-security-token"] = options.sessionToken;
  }
  const { canonical, signed } = canonicalHeaders(candidate, ctx.url);

  const canonicalRequest = [
    method,
    canonicalPath(parsed.pathname),
    canonicalQueryString(ctx.url),
    canonical,
    signed.join(";"),
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    hex(canonicalRequest),
  ].join("\n");

  const kDate = createHmac("sha256", `AWS4${options.secretKey}`)
    .update(dateStamp)
    .digest();
  const kRegion = createHmac("sha256", kDate).update(options.region).digest();
  const kService = createHmac("sha256", kRegion).update(options.service).digest();
  const kSigning = createHmac("sha256", kService).update("aws4_request").digest();
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign)
    .digest("hex");

  const headers: Record<string, string> = {
    "X-Amz-Date": amzDate,
    "X-Amz-Content-SHA256": payloadHash,
    Authorization: `AWS4-HMAC-SHA256 Credential=${options.accessKey}/${scope}, SignedHeaders=${signed.join(
      ";",
    )}, Signature=${signature}`,
  };
  if (options.sessionToken) {
    headers["X-Amz-Security-Token"] = options.sessionToken;
  }
  return headers;
}

/* ─────────────────────────────────────────────────────────────
 * HTTP Digest (RFC 7616)
 * ───────────────────────────────────────────────────────────── */

interface DigestChallenge {
  realm?: string;
  nonce?: string;
  opaque?: string;
  algorithm: string;
  qop?: string[];
  charset?: string;
}

function parseAuthChallenge(challenge: string): DigestChallenge {
  const params: Record<string, string> = {};
  const rest = challenge.replace(/^\s*digest\s+/i, "");
  const regex = /([a-zA-Z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,\s]+))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(rest)) !== null) {
    params[match[1].toLowerCase()] = (match[2] ?? match[3]).replace(/\\(.)/g, "$1");
  }
  const qop = (params["qop"] ?? "")
    .split(",")
    .map((q) => q.trim())
    .filter(Boolean);
  return {
    realm: params["realm"],
    nonce: params["nonce"],
    opaque: params["opaque"],
    algorithm: params["algorithm"] || "MD5",
    qop: qop.length > 0 ? qop : undefined,
    charset: params["charset"],
  };
}

function digestHash(algorithm: string, value: string): string {
  return hex(value, algorithm.includes("SHA-256") ? "sha256" : "md5");
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export interface DigestAuthOptions {
  username: string;
  password: string;
  /** Injectable for deterministic tests; random by default. */
  cnonce?: string;
  nc?: string;
}

/**
 * Build the `Authorization: Digest ...` header for a challenge that was sent
 * in a 401 `WWW-Authenticate` response.
 */
export function buildDigestAuthorization(
  challenge: string,
  ctx: Pick<ApplyAuthContext, "method" | "url" | "body" | "now">,
  creds: DigestAuthOptions,
): string {
  const parsed = parseAuthChallenge(challenge);
  if (!parsed.nonce) throw new Error("Digest challenge missing nonce");
  const baseAlgo = parsed.algorithm.replace(/-sess$/i, "").toUpperCase();
  const sess = /-sess$/i.test(parsed.algorithm);

  const uri = (() => {
    const parsedUrl = new URL(ctx.url);
    return parsedUrl.pathname + (parsedUrl.search || "");
  })();

  const useQop = parsed.qop && parsed.qop.includes("auth");
  const useAuthInt = parsed.qop && parsed.qop.includes("auth-int");
  const qopValue = useQop ? "auth" : useAuthInt ? "auth-int" : undefined;

  const cnonce = creds.cnonce ?? randomBytes(16).toString("hex");
  const nc = creds.nc ?? "00000001";

  const hasher = (s: string) => digestHash(baseAlgo, s);
  const ha1Base = hasher(`${creds.username}:${parsed.realm ?? ""}:${creds.password}`);
  const ha1 = sess ? hasher(`${ha1Base}:${parsed.nonce}:${cnonce}`) : ha1Base;

  let ha2: string;
  if (qopValue === "auth-int") {
    const bodyHash = ctx.body !== undefined && ctx.body !== "" ? hex(ctx.body) : hex("");
    ha2 = hasher(`${ctx.method.toUpperCase()}:${uri}:${bodyHash}`);
  } else {
    ha2 = hasher(`${ctx.method.toUpperCase()}:${uri}`);
  }

  let response: string;
  if (qopValue) {
    response = hasher(`${ha1}:${parsed.nonce}:${nc}:${cnonce}:${qopValue}:${ha2}`);
  } else {
    response = hasher(`${ha1}:${parsed.nonce}:${ha2}`);
  }

  const parts = [
    `username=${quote(creds.username)}`,
    `realm=${quote(parsed.realm ?? "")}`,
    `nonce=${quote(parsed.nonce)}`,
    `uri=${quote(uri)}`,
    `algorithm=${parsed.algorithm}`,
  ];
  if (qopValue) parts.push(`qop=${qopValue}`, `nc=${nc}`, `cnonce=${quote(cnonce)}`);
  parts.push(`response=${quote(response)}`);
  if (parsed.opaque) parts.push(`opaque=${quote(parsed.opaque)}`);
  return `Digest ${parts.join(", ")}`;
}

/* ─────────────────────────────────────────────────────────────
 * Hawk (basic MAC authentication)
 * ───────────────────────────────────────────────────────────── */

export interface HawkAuthOptions {
  id: string;
  key: string;
  algorithm?: "sha256" | "sha1";
}

export function buildHawkAuthorization(
  options: HawkAuthOptions,
  ctx: Pick<ApplyAuthContext, "method" | "url" | "body" | "now">,
): Record<string, string> {
  const algorithm = options.algorithm ?? "sha256";
  const now = ctx.now ?? new Date();
  const ts = Math.floor(now.getTime() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const parsed = new URL(ctx.url);
  const host = parsed.hostname;
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  const resource = parsed.pathname + (parsed.search || "");

  const hashHeader = (() => {
    if (ctx.body === undefined || ctx.body === "") return undefined;
    return Buffer.from(hex(ctx.body)).toString("base64");
  })();

  const normalized = [
    "hawk.1.header",
    ts,
    nonce,
    ctx.method.toUpperCase(),
    resource,
    host,
    port,
    hashHeader ?? "",
    "",
    "",
    "",
  ].join("\n");

  const mac = createHmac(algorithm, options.key).update(normalized).digest("base64");

  const parts = [
    `id="${options.id}"`,
    `ts="${ts}"`,
    `nonce="${nonce}"`,
    `mac="${mac}"`,
  ];
  if (hashHeader) parts.push(`hash="${hashHeader}"`);
  const headers: Record<string, string> = {
    Authorization: `Hawk ${parts.join(", ")}`,
  };
  if (hashHeader) headers.Hash = hashHeader;
  return headers;
}

/* ─────────────────────────────────────────────────────────────
 * Inherit-from-collection resolution
 * ───────────────────────────────────────────────────────────── */

export interface CollectionAuthLike {
  authType?: AuthType;
  authData?: AuthDataLike;
}

export function resolveAuthForRequest(
  authType: AuthType | undefined,
  authData: AuthDataLike | undefined,
  collectionAuth: CollectionAuthLike | undefined,
): { authType: AuthType; authData: AuthDataLike } {
  if (authType === "inherit") {
    if (
      collectionAuth &&
      collectionAuth.authType &&
      collectionAuth.authType !== "none"
    ) {
      return {
        authType: collectionAuth.authType,
        authData: collectionAuth.authData ?? {},
      };
    }
    return { authType: "none", authData: {} };
  }
  return { authType: authType ?? "none", authData: authData ?? {} };
}

/* ─────────────────────────────────────────────────────────────
 * Top-level auth header application
 * ───────────────────────────────────────────────────────────── */

/**
 * Apply the configured auth scheme to a request. Mutates `headers` and returns
 * the header set plus an optional updated URL (used by API-key-in-query).
 *
 * `digest` and `ntlm` are challenge-response schemes and are intentionally not
 * handled here — callers perform the 401 round-trip and then use
 * `buildDigestAuthorization`.
 */
export function applyAuthHeaders(
  headers: Record<string, string>,
  authType: AuthType,
  authData: AuthDataLike,
  ctx: ApplyAuthContext,
): ApplyAuthResult {
  const result: ApplyAuthResult = { headers };
  const resolve = ctx.resolve;

  // F19: `https://user:pass@host/` credentials become a Basic Authorization
  // header (fallback only, so explicit auth config still wins) and are
  // stripped from the URL so they are never logged or sent on the wire.
  const urlAuth = extractBasicAuthFromUrl(ctx.url);
  if (urlAuth.url !== ctx.url) {
    result.url = urlAuth.url;
    if (urlAuth.username && !hasHeader(headers, "Authorization")) {
      setHeader(
        headers,
        "Authorization",
        `Basic ${Buffer.from(`${urlAuth.username}:${urlAuth.password}`).toString("base64")}`,
      );
    }
  }

  switch (authType) {
    case "none":
    case "inherit":
    case "digest":
      break;
    case "bearer":
      if (authData.token) {
        setHeader(headers, "Authorization", `Bearer ${resolve(authData.token)}`);
      }
      break;
    case "basic":
      if (authData.username) {
        const creds = Buffer.from(
          `${resolve(authData.username)}:${resolve(authData.password ?? "")}`,
        ).toString("base64");
        setHeader(headers, "Authorization", `Basic ${creds}`);
      }
      break;
    case "apikey":
      if (authData.keyName) {
        const keyName = resolve(authData.keyName);
        const keyValue = resolve(authData.keyValue ?? "");
        if (authData.addTo === "query") {
          const parsed = new URL(ctx.url);
          parsed.searchParams.append(keyName, keyValue);
          result.url = parsed.toString();
        } else {
          setHeader(headers, keyName, keyValue);
        }
      }
      break;
    case "oauth2":
      if (authData.accessToken) {
        setHeader(headers, "Authorization", `Bearer ${resolve(authData.accessToken)}`);
      }
      break;
    case "jwt": {
      const algorithm = authData.jwtAlgorithm ?? "HS256";
      const token = signJwt({
        algorithm,
        secret: algorithm.startsWith("HS") ? resolve(authData.jwtSecret ?? "") : undefined,
        privateKey: !algorithm.startsWith("HS") ? resolve(authData.jwtPrivateKey ?? "") : undefined,
        keyId: authData.jwtKeyId,
        issuer: authData.jwtIssuer ? resolve(authData.jwtIssuer) : undefined,
        subject: authData.jwtSubject ? resolve(authData.jwtSubject) : undefined,
        audience: authData.jwtAudience ? resolve(authData.jwtAudience) : undefined,
        claims: authData.jwtClaims,
        expiresIn: authData.jwtExpiresIn,
        now: ctx.now,
      });
      setHeader(
        headers,
        resolve(authData.jwtHeaderName ?? "Authorization"),
        `Bearer ${token}`,
      );
      break;
    }
    case "awssigv4": {
      const sigv4 = buildSigV4Headers(
        {
          accessKey: resolve(authData.awsAccessKey ?? ""),
          secretKey: resolve(authData.awsSecretKey ?? ""),
          sessionToken: authData.awsSessionToken
            ? resolve(authData.awsSessionToken)
            : undefined,
          region: resolve(authData.awsRegion ?? ""),
          service: resolve(authData.awsService ?? ""),
        },
        {
          method: ctx.method,
          url: ctx.url,
          body: ctx.body,
          now: ctx.now,
          headers: ctx.headers,
        },
      );
      Object.entries(sigv4).forEach(([k, v]) => setHeader(headers, k, v));
      break;
    }
    case "hawk": {
      const hawk = buildHawkAuthorization(
        {
          id: resolve(authData.hawkId ?? ""),
          key: resolve(authData.hawkKey ?? ""),
          algorithm: authData.hawkAlgorithm,
        },
        { method: ctx.method, url: ctx.url, body: ctx.body, now: ctx.now },
      );
      Object.entries(hawk).forEach(([k, v]) => setHeader(headers, k, v));
      break;
    }
  }
  return result;
}
