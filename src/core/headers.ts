/**
 * Pure header helpers shared by the request engine. Header keys are
 * case-insensitive, so all lookups normalize to lowercase while preserving the
 * canonical display casing on write.
 */

export function canonicalHeaderName(name: string): string {
  if (name.toLowerCase() === "set-cookie") return "Set-Cookie";
  return name
    .split("-")
    .map((part) =>
      part.length > 0
        ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        : part,
    )
    .join("-");
}

export function getHeader(
  headers: Record<string, string | string[]>,
  name: string,
): string | undefined {
  const hit = Object.entries(headers).find(
    ([k]) => k.toLowerCase() === name.toLowerCase(),
  )?.[1];
  if (hit === undefined) return undefined;
  return Array.isArray(hit) ? hit.join(", ") : String(hit);
}

export function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some((k) => k.toLowerCase() === name.toLowerCase());
}

export function setHeader(
  headers: Record<string, string>,
  name: string,
  value: string,
): void {
  const existing = Object.keys(headers).find(
    (k) => k.toLowerCase() === name.toLowerCase(),
  );
  if (existing) {
    headers[existing] = value;
  } else {
    headers[name] = value;
  }
}

export function removeHeader(
  headers: Record<string, string>,
  name: string,
): void {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) {
      delete headers[key];
    }
  }
}

export function getHeaderValue(
  headers: Record<string, string | string[]>,
  name: string,
): string {
  const hit = Object.entries(headers).find(
    ([k]) => k.toLowerCase() === name.toLowerCase(),
  )?.[1];
  if (!hit) return "";
  return Array.isArray(hit) ? hit.join("; ") : hit;
}

export function getHeaderArray(
  headers: Record<string, string | string[]>,
  name: string,
): string[] {
  const hit = Object.entries(headers).find(
    ([k]) => k.toLowerCase() === name.toLowerCase(),
  )?.[1];
  if (!hit) return [];
  return Array.isArray(hit) ? hit : [hit];
}

export function normalizeResponseHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[]> {
  const normalized: Record<string, string | string[]> = {};
  Object.entries(headers || {}).forEach(([rawKey, rawValue]) => {
    if (rawValue === undefined) return;
    const key = canonicalHeaderName(rawKey);
    if (Array.isArray(rawValue)) {
      normalized[key] = rawValue.map((v) => String(v));
    } else {
      normalized[key] = String(rawValue);
    }
  });
  return normalized;
}
