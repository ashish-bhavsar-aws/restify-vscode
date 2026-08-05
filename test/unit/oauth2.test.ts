import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as http from "http";
import type { AddressInfo } from "net";
import {
  getOAuth2Token,
  runAuthorizationCodeFlow,
  requestClientCredentialsToken,
  requestPasswordGrantToken,
  isTokenExpired,
  parseTokenResponse,
  oauth2CacheKey,
  type OAuth2Config,
  type OAuth2Token,
  type OAuth2TokenCache,
} from "../../src/core";

interface TokenServer {
  server: http.Server;
  port: number;
  hits: () => number;
  lastForm: () => URLSearchParams;
  setHandler: (handler: (form: URLSearchParams) => void) => void;
}

async function startTokenServer(
  handler?: (form: URLSearchParams, res: http.ServerResponse) => void,
): Promise<TokenServer> {
  let count = 0;
  let latestForm = new URLSearchParams();
  let currentHandler = handler;
  const json = (res: http.ServerResponse, data: unknown, status = 200) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(data));
  };
  const server = http.createServer((req, res) => {
    count++;
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => {
      latestForm = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
      if (currentHandler) currentHandler(latestForm, res);
      else json(res, { error: "no_handler" }, 500);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        server,
        port,
        hits: () => count,
        lastForm: () => latestForm,
        setHandler: (h) => {
          currentHandler = h;
        },
      });
    });
  });
}

async function closeServer(ts: TokenServer): Promise<void> {
  await new Promise((r) => ts.server.close(r));
}

describe("oauth2", () => {
  let shared: TokenServer;

  beforeAll(async () => {
    shared = await startTokenServer();
  });

  afterAll(async () => {
    await closeServer(shared);
  });

  it("client_credentials posts the right form fields", async () => {
    const s = await startTokenServer((form, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ access_token: "t1", expires_in: 3600 }));
    });
    const cfg: OAuth2Config = {
      grantType: "client_credentials",
      tokenUrl: `http://127.0.0.1:${s.port}/token`,
      clientId: "client-123",
      clientSecret: "secret-456",
      scopes: "read write",
    };
    const token = await requestClientCredentialsToken(cfg);
    const form = s.lastForm();
    expect(form.get("grant_type")).toBe("client_credentials");
    expect(form.get("client_id")).toBe("client-123");
    expect(form.get("client_secret")).toBe("secret-456");
    expect(form.get("scope")).toBe("read write");
    expect(token.accessToken).toBe("t1");
    expect(typeof token.expiresAt).toBe("number");
    await closeServer(s);
  });

  it("password grant sends username/password and captures refresh token", async () => {
    const s = await startTokenServer((form, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ access_token: "pt", refresh_token: "rt" }));
    });
    const cfg: OAuth2Config = {
      grantType: "password",
      tokenUrl: `http://127.0.0.1:${s.port}/token`,
      clientId: "client-123",
      username: "alice",
      password: "hunter2",
    };
    const token = await requestPasswordGrantToken(cfg);
    const form = s.lastForm();
    expect(form.get("grant_type")).toBe("password");
    expect(form.get("username")).toBe("alice");
    expect(form.get("password")).toBe("hunter2");
    expect(token.accessToken).toBe("pt");
    expect(token.refreshToken).toBe("rt");
    await closeServer(s);
  });

  it("password grant throws when username/password missing", async () => {
    const cfg: OAuth2Config = {
      grantType: "password",
      tokenUrl: `http://127.0.0.1:${shared.port}/token`,
      clientId: "c",
    };
    await expect(requestPasswordGrantToken(cfg)).rejects.toThrow(
      /requires a username and password/,
    );
  });

  it("authorization_code flow: builds PKCE auth URL, listens for redirect, exchanges code", async () => {
    let capturedAuthUrl = "";
    const s = await startTokenServer((form, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ access_token: "ac-token", refresh_token: "ac-refresh" }));
    });

    const cfg: OAuth2Config = {
      grantType: "authorization_code",
      authUrl: `http://127.0.0.1:${s.port}/authorize`,
      tokenUrl: `http://127.0.0.1:${s.port}/token`,
      clientId: "client-123",
      scopes: "read",
    };

    const token = await runAuthorizationCodeFlow(cfg, {
      openUrl: (url) => {
        capturedAuthUrl = url;
        // Simulate the browser redirecting back with an authorization code.
        const u = new URL(url);
        const redirectUri = u.searchParams.get("redirect_uri") || "";
        setTimeout(() => {
          const target = new URL(redirectUri);
          target.searchParams.set("code", "test-code");
          http.get(target.toString()).on("error", () => {});
        }, 20);
      },
    });

    const authUrl = new URL(capturedAuthUrl);
    expect(authUrl.searchParams.get("response_type")).toBe("code");
    expect(authUrl.searchParams.get("client_id")).toBe("client-123");
    expect(authUrl.searchParams.get("scope")).toBe("read");
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authUrl.searchParams.get("code_challenge")).toBeTruthy();

    const form = s.lastForm();
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("test-code");
    expect(form.get("code_verifier")).toBeTruthy();
    expect(form.get("redirect_uri")).toBeTruthy();
    expect(token.accessToken).toBe("ac-token");
    expect(token.refreshToken).toBe("ac-refresh");
    await closeServer(s);
  });

  it("authorization_code flow can use a fixed local redirect URL", async () => {
    // Reserve a free port for the redirect listener.
    const probe = http.createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const port = (probe.address() as AddressInfo).port;
    await new Promise((r) => probe.close(r));
    const redirectUrl = `http://127.0.0.1:${port}/callback`;

    const s = await startTokenServer((form, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ access_token: "fixed-redirect-token" }));
    });
    const cfg: OAuth2Config = {
      grantType: "authorization_code",
      authUrl: `http://127.0.0.1:${s.port}/authorize`,
      tokenUrl: `http://127.0.0.1:${s.port}/token`,
      clientId: "c",
      redirectUrl,
    };
    const token = await runAuthorizationCodeFlow(cfg, {
      openUrl: (url) => {
        const u = new URL(url);
        expect(u.searchParams.get("redirect_uri")).toBe(redirectUrl);
        // Simulate a redirect to the fixed URL.
        setTimeout(() => {
          const target = new URL(redirectUrl);
          target.searchParams.set("code", "xyz");
          http.get(target.toString()).on("error", () => {});
        }, 20);
      },
    });
    expect(token.accessToken).toBe("fixed-redirect-token");
    expect(s.lastForm().get("code")).toBe("xyz");
    await closeServer(s);
  });

  it("authorization_code flow rejects non-localhost redirect URLs", async () => {
    const cfg: OAuth2Config = {
      grantType: "authorization_code",
      authUrl: "http://127.0.0.1/authorize",
      tokenUrl: "http://127.0.0.1/token",
      clientId: "c",
      redirectUrl: "https://myapp.com/callback",
    };
    await expect(runAuthorizationCodeFlow(cfg)).rejects.toThrow(
      /must point to http:\/\/127.0.0.1 or http:\/\/localhost/,
    );
  });

  it("authorization_code flow surfaces provider error descriptions", async () => {
    const s = await startTokenServer((form, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ access_token: "unused" }));
    });
    const cfg: OAuth2Config = {
      grantType: "authorization_code",
      authUrl: `http://127.0.0.1:${s.port}/authorize`,
      tokenUrl: `http://127.0.0.1:${s.port}/token`,
      clientId: "c",
    };
    await expect(
      runAuthorizationCodeFlow(cfg, {
        openUrl: (url) => {
          const u = new URL(url);
          const redirectUri = u.searchParams.get("redirect_uri") || "";
          setTimeout(() => {
            const target = new URL(redirectUri);
            target.searchParams.set("error", "access_denied");
            target.searchParams.set("error_description", "User said no");
            http.get(target.toString()).on("error", () => {});
          }, 20);
        },
      }),
    ).rejects.toThrow(/User said no/);
    await closeServer(s);
  });

  it("authorization_code flow throws without a browser opener", async () => {
    const cfg: OAuth2Config = {
      grantType: "authorization_code",
      authUrl: "http://127.0.0.1/authorize",
      tokenUrl: "http://127.0.0.1/token",
      clientId: "c",
    };
    await expect(runAuthorizationCodeFlow(cfg)).rejects.toThrow(
      /no browser opener/,
    );
  });

  it("getOAuth2Token returns cached token without hitting the network", async () => {
    const cache: OAuth2TokenCache = {
      get: () => ({ accessToken: "cached", expiresAt: Date.now() + 60000 }),
      set: () => {},
    };
    const cfg: OAuth2Config = {
      grantType: "client_credentials",
      tokenUrl: `http://127.0.0.1:${shared.port}/token`,
      clientId: "c",
    };
    const result = await getOAuth2Token(cfg, { cache });
    expect(result.source).toBe("cache");
    expect(result.token.accessToken).toBe("cached");
    expect(shared.hits()).toBe(0);
  });

  it("getOAuth2Token refreshes an expired token with refresh_token", async () => {
    const s = await startTokenServer((form, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ access_token: "refreshed", expires_in: 3600 }));
    });
    const cache: OAuth2TokenCache = {
      get: () => ({
        accessToken: "old",
        refreshToken: "rt-123",
        expiresAt: Date.now() - 1000,
      }),
      set: () => {},
    };
    const cfg: OAuth2Config = {
      grantType: "client_credentials",
      tokenUrl: `http://127.0.0.1:${s.port}/token`,
      clientId: "c",
    };
    const result = await getOAuth2Token(cfg, { cache });
    expect(result.source).toBe("refresh");
    expect(result.token.accessToken).toBe("refreshed");
    expect(s.lastForm().get("grant_type")).toBe("refresh_token");
    expect(s.lastForm().get("refresh_token")).toBe("rt-123");
    await closeServer(s);
  });

  it("getOAuth2Token preserves the old refresh token when the response omits one", async () => {
    let stored: OAuth2Token | undefined;
    const s = await startTokenServer((form, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ access_token: "refreshed2", expires_in: 3600 }));
    });
    const cache: OAuth2TokenCache = {
      get: () => ({
        accessToken: "old",
        refreshToken: "keep-me",
        expiresAt: Date.now() - 1000,
      }),
      set: (_k, t) => {
        stored = t;
      },
    };
    const cfg: OAuth2Config = {
      grantType: "client_credentials",
      tokenUrl: `http://127.0.0.1:${s.port}/token`,
      clientId: "c",
    };
    const result = await getOAuth2Token(cfg, { cache });
    expect(result.source).toBe("refresh");
    expect(stored?.refreshToken).toBe("keep-me");
    await closeServer(s);
  });

  it("getOAuth2Token falls back to a full flow when refresh fails", async () => {
    const s = await startTokenServer((form, res) => {
      if (form.get("grant_type") === "refresh_token") {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_grant" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ access_token: "fresh-flow", expires_in: 3600 }));
    });
    const cache: OAuth2TokenCache = {
      get: () => ({
        accessToken: "old",
        refreshToken: "rt-bad",
        expiresAt: Date.now() - 1000,
      }),
      set: () => {},
    };
    const cfg: OAuth2Config = {
      grantType: "client_credentials",
      tokenUrl: `http://127.0.0.1:${s.port}/token`,
      clientId: "c",
    };
    const result = await getOAuth2Token(cfg, { cache });
    expect(result.source).toBe("flow");
    expect(result.token.accessToken).toBe("fresh-flow");
    expect(s.hits()).toBe(2);
    await closeServer(s);
  });

  it("token with no expiresAt is never treated as expired", () => {
    expect(isTokenExpired({ accessToken: "x" })).toBe(false);
    expect(isTokenExpired({ accessToken: "x", expiresAt: Date.now() - 10000 })).toBe(true);
    expect(isTokenExpired({ accessToken: "x", expiresAt: Date.now() + 60000 })).toBe(false);
    // Within the skew window it counts as expired
    expect(isTokenExpired({ accessToken: "x", expiresAt: Date.now() + 10000 })).toBe(true);
  });

  it("parseTokenResponse validates the response shape", () => {
    expect(() => parseTokenResponse(200, "not json")).toThrow(/non-JSON/);
    expect(() => parseTokenResponse(200, JSON.stringify({ foo: 1 }))).toThrow(/no access_token/);
    expect(() => parseTokenResponse(400, JSON.stringify({ error: "invalid_client", error_description: "Bad creds" }))).toThrow(/Bad creds/);
    const token = parseTokenResponse(
      200,
      JSON.stringify({ access_token: "a", token_type: "Bearer", expires_in: 600, scope: "read" }),
    );
    expect(token.accessToken).toBe("a");
    expect(token.tokenType).toBe("Bearer");
    expect(token.scope).toBe("read");
    expect(token.expiresAt).toBeGreaterThan(Date.now());
  });

  it("oauth2CacheKey distinguishes providers/clients/scopes", () => {
    const base: OAuth2Config = {
      grantType: "client_credentials",
      tokenUrl: "https://a/token",
      clientId: "c1",
    };
    expect(oauth2CacheKey(base)).toBe("https://a/token|c1|");
    expect(oauth2CacheKey({ ...base, clientId: "c2" })).not.toBe(oauth2CacheKey(base));
    expect(oauth2CacheKey({ ...base, scopes: "read" })).not.toBe(oauth2CacheKey(base));
  });
});
