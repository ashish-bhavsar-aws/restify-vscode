import { DYNAMIC_VARIABLES } from '../../core/dynamicVarTokens';

function tokenString(name: string): string {
  return name === 'processEnv' ? '{{$processEnv:NAME}}' : `{{$${name}}}`;
}

/**
 * Returns `{{$...}}` suggestions when `text` ends with an incomplete dynamic
 * variable token (e.g. `{{$`, `{{$gui`, `{{$processEnv:`). Returns [] otherwise.
 */
export function getDynamicVarSuggestions(text: string): string[] {
  const m = text.match(/\{\{\$[a-zA-Z:]*$/);
  if (!m) return [];
  const prefix = m[0].slice(3);
  return DYNAMIC_VARIABLES.map((d) => tokenString(d.name)).filter((token) =>
    token.slice(3).startsWith(prefix),
  );
}

/** Replaces the trailing incomplete `{{$...` token with a full suggestion. */
export function applyDynamicVarSuggestion(text: string, suggestion: string): string {
  return text.replace(/\{\{\$[a-zA-Z:]*$/, suggestion);
}
