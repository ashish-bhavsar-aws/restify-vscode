/**
 * Shared text/format helpers for the webview UI (browser context — no vscode
 * or Node imports).
 */

/** Escape a string for use inside a RegExp (literal match). */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Human-readable byte size, e.g. `12.3 KB`. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
