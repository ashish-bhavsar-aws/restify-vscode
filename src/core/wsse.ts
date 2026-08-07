/**
 * WSSE — WS-Security (UsernameToken + XML Encryption) helpers.
 *
 * Pure, host-agnostic module (no `vscode` imports — see GUARDRAILS.md §3) that
 * runs in the Node extension host, where the `crypto` module is available.
 * The webview must NOT import this module (its bundle targets a browser and has
 * no Node `crypto`); all crypto happens host-side at send/receive time.
 *
 * Implements:
 *   1. UsernameToken credential injection into `<wsse:Security>` headers.
 *   2. XML-Encryption-style body encryption — AES-256-CBC encrypts the SOAP
 *      body while RSA-OAEP wraps the symmetric key — producing a self-contained
 *      `xenc:EncryptedData` payload (EncryptedKey nested in its KeyInfo).
 *   3. Decryption of encrypted SOAP messages with a recipient private key.
 */
import * as crypto from "crypto";
import * as forge from "node-forge";

export const WSSE_NS =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
export const XENC_NS = "http://www.w3.org/2001/04/xmlenc#";
export const DS_NS = "http://www.w3.org/2000/09/xmldsig#";
export const AES256_CBC_ALGO = `${XENC_NS}aes256-cbc`;
export const RSA_OAEP_ALGO = `${XENC_NS}rsa-oaep-mgf1p`;
export const ENCRYPTED_DATA_TYPE = `${XENC_NS}Element`;
export const PASSWORD_TEXT_URI =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText";

export interface WsseSecuritySettings {
  username?: string;
  password?: string;
  encrypt?: boolean;
  publicKeyPem?: string;
}

export interface WsseApplyResult {
  xml: string;
  encrypted: boolean;
  headerInjected: boolean;
}

/** True when a message/body contains an XML-Encryption payload. */
export function looksEncrypted(xml: string): boolean {
  return /<(?:[A-Za-z_][\w.:-]*:)?EncryptedData\b[\s>]/.test(xml || "");
}

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function indent(xml: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return xml
    .split("\n")
    .map((l) => (l.trim() ? pad + l : l))
    .join("\n");
}

function usernameTokenXml(username: string, password: string): string {
  return [
    `<wsse:UsernameToken>`,
    `  <wsse:Username>${escapeXml(username)}</wsse:Username>`,
    `  <wsse:Password Type="${PASSWORD_TEXT_URI}">${escapeXml(password)}</wsse:Password>`,
    `</wsse:UsernameToken>`,
  ].join("\n");
}

/** Replace the text of `<prefix:tag>` while preserving the declared prefix. */
function setTagText(xml: string, tag: string, value: string): string {
  const re = new RegExp(`(<\\w+:${tag}>)[^<]*(</\\w+:${tag}>)`);
  return xml.replace(re, `$1${escapeXml(value)}$2`);
}

function injectSecurityHeader(
  envelope: string,
  username: string,
  password: string,
): string {
  const security = [
    `<wsse:Security xmlns:wsse="${WSSE_NS}">`,
    indent(usernameTokenXml(username, password), 2),
    `</wsse:Security>`,
  ].join("\n");
  const selfClosing = envelope.match(/<soapenv:Header\s*\/>/);
  if (selfClosing) {
    return envelope.replace(
      /<soapenv:Header\s*\/>/,
      `<soapenv:Header>\n${indent(security, 4)}\n  </soapenv:Header>`,
    );
  }
  const open = envelope.match(/(<soapenv:Header[^>]*>)([\s\S]*?)(<\/soapenv:Header>)/);
  if (open) {
    return envelope.replace(
      open[0],
      `${open[1]}\n${indent(security, 4)}\n${open[3]}`,
    );
  }
  return envelope;
}

/** Build an `xenc:EncryptedData` XML node for `plaintext` using the recipient's
 *  public key (RSA-OAEP wraps a fresh AES-256-CBC key). Self-contained: the
 *  encrypted key is nested in the payload's KeyInfo. */
export function buildEncryptedData(
  plaintext: string,
  publicKeyPem: string,
): { xml: string; encryptedKeyB64: string; cipherValueB64: string } {
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);
  const cipherValueB64 = Buffer.concat([iv, encrypted]).toString("base64");

  const encryptedKey = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha1",
    },
    aesKey,
  );
  const encryptedKeyB64 = encryptedKey.toString("base64");

  const xml = [
    `<xenc:EncryptedData xmlns:xenc="${XENC_NS}" xmlns:ds="${DS_NS}" Type="${ENCRYPTED_DATA_TYPE}">`,
    `  <xenc:EncryptionMethod Algorithm="${AES256_CBC_ALGO}"/>`,
    `  <ds:KeyInfo>`,
    `    <xenc:EncryptedKey>`,
    `      <xenc:EncryptionMethod Algorithm="${RSA_OAEP_ALGO}"/>`,
    `      <xenc:CipherData>`,
    `        <xenc:CipherValue>${encryptedKeyB64}</xenc:CipherValue>`,
    `      </xenc:CipherData>`,
    `    </xenc:EncryptedKey>`,
    `  </ds:KeyInfo>`,
    `  <xenc:CipherData>`,
    `    <xenc:CipherValue>${cipherValueB64}</xenc:CipherValue>`,
    `  </xenc:CipherData>`,
    `</xenc:EncryptedData>`,
  ].join("\n");
  return { xml, encryptedKeyB64, cipherValueB64 };
}

/** Replace the content of the `<soapenv:Body>` element in an envelope with an
 *  encrypted `EncryptedData` payload. Returns the input unchanged when the
 *  envelope has no recognizable SOAP body. */
export function encryptSoapEnvelope(
  envelopeXml: string,
  publicKeyPem: string,
): string {
  const body = envelopeXml.match(
    /(<soapenv:Body[^>]*>)([\s\S]*?)(<\/soapenv:Body>)/,
  );
  if (!body) return envelopeXml;
  const { xml } = buildEncryptedData(body[2].trim(), publicKeyPem);
  return envelopeXml.replace(
    body[0],
    `${body[1]}\n${indent(xml, 4)}\n${body[3]}`,
  );
}

/**
 * Apply WS-Security settings to a generated SOAP envelope:
 *   - inject/replace UsernameToken credentials,
 *   - encrypt the body when requested (requires `publicKeyPem`).
 */
export function applyWsseSecurity(
  envelopeXml: string,
  settings: WsseSecuritySettings,
): WsseApplyResult {
  let xml = envelopeXml;
  let headerInjected = false;
  if (settings.username) {
    const withUsername = setTagText(xml, "Username", settings.username);
    xml = setTagText(withUsername, "Password", settings.password || "");
    if (!/<[^>]*Security\b/.test(xml)) {
      xml = injectSecurityHeader(xml, settings.username, settings.password || "");
      headerInjected = true;
    }
  }
  let encrypted = false;
  if (settings.encrypt && settings.publicKeyPem) {
    xml = encryptSoapEnvelope(xml, settings.publicKeyPem);
    encrypted = xml !== envelopeXml;
  }
  return { xml, encrypted, headerInjected };
}

function extractBlock(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`));
  return m ? m[0] : null;
}

function extractCipherValue(block: string, last: boolean): string | null {
  const matches = [...block.matchAll(/<xenc:CipherValue>([\s\S]*?)<\/xenc:CipherValue>/g)];
  if (!matches.length) return null;
  const chosen = last ? matches[matches.length - 1] : matches[0];
  return chosen[1].trim() || null;
}

function decryptKey(
  encryptedKeyB64: string,
  privateKeyPem: string,
): Buffer {
  return crypto.privateDecrypt(
    {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha1",
    },
    Buffer.from(encryptedKeyB64, "base64"),
  );
}

/**
 * Decrypt an XML-Encryption payload. Locates the `EncryptedKey` and the main
 * `EncryptedData` anywhere in the document (works for a bare EncryptedData or a
 * full SOAP envelope). Returns the decrypted plaintext or `null` on failure.
 */
export function decryptEncryptedData(
  xml: string,
  privateKeyPem: string,
): string | null {
  try {
    const encKeyBlock = extractBlock(xml, "xenc:EncryptedKey");
    if (!encKeyBlock) return null;
    const encKeyB64 = extractCipherValue(encKeyBlock, false);
    if (!encKeyB64) return null;
    const aesKey = decryptKey(encKeyB64, privateKeyPem);

    const encDataBlock = extractBlock(xml, "xenc:EncryptedData");
    if (!encDataBlock) return null;
    const cipherB64 = extractCipherValue(encDataBlock, true);
    if (!cipherB64) return null;

    const cipherBytes = Buffer.from(cipherB64, "base64");
    const iv = cipherBytes.subarray(0, 16);
    const payload = cipherBytes.subarray(16);
    const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);
    const decrypted = Buffer.concat([
      decipher.update(payload),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

/** Convenience: decrypt an encrypted SOAP message/body with a private key. */
export function decryptSoapMessage(
  xml: string,
  privateKeyPem: string,
): string | null {
  return decryptEncryptedData(xml, privateKeyPem);
}

export interface Pkcs12Bundle {
  privateKeyPem: string;
  publicKeyPem: string;
  certPem: string;
}

/** Parse a PKCS#12 (.p12/.pfx) bundle (base64) into PEM material, or null. */
export function parsePkcs12(base64: string, password?: string): Pkcs12Bundle | null {
  try {
    const asn1 = forge.asn1.fromDer(
      forge.util.createBuffer(Buffer.from(base64, "base64")),
    );
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password || "");

    const keyBags =
      p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
        forge.pki.oids.pkcs8ShroudedKeyBag
      ] ||
      p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag];
    const certBags =
      p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];

    const keyEntry = keyBags?.[0];
    const certEntry = certBags?.[0];
    if (!keyEntry?.key || !certEntry?.cert) return null;
    const cert = certEntry.cert;
    return {
      privateKeyPem: forge.pki.privateKeyToPem(keyEntry.key),
      publicKeyPem: forge.pki.publicKeyToPem(cert.publicKey),
      certPem: forge.pki.certificateToPem(cert),
    };
  } catch {
    return null;
  }
}

/** Extract the RSA public key (PEM) from an X.509 certificate (PEM). */
export function publicKeyFromCertificatePem(certPem: string): string | null {
  try {
    const cert = forge.pki.certificateFromPem(certPem);
    return forge.pki.publicKeyToPem(cert.publicKey);
  } catch {
    return null;
  }
}
