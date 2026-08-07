/**
 * WS-Security settings resolution.
 *
 * Pure, host-agnostic module (no `vscode` imports — see GUARDRAILS.md §3).
 * Merges per-request WS-Security settings with global settings entries
 * (Settings → SOAP Security) matched by hostname, and loads the referenced
 * keystore/truststore files via a caller-provided `readFile` callback.
 *
 * Outgoing actions (UsernameToken, body encryption) and incoming actions
 * (response decryption) are independent and combinable, mirroring the SoapUI
 * WS-Security model.
 */
import { parsePkcs12, publicKeyFromCertificatePem } from "./wsse";

/** A settings-level WS-Security entry (hostname-scoped defaults). */
export interface SoapSecurityEntryLike {
  hostname: string;
  username: string;
  password: string;
  /** Outgoing: inject a WS-Security UsernameToken. */
  useUsername?: boolean;
  /** Outgoing: XML-encrypt the request body. */
  encrypt?: boolean;
  /** Incoming: decrypt an encrypted response body. */
  decrypt?: boolean;
  /** Truststore: recipient certificate (PEM) — public key source for encryption. */
  certPath?: string;
  /** Keystore: private key file (PEM) for response decryption. */
  keyPath?: string;
  /** Keystore: PKCS#12 (.p12/.pfx) bundle with cert + private key. */
  p12Path?: string;
  p12Password?: string;
  /** For decryption: where the keystore private key comes from. */
  keystore?: "p12" | "pem";
}

/** Fully resolved WS-Security material ready for the sender. */
export interface ResolvedSoapSecurity {
  username: string;
  password: string;
  encrypt: boolean;
  decrypt: boolean;
  publicKeyPem: string;
  privateKeyPem: string;
}

/**
 * Resolve WS-Security settings for a request URL.
 *
 * Hostname matching mirrors the SSL certificate entries: exact host, any
 * `*.subdomain`, or `*` for all hosts. Only the matched settings entry decides
 * the action toggles (UsernameToken / encryption / decryption). Keystore files
 * referenced by the entry are loaded through `readFile` (which may throw —
 * callers should surface file-load failures). Returns `null` when nothing is
 * active.
 */
export function resolveSoapSecurity(
  url: string,
  entries: SoapSecurityEntryLike[],
  readFile: (path: string) => Buffer,
  resolveVar: (s: string) => string = (s) => s,
): ResolvedSoapSecurity | null {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = "";
  }

  const entry =
    entries.find((e) => host === e.hostname.toLowerCase()) ||
    entries.find((e) => host.endsWith("." + e.hostname.toLowerCase())) ||
    entries.find((e) => e.hostname === "*");

  const useUsername = Boolean(entry?.useUsername && entry.username);
  const encrypt = entry?.encrypt === true;
  const decrypt = entry?.decrypt === true;
  const username = useUsername ? resolveVar(entry?.username || "") : "";
  const password = useUsername ? resolveVar(entry?.password || "") : "";

  let publicKeyPem = "";
  let privateKeyPem = "";

  if (entry) {
    // Keystore source honours the chosen format: a PKCS#12 (.p12/.pfx) bundle
    // carries both the cert (public key) and private key; a PEM keystore is a
    // plain private-key file.
    const keystoreSrc = entry.keystore ?? "p12";
    if (keystoreSrc === "p12" && entry.p12Path) {
      const bundle = parsePkcs12(
        readFile(entry.p12Path).toString("base64"),
        entry.p12Password || "",
      );
      if (bundle) {
        if (!publicKeyPem) publicKeyPem = bundle.publicKeyPem;
        if (!privateKeyPem) privateKeyPem = bundle.privateKeyPem;
      }
    }
    // Truststore / recipient certificate (PEM) — public-key source.
    if (!publicKeyPem && entry.certPath) {
      const certPem = readFile(entry.certPath).toString("utf8");
      publicKeyPem = publicKeyFromCertificatePem(certPem) || "";
    }
    // Keystore as separate PEM private key.
    if (keystoreSrc === "pem" && !privateKeyPem && entry.keyPath) {
      privateKeyPem = readFile(entry.keyPath).toString("utf8");
    }
  }

  const active =
    Boolean(username) ||
    encrypt ||
    decrypt ||
    Boolean(publicKeyPem) ||
    Boolean(privateKeyPem);
  if (!active) return null;
  return { username, password, encrypt, decrypt, publicKeyPem, privateKeyPem };
}
