import { describe, it, expect } from "vitest";
import {
  resolveSoapSecurity,
  type SoapSecurityEntryLike,
} from "../../src/core";

describe("resolveSoapSecurity", () => {
  const readFile = (path: string) => Buffer.from(`[${path}]`);

  const entry = (partial: Partial<SoapSecurityEntryLike>): SoapSecurityEntryLike => ({
    hostname: "example.com",
    username: "",
    password: "",
    ...partial,
  });

  it("returns null when nothing is active", () => {
    expect(resolveSoapSecurity("https://example.com/api", [], readFile)).toBeNull();
  });

  it("matches entries by exact hostname", () => {
    const e = entry({
      useUsername: true,
      username: "alice",
      password: "secret",
    });
    const resolved = resolveSoapSecurity("https://example.com/ws", [e], readFile);
    expect(resolved).toEqual({
      username: "alice",
      password: "secret",
      encrypt: false,
      decrypt: false,
      publicKeyPem: "",
      privateKeyPem: "",
    });
  });

  it("matches any subdomain of a bare-domain entry (SSL cert semantics)", () => {
    const e = entry({
      hostname: "corp.internal",
      useUsername: true,
      username: "bob",
      password: "pw",
    });
    const resolved = resolveSoapSecurity(
      "https://api.corp.internal/ws",
      [e],
      readFile,
    );
    expect(resolved?.username).toBe("bob");
  });

  it("matches the catch-all '*' host", () => {
    const e = entry({ hostname: "*", useUsername: true, username: "any", password: "x" });
    const resolved = resolveSoapSecurity("https://other.org/ws", [e], readFile);
    expect(resolved?.username).toBe("any");
  });

  it("treats incoming/outgoing actions as independent toggles", () => {
    const e = entry({ encrypt: true, decrypt: true });
    const resolved = resolveSoapSecurity("https://example.com/ws", [e], readFile);
    expect(resolved?.encrypt).toBe(true);
    expect(resolved?.decrypt).toBe(true);
    expect(resolved?.username).toBe("");
  });

  it("does not enable actions the settings entry did not turn on", () => {
    const e = entry({ useUsername: true, username: "entry-user", password: "entry-pw" });
    const resolved = resolveSoapSecurity("https://example.com/ws", [e], readFile);
    expect(resolved?.encrypt).toBe(false);
    expect(resolved?.decrypt).toBe(false);
  });

  it("applies the dynamic-variable resolver", () => {
    const e = entry({ useUsername: true, username: "{{user}}", password: "{{pass}}" });
    const resolved = resolveSoapSecurity("https://example.com/ws", [e], readFile, (s) =>
      s.replace("{{user}}", "resolved-user").replace("{{pass}}", "resolved-pass"),
    );
    expect(resolved?.username).toBe("resolved-user");
    expect(resolved?.password).toBe("resolved-pass");
  });

  it("tolerates a PKCS#12 bundle that cannot be parsed", () => {
    const e = entry({ decrypt: true, p12Path: "/keys/app.p12", p12Password: "pw" });
    const resolved = resolveSoapSecurity("https://example.com/ws", [e], readFile);
    expect(resolved?.decrypt).toBe(true);
    expect(resolved?.privateKeyPem).toBe("");
  });

  it("tolerates a truststore PEM cert that cannot be parsed", () => {
    const e = entry({ encrypt: true, certPath: "/certs/recipient.pem" });
    const resolved = resolveSoapSecurity("https://example.com/ws", [e], readFile);
    expect(resolved?.encrypt).toBe(true);
    expect(resolved?.publicKeyPem).toBe("");
  });

  it("loads PEM private key from the keystore when source is pem", () => {
    const e = entry({ decrypt: true, keystore: "pem", keyPath: "/keys/app.key" });
    const resolved = resolveSoapSecurity("https://example.com/ws", [e], readFile);
    expect(resolved?.privateKeyPem).toBe("[/keys/app.key]");
  });
});
