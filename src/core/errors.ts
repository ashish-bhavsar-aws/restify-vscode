/**
 * Shared error helpers. Host-agnostic (`src/core` — no `vscode` imports).
 */

/** Human-readable message from an unknown thrown value. */
export function errorMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
