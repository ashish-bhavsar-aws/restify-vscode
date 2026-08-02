import { describe, it, expect } from "vitest";
import {
  serializeRequestBody,
  applyHeadersToRequest,
} from "../../src/core/body";
import type { CoreRequestForBody } from "../../src/core/body";

const resolve = (s: string) => s;

describe("serializeRequestBody", () => {
  it("returns empty for none body type", () => {
    expect(serializeRequestBody({ bodyType: "none" }, resolve)).toEqual({});
  });

  it("serializes JSON and adds Content-Type", () => {
    const out = serializeRequestBody(
      { bodyType: "json", body: '{"a": 1}' },
      resolve,
    );
    expect(out.body).toBe('{"a": 1}');
    expect(out.headers?.["Content-Type"]).toBe("application/json");
  });

  it("serializes XML and adds Content-Type", () => {
    const out = serializeRequestBody(
      { bodyType: "xml", body: "<a/>" },
      resolve,
    );
    expect(out.body).toBe("<a/>");
    expect(out.headers?.["Content-Type"]).toBe("application/xml");
  });

  it("serializes text without forcing Content-Type", () => {
    const out = serializeRequestBody(
      { bodyType: "text", body: "hello" },
      resolve,
    );
    expect(out.body).toBe("hello");
    expect(out.headers).toEqual({});
  });

  it("serializes GraphQL with query and variables", () => {
    const out = serializeRequestBody(
      {
        bodyType: "graphql",
        gqlQuery: "{ users { id } }",
        gqlVars: '{"id": 1}',
      },
      resolve,
    );
    expect(JSON.parse(out.body as string)).toEqual({
      query: "{ users { id } }",
      variables: { id: 1 },
    });
    expect(out.headers?.["Content-Type"]).toBe("application/json");
  });

  it("omits GraphQL variables when empty", () => {
    const out = serializeRequestBody(
      { bodyType: "graphql", gqlQuery: "{ ping }", gqlVars: "" },
      resolve,
    );
    const parsed = JSON.parse(out.body as string);
    expect(parsed.query).toBe("{ ping }");
    expect(parsed.variables).toBeUndefined();
  });

  it("returns empty for GraphQL without a query", () => {
    expect(
      serializeRequestBody({ bodyType: "graphql", gqlQuery: "" }, resolve),
    ).toEqual({});
  });

  it("falls back to raw string variables when JSON is invalid", () => {
    const out = serializeRequestBody(
      { bodyType: "graphql", gqlQuery: "{ ping }", gqlVars: "not-json" },
      resolve,
    );
    const parsed = JSON.parse(out.body as string);
    expect(parsed.variables).toBe("not-json");
  });

  it("serializes urlencoded form", () => {
    const out = serializeRequestBody(
      {
        bodyType: "urlencoded",
        urlencoded: [
          { key: "a", value: "1", enabled: true },
          { key: "b", value: "two words", enabled: true },
          { key: "disabled", value: "x", enabled: false },
        ],
      },
      resolve,
    );
    expect(out.body).toBe("a=1&b=two+words");
    expect(out.headers?.["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
  });

  it("serializes non-file form data as urlencoded", () => {
    const out = serializeRequestBody(
      {
        bodyType: "form",
        formData: [
          { key: "k", value: "v", enabled: true, formType: "text" },
        ],
      },
      resolve,
    );
    expect(out.body).toBe("k=v");
  });

  it("builds multipart body with boundary for file fields", () => {
    const out = serializeRequestBody(
      {
        bodyType: "form",
        formData: [
          {
            key: "file",
            formType: "file",
            fileName: "a.txt",
            fileContentBase64: Buffer.from("hi").toString("base64"),
            contentType: "text/plain",
            enabled: true,
          },
          { key: "note", value: "hello", formType: "text", enabled: true },
        ],
      },
      resolve,
    );
    const body = out.body as Buffer;
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.toString("utf8")).toContain('name="file"; filename="a.txt"');
    expect(body.toString("utf8")).toContain("Content-Type: text/plain");
    expect(body.toString("utf8")).toContain('name="note"');
    expect(out.headers?.["Content-Type"]).toMatch(
      /multipart\/form-data; boundary=/,
    );
    expect(out.headers?.["Content-Length"]).toBe(String(body.length));
    expect(out.forceHeaders).toContain("Content-Type");
  });

  it("resolves variables through the resolve callback", () => {
    const out = serializeRequestBody(
      { bodyType: "json", body: "{{name}}" },
      (s) => (s === "{{name}}" ? '"Resolved"' : s),
    );
    expect(out.body).toBe('"Resolved"');
  });
});

describe("applyHeadersToRequest", () => {
  it("does not override existing headers by default", () => {
    const target = { "Content-Type": "application/custom" };
    applyHeadersToRequest(target, { "Content-Type": "application/json" });
    expect(target["Content-Type"]).toBe("application/custom");
  });

  it("overrides headers listed in forceNames", () => {
    const target = { "Content-Type": "application/custom" };
    applyHeadersToRequest(
      target,
      { "Content-Type": "multipart/form-data; boundary=x" },
      ["Content-Type"],
    );
    expect(target["Content-Type"]).toBe("multipart/form-data; boundary=x");
  });

  it("is case-insensitive when matching existing headers", () => {
    const target = { "content-type": "application/custom" };
    applyHeadersToRequest(target, { "Content-Type": "application/json" });
    expect(target["content-type"]).toBe("application/custom");
  });
});
