import { describe, it, expect, vi } from "vitest";
import {
  retryWithChallengeAuth,
  type ChallengeAuthLogger,
  type ChallengeAuthResult,
  type ChallengeCredentials,
} from "../../src/core/authChallenge";

const hexChallenge = "1122334455667788";

function makeType2Token(): string {
  const buf = Buffer.alloc(48);
  buf.write("NTLMSSP\0", 0, "ascii");
  buf.writeUInt32LE(2, 8);
  buf.writeUInt32LE(0xe2088297, 20);
  Buffer.from(hexChallenge, "hex").copy(buf, 24);
  return buf.toString("base64");
}

const ok = (): ChallengeAuthResult => ({
  status: 200,
  headers: { "Content-Type": "text/plain" },
});

describe("retryWithChallengeAuth (F12)", () => {
  const digestCreds: ChallengeCredentials = {
    scheme: "digest",
    username: "Mufasa",
    password: "Circle Of Life",
    method: "GET",
    url: "http://host/dir/index.html",
  };

  const ntlmCreds: ChallengeCredentials = {
    scheme: "ntlm",
    username: "User",
    password: "Password",
    domain: "Domain",
    workstation: "WS",
  };

  it("retries a digest 401 once with a computed Authorization header", async () => {
    const initial: ChallengeAuthResult = {
      status: 401,
      headers: {
        "www-authenticate": 'Digest realm="api", qop="auth", nonce="abc123"',
      },
    };
    const headers: Record<string, string> = { "X-Custom": "abc" };
    const transport = vi.fn(async (): Promise<ChallengeAuthResult> => ok());
    const log: ChallengeAuthLogger = { append: vi.fn() };

    const result = await retryWithChallengeAuth(
      initial,
      digestCreds,
      headers,
      transport,
      {},
      log,
    );

    expect(transport).toHaveBeenCalledTimes(1);
    expect(headers.Authorization).toMatch(/^Digest /);
    expect(headers.Authorization).toContain('username="Mufasa"');
    expect(headers.Authorization).toContain("response=");
    expect(headers["X-Custom"]).toBe("abc");
    expect(result.status).toBe(200);
    expect(log.append).toHaveBeenCalledWith(
      "Digest auth",
      expect.any(String),
      "info",
    );
  });

  it("runs the NTLM type1 → type2 → type3 handshake through transport", async () => {
    const type2Token = makeType2Token();
    const initial: ChallengeAuthResult = {
      status: 401,
      headers: { "WWW-Authenticate": `NTLM ${type2Token}` },
    };
    const headers: Record<string, string> = { "X-Custom": "abc" };
    const messageTypes: number[] = [];
    const transport = vi.fn(async (): Promise<ChallengeAuthResult> => {
      const auth = headers.Authorization ?? "";
      if (auth.startsWith("NTLM ")) {
        const msg = Buffer.from(auth.slice("NTLM ".length), "base64");
        const type = msg.readUInt32LE(8);
        messageTypes.push(type);
        if (type === 3) return ok();
        return {
          status: 401,
          headers: { "WWW-Authenticate": `NTLM ${type2Token}` },
        };
      }
      return initial;
    });
    const log: ChallengeAuthLogger = { append: vi.fn() };

    const result = await retryWithChallengeAuth(
      initial,
      ntlmCreds,
      headers,
      transport,
      {},
      log,
    );

    expect(messageTypes).toEqual([1, 3]);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(200);
    expect(headers.Authorization).toMatch(/^NTLM /);
    expect(headers["X-Custom"]).toBe("abc");
    expect(log.append).toHaveBeenCalledWith(
      "NTLM auth",
      expect.any(String),
      "info",
    );
  });

  it("returns the initial result when no WWW-Authenticate header is present", async () => {
    const initial: ChallengeAuthResult = { status: 401, headers: {} };
    const transport = vi.fn(async (): Promise<ChallengeAuthResult> => ok());

    const result = await retryWithChallengeAuth(
      initial,
      digestCreds,
      {},
      transport,
      {},
    );

    expect(result).toBe(initial);
    expect(transport).not.toHaveBeenCalled();
  });

  it("ignores challenges that do not match the credential scheme", async () => {
    const digestInitial: ChallengeAuthResult = {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="api"' },
    };
    const digestTransport = vi.fn(async (): Promise<ChallengeAuthResult> =>
      ok(),
    );
    const digestResult = await retryWithChallengeAuth(
      digestInitial,
      digestCreds,
      {},
      digestTransport,
      {},
    );
    expect(digestResult).toBe(digestInitial);
    expect(digestTransport).not.toHaveBeenCalled();

    const ntlmInitial: ChallengeAuthResult = {
      status: 401,
      headers: { "WWW-Authenticate": 'Digest realm="api", nonce="abc123"' },
    };
    const ntlmTransport = vi.fn(async (): Promise<ChallengeAuthResult> => ok());
    const ntlmResult = await retryWithChallengeAuth(
      ntlmInitial,
      ntlmCreds,
      {},
      ntlmTransport,
      {},
    );
    expect(ntlmResult).toBe(ntlmInitial);
    expect(ntlmTransport).not.toHaveBeenCalled();
  });

  it("logs and returns the initial result when the digest challenge is invalid", async () => {
    const initial: ChallengeAuthResult = {
      status: 401,
      headers: { "WWW-Authenticate": 'Digest realm="api"' },
    };
    const transport = vi.fn(async (): Promise<ChallengeAuthResult> => ok());
    const log: ChallengeAuthLogger = { append: vi.fn() };

    const result = await retryWithChallengeAuth(
      initial,
      digestCreds,
      {},
      transport,
      {},
      log,
    );

    expect(result).toBe(initial);
    expect(transport).not.toHaveBeenCalled();
    expect(log.append).toHaveBeenCalledWith(
      "Digest auth failed",
      expect.any(String),
      "error",
    );
  });

  it("returns the type1 result when the server accepts it (no re-challenge)", async () => {
    const initial: ChallengeAuthResult = {
      status: 401,
      headers: { "WWW-Authenticate": `NTLM ${makeType2Token()}` },
    };
    const headers: Record<string, string> = {};
    const transport = vi.fn(async (): Promise<ChallengeAuthResult> => ok());
    const log: ChallengeAuthLogger = { append: vi.fn() };

    const result = await retryWithChallengeAuth(
      initial,
      ntlmCreds,
      headers,
      transport,
      {},
      log,
    );

    expect(transport).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(200);
    expect(log.append).not.toHaveBeenCalled();
  });

  it("gives up when the type2 token cannot be parsed", async () => {
    const initial: ChallengeAuthResult = {
      status: 401,
      headers: { "WWW-Authenticate": "NTLM notabase64token" },
    };
    const transport = vi.fn(async (): Promise<ChallengeAuthResult> => ({
      status: 401,
      headers: { "WWW-Authenticate": "NTLM notabase64token" },
    }));

    const result = await retryWithChallengeAuth(
      initial,
      ntlmCreds,
      {},
      transport,
      {},
    );

    expect(transport).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(401);
  });

  it("gives up when the type1 401 carries no usable challenge", async () => {
    const initial: ChallengeAuthResult = {
      status: 401,
      headers: { "WWW-Authenticate": "NTLM" },
    };
    const transport = vi.fn(async (): Promise<ChallengeAuthResult> => ({
      status: 401,
      headers: {},
    }));

    const result = await retryWithChallengeAuth(
      initial,
      ntlmCreds,
      {},
      transport,
      {},
    );

    expect(transport).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(401);
  });
});
