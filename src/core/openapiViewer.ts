import { _newId } from "./converters/shared";

export interface OpenApiViewerParam {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  description?: string;
  schema?: any;
  example?: any;
}

export interface OpenApiViewerRequestBody {
  contentType: string;
  schema?: any;
  example?: any;
  description?: string;
}

export interface OpenApiViewerResponse {
  status: string;
  description?: string;
  contentType?: string;
  schema?: any;
  example?: any;
}

export interface OpenApiViewerEndpoint {
  id: string;
  method: string;
  path: string;
  summary?: string;
  description?: string;
  operationId?: string;
  deprecated: boolean;
  parameters: OpenApiViewerParam[];
  requestBody?: OpenApiViewerRequestBody;
  responses: OpenApiViewerResponse[];
  security?: any[];
  tags: string[];
}

export interface OpenApiViewerTag {
  name: string;
  description?: string;
  endpoints: OpenApiViewerEndpoint[];
}

export interface OpenApiViewerSpec {
  id: string;
  title: string;
  version: string;
  description?: string;
  baseUrl: string;
  tags: OpenApiViewerTag[];
  untagged: OpenApiViewerEndpoint[];
  totalEndpoints: number;
  raw: any;
}

function _resolveRef(doc: any, ref: string): any {
  if (!ref?.startsWith("#/")) return undefined;
  return ref
    .slice(2)
    .split("/")
    .reduce((obj: any, part: string) =>
      obj?.[part.replace(/~1/g, "/").replace(/~0/g, "~")], doc);
}

function _resolveSchema(doc: any, schema: any, seen = new Set<string>()): any {
  if (!schema || typeof schema !== "object") return schema;
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return {};
    seen.add(schema.$ref);
    const resolved = _resolveRef(doc, schema.$ref);
    return _resolveSchema(doc, resolved, seen) || {};
  }
  if (Array.isArray(schema.allOf)) {
    return schema.allOf.reduce((merged: any, part: any) => {
      const resolved = _resolveSchema(doc, part, new Set(seen)) || {};
      return {
        ...merged,
        ...resolved,
        properties: { ...(merged.properties || {}), ...(resolved.properties || {}) },
        required: [...(merged.required || []), ...(resolved.required || [])],
      };
    }, { ...schema, allOf: undefined });
  }
  const alt = schema.oneOf?.[0] || schema.anyOf?.[0];
  if (alt) return _resolveSchema(doc, alt, seen);
  return schema;
}

function _resolveObj(doc: any, obj: any): any {
  return obj?.$ref ? (_resolveRef(doc, obj.$ref) || obj) : obj;
}

function _sampleSchema(doc: any, schema: any, seen = new Set<any>()): any {
  schema = _resolveSchema(doc, schema);
  if (!schema || typeof schema !== "object") return null;
  if (seen.has(schema)) return null;
  seen.add(schema);
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  const inferred = type || (schema.properties ? "object" : schema.items ? "array" : undefined);
  switch (inferred) {
    case "object": {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(schema.properties || {})) {
        out[k] = _sampleSchema(doc, v, new Set(seen));
      }
      return out;
    }
    case "array": return [_sampleSchema(doc, schema.items || {}, new Set(seen))];
    case "integer": case "number": return schema.minimum ?? 0;
    case "boolean": return false;
    case "string": return "";
    default: return null;
  }
}

function _pickContent(content: Record<string, any> = {}): { contentType: string; media: any } | null {
  const keys = Object.keys(content);
  const norm = (ct: string) => ct.toLowerCase().split(";")[0].trim();
  const preferred =
    keys.find(ct => norm(ct).includes("json")) ||
    keys.find(ct => norm(ct) === "application/x-www-form-urlencoded") ||
    keys.find(ct => norm(ct) === "multipart/form-data") ||
    keys.find(ct => norm(ct).includes("xml")) ||
    keys.find(ct => norm(ct).startsWith("text/")) ||
    keys[0];
  return preferred ? { contentType: preferred, media: content[preferred] } : null;
}

function _extractParams(doc: any, pathItem: any, op: any): OpenApiViewerParam[] {
  const resolved = [...(pathItem?.parameters || []), ...(op?.parameters || [])]
    .map((p: any) => _resolveObj(doc, p))
    .filter((p: any) => p && p.name);
  return resolved.map((p: any) => ({
    name: p.name,
    in: p.in as OpenApiViewerParam["in"],
    required: !!p.required || p.in === "path",
    description: p.description,
    schema: p.schema ? _resolveSchema(doc, p.schema) : undefined,
    example: p.example ?? p.schema?.example,
  }));
}

function _extractRequestBody(doc: any, op: any): OpenApiViewerRequestBody | undefined {
  const rb = _resolveObj(doc, op?.requestBody);
  if (!rb) return undefined;
  if (rb.content) {
    const picked = _pickContent(rb.content);
    if (!picked) return undefined;
    const schema = picked.media?.schema ? _resolveSchema(doc, picked.media.schema) : undefined;
    const firstExample = Object.values(picked.media?.examples || {})[0] as any;
    return {
      contentType: picked.contentType,
      schema,
      example: picked.media?.example ?? firstExample?.value ?? (schema ? _sampleSchema(doc, schema) : undefined),
      description: rb.description,
    };
  }
  // Swagger 2.0 body param
  const bodyParam = (op?.parameters || []).find((p: any) => {
    const r = _resolveObj(doc, p);
    return r?.in === "body";
  });
  if (bodyParam) {
    const resolved = _resolveObj(doc, bodyParam);
    return {
      contentType: "application/json",
      schema: resolved?.schema ? _resolveSchema(doc, resolved.schema) : undefined,
      example: resolved?.example,
      description: resolved?.description,
    };
  }
  return undefined;
}

function _extractResponses(doc: any, op: any): OpenApiViewerResponse[] {
  if (!op?.responses || typeof op.responses !== "object") return [];
  return Object.entries(op.responses).map(([status, resp]: [string, any]) => {
    const resolved = _resolveObj(doc, resp) || resp;
    const content = resolved?.content;
    let contentType: string | undefined;
    let schema: any;
    let example: any;
    if (content && typeof content === "object") {
      const picked = _pickContent(content);
      if (picked) {
        contentType = picked.contentType;
        schema = picked.media?.schema ? _resolveSchema(doc, picked.media.schema) : undefined;
        const firstExample = Object.values(picked.media?.examples || {})[0] as any;
        example = picked.media?.example ?? firstExample?.value ?? (schema ? _sampleSchema(doc, schema) : undefined);
      }
    }
    return {
      status,
      description: resolved?.description,
      contentType,
      schema,
      example,
    };
  });
}

export function parseOpenApiViewerSpec(data: any): OpenApiViewerSpec | null {
  const isOpenApi3 = typeof data?.openapi === "string" && data.openapi.startsWith("3");
  const isSwagger2 = data?.swagger === "2.0";
  if (!isOpenApi3 && !isSwagger2) return null;

  const title = data.info?.title || "API";
  const version = data.info?.version || "";
  const description = data.info?.description;

  let baseUrl = "";
  if (isOpenApi3) {
    baseUrl = (data.servers?.[0]?.url || "").replace(/\/$/, "");
  } else {
    const scheme = (data.schemes?.[0] || "https") as string;
    const host = (data.host || "") as string;
    const basePath = (data.basePath || "") as string;
    baseUrl = `${scheme}://${host}${basePath}`.replace(/\/$/, "");
  }

  const tagDescriptions = new Map<string, string>();
  for (const t of data.tags || []) {
    if (t.name && t.description) tagDescriptions.set(t.name, t.description);
  }

  const tagMap = new Map<string, OpenApiViewerEndpoint[]>();
  const untagged: OpenApiViewerEndpoint[] = [];
  const paths: Record<string, any> = data.paths || {};
  const METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];

  for (const [path, pathItem] of Object.entries(paths)) {
    const resolvedPathItem = _resolveObj(data, pathItem) || pathItem;
    for (const method of METHODS) {
      const op = resolvedPathItem[method];
      if (!op) continue;
      const resolvedOp = _resolveObj(data, op) || op;
      const ep: OpenApiViewerEndpoint = {
        id: _newId("endpoint"),
        method: method.toUpperCase(),
        path,
        summary: resolvedOp.summary,
        description: resolvedOp.description,
        operationId: resolvedOp.operationId,
        deprecated: !!resolvedOp.deprecated,
        parameters: _extractParams(data, resolvedPathItem, resolvedOp),
        requestBody: _extractRequestBody(data, resolvedOp),
        responses: _extractResponses(data, resolvedOp),
        security: resolvedOp.security,
        tags: resolvedOp.tags || [],
      };
      const tag = resolvedOp.tags?.[0];
      if (tag) {
        if (!tagMap.has(tag)) tagMap.set(tag, []);
        tagMap.get(tag)!.push(ep);
      } else {
        untagged.push(ep);
      }
    }
  }

  const tags: OpenApiViewerTag[] = [];
  for (const [name, endpoints] of tagMap.entries()) {
    tags.push({ name, description: tagDescriptions.get(name), endpoints });
  }

  return {
    id: _newId("spec"),
    title,
    version,
    description,
    baseUrl,
    tags,
    untagged,
    totalEndpoints: tags.reduce((s, t) => s + t.endpoints.length, 0) + untagged.length,
    raw: data,
  };
}
