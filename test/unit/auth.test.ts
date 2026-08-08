import { describe, it, expect } from "vitest";
import { createHash, createHmac, createVerify, generateKeyPairSync } from "crypto";
import {
  signJwt,
  verifyHmacJwt,
  buildSigV4Headers,
  buildDigestAuthorization,
  buildHawkAuthorization,
  applyAuthHeaders,
  resolveAuthForRequest,
  type AuthDataLike,
} from "../../src/core";

const noResolve = (s: string) => s;

function headerJson(token: string): Record<string, unknown> {
  return JSON.parse(
    Buffer.from(token.split(".")[0], "base64url").toString("utf8"),
  ) as Record<string, unknown>;
}

function rawSignatureToDer(raw: Buffer, keyBytes: number): Buffer {
  const r = raw.subarray(0, keyBytes);
  const s = raw.subarray(keyBytes);
  const rTrim = r[0] === 0 ? r.subarray(1) : r;
  const sTrim = s[0] === 0 ? s.subarray(1) : s;
  const rBytes = rTrim[0] & 0x80 ? Buffer.concat([Buffer.from([0]), rTrim]) : rTrim;
  const sBytes = sTrim[0] & 0x80 ? Buffer.concat([Buffer.from([0]), sTrim]) : sTrim;
  return Buffer.concat([
    Buffer.from([0x30, rBytes.length + sBytes.length + 4]),
    Buffer.from([0x02, rBytes.length]),
    rBytes,
    Buffer.from([0x02, sBytes.length]),
    sBytes,
  ]);
}

function payloadJson(token: string): Record<string, unknown> {
  return JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
  ) as Record<string, unknown>;
}

describe("signJwt — HS256", () => {
  it("produces a verifiable compact token with expected claims", () => {
    const secret = "my-secret";
    const now = new Date("2024-01-01T00:00:00Z");
    const token = signJwt({
      algorithm: "HS256",
      secret,
      keyId: "kid-1",
      issuer: "issuer",
      subject: "subject",
      audience: "audience",
      claims: '{"custom":"value"}',
      expiresIn: "1h",
      now,
    });

    expect(headerJson(token)).toEqual({ alg: "HS256", typ: "JWT", kid: "kid-1" });
    const payload = payloadJson(token);
    expect(payload.iss).toBe("issuer");
    expect(payload.sub).toBe("subject");
    expect(payload.aud).toBe("audience");
    expect(payload.custom).toBe("value");
    expect(payload.iat).toBe(1704067200);
    expect(payload.exp).toBe(1704070800);

    const verified = verifyHmacJwt(token, secret);
    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe("subject");

    // Tampered signature must not verify.
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -1)}a`;
    expect(verifyHmacJwt(tampered, secret)).toBeNull();
    expect(verifyHmacJwt(token, "wrong-secret")).toBeNull();
  });

  it("matches an independently computed HMAC signature", () => {
    const secret = "0123456789abcdef";
    const now = new Date("2024-06-01T12:00:00Z");
    const token = signJwt({ algorithm: "HS512", secret, expiresIn: "300", now });
    const input = token.split(".").slice(0, 2).join(".");
    const expected = createHmac("sha512", secret).update(input).digest("base64url");
    expect(token.split(".")[2]).toBe(expected);
  });
});

describe("signJwt — RS256 / ES256", () => {
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

  it("RS256 token verifies with the public key", () => {
    const token = signJwt({
      algorithm: "RS256",
      privateKey: rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      issuer: "rsa-issuer",
      expiresIn: "60",
    });
    const [head, payload, sig] = token.split(".");
    const verifier = createVerify("sha256");
    verifier.update(`${head}.${payload}`);
    verifier.end();
    expect(
      verifier.verify(
        rsa.publicKey.export({ type: "spki", format: "pem" }),
        Buffer.from(sig, "base64url"),
      ),
    ).toBe(true);
  });

  it("ES256 token verifies with the public key", () => {
    const token = signJwt({
      algorithm: "ES256",
      privateKey: ec.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      issuer: "ec-issuer",
      expiresIn: "60",
    });
    const [head, payload, sig] = token.split(".");
    const der = rawSignatureToDer(Buffer.from(sig, "base64url"), 32);
    const verifier = createVerify("sha256");
    verifier.update(`${head}.${payload}`);
    verifier.end();
    expect(
      verifier.verify(
        ec.publicKey.export({ type: "spki", format: "pem" }),
        der,
      ),
    ).toBe(true);
  });

  it("throws when an asymmetric algorithm is missing its private key", () => {
    expect(() =>
      signJwt({ algorithm: "RS256", secret: "not-a-key" }),
    ).toThrow(/private key/);
  });
});

describe("buildSigV4Headers", () => {
  it("reproduces the AWS S3 GetObject known-answer signature", () => {
    const now = new Date("2013-05-24T00:00:00.000Z");
    const headers = buildSigV4Headers(
      {
        accessKey: "AKIAIOSFODNN7EXAMPLE",
        secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        region: "us-east-1",
        service: "s3",
      },
      {
        method: "GET",
        url: "https://examplebucket.s3.amazonaws.com/test.txt",
        headers: { Range: "bytes=0-9" },
        now,
      },
    );

    expect(headers["X-Amz-Date"]).toBe("20130524T000000Z");
    expect(headers["X-Amz-Content-SHA256"]).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(headers.Authorization).toContain(
      "Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request",
    );
    expect(headers.Authorization).toContain(
      "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date",
    );
    expect(headers.Authorization).toContain(
      "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
  });

  it("signs query strings in canonical sorted order", () => {
    const headers = buildSigV4Headers(
      {
        accessKey: "AKID",
        secretKey: "SK",
        region: "us-east-1",
        service: "execute-api",
      },
      {
        method: "GET",
        url: "https://api.example.com/items?b=2&a=1",
        now: new Date("2024-03-01T00:00:00.000Z"),
      },
    );
    expect(headers.Authorization).toMatch(/Signature=[0-9a-f]{64}/);
  });

  it("hashes a JSON body payload", () => {
    const headers = buildSigV4Headers(
      { accessKey: "AKID", secretKey: "SK", region: "us-east-1", service: "lambda" },
      {
        method: "POST",
        url: "https://lambda.us-east-1.amazonaws.com/2015-03-31/functions/function/invocations",
        body: '{"hello":"world"}',
        now: new Date("2024-03-01T00:00:00.000Z"),
      },
    );
    const expectedHash = createHash("sha256")
      .update('{"hello":"world"}')
      .digest("hex");
    expect(headers["X-Amz-Content-SHA256"]).toBe(expectedHash);
  });

  it("includes the session token header when provided", () => {
    const headers = buildSigV4Headers(
      {
        accessKey: "AKID",
        secretKey: "SK",
        sessionToken: "session-token-123",
        region: "us-east-1",
        service: "sts",
      },
      {
        method: "GET",
        url: "https://sts.us-east-1.amazonaws.com/",
        now: new Date("2024-03-01T00:00:00.000Z"),
      },
    );
    expect(headers["X-Amz-Security-Token"]).toBe("session-token-123");
  });
});

describe("buildDigestAuthorization", () => {
  const challenge =
    'Digest realm="testrealm@host.com", qop="auth", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"';

  it("reproduces the RFC 2617 Mufasa known-answer response", () => {
    const header = buildDigestAuthorization(
      challenge,
      { method: "GET", url: "https://www.example.com/dir/index.html" },
      {
        username: "Mufasa",
        password: "Circle Of Life",
        cnonce: "0a4f113b",
        nc: "00000001",
      },
    );
    expect(header).toBe(
      'Digest username="Mufasa", realm="testrealm@host.com", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", uri="/dir/index.html", algorithm=MD5, qop=auth, nc=00000001, cnonce="0a4f113b", response="6629fae49393a05397450978507c4ef1", opaque="5ccc069c403ebaf9f0171e9517f40e41"',
    );
  });

  it("supports SHA-256 algorithm", () => {
    const header = buildDigestAuthorization(
      'Digest realm="api", nonce="abc123", algorithm=SHA-256, qop="auth"',
      { method: "GET", url: "https://api.example.com/resource" },
      { username: "alice", password: "secret", cnonce: "deadbeef", nc: "00000001" },
    );
    expect(header).toContain("algorithm=SHA-256");
    expect(header).toContain('response="');
    const response = /response="([0-9a-f]+)"/.exec(header)?.[1];
    expect(response).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles qop=auth-int with a body hash", () => {
    const header = buildDigestAuthorization(
      'Digest realm="api", nonce="abc123", qop="auth-int"',
      {
        method: "POST",
        url: "https://api.example.com/resource",
        body: '{"a":1}',
      },
      { username: "alice", password: "secret", cnonce: "deadbeef", nc: "00000001" },
    );
    expect(header).toContain("qop=auth-int");
    expect(header).toMatch(/response="[0-9a-f]{32}"/);
  });

  it("supports MD5-sess", () => {
    const header = buildDigestAuthorization(
      'Digest realm="api", nonce="abc123", algorithm=MD5-sess, qop="auth"',
      { method: "GET", url: "https://api.example.com/resource" },
      { username: "alice", password: "secret", cnonce: "deadbeef", nc: "00000001" },
    );
    expect(header).toContain("algorithm=MD5-sess");
  });

  it("falls back to the legacy no-qop response when qop is absent", () => {
    const header = buildDigestAuthorization(
      'Digest realm="api", nonce="abc123"',
      { method: "GET", url: "https://api.example.com/resource" },
      { username: "alice", password: "secret", cnonce: "deadbeef", nc: "00000001" },
    );
    expect(header).not.toContain("qop=");
    expect(header).toMatch(/response="[0-9a-f]{32}"/);
  });
});

describe("buildHawkAuthorization", () => {
  it("produces a MAC that verifies against the normalized string", () => {
    const now = new Date("2024-03-01T10:00:00Z");
    const headers = buildHawkAuthorization(
      { id: "dh37fgj492je", key: "werxhqb98rpaxn39848xrunpaw3489ruxnpa98w4rxn", algorithm: "sha256" },
      { method: "GET", url: "https://example.com:8000/resource/1?b=1&a=2", now },
    );
    const auth = headers.Authorization as string;
    expect(auth).toMatch(/^Hawk /);
    const id = /id="([^"]+)"/.exec(auth)?.[1];
    const ts = /ts="([^"]+)"/.exec(auth)?.[1];
    const nonce = /nonce="([^"]+)"/.exec(auth)?.[1];
    const mac = /mac="([^"]+)"/.exec(auth)?.[1];
    expect(id).toBe("dh37fgj492je");
    expect(ts).toBe("1709287200");

    const normalized = [
      "hawk.1.header",
      ts,
      nonce,
      "GET",
      "/resource/1?b=1&a=2",
      "example.com",
      "8000",
      "",
      "",
      "",
      "",
    ].join("\n");
    const expectedMac = createHmac("sha256", "werxhqb98rpaxn39848xrunpaw3489ruxnpa98w4rxn")
      .update(normalized)
      .digest("base64");
    expect(mac).toBe(expectedMac);
  });

  it("includes a Hash header for request bodies", () => {
    const headers = buildHawkAuthorization(
      { id: "dh37fgj492je", key: "secret-key", algorithm: "sha256" },
      {
        method: "POST",
        url: "https://example.com/resource",
        body: '{"hello":"world"}',
        now: new Date("2024-03-01T10:00:00Z"),
      },
    );
    const expected = Buffer.from(
      createHash("sha256").update('{"hello":"world"}').digest("hex"),
    ).toString("base64");
    expect(headers.Hash).toBe(expected);
    expect(headers.Authorization).toContain(`hash="${expected}"`);
  });
});

describe("applyAuthHeaders", () => {
  const ctx = (extra: Partial<Parameters<typeof applyAuthHeaders>[3]> = {}) => ({
    resolve: noResolve,
    method: "POST",
    url: "https://api.example.com/v1/items",
    ...extra,
  });

  it("bearer", () => {
    const headers: Record<string, string> = {};
    applyAuthHeaders(headers, "bearer", { token: "tok-123" }, ctx());
    expect(headers.Authorization).toBe("Bearer tok-123");
  });

  it("basic resolves variables before encoding", () => {
    const headers: Record<string, string> = {};
    applyAuthHeaders(
      headers,
      "basic",
      { username: "{{user}}", password: "{{pass}}" },
      { ...ctx(), resolve: (s) => ({ "{{user}}": "alice", "{{pass}}": "s3cret" }[s] ?? s) },
    );
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("alice:s3cret").toString("base64")}`,
    );
  });

  it("F19: URL user:pass@ becomes a Basic Authorization header and is stripped", () => {
    const headers: Record<string, string> = {};
    const result = applyAuthHeaders(
      headers,
      "none",
      {},
      { ...ctx(), url: "https://alice:s3cret@api.example.com/users" },
    );
    expect(result.url).toBe("https://api.example.com/users");
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("alice:s3cret").toString("base64")}`,
    );
  });

  it("F19: explicit auth config wins over URL credentials", () => {
    const headers: Record<string, string> = {};
    const result = applyAuthHeaders(
      headers,
      "basic",
      { username: "explicit", password: "pw" },
      { ...ctx(), url: "https://url-user:url-pass@api.example.com/" },
    );
    expect(result.url).toBe("https://api.example.com/");
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("explicit:pw").toString("base64")}`,
    );
  });

  it("F19: an existing Authorization header is left untouched", () => {
    const headers: Record<string, string> = { Authorization: "Bearer custom" };
    const result = applyAuthHeaders(
      headers,
      "none",
      {},
      { ...ctx(), url: "https://u:p@api.example.com/" },
    );
    expect(result.url).toBe("https://api.example.com/");
    expect(headers.Authorization).toBe("Bearer custom");
  });

  it("F19: URLs without userinfo are unchanged", () => {
    const headers: Record<string, string> = {};
    const result = applyAuthHeaders(
      headers,
      "none",
      {},
      { ...ctx(), url: "https://api.example.com/" },
    );
    expect(result.url).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
  });

  it("apikey header", () => {
    const headers: Record<string, string> = {};
    applyAuthHeaders(headers, "apikey", { keyName: "X-API-Key", keyValue: "k" }, ctx());
    expect(headers["X-API-Key"]).toBe("k");
  });

  it("apikey in query appends to the URL", () => {
    const headers: Record<string, string> = {};
    const result = applyAuthHeaders(
      headers,
      "apikey",
      { keyName: "api_key", keyValue: "abc", addTo: "query" },
      ctx(),
    );
    expect(result.url).toBe("https://api.example.com/v1/items?api_key=abc");
  });

  it("jwt signs a token and sets the Authorization header", () => {
    const headers: Record<string, string> = {};
    const now = new Date("2024-03-01T10:00:00Z");
    applyAuthHeaders(
      headers,
      "jwt",
      { jwtAlgorithm: "HS256", jwtSecret: "secret", jwtIssuer: "iss", jwtExpiresIn: "300" },
      { ...ctx(), now },
    );
    expect(headers.Authorization).toMatch(/^Bearer .+\..+\..+$/);
    const token = headers.Authorization.slice(7);
    expect(payloadJson(token).iss).toBe("iss");
    expect(verifyHmacJwt(token, "secret")).not.toBeNull();
  });

  it("jwt supports a custom header name", () => {
    const headers: Record<string, string> = {};
    applyAuthHeaders(
      headers,
      "jwt",
      { jwtAlgorithm: "HS256", jwtSecret: "secret", jwtHeaderName: "X-JWT-Token" },
      ctx(),
    );
    expect(headers["X-JWT-Token"]).toMatch(/^Bearer /);
    expect(headers.Authorization).toBeUndefined();
  });

  it("awssigv4", () => {
    const headers: Record<string, string> = {};
    applyAuthHeaders(
      headers,
      "awssigv4",
      {
        awsAccessKey: "AKIAIOSFODNN7EXAMPLE",
        awsSecretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        awsRegion: "us-east-1",
        awsService: "s3",
      },
      {
        ...ctx(),
        method: "GET",
        url: "https://examplebucket.s3.amazonaws.com/test.txt",
        headers: { Range: "bytes=0-9" },
        now: new Date("2013-05-24T00:00:00.000Z"),
      },
    );
    expect(headers.Authorization).toContain("AWS4-HMAC-SHA256");
    expect(headers.Authorization).toContain("Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
  });

  it("hawk", () => {
    const headers: Record<string, string> = {};
    applyAuthHeaders(
      headers,
      "hawk",
      { hawkId: "id", hawkKey: "key", hawkAlgorithm: "sha256" },
      { ...ctx(), now: new Date("2024-03-01T10:00:00Z") },
    );
    expect(headers.Authorization).toMatch(/^Hawk /);
  });

  it("leaves headers untouched for digest (challenge round-trip)", () => {
    const headers: Record<string, string> = {};
    applyAuthHeaders(headers, "digest", { digestUsername: "a", digestPassword: "b" }, ctx());
    expect(headers.Authorization).toBeUndefined();
  });
});

describe("resolveAuthForRequest", () => {
  const collectionAuth: { authType: "bearer"; authData: AuthDataLike } = {
    authType: "bearer",
    authData: { token: "collection-token" },
  };

  it("returns the request's own auth when not inheriting", () => {
    expect(resolveAuthForRequest("basic", { username: "u" }, collectionAuth)).toEqual({
      authType: "basic",
      authData: { username: "u" },
    });
  });

  it("inherits the collection auth", () => {
    expect(resolveAuthForRequest("inherit", {}, collectionAuth)).toEqual(collectionAuth);
  });

  it("falls back to none when the collection has no auth", () => {
    expect(resolveAuthForRequest("inherit", {}, undefined)).toEqual({
      authType: "none",
      authData: {},
    });
  });
});
