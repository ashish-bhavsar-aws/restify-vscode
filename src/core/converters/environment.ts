// Imported environment type and Postman/Restify environment converters.
export interface ImportedEnvironment {
  id?: string;
  name: string;
  variables: Array<{ key: string; value: string; isSecret?: boolean; initialValue?: string }>;
}
export function environmentToPostman(env: ImportedEnvironment): any {
  return {
    name: env.name,
    values: (env.variables || [])
      .filter((v) => v.key)
      .map((v) => ({ key: v.key, value: v.value || "", enabled: true, type: v.isSecret ? "secret" : "text" })),
    _postman_variable_scope: "environment",
    _postman_exported_at: new Date().toISOString(),
    _postman_exported_using: "Restify",
  };
}
export function parsePostmanEnvironment(data: any): ImportedEnvironment | null {
  if (!data || typeof data !== "object") return null;
  const name = data.name || (data._postman_variable_scope === "environment" ? "Imported Env" : null);
  const values = Array.isArray(data.values) ? data.values : Array.isArray(data.value) ? data.value : null;
  if (!name && !values) return null;
  return {
    name: name || "Imported Env",
    variables: (values || [])
      .filter((v: any) => v && v.key)
      .map((v: any) => ({
        key: String(v.key),
        value: String(v.value ?? ""),
        isSecret: v.type === "secret",
        initialValue:
          v.initial !== undefined && v.initial !== null
            ? String(v.initial)
            : undefined,
      })),
  };
}
export function environmentToRestify(env: ImportedEnvironment): any {
  return {
    name: env.name,
    variables: (env.variables || []).map((v) => ({
      key: v.key,
      value: v.isSecret ? "" : (v.value || ""),
      isSecret: !!v.isSecret,
      initialValue: v.isSecret ? undefined : (v.initialValue ?? v.value ?? ""),
    })),
  };
}
export function parseRestifyEnvironment(data: any): ImportedEnvironment | null {
  if (!data || typeof data !== "object" || typeof data.name !== "string") return null;
  return {
    name: data.name,
    variables: (Array.isArray(data.variables) ? data.variables : [])
      .filter((v: any) => v && v.key)
      .map((v: any) => ({
        key: String(v.key),
        value: String(v.value ?? ""),
        isSecret: !!v.isSecret,
        initialValue:
          v.initialValue !== undefined && v.initialValue !== null
            ? String(v.initialValue)
            : undefined,
      })),
  };
}

// ─── YAML (minimal parser for OpenAPI documents) ────────────────────────────
