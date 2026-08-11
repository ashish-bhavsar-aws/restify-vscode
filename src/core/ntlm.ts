/**
 * NTLM authentication message builders (F12).
 *
 * Pure host-side module (Node `crypto`) implementing the NTLM challenge-
 * response handshake used against servers that advertise
 * `WWW-Authenticate: NTLM` (IIS, SharePoint, SMB-over-HTTP gateways, Samba
 * `ntlm_auth`, ...).
 *
 * Handshake:
 *   1. Send the request with no Authorization header            → 401
 *   2. Reply `Authorization: NTLM <base64(Type1 negotiate)>`    → 401 + Type2 challenge
 *   3. Reply `Authorization: NTLM <base64(Type3 authenticate)>` → 200
 *
 * NTLMv2 responses are computed from the Type 2 server challenge + target
 * info; MD4 is implemented here because Node's OpenSSL build no longer
 * exposes it (avoids a new runtime dependency).
 */

import { createHmac, randomBytes } from "crypto";

const SIGNATURE = Buffer.from("NTLMSSP\0", "ascii");
const NTLM_REVISION = 0x0f;

/** Flags advertised in Type 1 (canonical Windows client value). */
const TYPE1_FLAGS = 0xe2088297;

/* ─────────────────────────────────────────────────────────────
 * MD4 (RFC 1320) — needed for the NT hash.
 * ───────────────────────────────────────────────────────────── */

function md4(input: Buffer): Buffer {
  const S = [
    [3, 7, 11, 19],
    [3, 5, 9, 13],
    [3, 9, 11, 15],
  ];

  // Pad message to a multiple of 64 bytes, little-endian bit length trailer.
  const bitLen = BigInt(input.length) * 8n;
  const padded = Buffer.alloc(((input.length + 9 + 63) >> 6) * 64, 0);
  input.copy(padded);
  padded[input.length] = 0x80;
  padded.writeBigUInt64LE(bitLen, padded.length - 8);

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  const f = (x: number, y: number, z: number): number => (x & y) | (~x & z);
  const g = (x: number, y: number, z: number): number =>
    (x & y) | (x & z) | (y & z);
  const h = (x: number, y: number, z: number): number => x ^ y ^ z;

  const rotl = (v: number, s: number): number =>
    ((v << s) | (v >>> (32 - s))) >>> 0;

  for (let off = 0; off < padded.length; off += 64) {
    const m: number[] = [];
    for (let i = 0; i < 16; i += 1) {
      m.push(padded.readUInt32LE(off + i * 4));
    }
    let [aa, bb, cc, dd] = [a, b, c, d];

    const op = (
      k: number,
      fn: (x: number, y: number, z: number) => number,
      r: number[],
      idx: number,
      constant: number,
    ): void => {
      const s = r[k % 4];
      // The register written cycles a → d → c → b with each step; the F/G/H
      // function reads the following three registers in order.
      if (k % 4 === 0) {
        aa = rotl((aa + fn(bb, cc, dd) + m[idx] + constant) >>> 0, s);
      } else if (k % 4 === 1) {
        dd = rotl((dd + fn(aa, bb, cc) + m[idx] + constant) >>> 0, s);
      } else if (k % 4 === 2) {
        cc = rotl((cc + fn(dd, aa, bb) + m[idx] + constant) >>> 0, s);
      } else {
        bb = rotl((bb + fn(cc, dd, aa) + m[idx] + constant) >>> 0, s);
      }
    };

    for (let k = 0; k < 16; k += 1) op(k, f, S[0], k, 0);
    const X = [0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15];
    for (let k = 0; k < 16; k += 1) op(k, g, S[1], X[k], 0x5a827999);
    const Y = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15];
    for (let k = 0; k < 16; k += 1) op(k, h, S[2], Y[k], 0x6ed9eba1);

    a = (a + aa) >>> 0;
    b = (b + bb) >>> 0;
    c = (c + cc) >>> 0;
    d = (d + dd) >>> 0;
  }

  const out = Buffer.alloc(16);
  out.writeUInt32LE(a, 0);
  out.writeUInt32LE(b, 4);
  out.writeUInt32LE(c, 8);
  out.writeUInt32LE(d, 12);
  return out;
}

/* ─────────────────────────────────────────────────────────────
 * NTLMv2 hashing
 * ───────────────────────────────────────────────────────────── */

/** NT hash = MD4 of the UTF-16LE password. */
export function ntHash(password: string): Buffer {
  return md4(Buffer.from(password, "utf16le"));
}

/** NTLMv2 hash = HMAC-MD5(NT hash, uppercased-username + domain, both UTF-16LE). */
export function ntlmV2Hash(
  password: string,
  username: string,
  domain: string,
): Buffer {
  const ntHashBuf = ntHash(password);
  const identity = Buffer.concat([
    Buffer.from(username.toUpperCase(), "utf16le"),
    Buffer.from(domain, "utf16le"),
  ]);
  return createHmac("md5", ntHashBuf).update(identity).digest();
}

/* ─────────────────────────────────────────────────────────────
 * Messages
 * ───────────────────────────────────────────────────────────── */

function securityBuffer(value: Buffer, offset: number): { header: Buffer; payload: Buffer } {
  const header = Buffer.alloc(8);
  header.writeUInt16LE(value.length, 0);
  header.writeUInt16LE(value.length, 2);
  header.writeUInt32LE(offset, 4);
  return { header, payload: value };
}

/** Type 1 (negotiate): 32-byte static message. */
export function buildNtlmType1(): Buffer {
  const msg = Buffer.alloc(32);
  SIGNATURE.copy(msg, 0);
  msg.writeUInt32LE(1, 8);
  msg.writeUInt32LE(TYPE1_FLAGS, 12);
  return msg;
}

export interface NtlmType2Challenge {
  /** 8-byte server challenge. */
  challenge: Buffer;
  /** Raw target-info AV-pair blob from the server (used verbatim in NTLMv2). */
  targetInfo: Buffer;
  /** Flags advertised by the server (used for the Type 3 message). */
  flags: number;
}

/** Parse a Type 2 challenge token (raw or base64). Returns null if invalid. */
export function parseNtlmType2(token: Buffer | string): NtlmType2Challenge | null {
  let buf: Buffer;
  if (Buffer.isBuffer(token)) {
    buf = token;
  } else {
    try {
      buf = Buffer.from(token, "base64");
    } catch {
      return null;
    }
  }
  if (
    buf.length < 32 ||
    buf.subarray(0, 8).compare(SIGNATURE) !== 0 ||
    buf.readUInt32LE(8) !== 2
  ) {
    return null;
  }
  const challenge = buf.subarray(24, 32);
  const infoLen = buf.readUInt16LE(40);
  const infoOffset = buf.readUInt32LE(44);
  const targetInfo =
    infoLen > 0 && infoOffset + infoLen <= buf.length
      ? Buffer.from(buf.subarray(infoOffset, infoOffset + infoLen))
      : Buffer.alloc(0);
  return {
    challenge: Buffer.from(challenge),
    targetInfo,
    flags: buf.readUInt32LE(20),
  };
}

export interface NtlmCredentials {
  username: string;
  password: string;
  domain?: string;
  workstation?: string;
}

const FILETIME_UNIX_EPOCH_MS = 11644473600000;

function fileTimeNow(nowMs?: number): Buffer {
  const hundredNanos =
    BigInt((nowMs ?? Date.now()) + FILETIME_UNIX_EPOCH_MS) * 10000n;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(hundredNanos);
  return buf;
}

export interface NtlmType3Options {
  /** Override the 8-byte client challenge (tests). */
  clientChallenge?: Buffer;
  /** Override the wall-clock time in ms (tests). */
  now?: number;
}

/** Type 3 (authenticate) token built from the server's Type 2 challenge. */
export function buildNtlmType3(
  challenge: NtlmType2Challenge,
  creds: NtlmCredentials,
  opts: NtlmType3Options = {},
): Buffer {
  const domain = creds.domain ?? "";
  const workstation = creds.workstation ?? "";
  const userName = creds.username || "";

  const v2Hash = ntlmV2Hash(creds.password, userName, domain);
  const clientChallenge =
    opts.clientChallenge && opts.clientChallenge.length === 8
      ? opts.clientChallenge
      : randomBytes(8);

  const blob = Buffer.concat([
    Buffer.from([0x01, 0x01, 0x00, 0x00]),
    fileTimeNow(opts.now),
    clientChallenge,
    Buffer.alloc(4),
    challenge.targetInfo,
    Buffer.alloc(4),
  ]);

  const ntResponse = Buffer.concat([
    createHmac("md5", v2Hash)
      .update(Buffer.concat([challenge.challenge, blob]))
      .digest(),
    blob,
  ]);
  const lmResponse = Buffer.concat([
    createHmac("md5", v2Hash)
      .update(Buffer.concat([challenge.challenge, clientChallenge]))
      .digest(),
    clientChallenge,
  ]);

  const domainBuf = Buffer.from(domain, "utf16le");
  const userBuf = Buffer.from(userName, "utf16le");
  const workstationBuf = Buffer.from(workstation, "utf16le");

  const payload = Buffer.concat([lmResponse, ntResponse, domainBuf, userBuf, workstationBuf]);
  let cursor = 72;

  const lm = securityBuffer(lmResponse, cursor);
  cursor += lmResponse.length;
  const nt = securityBuffer(ntResponse, cursor);
  cursor += ntResponse.length;
  const dom = securityBuffer(domainBuf, cursor);
  cursor += domainBuf.length;
  const user = securityBuffer(userBuf, cursor);
  cursor += userBuf.length;
  const wks = securityBuffer(workstationBuf, cursor);
  cursor += workstationBuf.length;
  const session = securityBuffer(Buffer.alloc(0), cursor);

  const msg = Buffer.alloc(72 + payload.length);
  SIGNATURE.copy(msg, 0);
  msg.writeUInt32LE(3, 8);

  lm.header.copy(msg, 12);
  nt.header.copy(msg, 20);
  dom.header.copy(msg, 28);
  user.header.copy(msg, 36);
  wks.header.copy(msg, 44);
  session.header.copy(msg, 52);
  msg.writeUInt32LE(challenge.flags || TYPE1_FLAGS, 60);
  // Version + NTLM revision (8 bytes).
  msg.writeUInt8(6, 64); // major
  msg.writeUInt8(1, 65); // minor
  msg.writeUInt16LE(7600, 66); // build
  msg.writeUInt8(NTLM_REVISION, 71);

  payload.copy(msg, 72);
  return msg;
}

/* ─────────────────────────────────────────────────────────────
 * Wire helpers
 * ───────────────────────────────────────────────────────────── */

/**
 * Inspect a `WWW-Authenticate` header value for an NTLM challenge.
 * Returns the base64 token payload (may be empty when the server challenges
 * without a token) or null when the header is not NTLM/Negotiate.
 */
export function parseWwwAuthenticateNtlm(headerValue: string): string | null {
  const value = headerValue.trim();
  const match = /^\s*(ntlm|negotiate)(?:\s+([^\s]+))?\s*$/i.exec(value);
  if (!match) return null;
  return (match[2] || "").trim();
}

/** Build the `Authorization: NTLM <base64>` header value for a message token. */
export function ntlmAuthorizationHeader(token: Buffer): string {
  return `NTLM ${token.toString("base64")}`;
}
