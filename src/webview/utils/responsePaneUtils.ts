export const LARGE_RESPONSE_THRESHOLD = 500 * 1024;
export const FILE_PREVIEW_RENDER_THRESHOLD = 5 * 1024 * 1024;

export type ResponseHeaders = Record<string, string | string[]>;

export function getHeaderValue(headers: ResponseHeaders | undefined, name: string): string {
  if (!headers) return '';
  const hit = Object.entries(headers).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
  if (!hit) return '';
  return Array.isArray(hit) ? (hit[0] || '') : hit;
}

export function flattenHeaders(headers: ResponseHeaders | undefined): Array<{ key: string; value: string }> {
  if (!headers) return [];
  const rows: Array<{ key: string; value: string }> = [];
  Object.entries(headers).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((v) => rows.push({ key, value: String(v) }));
      return;
    }
    rows.push({ key, value: String(value) });
  });
  return rows;
}

export interface ResponseCookie {
  name: string;
  value: string;
  attributes: Array<{ key: string; value: string }>;
}

export function parseResponseCookies(
  headers: ResponseHeaders | undefined,
): ResponseCookie[] {
  if (!headers) return [];
  const entry = Object.entries(headers).find(
    ([k]) => k.toLowerCase() === 'set-cookie',
  );
  const setCookie = entry?.[1];
  const rawList = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  return rawList.map((raw) => {
    const [first, ...rest] = raw.split(';');
    const eq = first.indexOf('=');
    const name = eq === -1 ? first.trim() : first.slice(0, eq).trim();
    const value = eq === -1 ? '' : first.slice(eq + 1).trim();
    const attributes: Array<{ key: string; value: string }> = [];
    rest.forEach((part) => {
      const p = part.trim();
      if (!p) return;
      const e = p.indexOf('=');
      if (e === -1) attributes.push({ key: p, value: 'true' });
      else attributes.push({ key: p.slice(0, e).trim(), value: p.slice(e + 1).trim() });
    });
    return { name, value, attributes };
  });
}

export function decodeBase64ToText(base64: string): string {
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

export function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (ch === '"') {
      if (inQuotes && input[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

export function isLikelyJson(body: string | undefined | null, headers?: ResponseHeaders): boolean {
  if (!body) return false;
  const contentType = getHeaderValue(headers, 'content-type');
  const ct = String(contentType).toLowerCase();
  if (ct.includes('application/json') || ct.includes('+json')) return true;
  const trimmed = body.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

export function isLikelyXml(body: string | undefined | null, headers?: ResponseHeaders): boolean {
  if (!body) return false;
  const contentType = getHeaderValue(headers, 'content-type');
  const ct = String(contentType).toLowerCase();
  if (ct.includes('application/xml') || ct.includes('text/xml') || ct.includes('+xml')) return true;
  const trimmed = body.trimStart();
  return trimmed.startsWith('<') && !trimmed.startsWith('<!DOCTYPE html');
}

export function isLikelyHtml(body: string | undefined | null, headers?: ResponseHeaders): boolean {
  if (!body) return false;
  const contentType = getHeaderValue(headers, 'content-type');
  const ct = String(contentType).toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/xhtml+xml')) return true;
  const trimmed = body.trimStart().toLowerCase();
  return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html');
}
