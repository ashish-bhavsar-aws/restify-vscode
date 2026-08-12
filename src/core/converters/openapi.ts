import { _newId, _safeParseUrl } from "./shared";
import type { ImportedCollection, ImportRequest } from "./types";

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

/**
 * Extract the JSON response schema for an OpenAPI operation's success
 * response (first 2xx). $refs are resolved against the doc so the schema is
 * self-contained and can be handed to the JSON Schema validator (F22).
 */
function _openApiResponseSchema(doc: any, op: any): any {
  if (!op || !op.responses || typeof op.responses !== "object") return undefined;
  const statuses = Object.keys(op.responses).sort((a, b) => {
    const rank = (s: string) => (s === "2XX" || s === "default" ? 1 : /^2\d\d$/.test(s) ? 0 : 2);
    return rank(a) - rank(b);
  });
  for (const status of statuses) {
    if (status !== "default" && !/^2\d\d$/i.test(status)) continue;
    const resp = op.responses[status];
    if (!resp) continue;
    const content = resp.content;
    if (!content || typeof content !== "object") continue;
    const media = content["application/json"] || content["application/*+json"];
    if (!media || !media.schema) continue;
    const resolved = _resolveOpenApiSchema(doc, media.schema);
    if (resolved) return resolved;
  }
  return undefined;
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

      const responseSchema = _openApiResponseSchema(data, op);

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
        validateSchema: !!responseSchema,
        schema: (() => {
          if (!responseSchema) return "";
          try {
            return JSON.stringify(responseSchema, null, 2);
          } catch {
            return "";
          }
        })(),
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

export function _contentTypeForBodyType(bodyType: string | undefined): string | undefined {
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
