/**
 * Variable-name autocomplete suggestions (F18) — shared by the URL bar, KV
 * value cells, and the request body editor.
 *
 * Pure, framework-free logic so it stays unit-testable and host-agnostic.
 */
import { DYNAMIC_VARIABLES } from './dynamicVarTokens';

export interface VariableSuggestion {
  /** Display name, e.g. "userToken" or "$guid". */
  name: string;
  /** Insertable token, e.g. "{{userToken}}" or "{{$guid}}". */
  token: string;
  dynamic: boolean;
}

const TRAILING_TOKEN = /\{\{\$?[a-zA-Z0-9_.\-:]*$/;

export function tokenString(name: string): string {
  return name === 'processEnv' ? '{{$processEnv:NAME}}' : `{{$${name}}}`;
}

/**
 * Returns variable suggestions when `text` ends with an incomplete `{{...`
 * token. Dynamic variables (`{{$...`) are offered when the prefix starts with
 * `$`; otherwise env variable names matching the typed prefix are offered.
 * Returns [] when no incomplete token is being typed.
 */
export function getVariableSuggestions(
  text: string,
  varNames: string[],
): VariableSuggestion[] {
  const dynamicMatch = text.match(/\{\{\$[a-zA-Z:]*$/);
  if (dynamicMatch) {
    const prefix = dynamicMatch[0].slice(3);
    return DYNAMIC_VARIABLES.map((d) => ({
      name: d.name,
      token: tokenString(d.name),
      dynamic: true,
    })).filter((s) => s.token.slice(3).startsWith(prefix));
  }

  const envMatch = text.match(/\{\{[a-zA-Z0-9_.-]*$/);
  if (!envMatch) return [];
  const prefix = envMatch[0].slice(2).toLowerCase();
  const seen = new Set<string>();
  const suggestions: VariableSuggestion[] = [];
  for (const name of varNames) {
    const key = name.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (key.toLowerCase().startsWith(prefix)) {
      suggestions.push({ name: key, token: `{{${key}}}`, dynamic: false });
    }
  }
  return suggestions;
}

/**
 * Replaces the trailing incomplete `{{...` token in `text` with the suggestion
 * token. Returns `text` unchanged when no incomplete token is present.
 */
export function applyVariableSuggestion(
  text: string,
  suggestion: { token: string },
): string {
  return text.replace(TRAILING_TOKEN, suggestion.token);
}

/** Length of the trailing incomplete `{{...` token in `text`, or 0. */
export function incompleteTokenLength(text: string): number {
  const m = text.match(TRAILING_TOKEN);
  return m ? m[0].length : 0;
}
