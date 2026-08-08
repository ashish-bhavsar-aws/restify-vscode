/**
 * JSONPath query engine (F23).
 *
 * Pure, framework-free logic that evaluates a JSONPath subset against a parsed
 * JSON value and can map matches back to character offsets in a pretty-printed
 * representation of the document (used to highlight results in the response
 * viewer). Kept free of `vscode`/webview imports so it is unit-testable in
 * isolation (see test/unit/jsonPath.test.ts).
 *
 * Supported syntax:
 *   $                  root
 *   .name  ['name']    object child access
 *   [n]                array index
 *   .*  [*]            wildcard (all children / elements)
 *   ..name  ..*        recursive descent
 *   [?( @.key op lit )]  filter (== != < <= > >=) or bare existence @.key
 */

export interface JsonPathMatch {
  /** JSONPath of the match, e.g. "$.users[0].name". */
  path: string;
  value: unknown;
}

export type JsonPathResult =
  | { ok: true; matches: JsonPathMatch[] }
  | { ok: false; error: string };

export interface JsonPathHighlightRange {
  from: number;
  to: number;
}

export interface JsonPathInTextResult {
  ok: boolean;
  error?: string;
  matches: JsonPathMatch[];
  ranges: JsonPathHighlightRange[];
}

interface JsonPathSeg {
  kind: 'child' | 'index' | 'wildcard' | 'recursive' | 'recursiveWildcard' | 'filter';
  name?: string;
  index?: number;
  filter?: FilterExpr | null;
}

interface FilterExpr {
  key: string;
  op?: string;
  literal?: string | number | boolean;
}

// ─── Tokenizer ─────────────────────────────────────────────────────

function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  const len = expr.length;
  let i = 0;
  while (i < len) {
    const ch = expr[i];
    if (ch === '.') {
      tokens.push('.');
      i += 1;
    } else if (ch === ' ' || ch === '\t' || ch === '\n') {
      i += 1;
    } else if (ch === '[') {
      let j = i + 1;
      let inStr = false;
      let quote = '';
      while (j < len) {
        const c = expr[j];
        if (inStr) {
          if (c === '\\') j += 2;
          else if (c === quote) { inStr = false; j += 1; }
          else j += 1;
        } else if (c === "'" || c === '"') { inStr = true; quote = c; j += 1; }
        else if (c === ']') break;
        else j += 1;
      }
      tokens.push('BRK:' + expr.slice(i + 1, Math.min(j, len)));
      i = Math.min(j + 1, len);
    } else {
      let j = i;
      let buf = '';
      while (j < len && !'.[] '.includes(expr[j])) {
        buf += expr[j];
        j += 1;
      }
      tokens.push(buf.trim());
      i = j;
    }
  }
  return tokens.filter((t) => t.length > 0);
}

function parseNumber(text: string): number | null {
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

// ─── Parser ────────────────────────────────────────────────────────

function parseSegments(expr: string): { segs: JsonPathSeg[]; error?: string } {
  const tokens = tokenize(expr);
  const segs: JsonPathSeg[] = [];
  let i = 0;

  if (tokens[0] !== '$') {
    return { segs, error: `JSONPath must start with "$" (got "${tokens[0] ?? ''}")` };
  }
  i = 1;

  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok === '.') {
      const next = tokens[i + 1];
      if (next === undefined) return { segs, error: 'JSONPath ends with "."' };
      if (next === '.') {
        const after = tokens[i + 2];
        if (after === undefined) return { segs, error: 'JSONPath ends with ".."' };
        if (after === '*') {
          segs.push({ kind: 'recursiveWildcard' });
          i += 3;
        } else {
          segs.push({ kind: 'recursive', name: after });
          i += 3;
        }
      } else if (next === '*') {
        segs.push({ kind: 'wildcard' });
        i += 2;
      } else {
        segs.push({ kind: 'child', name: next });
        i += 2;
      }
    } else if (tok.startsWith('BRK:')) {
      const inner = tok.slice(4).trim();
      if (inner === '*') {
        segs.push({ kind: 'wildcard' });
      } else if (
        (inner.startsWith("'") && inner.endsWith("'") && inner.length > 1) ||
        (inner.startsWith('"') && inner.endsWith('"') && inner.length > 1)
      ) {
        segs.push({ kind: 'child', name: inner.slice(1, -1) });
      } else if (inner.startsWith('?(') && inner.endsWith(')')) {
        segs.push({ kind: 'filter', filter: parseFilter(inner.slice(2, -1)) });
      } else {
        const idx = parseNumber(inner);
        if (idx === null || idx < 0 || !Number.isInteger(idx)) {
          return { segs, error: `Invalid array index "${inner}"` };
        }
        segs.push({ kind: 'index', index: idx });
      }
      i += 1;
    } else {
      return { segs, error: `Unexpected token "${tok}" in JSONPath` };
    }
  }
  return { segs };
}

function parseFilter(body: string): FilterExpr | null {
  const trimmed = body.trim();
  const keyMatch = /^@\.([A-Za-z_$][\w$]*)$/.exec(trimmed);
  if (keyMatch) return { key: keyMatch[1] };
  const opMatch = /^@\.([A-Za-z_$][\w$]*)\s*(==|!=|<=|>=|<|>)\s*(.+)$/.exec(trimmed);
  if (!opMatch) return null;
  const [, key, op, rawLiteral] = opMatch;
  const lit = rawLiteral.trim();
  let literal: string | number | boolean | null = null;
  if ((lit.startsWith("'") && lit.endsWith("'")) || (lit.startsWith('"') && lit.endsWith('"'))) {
    literal = lit.slice(1, -1);
  } else if (lit === 'true') literal = true;
  else if (lit === 'false') literal = false;
  else {
    const n = parseNumber(lit);
    if (n !== null) literal = n;
  }
  if (literal === null) return null;
  return { key, op, literal };
}

// ─── Evaluator ─────────────────────────────────────────────────────

interface Cursor {
  value: unknown;
  path: string;
}

function deepCollect(node: unknown, path: string, results: Cursor[], name: string): void {
  if (Array.isArray(node)) {
    node.forEach((item, i) => {
      const p = `${path}[${i}]`;
      deepCollect(item, p, results, name);
    });
  } else if (node !== null && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const p = `${path}.${key}`;
      if (key === name) results.push({ value: obj[key], path: p });
      deepCollect(obj[key], p, results, name);
    }
  }
}

function deepCollectWildcard(node: unknown, path: string, results: Cursor[]): void {
  if (Array.isArray(node)) {
    node.forEach((item, i) => {
      const p = `${path}[${i}]`;
      results.push({ value: item, path: p });
      deepCollectWildcard(item, p, results);
    });
  } else if (node !== null && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const p = `${path}.${key}`;
      results.push({ value: obj[key], path: p });
      deepCollectWildcard(obj[key], p, results);
    }
  }
}

function filterPass(value: unknown, filter: FilterExpr | null): boolean {
  if (!filter) return true;
  const record = value as Record<string, unknown>;
  const actual = record && typeof record === 'object' && !Array.isArray(record) ? record[filter.key] : undefined;
  if (filter.op === undefined) return actual !== undefined;
  const expected = filter.literal;
  switch (filter.op) {
    case '==':
      return actual === expected;
    case '!=':
      return actual !== expected;
    case '<':
      return (actual as number) < (expected as number);
    case '<=':
      return (actual as number) <= (expected as number);
    case '>':
      return (actual as number) > (expected as number);
    case '>=':
      return (actual as number) >= (expected as number);
    default:
      return false;
  }
}

/**
 * Evaluate a JSONPath expression against a parsed JSON value.
 */
export function queryJsonPath(data: unknown, expr: string): JsonPathResult {
  if (typeof expr !== 'string' || !expr.trim()) {
    return { ok: false, error: 'JSONPath expression is empty' };
  }
  const { segs, error } = parseSegments(expr.trim());
  if (error) return { ok: false, error };
  if (segs.length === 0) return { ok: true, matches: [{ path: '$', value: data }] };

  let cursors: Cursor[] = [{ value: data, path: '$' }];
  for (const seg of segs) {
    const next: Cursor[] = [];
    for (const cur of cursors) {
      const node = cur.value;
      switch (seg.kind) {
        case 'child': {
          if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
            const obj = node as Record<string, unknown>;
            if (Object.prototype.hasOwnProperty.call(obj, seg.name!)) {
              next.push({ value: obj[seg.name!], path: `${cur.path}.${seg.name}` });
            }
          }
          break;
        }
        case 'index': {
          if (Array.isArray(node) && seg.index! < node.length) {
            next.push({ value: node[seg.index!], path: `${cur.path}[${seg.index}]` });
          }
          break;
        }
        case 'wildcard': {
          if (Array.isArray(node)) {
            node.forEach((item, i) => next.push({ value: item, path: `${cur.path}[${i}]` }));
          } else if (node !== null && typeof node === 'object') {
            const obj = node as Record<string, unknown>;
            for (const key of Object.keys(obj)) {
              next.push({ value: obj[key], path: `${cur.path}.${key}` });
            }
          }
          break;
        }
        case 'recursive': {
          const found: Cursor[] = [];
          deepCollect(node, cur.path, found, seg.name!);
          next.push(...found);
          break;
        }
        case 'recursiveWildcard': {
          const found: Cursor[] = [];
          deepCollectWildcard(node, cur.path, found);
          next.push(...found);
          break;
        }
        case 'filter': {
          if (Array.isArray(node)) {
            node.forEach((item, i) => {
              if (filterPass(item, seg.filter ?? null)) next.push({ value: item, path: `${cur.path}[${i}]` });
            });
          } else if (node !== null && typeof node === 'object') {
            const obj = node as Record<string, unknown>;
            for (const key of Object.keys(obj)) {
              if (filterPass(obj[key], seg.filter ?? null)) next.push({ value: obj[key], path: `${cur.path}.${key}` });
            }
          }
          break;
        }
        default:
          break;
      }
    }
    cursors = next;
    if (cursors.length === 0) break;
  }

  return { ok: true, matches: cursors.map((c) => ({ path: c.path, value: c.value })) };
}

// ─── Pretty-print with offsets ─────────────────────────────────────

interface LayoutBuild {
  text: string;
  ranges: Map<string, JsonPathHighlightRange>;
}

function serializeNode(node: unknown, indent: number, path: string, out: LayoutBuild): void {
  const pad = '  '.repeat(indent);
  const start = out.text.length;
  if (node === null) {
    out.text += 'null';
  } else if (typeof node === 'boolean' || typeof node === 'number') {
    out.text += String(node);
  } else if (typeof node === 'string') {
    out.text += JSON.stringify(node);
  } else if (Array.isArray(node)) {
    if (node.length === 0) {
      out.text += '[]';
    } else {
      out.text += '[\n';
      node.forEach((item, i) => {
        out.text += '  '.repeat(indent + 1);
        serializeNode(item, indent + 1, `${path}[${i}]`, out);
        out.text += i < node.length - 1 ? ',\n' : '\n';
      });
      out.text += pad + ']';
    }
  } else if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      out.text += '{}';
    } else {
      out.text += '{\n';
      keys.forEach((key, i) => {
        out.text += '  '.repeat(indent + 1) + JSON.stringify(key) + ': ';
        serializeNode(obj[key], indent + 1, `${path}.${key}`, out);
        out.text += i < keys.length - 1 ? ',\n' : '\n';
      });
      out.text += pad + '}';
    }
  } else {
    out.text += 'null';
  }
  out.ranges.set(path, { from: start, to: out.text.length });
}

/**
 * Pretty-print a JSON document (matching `JSON.stringify(parsed, null, 2)`)
 * while recording the character range of every node keyed by its JSONPath.
 */
export function buildJsonLayout(text: string): {
  ok: boolean;
  pretty?: string;
  ranges?: Map<string, JsonPathHighlightRange>;
  error?: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const out: LayoutBuild = { text: '', ranges: new Map() };
  serializeNode(parsed, 0, '$', out);
  return { ok: true, pretty: out.text, ranges: out.ranges };
}

/**
 * One-shot helper for the webview: parse + query + map matches to highlight
 * ranges in the pretty-printed body.
 */
export function queryJsonPathInText(text: string, expr: string): JsonPathInTextResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Body is not valid JSON, so it cannot be queried', matches: [], ranges: [] };
  }
  const res = queryJsonPath(parsed, expr);
  if (!res.ok) {
    return { ok: false, error: res.error, matches: [], ranges: [] };
  }
  const layout = buildJsonLayout(text);
  const ranges: JsonPathHighlightRange[] = [];
  for (const m of res.matches) {
    const r = layout.ok ? layout.ranges!.get(m.path) : undefined;
    if (r) ranges.push(r);
  }
  return { ok: true, matches: res.matches, ranges };
}
