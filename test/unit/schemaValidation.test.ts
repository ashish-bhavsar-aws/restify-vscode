import { describe, it, expect } from "vitest";
import { validateJsonResponse } from "../../src/core/schemaValidation";

describe("validateJsonResponse", () => {
  const userSchema = JSON.stringify({
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      id: { type: "integer" },
      name: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["id", "name"],
    additionalProperties: false,
  });

  it("returns valid for a conforming body", () => {
    const result = validateJsonResponse(
      JSON.stringify({ id: 1, name: "ada", tags: ["admin"] }),
      userSchema,
    );
    expect(result.valid).toBe(true);
    expect(result.errorCount).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it("reports a missing required field", () => {
    const result = validateJsonResponse(JSON.stringify({ id: 1 }), userSchema);
    expect(result.valid).toBe(false);
    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.path === "/" && /name/.test(e.message))).toBe(true);
  });

  it("reports type mismatches with instance paths", () => {
    const result = validateJsonResponse(
      JSON.stringify({ id: "not-an-int", name: "ada", tags: [42] }),
      userSchema,
    );
    expect(result.valid).toBe(false);
    const paths = result.errors.map((e) => e.path);
    expect(paths).toContain("/id");
    expect(paths).toContain("/tags/0");
  });

  it("fails when additional properties are present", () => {
    const result = validateJsonResponse(
      JSON.stringify({ id: 1, name: "ada", extra: true }),
      userSchema,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0].path).toBe("/");
  });

  it("rejects a non-JSON response body", () => {
    const result = validateJsonResponse("<html>not json</html>", userSchema);
    expect(result.valid).toBe(false);
    expect(result.errorCount).toBe(1);
    expect(result.errors[0].keyword).toBe("body");
  });

  it("rejects an invalid schema text", () => {
    const result = validateJsonResponse('{"id":1}', "{ not valid json");
    expect(result.valid).toBe(false);
    expect(result.errors[0].keyword).toBe("schema");
  });

  it("rejects a non-object schema", () => {
    const result = validateJsonResponse("[]", '"true"');
    expect(result.valid).toBe(false);
    expect(result.errors[0].keyword).toBe("schema");
  });

  it("returns valid for an empty body that matches an empty schema", () => {
    const result = validateJsonResponse("{}", "{}");
    expect(result.valid).toBe(true);
  });

  it("supports arrays at the root", () => {
    const schema = JSON.stringify({
      type: "array",
      items: { type: "string" },
    });
    expect(validateJsonResponse('["a","b"]', schema).valid).toBe(true);
    expect(validateJsonResponse('[1,2]', schema).valid).toBe(false);
  });

  it("supports format validation when formats are used", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: { email: { type: "string", format: "email" } },
      required: ["email"],
    });
    expect(validateJsonResponse('{"email":"a@b.com"}', schema).valid).toBe(true);
    expect(validateJsonResponse('{"email":"not-an-email"}', schema).valid).toBe(false);
  });
});
