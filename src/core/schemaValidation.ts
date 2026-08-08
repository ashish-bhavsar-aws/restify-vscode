/**
 * JSON Schema response validation (F22).
 *
 * Pure host-side logic: takes a response body string and a JSON Schema
 * (draft-07) string, validates the body against the schema with Ajv, and
 * returns a plain, serializable result object that can be passed to the
 * webview over postMessage.
 *
 * Kept free of any `vscode`/webview imports so it is unit-testable in
 * isolation (see test/unit/schemaValidation.test.ts).
 */

import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";

export interface SchemaValidationError {
  /** JSON pointer-ish instance path, e.g. "/items/0/name". */
  path: string;
  /** Ajv keyword that failed, or a synthetic tag like "body" / "schema". */
  keyword: string;
  /** Human-readable failure message. */
  message: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  errorCount: number;
  errors: SchemaValidationError[];
}

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  validateFormats: true,
  addUsedSchema: false,
});
addFormats(ajv);

/** Convert Ajv error objects into plain serializable entries. */
function toPlainErrors(errors: Array<ErrorObject>): SchemaValidationError[] {
  return errors.map((err) => ({
    path: err.instancePath || "/",
    keyword: err.keyword,
    message: err.message || "validation failed",
  }));
}

/**
 * Validate a response body string against a JSON Schema (draft-07) string.
 *
 * - Returns `valid: false` with a single synthetic error when the schema or
 *   the body is not valid JSON.
 * - Otherwise returns the Ajv result mapped to plain error objects.
 */
export function validateJsonResponse(
  body: string,
  schemaText: string,
): SchemaValidationResult {
  let schema: unknown;  try {
    schema = JSON.parse(schemaText);
  } catch (err) {
    return {
      valid: false,
      errorCount: 1,
      errors: [
        {
          path: "/",
          keyword: "schema",
          message: `Invalid JSON Schema: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }

  if (typeof schema !== "object" || schema === null) {
    return {
      valid: false,
      errorCount: 1,
      errors: [
        { path: "/", keyword: "schema", message: "JSON Schema must be an object" },
      ],
    };
  }

  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return {
      valid: false,
      errorCount: 1,
      errors: [
        {
          path: "/",
          keyword: "body",
          message: "Response is not valid JSON, so it cannot be validated against a schema",
        },
      ],
    };
  }

  try {
    const validate = ajv.compile(schema as object);
    const valid = validate(data);
    if (valid) {
      return { valid: true, errorCount: 0, errors: [] };
    }
    const errors = toPlainErrors(validate.errors ?? []);
    return { valid: false, errorCount: errors.length, errors };
  } catch (err) {
    return {
      valid: false,
      errorCount: 1,
      errors: [
        {
          path: "/",
          keyword: "schema",
          message: `Schema compilation failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }
}

/**
 * Convenience wrapper for host callers: validates only when the request opted
 * in (`validateSchema`) and a non-empty schema is present. Returns `null` when
 * validation is skipped, so callers can omit the result entirely.
 */
export function validateResponseIfEnabled(
  opts: { validateSchema?: boolean; schema?: string },
  body: string | undefined,
): SchemaValidationResult | null {
  if (!opts.validateSchema || !(opts.schema || "").trim()) return null;
  return validateJsonResponse(
    typeof body === "string" ? body : "",
    opts.schema as string,
  );
}
