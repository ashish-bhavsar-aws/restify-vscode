import { describe, it, expect } from "vitest";
import {
  detectJsonSource,
  parseImportText,
  parseImportTextAuto,
  parsePostmanCollection,
  parsePostmanEnvironment,
  parseOpenApiCollection,
  parseHarCollection,
  parseInsomniaCollection,
  parseHttpFileText,
  parseRestifyEnvironment,
  parseYaml,
  requestToHttpText,
  collectionToHttpText,
  collectionToPostman,
  collectionToOpenApi,
  collectionToHar,
  collectionToRestify,
  environmentToPostman,
  environmentToRestify,
  ImportedCollection,
  ImportedEnvironment,
} from "../../src/core";

const postmanV2Json = JSON.stringify({
  info: { name: "Sample API", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
  item: [
    {
      name: "Get user",
      request: {
        method: "GET",
        url: { raw: "https://api.example.com/users?active=true", host: ["api.example.com"], path: ["users"] },
        header: [{ key: "Accept", value: "application/json" }],
      },
    },
    {
      name: "Create user",
      request: {
        method: "POST",
        url: "https://api.example.com/users",
        header: [{ key: "Content-Type", value: "application/json" }],
        body: { mode: "raw", raw: '{"name":"Ada"}' },
        auth: { type: "bearer", bearer: [{ key: "token", value: "abc", type: "string" }] },
      },
    },
  ],
});

const sampleCollection = (): ImportedCollection => ({
  id: "col-test",
  name: "Sample Collection",
  requests: [
    {
      name: "List users",
      method: "GET",
      url: "https://api.example.com/users?page=1",
      headers: [{ key: "Accept", value: "application/json" }],
      queryParams: [{ key: "page", value: "1", enabled: true }],
    },
    {
      name: "Create user",
      method: "POST",
      url: "https://api.example.com/users/:id",
      bodyType: "json",
      body: '{"name":"Ada"}',
      authType: "bearer",
      authData: { token: "sekret" },
    },
  ],
});

describe("detectJsonSource", () => {
  it("detects postman collections", () => {
    expect(detectJsonSource(JSON.parse(postmanV2Json))).toBe("postman");
  });

  it("detects openapi 3.x", () => {
    expect(detectJsonSource({ openapi: "3.0.1", paths: {} })).toBe("openapi");
  });

  it("detects swagger 2.0", () => {
    expect(detectJsonSource({ swagger: "2.0", paths: {} })).toBe("openapi");
  });

  it("detects HAR logs", () => {
    expect(detectJsonSource({ log: { entries: [] } })).toBe("har");
  });

  it("detects restify collections", () => {
    expect(detectJsonSource({ name: "x", requests: [] })).toBe("restify");
  });

  it("detects insomnia exports by _type", () => {
    expect(detectJsonSource([{ _type: "request", name: "x" }])).toBe("insomnia");
  });

  it("falls back to filename hints", () => {
    expect(detectJsonSource({}, "spec.yaml")).toBe("openapi");
    expect(detectJsonSource({}, "spec.yml")).toBe("openapi");
    expect(detectJsonSource({}, "capture.har")).toBe("har");
    expect(detectJsonSource({}, "unknown.txt")).toBeNull();
  });
});

describe("parsePostmanCollection", () => {
  it("imports v2 collections with urlencoded/raw bodies and auth", () => {
    const col = parseImportText(postmanV2Json, "postman");
    expect(col).not.toBeNull();
    expect(col!.name).toBe("Sample API");
    expect(col!.requests).toHaveLength(2);
    const get = col!.requests[0];
    expect(get.method).toBe("GET");
    expect(get.url).toContain("api.example.com/users");
    expect(get.headers).toEqual([{ key: "Accept", value: "application/json" }]);
    const post = col!.requests[1];
    expect(post.method).toBe("POST");
    expect(post.bodyType).toBe("json");
    expect(post.body).toContain('"name"');
    expect(post.authType).toBe("bearer");
  });

  it("returns null for non-postman documents", () => {
    expect(parsePostmanCollection({ openapi: "3.0.0", paths: {} })).toBeNull();
  });
});

describe("openapi import/export", () => {
  const yaml = `
openapi: 3.0.1
info:
  title: Pets
  version: 1.0.0
paths:
  /pets:
    get:
      summary: List pets
      parameters:
        - name: limit
          in: query
          schema: { type: integer }
      responses:
        '200': { description: OK }
    post:
      summary: Create pet
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                name: { type: string }
      responses:
        '201': { description: Created }
  /pets/{id}:
    get:
      summary: Get pet
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      responses:
        '200': { description: OK }
`;

  it("parses YAML openapi documents", () => {
    const data = parseYaml(yaml);
    expect(data.openapi).toBe("3.0.1");
    expect(data.info.title).toBe("Pets");
    const col = parseOpenApiCollection(data);
    expect(col).not.toBeNull();
    expect(col!.name).toBe("Pets");
    const methods = col!.requests.map((r) => r.method);
    expect(methods).toContain("GET");
    expect(methods).toContain("POST");
    const create = col!.requests.find((r) => r.method === "POST");
    expect(create!.bodyType).toBe("json");
  });

  it("parses openapi via parseImportTextAuto with .yaml", () => {
    const col = parseImportTextAuto(yaml, "openapi.yaml");
    expect(col).not.toBeNull();
    expect(col!.requests.length).toBeGreaterThanOrEqual(3);
  });

  it("exports collections to openapi 3.0", () => {
    const doc = collectionToOpenApi(sampleCollection());
    expect(doc.openapi.startsWith("3.")).toBe(true);
    expect(doc.info.title).toBe("Sample Collection");
    expect(doc.paths["/users"].get).toBeDefined();
    expect(doc.paths["/users/{id}"].post).toBeDefined();
    const getOp = doc.paths["/users"].get;
    expect(getOp.parameters.some((p: any) => p.name === "page" && p.in === "query")).toBe(true);
  });
});

describe("har import/export", () => {
  const har = {
    log: {
      version: "1.2",
      entries: [
        {
          startedDateTime: "2024-01-01T00:00:00Z",
          request: {
            method: "POST",
            url: "https://api.example.com/items?a=1",
            headers: [{ name: "Content-Type", value: "application/x-www-form-urlencoded" }],
            queryString: [{ name: "a", value: "1" }],
            postData: {
              mimeType: "application/x-www-form-urlencoded",
              params: [{ name: "name", value: "Ada" }],
              text: "name=Ada",
            },
          },
        },
        {
          startedDateTime: "2024-01-01T00:00:01Z",
          request: { method: "GET", url: "https://api.example.com/health", headers: [], queryString: [] },
        },
      ],
    },
  };

  it("imports HAR entries incl. urlencoded bodies", () => {
    const col = parseHarCollection(har);
    expect(col).not.toBeNull();
    expect(col!.requests).toHaveLength(2);
    const post = col!.requests[0];
    expect(post.bodyType).toBe("urlencoded");
    expect(post.urlencoded).toEqual([{ key: "name", value: "Ada", enabled: true }]);
    expect(post.queryParams).toEqual([{ key: "a", value: "1", enabled: true }]);
  });

  it("export->import roundtrip preserves methods and urls", () => {
    const out = collectionToHar(sampleCollection());
    const col = parseHarCollection(out);
    expect(col).not.toBeNull();
    expect(col!.requests).toHaveLength(2);
    expect(col!.requests[0].url).toBe("https://api.example.com/users?page=1");
    expect(col!.requests[1].body).toContain('"name"');
  });
});

describe("insomnia import", () => {
  it("imports insomnia requests", () => {
    const col = parseInsomniaCollection([
      { _type: "request", name: "Ping", url: "https://api.example.com/ping", method: "GET", headers: [] },
    ]);
    expect(col).not.toBeNull();
    expect(col!.requests).toHaveLength(1);
    expect(col!.requests[0].name).toBe("Ping");
  });
});

describe(".http parse/export", () => {
  const httpDoc = `### Get health
GET https://api.example.com/health
Accept: application/json

### Create item
POST https://api.example.com/items
Content-Type: application/json

{"name":"Ada"}
`;

  it("parses .http documents", () => {
    const col = parseHttpFileText(httpDoc);
    expect(col).not.toBeNull();
    expect(col!.requests).toHaveLength(2);
    const [health, create] = col!.requests;
    expect(health.name).toBe("Get health");
    expect(health.method).toBe("GET");
    expect(health.headers).toEqual([{ key: "Accept", value: "application/json" }]);
    expect(create.bodyType).toBe("json");
    expect(create.body).toContain('"name"');
  });

  it("detects .http from text via parseImportTextAuto", () => {
    const col = parseImportTextAuto(httpDoc);
    expect(col).not.toBeNull();
    expect(col!.requests).toHaveLength(2);
  });

  it("exports a request as .http text", () => {
    const text = requestToHttpText(sampleCollection().requests[1]);
    expect(text).toContain("### Create user");
    expect(text).toContain("POST https://api.example.com/users/:id");
    expect(text).toContain('{"name":"Ada"}');
  });

  it("collectionToHttpText roundtrips through parseHttpFileText", () => {
    const text = collectionToHttpText(sampleCollection());
    const parsed = parseHttpFileText(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.requests.map((r) => r.method)).toEqual(["GET", "POST"]);
  });
});

describe("restify export", () => {
  it("strips internal ids", () => {
    const out = collectionToRestify(sampleCollection());
    expect(out.name).toBe("Sample Collection");
    expect(out.requests[0].id).toBeUndefined();
    expect(out.requests[0].method).toBe("GET");
  });

  it("parses restify JSON back", () => {
    const out = collectionToRestify(sampleCollection());
    const col = parseImportTextAuto(JSON.stringify(out), "collection.json");
    expect(col).not.toBeNull();
    expect(col!.name).toBe("Sample Collection");
    expect(col!.requests).toHaveLength(2);
  });
});

describe("postman export", () => {
  it("exports collections with body/auth", () => {
    const out = collectionToPostman(sampleCollection());
    expect(out.info.schema).toContain("collection.json");
    expect(out.item).toHaveLength(2);
    const post = out.item[1].request;
    expect(post.method).toBe("POST");
    expect(post.body.mode).toBe("raw");
    expect(post.auth.type).toBe("bearer");
  });
});

describe("environment import/export", () => {
  const env: ImportedEnvironment = {
    name: "Dev",
    variables: [
      { key: "baseUrl", value: "https://dev.example.com" },
      { key: "token", value: "shh", isSecret: true },
    ],
  };

  it("exports to postman env format", () => {
    const out = environmentToPostman(env);
    expect(out.name).toBe("Dev");
    expect(out.values).toHaveLength(2);
    const secret = out.values.find((v: any) => v.key === "token");
    expect(secret.type).toBe("secret");
  });

  it("parses postman env format", () => {
    const parsed = parsePostmanEnvironment({
      name: "Dev",
      values: [
        { key: "baseUrl", value: "https://dev.example.com", enabled: true, type: "text" },
        { key: "token", value: "shh", enabled: true, type: "secret" },
      ],
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.variables).toHaveLength(2);
    expect(parsed!.variables[1].isSecret).toBe(true);
  });

  it("exports/parses restify env format", () => {
    const out = environmentToRestify(env);
    const secretVar = out.variables.find((v: any) => v.key === "token");
    expect(secretVar.value).toBe("");
    const parsed = parseRestifyEnvironment(out);
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe("Dev");
    expect(parsed!.variables[1].isSecret).toBe(true);
  });
});

describe("parseYaml", () => {
  it("parses scalars, sequences and nested mappings", () => {
    const out = parseYaml(`
a: 1
b: true
c: null
list:
  - one
  - two
nested:
  x: hello
`);
    expect(out.a).toBe(1);
    expect(out.b).toBe(true);
    expect(out.c).toBeNull();
    expect(out.list).toEqual(["one", "two"]);
    expect(out.nested.x).toBe("hello");
  });
});
