import { buildSoapEnvelope, looksLikeWsdl, parseWsdl, soapContentType } from "./wsdl";

/**
 * Pure import/export converters for Restify collections, environments, and
 * `.http` files. Kept free of vscode/webview dependencies so it is
 * unit-testable in isolation (see GUARDRAILS.md §3).
 *
 * Supported sources: Postman (v1/v2), OpenAPI/Swagger (2.0/3.x), HAR,
 * Insomnia, REST Client `.http`, and Restify's own JSON export.
 * Supported export targets: Postman v2.1, OpenAPI 3.0, HAR, `.http`,
 * Restify JSON, and Postman/Restify environment files.
 */

export interface ImportRequest {
  name?: string;
  method?: string;
  url?: string;
  headers?: Array<{ key: string; value: string; enabled?: boolean }>;
  queryParams?: Array<{ key: string; value: string; enabled?: boolean }>;
  bodyType?: string;
  body?: string;
  formData?: any[];
  urlencoded?: Array<{ key: string; value: string; enabled?: boolean }>;
  gqlQuery?: string;
  gqlVars?: string;
  authType?: string;
  authData?: any;
  [key: string]: any;
}

export interface ImportedCollection {
  id: string;
  name: string;
  requests: ImportRequest[];
  groups?: Array<{ id: string; name: string; requests: ImportRequest[]; groups: any[] }>;
}

export type ImportSource =
  | "postman"
  | "openapi"
  | "restify"
  | "har"
  | "insomnia"
  | "http"
  | "wsdl"
  | null;

function _uuid(): string {
  try {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  } catch {
    return `${Date.now()}`;
  }
}

function _newId(prefix: string): string {
  return `${prefix}-${_uuid()}`;
}

function _cleanId(id: any): string {
  return id !== undefined && id !== null ? String(id) : _newId("col");
}

/** Detect the import source for a parsed JSON document (or filename hint). */
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

/** Parse a raw file into an imported collection, dispatching on source. */
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

/** Detect then parse raw text into an imported collection. */
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

function parseRestifyCollection(data: any): ImportedCollection | null {
  if (!data || typeof data !== "object" || !data.name) return null;
  return {
    id: _cleanId(data.id),
    name: data.name,
    requests: Array.isArray(data.requests) ? data.requests.map(_sanitizeRequest) : [],
    groups: _sanitizeGroups(data.groups),
  };
}

function _sanitizeRequest(r: any): ImportRequest {
  if (!r || typeof r !== "object") return { name: "Untitled", method: "GET", url: "" };
  return {
    ...r,
    headers: Array.isArray(r.headers) ? r.headers.filter((h: any) => h && h.key) : [],
    queryParams: Array.isArray(r.queryParams) ? r.queryParams : [],
    urlencoded: Array.isArray(r.urlencoded) ? r.urlencoded : [],
    formData: Array.isArray(r.formData) ? r.formData : [],
  };
}

function _sanitizeGroups(groups: any[] | undefined): any[] {
  return (groups || []).map((g: any) => ({
    id: _cleanId(g.id),
    name: g.name || "Folder",
    requests: Array.isArray(g.requests) ? g.requests.map(_sanitizeRequest) : [],
    groups: _sanitizeGroups(g.groups),
  }));
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

// ─── Postman ────────────────────────────────────────────────────────────────

export function parsePostmanCollection(data: any): ImportedCollection | null {
  const isV2 = data?.info?.schema?.includes("collection") && Array.isArray(data?.item);
  const isV1 = data?.requests && Array.isArray(data.requests);
  if (!isV2 && !isV1) return null;

  const name = data.info?.name || data.name || "Postman Import";
  const requests: ImportRequest[] = [];

  if (isV2) {
    _collectPostmanItems(data.item || [], requests);
  } else {
    for (const req of data.requests as any[]) {
      requests.push(_postmanV1Request(req));
    }
  }

  return { id: _newId("col"), name, requests };
}

function _collectPostmanItems(items: any[], out: ImportRequest[]): void {
  for (const item of items) {
    if (Array.isArray(item.item)) {
      _collectPostmanItems(item.item, out);
    } else if (item.request) {
      out.push(_postmanV2Request(item));
    }
  }
}

function _detectRawBodyType(
  headers: Array<{ key?: string; value?: string }>,
  languageHint?: string,
): "json" | "xml" | "text" | "graphql" {
  const language = (languageHint || "").toLowerCase();
  if (language === "json") return "json";
  if (language === "xml") return "xml";
  if (language === "graphql") return "graphql";

  const contentTypeHeader = headers.find((h) => (h.key || "").toLowerCase() === "content-type");
  const contentType = (contentTypeHeader?.value || "").toLowerCase();
  if (contentType.includes("application/json")) return "json";
  if (contentType.includes("application/xml") || contentType.includes("text/xml")) return "xml";
  if (contentType.includes("application/graphql")) return "graphql";
  return "text";
}

function _postmanAuth(req: any): { authType?: string; authData?: any } {
  const auth = req?.auth || {};
  if (auth.type === "bearer" && Array.isArray(auth.bearer)) {
    const token = auth.bearer.find((v: any) => v.key === "token")?.value;
    return { authType: "bearer", authData: { token: token ?? "" } };
  }
  if (auth.type === "basic" && Array.isArray(auth.basic)) {
    const username = auth.basic.find((v: any) => v.key === "username")?.value;
    const password = auth.basic.find((v: any) => v.key === "password")?.value;
    return { authType: "basic", authData: { username: username ?? "", password: password ?? "" } };
  }
  if (auth.type === "apikey" && Array.isArray(auth.apikey)) {
    const keyName = auth.apikey.find((v: any) => v.key === "key")?.value;
    const keyValue = auth.apikey.find((v: any) => v.key === "value")?.value;
    const addTo = auth.apikey.find((v: any) => v.key === "in")?.value === "query" ? "query" : "header";
    return { authType: "apikey", authData: { keyName: keyName ?? "", keyValue: keyValue ?? "", addTo } };
  }
  return {};
}

function _postmanV2Request(item: any): ImportRequest {
  const req = item.request || {};
  const rawUrl = typeof req.url === "string" ? req.url : req.url?.raw || "";
  const headers = (req.header || []).map((h: any) => ({ key: h.key || "", value: h.value || "" }));

  let body = "";
  let bodyType = "none";
  let formData: any[] | undefined;
  let urlencoded: Array<{ key: string; value: string }> | undefined;
  if (req.body) {
    if (req.body.mode === "raw") {
      body = req.body.raw || "";
      bodyType = _detectRawBodyType(headers, req.body?.options?.raw?.language);
    } else if (req.body.mode === "urlencoded") {
      bodyType = "form";
      urlencoded = (req.body.urlencoded || []).map((p: any) => ({
        key: p.key || "",
        value: p.value || "",
      }));
    } else if (req.body.mode === "formdata") {
      bodyType = "form";
      formData = (req.body.formdata || []).map((p: any) => ({
        key: p.key || "",
        value: p.value || "",
        enabled: p.disabled !== true,
        formType: p.type === "file" ? "file" : "text",
        fileName: p.type === "file" ? p.src || "" : undefined,
        contentType: p.contentType || undefined,
      }));
    }
  }

  const queryParams = (req.url?.query || []).map((q: any) => ({
    key: q.key || "",
    value: q.value || "",
    enabled: q.disabled !== true,
  }));

  return {
    id: _newId("request"),
    name: item.name || "Untitled",
    method: (req.method || "GET").toUpperCase(),
    url: rawUrl,
    headers,
    queryParams,
    body,
    bodyType,
    formData,
    urlencoded,
    ..._postmanAuth(req),
  };
}

function _postmanV1Request(req: any): ImportRequest {
  const headers = (req.headerData || []).map((h: any) => ({ key: h.key || "", value: h.value || "" }));
  const rawType = _detectRawBodyType(headers, req.dataMode === "raw" ? req.dataMode : undefined);
  return {
    id: _newId("request"),
    name: req.name || "Untitled",
    method: (req.method || "GET").toUpperCase(),
    url: req.url || "",
    headers,
    body: req.rawModeData || "",
    bodyType: req.dataMode === "raw" ? rawType : "none",
  };
}

/** Export a collection to Postman Collection v2.1 JSON. */
export function collectionToPostman(col: ImportedCollection): any {
  const item = _requestListToPostman(col.requests || []);
  const groups = (col.groups || []).map((g) => _groupToPostman(g));
  return {
    info: {
      name: col.name || "Restify Collection",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: [...item, ...groups],
  };
}

function _groupToPostman(group: any): any {
  return {
    name: group.name || "Folder",
    item: [..._requestListToPostman(group.requests || []), ...(group.groups || []).map(_groupToPostman)],
  };
}

function _requestListToPostman(requests: ImportRequest[]): any[] {
  return (requests || []).map((req) => {
    const headers = (req.headers || [])
      .filter((h) => h.key)
      .map((h) => ({ key: h.key, value: h.value || "", disabled: h.enabled === false }));
    const query = (req.queryParams || [])
      .filter((p) => p.key)
      .map((p) => ({ key: p.key, value: p.value || "", disabled: p.enabled === false }));
    const url: any = { raw: req.url || "", query };
    const parsedUrl = _safeParseUrl(req.url);
    if (parsedUrl) {
      url.protocol = parsedUrl.protocol;
      url.host = [parsedUrl.hostname];
      url.path = parsedUrl.pathname.split("/").filter(Boolean);
    }
    const body: any = {};
    const method = (req.method || "GET").toUpperCase();
    if (req.bodyType === "graphql") {
      body.mode = "graphql";
      body.graphql = { query: req.gqlQuery || req.body || "" };
    } else if (req.bodyType === "urlencoded") {
      body.mode = "urlencoded";
      body.urlencoded = (req.urlencoded || []).map((p: any) => ({ key: p.key, value: p.value || "", disabled: p.enabled === false }));
    } else if (req.bodyType === "form") {
      body.mode = "formdata";
      body.formdata = (req.formData || [])
        .filter((f: any) => f.key)
        .map((f: any) => ({
          key: f.key,
          value: (f.formType || "text") === "file" ? (f.fileName || "") : (f.value || ""),
          type: (f.formType || "text") === "file" ? "file" : "text",
          src: (f.formType || "text") === "file" ? (f.fileName || "") : undefined,
          disabled: f.enabled === false,
        }));
    } else if (req.bodyType === "json") {
      body.mode = "raw";
      body.raw = req.body || "";
      body.options = { raw: { language: "json" } };
    } else if (req.bodyType === "xml") {
      body.mode = "raw";
      body.raw = req.body || "";
      body.options = { raw: { language: "xml" } };
    } else if (req.bodyType === "text") {
      body.mode = "raw";
      body.raw = req.body || "";
      body.options = { raw: { language: "text" } };
    } else if (req.body && method !== "GET" && method !== "HEAD") {
      body.mode = "raw";
      body.raw = req.body;
    }

    const request: any = { method, url, header: headers };
    if (Object.keys(body).length > 0) request.body = body;

    const authType = req.authType || "none";
    if (authType === "bearer" && req.authData?.token) {
      request.auth = { type: "bearer", bearer: [{ key: "token", value: req.authData.token, type: "string" }] };
    } else if (authType === "basic" && req.authData?.username) {
      request.auth = {
        type: "basic",
        basic: [
          { key: "username", value: req.authData.username, type: "string" },
          { key: "password", value: req.authData.password || "", type: "string" },
        ],
      };
    } else if (authType === "apikey" && req.authData?.keyName) {
      request.auth = {
        type: "apikey",
        apikey: [
          { key: "key", value: req.authData.keyName, type: "string" },
          { key: "value", value: req.authData.keyValue || "", type: "string" },
          { key: "in", value: req.authData.addTo === "query" ? "query" : "header", type: "string" },
        ],
      };
    }

    return { name: req.name || "Untitled", request };
  });
}

// ─── OpenAPI / Swagger ──────────────────────────────────────────────────────

interface OpenApiBodySeed {
  bodyType: "none" | "json" | "text" | "xml" | "form" | "urlencoded";
  body: string;
  formData?: Array<{ key: string; value: string; enabled: boolean; formType?: "text" | "file"; contentType?: string }>;
  urlencoded?: Array<{ key: string; value: string; enabled: boolean }>;
  contentType?: string;
}

function _resolveOpenApiRef(doc: any, ref: string): any {
  if (!ref.startsWith("#/")) return undefined;
  return ref
    .slice(2)
    .split("/")
    .reduce((obj: any, part: string) => obj?.[part.replace(/~1/g, "/").replace(/~0/g, "~")], doc);
}

function _resolveOpenApiSchema(doc: any, schema: any, seen = new Set<string>()): any {
  if (!schema || typeof schema !== "object") return schema;

  if (schema.$ref) {
    if (seen.has(schema.$ref)) return {};
    seen.add(schema.$ref);
    const resolved = _resolveOpenApiRef(doc, schema.$ref);
    return _resolveOpenApiSchema(doc, resolved, seen) || {};
  }

  if (Array.isArray(schema.allOf)) {
    return schema.allOf.reduce((merged: any, part: any) => {
      const resolved = _resolveOpenApiSchema(doc, part, new Set(seen)) || {};
      return {
        ...merged,
        ...resolved,
        properties: { ...(merged.properties || {}), ...(resolved.properties || {}) },
        required: [...(merged.required || []), ...(resolved.required || [])],
      };
    }, { ...schema, allOf: undefined });
  }

  const alternative = schema.oneOf?.[0] || schema.anyOf?.[0];
  if (alternative) return _resolveOpenApiSchema(doc, alternative, seen);

  return schema;
}

function _resolveOpenApiObject(doc: any, obj: any): any {
  return obj?.$ref ? (_resolveOpenApiRef(doc, obj.$ref) || obj) : obj;
}

function _sampleFromOpenApiSchema(doc: any, schema: any, seen = new Set<any>()): any {
  schema = _resolveOpenApiSchema(doc, schema);
  if (!schema || typeof schema !== "object") return null;
  if (seen.has(schema)) return null;
  seen.add(schema);

  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.examples) && schema.examples.length > 0) return schema.examples[0];
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (schema.const !== undefined) return schema.const;

  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  const inferredType = type || (schema.properties ? "object" : schema.items ? "array" : undefined);

  switch (inferredType) {
    case "object": {
      const out: Record<string, any> = {};
      for (const [key, propSchema] of Object.entries(schema.properties || {})) {
        out[key] = _sampleFromOpenApiSchema(doc, propSchema, new Set(seen));
      }
      if (Object.keys(out).length === 0 && schema.additionalProperties && typeof schema.additionalProperties === "object") {
        out.property = _sampleFromOpenApiSchema(doc, schema.additionalProperties, new Set(seen));
      }
      return out;
    }
    case "array":
      return [_sampleFromOpenApiSchema(doc, schema.items || {}, new Set(seen))];
    case "integer":
    case "number":
      return schema.minimum ?? 0;
    case "boolean":
      return false;
    case "string":
      if (schema.format === "date-time") return new Date(0).toISOString();
      if (schema.format === "date") return "1970-01-01";
      if (schema.format === "email") return "user@example.com";
      if (schema.format === "uuid") return "00000000-0000-0000-0000-000000000000";
      if (schema.format === "binary") return "";
      return "";
    default:
      return null;
  }
}

function _openApiSchemaToKv(doc: any, schema: any): Array<{ key: string; value: string; enabled: boolean }> {
  const resolved = _resolveOpenApiSchema(doc, schema);
  const sample = _sampleFromOpenApiSchema(doc, resolved);
  const obj = sample && typeof sample === "object" && !Array.isArray(sample) ? sample : {};
  const keys = Object.keys(obj).length ? Object.keys(obj) : Object.keys(resolved?.properties || {});
  return keys.map((key) => {
    const value = obj[key] !== undefined ? obj[key] : _sampleFromOpenApiSchema(doc, resolved.properties?.[key]);
    return {
      key,
      value: typeof value === "string" ? value : JSON.stringify(value ?? ""),
      enabled: true,
    };
  });
}

function _openApiSchemaToFormData(
  doc: any,
  schema: any,
): Array<{ key: string; value: string; enabled: boolean; formType: "text" | "file"; contentType?: string }> {
  const resolved = _resolveOpenApiSchema(doc, schema);
  return _openApiSchemaToKv(doc, resolved).map((item) => {
    const propSchema = _resolveOpenApiSchema(doc, resolved?.properties?.[item.key]);
    const isFile = propSchema?.type === "string" && (propSchema.format === "binary" || propSchema.format === "base64");
    return {
      ...item,
      value: isFile ? "" : item.value,
      formType: isFile ? "file" : "text",
      contentType: isFile ? "application/octet-stream" : undefined,
    };
  });
}

function _sampleToXml(value: any, tagName = "root"): string {
  const safeTag = tagName.replace(/[^A-Za-z0-9_.-]/g, "") || "item";
  if (Array.isArray(value)) {
    return value.map((item) => _sampleToXml(item, safeTag)).join("");
  }
  if (value && typeof value === "object") {
    const children = Object.entries(value)
      .map(([key, child]) => _sampleToXml(child, key))
      .join("");
    return `<${safeTag}>${children}</${safeTag}>`;
  }
  return `<${safeTag}>${String(value ?? "")}</${safeTag}>`;
}

function _pickOpenApiContent(content: Record<string, any> = {}): { contentType: string; media: any } | null {
  const contentTypes = Object.keys(content);
  const normalized = (ct: string) => ct.toLowerCase().split(";")[0].trim();
  const preferred =
    contentTypes.find((ct) => normalized(ct).includes("json")) ||
    contentTypes.find((ct) => normalized(ct) === "application/x-www-form-urlencoded") ||
    contentTypes.find((ct) => normalized(ct) === "multipart/form-data") ||
    contentTypes.find((ct) => normalized(ct).includes("xml")) ||
    contentTypes.find((ct) => normalized(ct).startsWith("text/")) ||
    contentTypes[0];
  return preferred ? { contentType: preferred, media: content[preferred] } : null;
}

function _bodySeedFromContent(doc: any, contentType: string, media: any): OpenApiBodySeed {
  const normalizedContentType = contentType.toLowerCase().split(";")[0].trim();
  const schema = media?.schema;
  const firstNamedExample = Object.values(media?.examples || {})[0] as any;
  const mediaExample = media?.example ?? firstNamedExample?.value;
  const sample = mediaExample !== undefined ? mediaExample : _sampleFromOpenApiSchema(doc, schema);

  if (normalizedContentType === "application/x-www-form-urlencoded") {
    return { bodyType: "urlencoded", body: "", urlencoded: _openApiSchemaToKv(doc, schema), contentType };
  }
  if (normalizedContentType === "multipart/form-data") {
    return {
      bodyType: "form",
      body: "",
      formData: _openApiSchemaToFormData(doc, schema),
      contentType,
    };
  }
  if (normalizedContentType.includes("json")) {
    return { bodyType: "json", body: JSON.stringify(sample ?? {}, null, 2), contentType };
  }
  if (normalizedContentType.includes("xml")) {
    const root = schema?.xml?.name || "root";
    return { bodyType: "xml", body: typeof sample === "string" ? sample : _sampleToXml(sample ?? {}, root), contentType };
  }
  if (normalizedContentType.startsWith("text/")) {
    return { bodyType: "text", body: typeof sample === "string" ? sample : JSON.stringify(sample ?? ""), contentType };
  }
  return { bodyType: "text", body: typeof sample === "string" ? sample : JSON.stringify(sample ?? {}, null, 2), contentType };
}

function _buildOpenApiRequestBody(doc: any, op: any, pathItem: any, isOpenApi3: boolean): OpenApiBodySeed {
  const requestBody = _resolveOpenApiObject(doc, op.requestBody);
  if (isOpenApi3 && requestBody?.content) {
    const picked = _pickOpenApiContent(requestBody.content);
    if (picked) return _bodySeedFromContent(doc, picked.contentType, picked.media);
  }

  const parameters = [...(pathItem?.parameters || []), ...(op.parameters || [])].map((p) => _resolveOpenApiObject(doc, p));
  const consumes = op.consumes || doc.consumes || [];
  const contentType = consumes[0] || "application/json";
  const bodyParam = parameters.find((p: any) => p?.in === "body" && p.schema);
  if (bodyParam) {
    return _bodySeedFromContent(doc, contentType, { schema: bodyParam.schema, example: bodyParam.example });
  }

  const formParams = parameters.filter((p: any) => p?.in === "formData");
  if (formParams.length > 0) {
    const normalizedContentType = contentType.toLowerCase().split(";")[0].trim();
    const items = formParams.map((p: any) => {
      const value = p.example ?? p.default ?? (Array.isArray(p.enum) ? p.enum[0] : "");
      return { key: p.name || "", value: String(value ?? ""), enabled: true };
    });
    if (normalizedContentType === "multipart/form-data") {
      return {
        bodyType: "form",
        body: "",
        formData: formParams.map((p: any, index: number) => ({
          ...items[index],
          formType: p.type === "file" ? ("file" as const) : ("text" as const),
          contentType: p.type === "file" ? "application/octet-stream" : undefined,
        })),
        contentType,
      };
    }
    return { bodyType: "urlencoded", body: "", urlencoded: items, contentType: "application/x-www-form-urlencoded" };
  }

  return { bodyType: "none", body: "" };
}

export function parseOpenApiCollection(data: any): ImportedCollection | null {
  const isOpenApi3 = typeof data?.openapi === "string" && data.openapi.startsWith("3");
  const isSwagger2 = data?.swagger === "2.0";
  if (!isOpenApi3 && !isSwagger2) return null;

  const name = data.info?.title || "OpenAPI Import";

  let baseUrl = "";
  if (isOpenApi3) {
    baseUrl = (data.servers?.[0]?.url || "").replace(/\/$/, "");
  } else {
    const scheme = (data.schemes?.[0] || "https") as string;
    const host = (data.host || "") as string;
    const basePath = (data.basePath || "") as string;
    baseUrl = `${scheme}://${host}${basePath}`.replace(/\/$/, "");
  }

  const tagMap = new Map<string, any[]>();
  const untagged: any[] = [];

  const paths: Record<string, any> = data.paths || {};
  const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];
  for (const [path, methods] of Object.entries(paths)) {
    for (const method of HTTP_METHODS) {
      const op = (methods as any)[method];
      if (!op) continue;

      const reqName = op.summary || op.operationId || `${method.toUpperCase()} ${path}`;
      const url = `${baseUrl}${path}`;
      const headers: { key: string; value: string }[] = [];
      const bodySeed = _buildOpenApiRequestBody(data, op, methods, isOpenApi3);

      if (bodySeed.contentType) {
        headers.push({ key: "Content-Type", value: bodySeed.contentType });
      }

      // Extract path params (:id → {id})
      const pathParams = (path.match(/\{([^}]+)\}/g) || []).map((p) => p.slice(1, -1));
      const queryParams: Array<{ key: string; value: string; enabled: boolean }> = [];
      const parameters = [...((methods as any).parameters || []), ...(op.parameters || [])];
      for (const p of parameters) {
        const resolved = _resolveOpenApiObject(data, p);
        if (!resolved || resolved.in !== "query") continue;
        const value = resolved.example ?? resolved.default ?? (Array.isArray(resolved.enum) ? resolved.enum[0] : "");
        queryParams.push({
          key: resolved.name || "",
          value: String(value ?? ""),
          enabled: true,
        });
      }

      const req = {
        id: _newId("request"),
        name: reqName,
        method: method.toUpperCase(),
        url,
        headers,
        queryParams,
        body: bodySeed.body,
        bodyType: bodySeed.bodyType,
        formData: bodySeed.formData || [],
        urlencoded: bodySeed.urlencoded || [],
      };
      void pathParams;

      const tag = (op.tags?.[0] as string | undefined) || "";
      if (tag) {
        if (!tagMap.has(tag)) tagMap.set(tag, []);
        tagMap.get(tag)!.push(req);
      } else {
        untagged.push(req);
      }
    }
  }

  const groups: ImportedCollection["groups"] = [];
  for (const [tag, reqs] of tagMap.entries()) {
    groups.push({
      id: _newId("group"),
      name: tag,
      requests: reqs,
      groups: [],
    });
  }

  return { id: _newId("col"), name, requests: untagged, groups };
}

function _contentTypeForBodyType(bodyType: string | undefined): string | undefined {
  switch (bodyType) {
    case "json":
      return "application/json";
    case "urlencoded":
      return "application/x-www-form-urlencoded";
    case "form":
      return "multipart/form-data";
    case "xml":
      return "application/xml";
    case "text":
      return "text/plain";
    case "graphql":
      return "application/json";
    default:
      return undefined;
  }
}

/** Export a collection to OpenAPI 3.0 JSON. */
export function collectionToOpenApi(col: ImportedCollection): any {
  const paths: Record<string, any> = {};
  const visitRequests = (requests: ImportRequest[]) => {
    for (const req of requests || []) {
      const parsedUrl: URL | null = _safeParseUrl(req.url);
      let path = req.url || "";
      if (parsedUrl) {
        path = parsedUrl.pathname || "/";
        // Keep the path relative
        if (!path.startsWith("/")) path = "/" + path;
      } else {
        // Fall back to a literal path from the URL string
        const match = path.match(/^(?:[a-z][a-z0-9+.-]*:\/\/[^/]+)?(\/.*)?$/i);
        path = match?.[1] || "/";
      }
      // Convert Restify-style path params (:id) to OpenAPI {id}
      path = path.replace(/:([A-Za-z0-9_-]+)/g, "{$1}");

      const method = (req.method || "GET").toLowerCase();
      const op: any = {
        summary: req.name || `${method.toUpperCase()} ${path}`,
        operationId: _operationId(req, method, path),
        responses: {
          "200": { description: "OK" },
          default: { description: "Unexpected error" },
        },
      };

      const parameters: any[] = [];
      for (const p of req.queryParams || []) {
        if (!p.key) continue;
        parameters.push({
          name: p.key,
          in: "query",
          schema: { type: "string" },
          example: p.value,
        });
      }
      for (const match of path.matchAll(/\{([^}]+)\}/g)) {
        parameters.push({ name: match[1], in: "path", required: true, schema: { type: "string" } });
      }
      if (parameters.length > 0) op.parameters = parameters;

      const bodyType = req.bodyType;
      const contentType = _contentTypeForBodyType(bodyType);
      const hasBody = req.body || (bodyType === "form" && (req.formData || []).length) || (bodyType === "urlencoded" && (req.urlencoded || []).length);
      if (hasBody && contentType) {
        let schema: any = { type: "string" };
        if (bodyType === "json") {
          try {
            schema = { type: "object" };
          } catch {
            schema = { type: "string" };
          }
        } else if (bodyType === "urlencoded" || bodyType === "form") {
          const props: Record<string, any> = {};
          const fields = bodyType === "urlencoded" ? req.urlencoded : req.formData;
          for (const f of fields || []) {
            if (f.key) props[f.key] = { type: "string" };
          }
          schema = { type: "object", properties: props };
        }
        op.requestBody = {
          required: true,
          content: { [contentType]: { schema, example: bodyType === "json" ? _tryParseJson(req.body || "{}") : req.body } },
        };
      }

      if (!paths[path]) paths[path] = {};
      paths[path][method] = op;
    }
  };

  visitRequests(col.requests || []);
  const visitGroups = (groups: any[] | undefined) => {
    for (const g of groups || []) {
      visitRequests(g.requests || []);
      visitGroups(g.groups);
    }
  };
  visitGroups(col.groups);

  return {
    openapi: "3.0.0",
    info: { title: col.name || "Restify Collection", version: "1.0.0" },
    paths,
  };
}

function _tryParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function _operationId(req: ImportRequest, method: string, path: string): string {
  const base = (req.name || `${method} ${path}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return `${base || "request"}_${method}`;
}

// ─── HAR ────────────────────────────────────────────────────────────────────

export function parseHarCollection(data: any): ImportedCollection | null {
  const entries = data?.log?.entries;
  if (!Array.isArray(entries)) return null;

  const requests: ImportRequest[] = entries.map((entry: any, i: number) => {
    const req = entry.request || {};
    const method = (req.method || "GET").toUpperCase();
    const url = req.url || "";
    const headers = (req.headers || [])
      .filter((h: any) => h && h.name)
      .map((h: any) => ({ key: h.name, value: String(h.value ?? "") }));
    const queryParams = (req.queryString || []).map((q: any) => ({
      key: q.name || "",
      value: q.value || "",
      enabled: true,
    }));

    let body = "";
    let bodyType = "none";
    let urlencoded: Array<{ key: string; value: string; enabled: boolean }> = [];
    const postData = req.postData;
    if (postData && postData.text) {
      const mime = (postData.mimeType || "").toLowerCase();
      if (mime.includes("json")) {
        bodyType = "json";
        body = postData.text;
      } else if (mime.includes("xml")) {
        bodyType = "xml";
        body = postData.text;
      } else if (mime === "application/x-www-form-urlencoded") {
        const encoded = (postData.params || []).map((p: any) => ({
          key: p.name || "",
          value: String(p.value ?? ""),
          enabled: true,
        }));
        if (encoded.length) {
          bodyType = "urlencoded";
        } else {
          body = postData.text;
          bodyType = "text";
        }
        urlencoded = encoded;
      } else {
        bodyType = "text";
        body = postData.text;
      }
    }

    return {
      id: _newId("request"),
      name: req.headers?.find((h: any) => (h.name || "").toLowerCase() === "x-restify-name")?.value || `Request ${i + 1}`,
      method,
      url,
      headers,
      queryParams,
      body,
      bodyType,
      urlencoded,
    };
  });

  return { id: _newId("col"), name: data?.log?.pages?.[0]?.title || "HAR Import", requests };
}

/** Export a collection to HAR 1.2 JSON. */
export function collectionToHar(col: ImportedCollection): any {
  const entries: any[] = [];
  const visitRequests = (requests: ImportRequest[]) => {
    for (const req of requests || []) {
      entries.push({
        startedDateTime: new Date().toISOString(),
        time: 0,
        request: {
          method: (req.method || "GET").toUpperCase(),
          url: req.url || "",
          httpVersion: "HTTP/1.1",
          cookies: [],
          headers: (req.headers || [])
            .filter((h) => h.key)
            .map((h) => ({ name: h.key, value: h.value || "" })),
          queryString: (req.queryParams || [])
            .filter((p) => p.key)
            .map((p) => ({ name: p.key, value: p.value || "" })),
          postData: req.body || (req.bodyType === "urlencoded" && (req.urlencoded || []).length)
            ? {
                mimeType: _contentTypeForBodyType(req.bodyType) || "application/octet-stream",
                text: req.body || "",
              }
            : undefined,
          headersSize: -1,
          bodySize: -1,
        },
        response: {
          status: 0,
          statusText: "",
          httpVersion: "HTTP/1.1",
          headers: [],
          cookies: [],
          content: { size: 0, mimeType: "" },
          redirectURL: "",
          headersSize: -1,
          bodySize: -1,
        },
        cache: {},
        timings: { send: 0, wait: 0, receive: 0 },
      });
    }
  };
  visitRequests(col.requests || []);
  const visitGroups = (groups: any[] | undefined) => {
    for (const g of groups || []) {
      visitRequests(g.requests || []);
      visitGroups(g.groups);
    }
  };
  visitGroups(col.groups);

  return {
    log: {
      version: "1.2",
      creator: { name: "Restify", version: "1.0.0" },
      entries,
    },
  };
}

// ─── Insomnia ───────────────────────────────────────────────────────────────

export function parseInsomniaCollection(data: any): ImportedCollection | null {
  if (!Array.isArray(data)) return null;
  const requests = data.filter((r: any) => r && r._type === "request");
  if (requests.length === 0) return null;

  const groupMap = new Map<string, string>();
  const groups = data.filter((r: any) => r && r._type === "request_group");
  const groupNames = new Map<string, string>();
  for (const g of groups) {
    groupNames.set(String(g._id), g.name || "Folder");
  }
  for (const r of requests) {
    const parent = r.parentId ? String(r.parentId) : "";
    groupMap.set(String(r._id), parent);
  }

  const parsed: ImportRequest[] = requests.map((req: any) => {
    const method = (req.method || "GET").toUpperCase();
    const headers = (req.headers || []).map((h: any) => ({
      key: h.name || "",
      value: String(h.value ?? ""),
      enabled: h.disabled !== true,
    }));
    const queryParams = (req.parameters || []).map((p: any) => ({
      key: p.name || "",
      value: String(p.value ?? ""),
      enabled: true,
    }));
    let body = "";
    let bodyType = "none";
    const bodyObj = req.body || {};
    if (bodyObj.mimeType && bodyObj.text) {
      const mime = String(bodyObj.mimeType).toLowerCase();
      if (mime.includes("json")) {
        bodyType = "json";
        body = bodyObj.text;
      } else if (mime.includes("xml")) {
        bodyType = "xml";
        body = bodyObj.text;
      } else if (mime === "application/x-www-form-urlencoded") {
        bodyType = "urlencoded";
        body = bodyObj.text;
      } else if (mime.includes("multipart")) {
        bodyType = "form";
        body = bodyObj.text;
      } else {
        bodyType = "text";
        body = bodyObj.text;
      }
    }

    const auth = req.authentication || {};
    let authType: string | undefined;
    let authData: any;
    if (auth.type === "bearer") {
      authType = "bearer";
      authData = { token: auth.token || "" };
    } else if (auth.type === "basic") {
      authType = "basic";
      authData = { username: auth.username || "", password: auth.password || "" };
    }

    return {
      id: _newId("request"),
      name: req.name || "Untitled",
      method,
      url: req.url || "",
      headers,
      queryParams,
      body,
      bodyType,
      authType,
      authData,
    };
  });

  // Build flat groups from request_group parent chains (Insomnia parentId nesting).
  const groupsOut: ImportedCollection["groups"] = [];
  for (const [reqId, parentId] of groupMap.entries()) {
    const req = parsed.find((r) => r.id === reqId);
    if (!req) continue;
    const name = groupNames.get(parentId) || "";
    if (!name) continue;
    let bucket = groupsOut.find((g) => g.name === name);
    if (!bucket) {
      bucket = { id: _newId("group"), name, requests: [], groups: [] };
      groupsOut.push(bucket);
    }
    bucket.requests.push(req);
    // Remove from top-level if grouped
    const idx = parsed.indexOf(req);
    if (idx >= 0) parsed.splice(idx, 1);
  }

  return { id: _newId("col"), name: "Insomnia Import", requests: parsed, groups: groupsOut };
}

// ─── REST Client .http ──────────────────────────────────────────────────────

/** Parse a REST Client `.http` document into requests. */
export function parseHttpFileText(text: string): ImportedCollection | null {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");

  const requests: ImportRequest[] = [];
  let current: Partial<ImportRequest> | null = null;
  let inBody = false;
  let bodyLines: string[] = [];
  let currentName: string | undefined;

  const flush = () => {
    if (!current) return;
    const body = bodyLines.join("\n").replace(/\n+$/, "");
    const method = (current.method || "GET").toUpperCase();
    if (body && method !== "GET" && method !== "HEAD") {
      current.body = body;
      const hasJson = (current.headers || []).some(
        (h) => h.key.toLowerCase() === "content-type" && h.value.toLowerCase().includes("json"),
      );
      current.bodyType = hasJson ? "json" : "text";
    }
    requests.push(current as ImportRequest);
    current = null;
    bodyLines = [];
    inBody = false;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^###/.test(trimmed)) {
      flush();
      currentName = trimmed.replace(/^###\s*/, "").trim() || undefined;
      current = { name: currentName || undefined, headers: [] };
      inBody = false;
      continue;
    }
    if (/^#/.test(trimmed)) continue;
    if (!current) {
      if (/^\S+\s+\S+/.test(trimmed) && !trimmed.includes(":")) {
        current = { name: currentName, headers: [] };
        currentName = undefined;
      } else {
        continue;
      }
    }
    if (inBody) {
      bodyLines.push(line);
      continue;
    }
    // Request line
    const reqMatch = trimmed.match(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\S+)(?:\s+HTTP\/\d\.\d)?$/i);
    if (reqMatch) {
      current.method = reqMatch[1].toUpperCase();
      current.url = reqMatch[2].replace(/^<|>$/g, "");
      continue;
    }
    // Header line
    const headerMatch = trimmed.match(/^([^:]+):\s*(.*)$/);
    if (headerMatch && !inBody) {
      current.headers = current.headers || [];
      current.headers.push({ key: headerMatch[1].trim(), value: headerMatch[2].trim() });
      continue;
    }
    // Blank line → start body
    if (trimmed === "" && current.method && current.url) {
      inBody = true;
      continue;
    }
  }
  flush();

  if (requests.length === 0) return null;
  return { id: _newId("col"), name: "Imported .http", requests };
}

/** Serialize a single request as a REST Client `.http` section. */
export function requestToHttpText(req: ImportRequest): string {
  const method = (req.method || "GET").toUpperCase();
  const lines: string[] = [];
  if (req.name) lines.push(`### ${req.name}`);
  lines.push(`${method} ${req.url || ""}`);
  for (const h of req.headers || []) {
    if (h.key && h.enabled !== false) lines.push(`${h.key}: ${h.value || ""}`);
  }
  const body = req.body || "";
  const hasBody = body && method !== "GET" && method !== "HEAD";
  if (hasBody) {
    lines.push("");
    lines.push(body.replace(/\n$/, ""));
  }
  lines.push("");
  return lines.join("\n");
}

/** Serialize a whole collection to a REST Client `.http` document. */
export function collectionToHttpText(col: ImportedCollection): string {
  const parts: string[] = [];
  for (const req of col.requests || []) {
    const text = requestToHttpText(req);
    if (text.trim()) parts.push(text.trim());
  }
  const visitGroups = (groups: any[] | undefined) => {
    for (const g of groups || []) {
      for (const req of g.requests || []) {
        const text = requestToHttpText(req);
        if (text.trim()) parts.push(text.trim());
      }
      visitGroups(g.groups);
    }
  };
  visitGroups(col.groups);
  return parts.join("\n\n");
}

// ─── Restify JSON export ────────────────────────────────────────────────────

export function collectionToRestify(col: ImportedCollection): any {
  return {
    id: col.id,
    name: col.name,
    requests: (col.requests || []).map(_stripRequestMeta),
    groups: _stripGroups(col.groups),
  };
}

function _stripRequestMeta(req: ImportRequest): any {
  const { id: _id, ...rest } = req;
  return rest;
}

function _stripGroups(groups: ImportedCollection["groups"]): any[] {
  return (groups || []).map((g) => ({
    id: g.id,
    name: g.name,
    requests: (g.requests || []).map(_stripRequestMeta),
    groups: _stripGroups(g.groups),
  }));
}

// ─── Environments ───────────────────────────────────────────────────────────

export interface ImportedEnvironment {
  id?: string;
  name: string;
  variables: Array<{ key: string; value: string; isSecret?: boolean }>;
}

/** Export an environment as Postman environment JSON. */
export function environmentToPostman(env: ImportedEnvironment): any {
  return {
    name: env.name,
    values: (env.variables || [])
      .filter((v) => v.key)
      .map((v) => ({ key: v.key, value: v.value || "", enabled: true, type: v.isSecret ? "secret" : "text" })),
    _postman_variable_scope: "environment",
    _postman_exported_at: new Date().toISOString(),
    _postman_exported_using: "Restify",
  };
}

/** Parse a Postman environment JSON file. */
export function parsePostmanEnvironment(data: any): ImportedEnvironment | null {
  if (!data || typeof data !== "object") return null;
  const name = data.name || (data._postman_variable_scope === "environment" ? "Imported Env" : null);
  const values = Array.isArray(data.values) ? data.values : Array.isArray(data.value) ? data.value : null;
  if (!name && !values) return null;
  return {
    name: name || "Imported Env",
    variables: (values || [])
      .filter((v: any) => v && v.key)
      .map((v: any) => ({
        key: String(v.key),
        value: String(v.value ?? ""),
        isSecret: v.type === "secret",
      })),
  };
}

/** Export an environment as Restify's own JSON. */
export function environmentToRestify(env: ImportedEnvironment): any {
  return {
    name: env.name,
    variables: (env.variables || []).map((v) => ({
      key: v.key,
      value: v.isSecret ? "" : (v.value || ""),
      isSecret: !!v.isSecret,
    })),
  };
}

/** Parse a Restify environment JSON file. */
export function parseRestifyEnvironment(data: any): ImportedEnvironment | null {
  if (!data || typeof data !== "object" || typeof data.name !== "string") return null;
  return {
    name: data.name,
    variables: (Array.isArray(data.variables) ? data.variables : [])
      .filter((v: any) => v && v.key)
      .map((v: any) => ({
        key: String(v.key),
        value: String(v.value ?? ""),
        isSecret: !!v.isSecret,
      })),
  };
}

// ─── YAML (minimal parser for OpenAPI documents) ────────────────────────────

/**
 * Minimal YAML → object parser sufficient for OpenAPI/Swagger documents.
 * Handles string scalars, numbers, booleans, block sequences, and nested mappings.
 */
export function parseYaml(yaml: string): any {
  const lines = yaml.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let pos = 0;

  function _peek(): string | undefined {
    return lines[pos];
  }
  function _next(): string {
    return lines[pos++];
  }

  function getIndent(line: string): number {
    let i = 0;
    while (i < line.length && line[i] === " ") i++;
    return i;
  }

  function isBlankOrComment(line: string): boolean {
    return /^\s*(#.*)?$/.test(line);
  }

  function parseScalar(raw: string): any {
    const s = raw.trim();
    if (s === "true") return true;
    if (s === "false") return false;
    if (s === "null" || s === "~") return null;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
    if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
      return s.slice(1, -1);
    }
    return s.replace(/\s+#.*$/, "").trim();
  }

  function parseValue(valueStr: string, indent: number): any {
    const trimmed = valueStr.trim();
    if (trimmed === "" || trimmed === "|" || trimmed === ">") {
      return parseBlock(indent);
    }
    if (trimmed === "-") return parseBlock(indent);
    return parseScalar(trimmed);
  }

  function parseBlock(minIndent: number): any {
    while (pos < lines.length && isBlankOrComment(lines[pos])) pos++;
    if (pos >= lines.length) return null;

    const firstLine = lines[pos];
    const indent = getIndent(firstLine);
    if (indent <= minIndent && minIndent !== -1) return null;

    const stripped = firstLine.trim();
    if (stripped.startsWith("- ") || stripped === "-") {
      return parseSequence(indent);
    }
    return parseMapping(indent);
  }

  function parseSequence(indent: number): any[] {
    const result: any[] = [];
    while (pos < lines.length) {
      while (pos < lines.length && isBlankOrComment(lines[pos])) pos++;
      if (pos >= lines.length) break;
      const line = lines[pos];
      const lineIndent = getIndent(line);
      if (lineIndent < indent) break;
      const stripped = line.trim();
      if (!stripped.startsWith("- ") && stripped !== "-") break;
      pos++;
      const valueStr = stripped.slice(2).trim();
      if (valueStr === "" || valueStr.includes(": ")) {
        const nested: any = {};
        if (valueStr.includes(": ")) {
          const colonIdx = valueStr.indexOf(": ");
          const k = valueStr.slice(0, colonIdx).trim();
          const v = valueStr.slice(colonIdx + 2).trim();
          nested[k] = v === "" ? parseBlock(lineIndent + 2) : parseScalar(v);
        }
        const rest = parseMapping(lineIndent + 2);
        result.push({ ...nested, ...(typeof rest === "object" && rest !== null ? rest : {}) });
      } else {
        result.push(parseScalar(valueStr));
      }
    }
    return result;
  }

  function parseMapping(indent: number): Record<string, any> {
    const result: Record<string, any> = {};
    while (pos < lines.length) {
      while (pos < lines.length && isBlankOrComment(lines[pos])) pos++;
      if (pos >= lines.length) break;
      const line = lines[pos];
      const lineIndent = getIndent(line);
      if (lineIndent < indent) break;
      const stripped = line.trim();
      if (stripped.startsWith("- ")) break;
      const colonIdx = stripped.indexOf(": ");
      const isKeyOnly = stripped.endsWith(":") && !stripped.startsWith("-");
      if (colonIdx === -1 && !isKeyOnly) {
        pos++;
        continue;
      }
      pos++;
      const key = isKeyOnly ? stripped.slice(0, -1).trim() : stripped.slice(0, colonIdx).trim();
      const cleanKey = key.replace(/^['"]|['"]$/g, "");
      if (isKeyOnly) {
        result[cleanKey] = parseBlock(lineIndent);
      } else {
        const valStr = stripped.slice(colonIdx + 2);
        result[cleanKey] = parseValue(valStr, lineIndent);
      }
    }
    return result;
  }

  return parseBlock(-1);
}

function _safeParseUrl(url: string | undefined): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}
