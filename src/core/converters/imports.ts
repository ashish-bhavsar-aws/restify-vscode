import { _newId } from "./shared";
import { parseYaml } from "./yaml";
import { parseHarCollection } from "./har";
import { parseHttpFileText } from "./httpText";
import { parseInsomniaCollection } from "./insomnia";
import { parseOpenApiCollection } from "./openapi";
import { parsePostmanCollection } from "./postman";
import { parseRestifyCollection } from "./restify";
import { buildSoapEnvelope, looksLikeWsdl, parseWsdl, soapContentType } from "../wsdl";
import type { ImportedCollection, ImportSource } from "./types";
export function detectJsonSource(data: any, filename?: string): ImportSource {
  if (!data || typeof data !== "object") return null;

  if (Array.isArray(data) && data.some((r) => r && typeof r._type === "string")) {
    return "insomnia";
  }
  if (typeof data.info?.schema === "string" && data.info.schema.includes("collection")) {
    return "postman";
  }
  if (typeof data.openapi === "string" && data.openapi.startsWith("3")) return "openapi";
  if (data.swagger === "2.0") return "openapi";
  if (data.log && Array.isArray(data.log.entries)) return "har";
  if (data.name && (Array.isArray(data.requests) || Array.isArray(data.groups))) {
    return "restify";
  }

  if (filename) {
    const lower = filename.toLowerCase();
    if (lower.endsWith(".har") || lower.endsWith(".har.json")) return "har";
    if (lower.endsWith(".http")) return "http";
    if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "openapi";
  }
  return null;
}
export function parseImportText(
  text: string,
  source: ImportSource,
): ImportedCollection | null {
  if (!text) return null;
  switch (source) {
    case "postman": {
      try {
        return parsePostmanCollection(JSON.parse(text));
      } catch {
        return null;
      }
    }
    case "openapi": {
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        try {
          data = parseYaml(text);
        } catch {
          return null;
        }
      }
      return parseOpenApiCollection(data);
    }
    case "har": {
      try {
        return parseHarCollection(JSON.parse(text));
      } catch {
        return null;
      }
    }
    case "insomnia": {
      try {
        return parseInsomniaCollection(JSON.parse(text));
      } catch {
        return null;
      }
    }
    case "http":
      return parseHttpFileText(text);
    case "wsdl":
      return parseWsdlCollection(text);
    case "restify": {
      try {
        const data = JSON.parse(text);
        return Array.isArray(data) ? data.map(parseRestifyCollection).filter(Boolean)[0] || null : parseRestifyCollection(data);
      } catch {
        return null;
      }
    }
    default:
      return null;
  }
}
export function parseImportTextAuto(text: string, filename?: string): ImportedCollection | null {
  let data: any;
  let source: ImportSource = null;
  try {
    data = JSON.parse(text);
    source = detectJsonSource(data, filename);
  } catch {
    if (filename && /\.http$/i.test(filename)) {
      source = "http";
    } else if (/^\s*(###|#)\s/.test(text) || /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+\S+/im.test(text)) {
      source = "http";
    } else if (looksLikeWsdl(text)) {
      source = "wsdl";
    } else {
      try {
        data = parseYaml(text);
        source = detectJsonSource(data, filename);
      } catch {
        source = null;
      }
    }
  }
  if (source === "http") return parseHttpFileText(text);
  if (source === "wsdl") return parseWsdlCollection(text);
  if (!source) return null;
  return parseImportText(text, source);
}
function parseWsdlCollection(xml: string): ImportedCollection | null {
  const wsdl = parseWsdl(xml);
  if (!wsdl || !wsdl.operations.length) return null;

  const operations = wsdl.operations.filter((op) => Boolean(op.location));
  if (!operations.length) return null;

  const requests = operations.map((op) => {
    const body = buildSoapEnvelope(wsdl, op.name);
    const contentType = soapContentType(op.isSoap12);
    const headers = [
      { key: "Content-Type", value: contentType, enabled: true },
      { key: "SOAPAction", value: op.soapAction || "", enabled: true },
    ];
    return {
      id: _newId("request"),
      name: op.name || "SOAP Operation",
      method: "POST",
      url: op.location || wsdl.ports[0]?.location || "",
      headers,
      queryParams: [],
      bodyType: "xml",
      body,
      soapMeta: {
        wsdl: xml,
        operation: op.name,
        targetNamespace: wsdl.targetNamespace,
        isSoap12: op.isSoap12,
        operations: wsdl.operations.map((otherOp) => ({
          name: otherOp.name,
          soapAction: otherOp.soapAction,
          location: otherOp.location,
          isSoap12: otherOp.isSoap12,
          body: buildSoapEnvelope(wsdl, otherOp.name),
        })),
      },
    };
  });

  return {
    id: _newId("col"),
    name: wsdl.name || "WSDL Import",
    requests,
  };
}
