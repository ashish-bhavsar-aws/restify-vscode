import { describe, it, expect } from "vitest";
import { parseOpenApiViewerSpec } from "../../src/core/openapiViewer";

const petstore3 = {
  openapi: "3.0.0",
  info: { title: "Petstore", version: "1.0.0", description: "A sample API" },
  servers: [{ url: "https://petstore.example.com/v1" }],
  tags: [
    { name: "pets", description: "Pet operations" },
    { name: "store", description: "Store operations" },
  ],
  paths: {
    "/pets": {
      get: {
        tags: ["pets"],
        summary: "List all pets",
        operationId: "listPets",
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer", default: 10 } },
          { name: "status", in: "query", schema: { type: "string", enum: ["active", "inactive"] } },
        ],
        responses: {
          "200": {
            description: "A list of pets",
            content: {
              "application/json": {
                schema: { type: "array", items: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" } } } },
              },
            },
          },
          "400": { description: "Bad request" },
        },
      },
      post: {
        tags: ["pets"],
        summary: "Create a pet",
        operationId: "createPet",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { name: { type: "string" }, tag: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "201": { description: "Pet created" },
        },
      },
    },
    "/pets/{petId}": {
      get: {
        tags: ["pets"],
        summary: "Get a pet by ID",
        operationId: "getPetById",
        deprecated: true,
        parameters: [
          { name: "petId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "A pet" },
        },
      },
    },
    "/store/inventory": {
      get: {
        tags: ["store"],
        summary: "Get inventory",
        responses: {
          "200": {
            description: "Inventory map",
            content: {
              "application/json": {
                schema: { type: "object", properties: { count: { type: "integer" } } },
              },
            },
          },
        },
      },
    },
    "/health": {
      get: {
        summary: "Health check",
        responses: { "200": { description: "OK" } },
      },
    },
  },
};

const swagger2 = {
  swagger: "2.0",
  info: { title: "Swagger 2 API", version: "2.0" },
  host: "api.example.com",
  basePath: "/v2",
  schemes: ["https"],
  paths: {
    "/items": {
      get: {
        summary: "List items",
        responses: { "200": { description: "OK" } },
      },
    },
  },
};

describe("parseOpenApiViewerSpec", () => {
  it("returns null for non-OpenAPI data", () => {
    expect(parseOpenApiViewerSpec({})).toBeNull();
    expect(parseOpenApiViewerSpec(null)).toBeNull();
    expect(parseOpenApiViewerSpec({ foo: "bar" })).toBeNull();
  });

  it("parses OpenAPI 3.0 spec", () => {
    const spec = parseOpenApiViewerSpec(petstore3)!;
    expect(spec).not.toBeNull();
    expect(spec.title).toBe("Petstore");
    expect(spec.version).toBe("1.0.0");
    expect(spec.description).toBe("A sample API");
    expect(spec.baseUrl).toBe("https://petstore.example.com/v1");
    expect(spec.totalEndpoints).toBe(5);
  });

  it("parses Swagger 2.0 spec", () => {
    const spec = parseOpenApiViewerSpec(swagger2)!;
    expect(spec).not.toBeNull();
    expect(spec.title).toBe("Swagger 2 API");
    expect(spec.baseUrl).toBe("https://api.example.com/v2");
    expect(spec.totalEndpoints).toBe(1);
  });

  it("organizes endpoints by tags", () => {
    const spec = parseOpenApiViewerSpec(petstore3)!;
    const petsTag = spec.tags.find(t => t.name === "pets");
    const storeTag = spec.tags.find(t => t.name === "store");
    expect(petsTag).toBeDefined();
    expect(petsTag!.endpoints).toHaveLength(3);
    expect(storeTag).toBeDefined();
    expect(storeTag!.endpoints).toHaveLength(1);
  });

  it("places untagged endpoints in the untagged array", () => {
    const spec = parseOpenApiViewerSpec(petstore3)!;
    expect(spec.untagged).toHaveLength(1);
    expect(spec.untagged[0].path).toBe("/health");
  });

  it("includes tag descriptions", () => {
    const spec = parseOpenApiViewerSpec(petstore3)!;
    const petsTag = spec.tags.find(t => t.name === "pets");
    expect(petsTag!.description).toBe("Pet operations");
  });

  it("extracts endpoint metadata", () => {
    const spec = parseOpenApiViewerSpec(petstore3)!;
    const listPets = spec.tags[0].endpoints.find(e => e.operationId === "listPets")!;
    expect(listPets.method).toBe("GET");
    expect(listPets.path).toBe("/pets");
    expect(listPets.summary).toBe("List all pets");
    expect(listPets.deprecated).toBe(false);
    expect(listPets.parameters).toHaveLength(2);
    expect(listPets.responses.length).toBeGreaterThanOrEqual(1);
  });

  it("marks deprecated endpoints", () => {
    const spec = parseOpenApiViewerSpec(petstore3)!;
    const getPet = spec.tags[0].endpoints.find(e => e.operationId === "getPetById")!;
    expect(getPet.deprecated).toBe(true);
  });

  it("extracts path and query parameters", () => {
    const spec = parseOpenApiViewerSpec(petstore3)!;
    const listPets = spec.tags[0].endpoints.find(e => e.operationId === "listPets")!;
    const limitParam = listPets.parameters.find(p => p.name === "limit")!;
    expect(limitParam.in).toBe("query");
    expect(limitParam.required).toBe(false);
    expect(limitParam.schema?.type).toBe("integer");
  });

  it("marks path params as required", () => {
    const spec = parseOpenApiViewerSpec(petstore3)!;
    const getPet = spec.tags[0].endpoints.find(e => e.operationId === "getPetById")!;
    const petId = getPet.parameters.find(p => p.name === "petId")!;
    expect(petId.in).toBe("path");
    expect(petId.required).toBe(true);
  });

  it("extracts request body with content type", () => {
    const spec = parseOpenApiViewerSpec(petstore3)!;
    const createPet = spec.tags[0].endpoints.find(e => e.operationId === "createPet")!;
    expect(createPet.requestBody).toBeDefined();
    expect(createPet.requestBody!.contentType).toBe("application/json");
    expect(createPet.requestBody!.schema).toBeDefined();
  });

  it("extracts response schemas", () => {
    const spec = parseOpenApiViewerSpec(petstore3)!;
    const listPets = spec.tags[0].endpoints.find(e => e.operationId === "listPets")!;
    const res200 = listPets.responses.find(r => r.status === "200")!;
    expect(res200).toBeDefined();
    expect(res200.description).toBe("A list of pets");
    expect(res200.schema).toBeDefined();
  });

  it("extracts enum values in parameters", () => {
    const spec = parseOpenApiViewerSpec(petstore3)!;
    const listPets = spec.tags[0].endpoints.find(e => e.operationId === "listPets")!;
    const statusParam = listPets.parameters.find(p => p.name === "status")!;
    expect(statusParam.schema?.enum).toEqual(["active", "inactive"]);
  });
});
