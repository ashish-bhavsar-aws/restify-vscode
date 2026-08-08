/**
 * Variable scoping (F42) — precedence-aware resolution of `{{var}}` tokens.
 *
 * Scope precedence, lowest to highest priority (later overrides earlier for
 * keys it defines):
 *
 *   1. global      — the built-in Global environment (always in scope)
 *   2. collection  — variables defined on a collection, inherited by requests
 *   3. environment — the active environment
 *   4. local       — session/script variables (request chaining), applied last
 *
 * Pure and framework-free so it is unit-testable in isolation.
 */
export interface ScopedVariables {
  /** Scope name for diagnostics/tests (e.g. "global", "collection"). */
  name: string;
  values: Record<string, string>;
}

/**
 * Merge scopes in array order so later entries override earlier ones for the
 * keys they define. Keys absent from a higher scope fall through untouched.
 */
export function mergeVariableScopes(
  scopes: ScopedVariables[],
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const scope of scopes) {
    for (const [key, value] of Object.entries(scope.values || {})) {
      if (!key) continue;
      merged[key] = value ?? "";
    }
  }
  return merged;
}

/**
 * Replace every `{{key}}` occurrence in text using a merged variable map.
 * Uses split/join so keys containing regex special characters are safe.
 */
export function applyVariableMap(
  text: string,
  variables: Record<string, string>,
): string {
  let out = text;
  for (const [key, value] of Object.entries(variables || {})) {
    if (!key) continue;
    out = out.split(`{{${key}}}`).join(value ?? "");
  }
  return out;
}
