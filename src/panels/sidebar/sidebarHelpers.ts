import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import type { ImportedCollection } from '../../core/converters';

/** Ensure every imported request/group carries a stable id for storage. */
export function normalizeImportedCollection(col: ImportedCollection): any {
  const _reqId = () =>
    Date.now().toString() + Math.random().toString(36).slice(2);
  const normalizeRequest = (r: any) => (r?.id ? r : { ...r, id: _reqId() });
  const normalizeGroups = (groups: any[] | undefined): any[] =>
    (groups || []).map((g) => ({
      ...g,
      id: g.id || _reqId(),
      requests: (g.requests || []).map(normalizeRequest),
      groups: normalizeGroups(g.groups),
    }));
  return {
    id: col.id,
    name: col.name,
    requests: (col.requests || []).map(normalizeRequest),
    groups: normalizeGroups(col.groups),
  };
}

export function countImportedRequests(col: ImportedCollection): number {
  let count = (col.requests || []).length;
  const visit = (groups: any[] | undefined) => {
    for (const g of groups || []) {
      count += (g.requests || []).length;
      visit(g.groups);
    }
  };
  visit(col.groups);
  return count;
}

export function findGroupInline(groups: any[], id: string): any {
  for (const g of groups) {
    if (String(g.id) === String(id)) return g;
    if (g.groups?.length) {
      const found = findGroupInline(g.groups, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** Flatten a collection (or a single group within it) into a list of requests. */
export function flattenCollectionRequests(col: any, groupId: string | null): any[] {
  const out: any[] = [];
  const visit = (requests: any[] | undefined) => {
    for (const r of requests || []) out.push(r);
  };

  if (groupId) {
    const group = findGroupInline(col.groups || [], groupId);
    if (group) {
      visit(group.requests);
      const visitSubGroups = (groups: any[] | undefined) => {
        for (const g of groups || []) {
          visit(g.requests);
          visitSubGroups(g.groups);
        }
      };
      visitSubGroups(group.groups);
    }
    return out;
  }

  visit(col.requests);
  const visitGroups = (groups: any[] | undefined) => {
    for (const g of groups || []) {
      visit(g.requests);
      visitGroups(g.groups);
    }
  };
  visitGroups(col.groups);
  return out;
}

/** Simple GET following up to 5 redirects, returns body as string. */
export function httpGet(
  reqUrl: string,
  redirectsLeft = 5
): Promise<{ statusCode: number; body: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(reqUrl);
    const isHttps = parsed.protocol === 'https:';
    const mod: typeof https = isHttps ? https : (http as any);
    const req = mod.get(
      reqUrl,
      { headers: { Accept: 'application/json, application/yaml, text/yaml, */*' } },
      (res) => {
        const statusCode = res.statusCode ?? 0;
        const contentType = (res.headers['content-type'] || '').toLowerCase();
        // Follow redirects
        if (statusCode >= 300 && statusCode < 400 && res.headers.location && redirectsLeft > 0) {
          res.resume();
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : `${parsed.protocol}//${parsed.host}${res.headers.location}`;
          resolve(httpGet(next, redirectsLeft - 1));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ statusCode, body: Buffer.concat(chunks).toString('utf8'), contentType }));
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.end();
  });
}
