import { _cleanId } from "./shared";
import type { ImportedCollection, ImportRequest } from "./types";
export function parseRestifyCollection(data: any): ImportedCollection | null {
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
