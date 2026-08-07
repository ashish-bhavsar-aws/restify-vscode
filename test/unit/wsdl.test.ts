import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  parseWsdl,
  buildSoapEnvelope,
  looksLikeWsdl,
  soapContentType,
  parseImportText,
  parseImportTextAuto,
  serializeRequestBody,
  applyHeadersToRequest,
} from "../../src/core";

const fixture = (name: string): string =>
  fs.readFileSync(path.resolve(process.cwd(), "test/fixtures/wsdl", name), "utf8");

const calculator = () => parseWsdl(fixture("calculator.wsdl"));
const security = () => parseWsdl(fixture("security.wsdl"));
const encrypted = () => parseWsdl(fixture("encrypted.wsdl"));

describe("parseWsdl", () => {
  it("rejects non-WSDL XML", () => {
    expect(parseWsdl("<html></html>")).toBeNull();
    expect(parseWsdl("not xml")).toBeNull();
  });

  it("parses document/literal operation, port and targetNamespace", () => {
    const wsdl = calculator();
    expect(wsdl).not.toBeNull();
    expect(wsdl!.name).toBe("CalculatorService");
    expect(wsdl!.targetNamespace).toBe("http://example.com/calc");
    expect(wsdl!.operations).toHaveLength(1);
    expect(wsdl!.ports).toHaveLength(1);

    const op = wsdl!.operations[0];
    expect(op.name).toBe("Add");
    expect(op.style).toBe("document");
    expect(op.use).toBe("literal");
    expect(op.soapAction).toBe("http://example.com/calc/Add");
    expect(op.location).toBe("http://example.com/calc");
    expect(op.isSoap12).toBe(false);
    expect(op.inputElement).toEqual({ ns: "http://example.com/calc", local: "Add" });
  });

  it("captures soap:header binding parts", () => {
    const op = calculator()!.operations[0];
    expect(op.headerParts).toHaveLength(1);
    expect(op.headerParts[0].part).toBe("auth");
    expect(op.headerParts[0].element).toEqual({
      ns: "http://example.com/auth",
      local: "AuthToken",
    });
  });

  it("detects SOAP 1.2 bindings", () => {
    const wsdl = encrypted();
    expect(wsdl!.operations[0].isSoap12).toBe(true);
    expect(wsdl!.isSoap12).toBe(true);
    expect(wsdl!.operations[0].inputElement).toEqual({
      ns: "http://www.w3.org/2001/04/xmlenc#",
      local: "EncryptedData",
    });
  });
});

describe("buildSoapEnvelope", () => {
  it("generates a SOAP 1.1 envelope with sample body", () => {
    const env = buildSoapEnvelope(calculator()!, "Add");
    expect(env).toContain('xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"');
    expect(env).toContain("<tns:Add>");
    expect(env).toContain("<tns:a>0</tns:a>");
    expect(env).toContain("<tns:b>0</tns:b>");
  });

  it("renders declared SOAP headers with sample values", () => {
    const env = buildSoapEnvelope(calculator()!, "Add");
    expect(env).not.toContain("<soapenv:Header/>");
    expect(env).toContain("AuthToken");
    expect(env).toContain("<ns1:token>string</ns1:token>");
    expect(env).toContain("xmlns:ns1=\"http://example.com/auth\"");
  });

  it("renders a WS-Security UsernameToken template for wsse headers", () => {
    const env = buildSoapEnvelope(security()!, "Ping");
    expect(env).toContain("UsernameToken");
    expect(env).toContain("<ns1:Username>username</ns1:Username>");
    expect(env).toContain("PasswordText");
  });

  it("renders an EncryptedData template for xenc inputs on SOAP 1.2", () => {
    const env = buildSoapEnvelope(encrypted()!, "SubmitSecure");
    expect(env).toContain('xmlns:soapenv="http://www.w3.org/2003/05/soap-envelope"');
    expect(env).toContain("EncryptedData");
    expect(env).toContain("BASE64_ENCRYPTED_BODY");
    expect(env).toContain("aes256-cbc");
    expect(env).toContain("rsa-oaep-mgf1p");
  });

  it("uses the first operation when none matches", () => {
    const wsdl = calculator()!;
    expect(buildSoapEnvelope(wsdl, "NoSuchOp")).toContain("<tns:Add>");
  });
});

describe("soapContentType / looksLikeWsdl", () => {
  it("returns the right content type per SOAP version", () => {
    expect(soapContentType(false)).toBe("text/xml; charset=utf-8");
    expect(soapContentType(true)).toBe("application/soap+xml; charset=utf-8");
  });

  it("auto-detects WSDL documents", () => {
    expect(looksLikeWsdl(fixture("calculator.wsdl"))).toBe(true);
    expect(looksLikeWsdl("<html></html>")).toBe(false);
  });
});

describe("parseImportText wsdl", () => {
  it("imports operations with headers, XML body and SOAP metadata", () => {
    const col = parseImportText(fixture("calculator.wsdl"), "wsdl");
    expect(col).not.toBeNull();
    expect(col!.name).toBe("CalculatorService");
    expect(col!.requests).toHaveLength(1);

    const req = col!.requests[0];
    expect(req.method).toBe("POST");
    expect(req.url).toBe("http://example.com/calc");
    expect(req.bodyType).toBe("xml");
    expect(req.body).toContain("<soapenv:Envelope");
    expect(req.body).toContain("AuthToken");

    const headers = req.headers as Array<{ key: string; value: string; enabled: boolean }>;
    expect(headers.find((h) => h.key === "Content-Type")?.value).toBe("text/xml; charset=utf-8");
    expect(headers.find((h) => h.key === "SOAPAction")?.value).toBe("http://example.com/calc/Add");

    const meta = req.soapMeta as any;
    expect(meta.operation).toBe("Add");
    expect(meta.targetNamespace).toBe("http://example.com/calc");
    expect(meta.isSoap12).toBe(false);
    expect(meta.operations).toHaveLength(1);
    expect(typeof meta.operations[0].body).toBe("string");
    expect(meta.operations[0].body).toContain("<soapenv:Envelope");
  });

  it("returns null for a WSDL with no importable operations", () => {
    const wsdl = '<?xml version="1.0"?><definitions xmlns="http://schemas.xmlsoap.org/wsdl/" name="x"/>';
    expect(parseImportText(wsdl, "wsdl")).toBeNull();
  });
});

describe("parseImportTextAuto wsdl", () => {
  it("auto-detects and imports WSDL text", () => {
    const col = parseImportTextAuto(fixture("security.wsdl"));
    expect(col).not.toBeNull();
    expect(col!.requests[0].soapMeta).toBeTruthy();
    expect(col!.requests[0].body).toContain("UsernameToken");
  });
});

describe("body serialization + SOAP headers", () => {
  it("serializes xml body with soap content type when soapMeta present", () => {
    const req = {
      bodyType: "xml",
      body: "<Envelope/>",
      soapMeta: { isSoap12: true },
    } as any;
    const serialized = serializeRequestBody(req, (s) => s);
    expect(serialized.headers?.["Content-Type"]).toBe("application/soap+xml; charset=utf-8");
    expect(serialized.forceHeaders).toContain("Content-Type");
  });

  it("keeps application/xml for plain xml bodies", () => {
    const serialized = serializeRequestBody({ bodyType: "xml", body: "<a/>" } as any, (s) => s);
    expect(serialized.headers?.["Content-Type"]).toBe("application/xml");
    expect(serialized.forceHeaders).toBeUndefined();
  });

  it("forces the SOAP content type over a user-supplied header", () => {
    const serialized = serializeRequestBody(
      { bodyType: "xml", body: "<Envelope/>", soapMeta: { isSoap12: false } } as any,
      (s) => s,
    );
    const target: Record<string, string> = { "Content-Type": "application/json" };
    applyHeadersToRequest(target, serialized.headers, serialized.forceHeaders);
    expect(target["Content-Type"]).toBe("text/xml; charset=utf-8");
  });
});

describe("parseWsdl — name fallbacks", () => {
  it("uses the service name when <definitions> has no name attribute", () => {
    const xml = `<?xml version="1.0"?>
      <wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
        targetNamespace="https://example.com/Weather">
        <wsdl:service name="WeatherService"><wsdl:port name="WeatherSoap" binding="tns:B"/></wsdl:service>
      </wsdl:definitions>`;
    const doc = parseWsdl(xml);
    expect(doc!.name).toBe("WeatherService");
  });

  it("derives a friendly name from the targetNamespace URL when no service element exists", () => {
    const xml = `<?xml version="1.0"?>
      <wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
        targetNamespace="https://soap.example.com/Shipping?wsdl"></wsdl:definitions>`;
    const doc = parseWsdl(xml);
    expect(doc!.name).toBe("Shipping");
  });
});

describe("parseWsdl — prefixed-namespace WSDL (live CountryInfoService)", () => {
  const wsdl = () => parseWsdl(fixture("CountryInfoService.wsdl"));

  it("parses a wsdl:-prefixed document (real-world shape)", () => {
    const doc = wsdl();
    expect(doc).not.toBeNull();
    expect(doc!.targetNamespace).toBe("https://soap-service-free.mock.beeceptor.com/CountryInfoService");
    expect(doc!.name).toBe("CountryInfoService"); // no <definitions name=...>, falls back to the <service> name
  });

  it("extracts both operations with SOAPActions and the live endpoint", () => {
    const doc = wsdl();
    const ops = doc!.operations;
    expect(ops.map((o) => o.name).sort()).toEqual([
      "ListOfContinentsByName",
      "ListOfCountryNamesByName",
    ]);
    const continents = ops.find((o) => o.name === "ListOfContinentsByName")!;
    expect(continents.soapAction).toBe(
      "https://soap-service-free.mock.beeceptor.com/CountryInfoService.wso/ListOfContinentsByName",
    );
    expect(continents.location).toBe(
      "https://soap-service-free.mock.beeceptor.com/CountryInfoService.wso",
    );
    expect(continents.isSoap12).toBe(false);
  });

  it("generates an empty-parameter document/literal envelope per operation", () => {
    const doc = wsdl();
    const op = doc!.operations.find((o) => o.name === "ListOfCountryNamesByName")!;
    const envelope = buildSoapEnvelope(doc!, op.name);
    expect(envelope).toContain("soapenv:Envelope");
    expect(envelope).toContain("<tns:ListOfCountryNamesByName");
    expect(envelope).not.toContain("<a>");
  });

  it("imports the URL content as a collection with POST requests", () => {
    const collection = parseImportText(fixture("CountryInfoService.wsdl"), "wsdl");
    expect(collection).not.toBeNull();
    expect(collection!.name).toBe("CountryInfoService");
    expect(collection!.requests).toHaveLength(2);
    for (const req of collection!.requests) {
      expect(req.method).toBe("POST");
      expect(req.bodyType).toBe("xml");
      expect(req.url).toBe("https://soap-service-free.mock.beeceptor.com/CountryInfoService.wso");
    }
  });
});
