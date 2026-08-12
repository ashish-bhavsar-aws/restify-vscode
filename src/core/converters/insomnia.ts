import { _newId } from "./shared";
import type { ImportedCollection, ImportRequest } from "./types";
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

