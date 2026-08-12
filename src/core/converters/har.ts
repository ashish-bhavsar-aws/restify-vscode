import { _newId } from "./shared";
import { _contentTypeForBodyType } from "./openapi";
import type { ImportedCollection, ImportRequest } from "./types";
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
