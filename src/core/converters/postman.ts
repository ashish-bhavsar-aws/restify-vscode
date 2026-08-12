import { _newId, _safeParseUrl } from "./shared";
import type { ImportedCollection, ImportRequest } from "./types";
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

