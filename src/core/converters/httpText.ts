import { _newId } from "./shared";
import type { ImportedCollection, ImportRequest } from "./types";
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
