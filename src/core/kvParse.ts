/**
 * Key/value table parsing helpers — used for both clipboard paste into KV
 * tables (F15) and the raw bulk editor (F14).
 *
 * Pure, framework-free logic so it stays unit-testable and host-agnostic.
 */

export type KvTableMode = 'headers' | 'params';

export interface ParsedKvItem {
  key: string;
  value: string;
  enabled: boolean;
}

const EMPTY: ParsedKvItem = { key: '', value: '', enabled: true };

/** Splits a single pasted line at its first delimiter into key/value. */
export function splitKvLine(line: string, mode: KvTableMode): ParsedKvItem {
  const tabIdx = line.indexOf('\t');
  if (tabIdx >= 0) {
    return {
      key: line.slice(0, tabIdx).trim(),
      value: line.slice(tabIdx + 1).trim(),
      enabled: true,
    };
  }
  const sep = mode === 'headers' ? ':' : '=';
  const sepIdx = line.indexOf(sep);
  if (sepIdx >= 0) {
    return {
      key: line.slice(0, sepIdx).trim(),
      value: line.slice(sepIdx + 1).trim(),
      enabled: true,
    };
  }
  return { key: line.trim(), value: '', enabled: true };
}

/**
 * Parses pasted clipboard text into KV rows. Handles:
 *   - tab-delimited columns (Excel/CSV copy): "key\tvalue"
 *   - header-style lines: "Key: Value" (headers mode)
 *   - query-style lines: "key=value" (params mode)
 *   - bare tokens: treated as keys with an empty value
 * CRLF and blank lines are handled; blank lines are dropped.
 */
export function parsePaste(text: string, mode: KvTableMode): ParsedKvItem[] {
  const rows: ParsedKvItem[] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    rows.push(splitKvLine(line, mode));
  }
  return rows;
}

/** True when pasted text should trigger a bulk row insert rather than a single-cell paste. */
export function isBulkPaste(text: string): boolean {
  return text.includes('\n') || text.includes('\t');
}

/** Parses raw bulk-editor text (same grammar as paste). */
export function parseBulkText(text: string, mode: KvTableMode): ParsedKvItem[] {
  const parsed = parsePaste(text, mode);
  // Preserve blank lines as empty rows so the editor can be used to clear rows.
  const lines = text.replace(/\r/g, '').split('\n');
  const out: ParsedKvItem[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() === '') {
      out.push({ ...EMPTY });
    } else {
      out.push(parsed.shift() ?? { ...EMPTY });
    }
  }
  return out;
}

/** Serializes KV rows into bulk-editor text form. */
export function serializeBulkText(items: Array<{ key: string; value: string }>, mode: KvTableMode): string {
  const sep = mode === 'headers' ? ': ' : '=';
  return items
    .map((item) => (item.key ? `${item.key}${sep}${item.value}` : item.value))
    .join('\n');
}
