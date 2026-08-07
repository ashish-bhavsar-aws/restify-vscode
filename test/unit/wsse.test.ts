import { describe, it, expect } from "vitest";
import * as crypto from "crypto";
import * as forge from "node-forge";
import {
  buildEncryptedData,
  encryptSoapEnvelope,
  decryptEncryptedData,
  decryptSoapMessage,
  applyWsseSecurity,
  looksEncrypted,
  parsePkcs12,
  publicKeyFromCertificatePem,
  WSSE_NS,
  XENC_NS,
} from "../../src/core";

function keyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  return {
    publicKeyPem: publicKey.export({ type: "pkcs1", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
  };
}

const sampleEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="http://example.com/calc">
  <soapenv:Header/>
  <soapenv:Body>
    <tns:Add>
      <a>1</a>
      <b>2</b>
    </tns:Add>
  </soapenv:Body>
</soapenv:Envelope>`;

describe("looksEncrypted", () => {
  it("detects EncryptedData payloads", () => {
    expect(looksEncrypted('<xenc:EncryptedData><xenc:CipherValue>aGk=</xenc:CipherValue></xenc:EncryptedData>')).toBe(true);
    expect(looksEncrypted("<tns:Add/>")).toBe(false);
    expect(looksEncrypted("")).toBe(false);
  });
});

describe("encrypt / decrypt round trip", () => {
  it("builds self-contained EncryptedData that decrypts back", () => {
    const { publicKeyPem, privateKeyPem } = keyPair();
    const body = "<tns:Add><a>1</a><b>2</b></tns:Add>";
    const { xml, encryptedKeyB64, cipherValueB64 } = buildEncryptedData(body, publicKeyPem);

    expect(encryptedKeyB64.length).toBeGreaterThan(0);
    expect(cipherValueB64.length).toBeGreaterThan(0);
    expect(xml).toContain(XENC_NS);
    expect(xml).toContain("xenc:EncryptedData");

    const decrypted = decryptEncryptedData(xml, privateKeyPem);
    expect(decrypted).toBe(body);
  });

  it("decrypts an encrypted SOAP envelope body", () => {
    const { publicKeyPem, privateKeyPem } = keyPair();
    const encrypted = encryptSoapEnvelope(sampleEnvelope, publicKeyPem);
    expect(encrypted).not.toBe(sampleEnvelope);
    expect(encrypted).toContain("xenc:EncryptedData");

    const plain = decryptSoapMessage(encrypted, privateKeyPem);
    expect(plain).toBe("<tns:Add>\n      <a>1</a>\n      <b>2</b>\n    </tns:Add>");
  });

  it("returns null for wrong private key", () => {
    const { publicKeyPem } = keyPair();
    const { privateKeyPem } = keyPair();
    const { xml } = buildEncryptedData("<tns:Add/>", publicKeyPem);
    expect(decryptEncryptedData(xml, privateKeyPem)).toBeNull();
  });

  it("returns null for non-encrypted input", () => {
    const { privateKeyPem } = keyPair();
    expect(decryptSoapMessage("<tns:Add/>", privateKeyPem)).toBeNull();
  });
});

describe("applyWsseSecurity", () => {
  it("injects a Security header with credentials when none exists", () => {
    const { xml, headerInjected } = applyWsseSecurity(sampleEnvelope, {
      username: "alice",
      password: "s3cret",
    });
    expect(headerInjected).toBe(true);
    expect(xml).toContain(`xmlns:wsse="${WSSE_NS}"`);
    expect(xml).toContain("<wsse:Username>alice</wsse:Username>");
    expect(xml).toContain("<wsse:Password");
  });

  it("replaces placeholder credentials in an existing Security header", () => {
    const envelope = sampleEnvelope.replace(
      "<soapenv:Header/>",
      `<soapenv:Header>\n  <wsse:Security xmlns:wsse="${WSSE_NS}">\n    <wsse:UsernameToken>\n      <wsse:Username>username</wsse:Username>\n      <wsse:Password Type="http://example.com/PasswordText">password</wsse:Password>\n    </wsse:UsernameToken>\n  </wsse:Security>\n</soapenv:Header>`,
    );
    const { xml } = applyWsseSecurity(envelope, { username: "bob", password: "hunter2" });
    expect(xml).toContain("<wsse:Username>bob</wsse:Username>");
    expect(xml).toContain("<wsse:Password");
  });

  it("encrypts the body when configured and leaves metadata", () => {
    const { publicKeyPem, privateKeyPem } = keyPair();
    const { xml, encrypted } = applyWsseSecurity(sampleEnvelope, {
      username: "alice",
      password: "pw",
      encrypt: true,
      publicKeyPem,
    });
    expect(encrypted).toBe(true);
    expect(xml).toContain("xenc:EncryptedData");
    expect(decryptSoapMessage(xml, privateKeyPem)).toContain("<tns:Add>");
  });

  it("escapes XML-sensitive credential values", () => {
    const { xml } = applyWsseSecurity(sampleEnvelope, { username: "a<b&c", password: "p\"q" });
    expect(xml).toContain("<wsse:Username>a&lt;b&amp;c</wsse:Username>");
  });
});

function makeP12(password = "p12secret") {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 86400000);
  const attrs = [{ name: "commonName", value: "recipient.example.com" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password);
  const der = forge.asn1.toDer(p12Asn1).getBytes();
  return {
    base64: Buffer.from(der, "binary").toString("base64"),
    password,
  };
}

describe("PKCS#12 keystore support", () => {
  it("extracts PEM keys and certificate from a .p12 bundle", () => {
    const { base64, password } = makeP12();
    const bundle = parsePkcs12(base64, password);
    expect(bundle).not.toBeNull();
    expect(bundle!.privateKeyPem).toContain("PRIVATE KEY");
    expect(bundle!.publicKeyPem).toContain("PUBLIC KEY");
    expect(bundle!.certPem).toContain("CERTIFICATE");
  });

  it("returns null for garbage input or a wrong password", () => {
    expect(parsePkcs12("bm90LWEtcDEyCg==", "x")).toBeNull();
    const { base64 } = makeP12();
    expect(parsePkcs12(base64, "wrong")).toBeNull();
  });

  it("extracts the public key from a certificate PEM", () => {
    const { base64, password } = makeP12();
    const bundle = parsePkcs12(base64, password)!;
    const pub = publicKeyFromCertificatePem(bundle.certPem);
    expect(pub).toContain("PUBLIC KEY");
  });

  it("round-trips body encryption using keystore keys", () => {
    const { base64, password } = makeP12();
    const bundle = parsePkcs12(base64, password)!;
    const enc = encryptSoapEnvelope(sampleEnvelope, bundle.publicKeyPem);
    expect(enc).toContain("xenc:EncryptedData");
    const plain = decryptSoapMessage(enc, bundle.privateKeyPem);
    expect(plain).toContain("<tns:Add>");
  });
});
