import { describe, it, expect } from "vitest";
import {
  queryJsonPath,
  resolveResponseVariables,
  extractResponseTokens,
  collectResponseVariableTokens,
  toResponseVarsContext,
  ResponseVarsContext,
} from "../../src/core";

const ctx: ResponseVarsContext = {
  status: 200,
  statusText: "OK",
  headers: {
    "content-type": "application/json",
    "set-cookie": ["a=1", "b=2"],
  },
  body: JSON.stringify({ token: "abc123", user: { name: "Ada" }, items: [{ id: 1 }, { id: 2 }] }),
};

describe("queryJsonPath", () => {
  const data = { token: "abc", user: { name: "Ada" }, items: [{ id: 1 }, { id: 2 }] };

  it("walks dot paths", () => {
    expect(queryJsonPath(data, "token")).toBe("abc");
    expect(queryJsonPath(data, "$.token")).toBe("abc");
    expect(queryJsonPath(data, "$.user.name")).toBe("Ada");
    expect(queryJsonPath(data, "user.name")).toBe("Ada");
  });

  it("walks array indexes with dot and bracket notation", () => {
    expect(queryJsonPath(data, "items.1.id")).toBe(2);
    expect(queryJsonPath(data, "items[0].id")).toBe(1);
  });

  it("supports quoted bracket keys with dots/spaces", () => {
    const spaced = { "my key": { value: 42 } };
    expect(queryJsonPath(spaced, '$["my key"].value')).toBe(42);
    expect(queryJsonPath(spaced, "$['my key'].value")).toBe(42);
  });

  it("returns undefined for missing segments or non-navigable values", () => {
    expect(queryJsonPath(data, "user.missing")).toBeUndefined();
    expect(queryJsonPath(data, "missing.x")).toBeUndefined();
    expect(queryJsonPath(data, "token.x")).toBeUndefined();
    expect(queryJsonPath(null, "a.b")).toBeUndefined();
    expect(queryJsonPath(undefined, "a.b")).toBeUndefined();
  });

  it("returns primitives from a root value", () => {
    expect(queryJsonPath("str", "x")).toBeUndefined();
    expect(queryJsonPath(42, "")).toBe(42);
  });
});

describe("resolveResponseVariables", () => {
  it("resolves status, statusText, body and headers", () => {
    expect(resolveResponseVariables("{{response.status}}", ctx)).toBe("200");
    expect(resolveResponseVariables("s={{response.statusText}}", ctx)).toBe("s=OK");
    expect(resolveResponseVariables("{{response.body}}", ctx)).toBe(ctx.body);
    expect(resolveResponseVariables("{{response.headers.content-type}}", ctx)).toBe("application/json");
    expect(resolveResponseVariables("{{response.headers.Content-Type}}", ctx)).toBe("application/json");
  });

  it("joins multi-value headers", () => {
    expect(resolveResponseVariables("{{response.headers.set-cookie}}", ctx)).toBe("a=1; b=2");
  });

  it("resolves JSONPath tokens against the parsed body", () => {
    expect(resolveResponseVariables("{{response.$.token}}", ctx)).toBe("abc123");
    expect(resolveResponseVariables("{{response.$.user.name}}", ctx)).toBe("Ada");
    expect(resolveResponseVariables("{{response.$.items.0.id}}", ctx)).toBe("1");
    expect(resolveResponseVariables("{{response.$.items[1].id}}", ctx)).toBe("2");
  });

  it("stringifies object/array values", () => {
    expect(resolveResponseVariables("{{response.$.items}}", ctx)).toBe(
      JSON.stringify([{ id: 1 }, { id: 2 }]),
    );
  });

  it("leaves unknown or missing tokens untouched", () => {
    expect(resolveResponseVariables("{{response.$.missing}}", ctx)).toBe("{{response.$.missing}}");
    expect(resolveResponseVariables("{{response.headers.nope}}", ctx)).toBe("{{response.headers.nope}}");
  });

  it("does nothing without a context", () => {
    expect(resolveResponseVariables("{{response.status}}", undefined)).toBe("{{response.status}}");
  });

  it("resolves inside larger strings and multiple tokens", () => {
    expect(
      resolveResponseVariables("Bearer {{response.$.token}} ({{response.status}})", ctx),
    ).toBe("Bearer abc123 (200)");
  });
});

describe("extractResponseTokens", () => {
  it("lists referenced tokens", () => {
    expect(extractResponseTokens("{{response.status}} and {{response.$.token}}")).toEqual([
      "response.status",
      "response.$.token",
    ]);
  });
});

describe("collectResponseVariableTokens", () => {
  it("inventories status, body, headers and top-level JSON keys", () => {
    const tokens = collectResponseVariableTokens(ctx);
    expect(tokens).toContain("response.status");
    expect(tokens).toContain("response.body");
    expect(tokens).toContain("response.headers.content-type");
    expect(tokens).toContain("response.$.token");
    expect(tokens).toContain("response.$.user");
    expect(tokens).toContain("response.$.items");
  });

  it("omits JSON keys for non-JSON bodies", () => {
    const tokens = collectResponseVariableTokens({ status: 500, body: "not json" });
    expect(tokens).toContain("response.status");
    expect(tokens).not.toContain("response.$.x");
  });
});

describe("toResponseVarsContext", () => {
  it("normalizes raw headers", () => {
    const c = toResponseVarsContext({
      status: 200,
      headers: { "Content-Type": ["application/json"] },
      body: "{}",
    });
    expect(c.headers?.["Content-Type"]).toEqual(["application/json"]);
    expect(c.status).toBe(200);
  });
});
