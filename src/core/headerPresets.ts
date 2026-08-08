/**
 * Header presets (F20) — named, reusable sets of headers that can be applied
 * to a request. Pure, framework-free logic shared by the host (persistence)
 * and the webview (apply).
 */
export interface HeaderRow {
  key: string;
  value: string;
  enabled?: boolean;
}

export interface HeaderPreset {
  id: string;
  name: string;
  headers: HeaderRow[];
}

/**
 * Merge a preset's headers into the current header list. Existing headers with
 * the same key (case-insensitive) are replaced in place; new ones are
 * appended. Returns a new array and never mutates the inputs.
 */
export function mergeHeaders(
  current: HeaderRow[],
  incoming: HeaderRow[],
): HeaderRow[] {
  const result = current.map((h) => ({ ...h }));
  for (const inc of incoming) {
    const idx = result.findIndex(
      (h) => h.key.toLowerCase() === inc.key.toLowerCase(),
    );
    if (idx >= 0) {
      result[idx] = { ...inc };
    } else {
      result.push({ ...inc });
    }
  }
  return result;
}

/** Drop rows that have no key so saved presets stay clean. */
export function cleanPresetHeaders(rows: HeaderRow[]): HeaderRow[] {
  return rows
    .map((h) => ({ ...h }))
    .filter((h) => (h.key || "").trim().length > 0);
}
