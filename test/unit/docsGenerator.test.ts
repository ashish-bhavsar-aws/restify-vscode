import { describe, it, expect } from "vitest";
import { generateMarkdown, generateHtml, type DocCollection } from "../../src/core/docsGenerator";

const sampleCollection: DocCollection = {
  name: "Pet Store API",
  description: "A simple pet store API",
  variables: [
    { key: "baseUrl", value: "https://api.petstore.com" },
  ],
  requests: [
    {
      name: "List Pets",
      method: "GET",
      url: "https://api.petstore.com/pets",
      queryParams: [
        { key: "limit", value: "10", enabled: true },
        { key: "offset", value: "0", enabled: false },
      ],
      headers: [
        { key: "Accept", value: "application/json", enabled: true },
      ],
    },
  ],
  groups: [
    {
      name: "Pets",
      requests: [
        {
          name: "Get Pet",
          method: "GET",
          url: "https://api.petstore.com/pets/{petId}",
          description: "Get a pet by ID",
        },
        {
          name: "Create Pet",
          method: "POST",
          url: "https://api.petstore.com/pets",
          bodyType: "json",
          body: '{"name": "Fido", "species": "dog"}',
        },
      ],
      groups: [
        {
          name: "Favorites",
          requests: [
            {
              name: "Add Favorite",
              method: "POST",
              url: "https://api.petstore.com/pets/{petId}/favorites",
              bodyType: "json",
              body: "{}",
            },
          ],
        },
      ],
    },
  ],
};

describe("generateMarkdown", () => {
  it("includes collection name as heading", () => {
    const md = generateMarkdown(sampleCollection);
    expect(md).toContain("# Pet Store API");
  });

  it("includes collection description", () => {
    const md = generateMarkdown(sampleCollection);
    expect(md).toContain("A simple pet store API");
  });

  it("counts total endpoints", () => {
    const md = generateMarkdown(sampleCollection);
    expect(md).toContain("**Total endpoints:** 4");
  });

  it("includes variables table", () => {
    const md = generateMarkdown(sampleCollection);
    expect(md).toContain("## Variables");
    expect(md).toContain("`baseUrl`");
  });

  it("renders HTTP methods and URLs", () => {
    const md = generateMarkdown(sampleCollection);
    expect(md).toContain("**`GET`**");
    expect(md).toContain("**`POST`**");
    expect(md).toContain("`https://api.petstore.com/pets`");
  });

  it("renders query parameters", () => {
    const md = generateMarkdown(sampleCollection);
    expect(md).toContain("**Query Parameters:**");
    expect(md).toContain("`limit`");
  });

  it("does not render disabled query parameters", () => {
    const md = generateMarkdown(sampleCollection);
    expect(md).not.toContain("`offset`");
  });

  it("renders request body", () => {
    const md = generateMarkdown(sampleCollection);
    expect(md).toContain("**Body** (`json`):");
    expect(md).toContain('"name": "Fido"');
  });

  it("renders headers", () => {
    const md = generateMarkdown(sampleCollection);
    expect(md).toContain("**Headers:**");
    expect(md).toContain("`Accept`");
  });

  it("renders group headings", () => {
    const md = generateMarkdown(sampleCollection);
    expect(md).toContain("## Pets");
    expect(md).toContain("## Pets > Favorites");
  });

  it("renders endpoint descriptions", () => {
    const md = generateMarkdown(sampleCollection);
    expect(md).toContain("Get a pet by ID");
  });

  it("handles empty collection", () => {
    const md = generateMarkdown({ name: "Empty" });
    expect(md).toContain("# Empty");
    expect(md).toContain("**Total endpoints:** 0");
  });
});

describe("generateHtml", () => {
  it("returns valid HTML wrapper", () => {
    const html = generateHtml(sampleCollection);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>Pet Store API — API Documentation</title>");
    expect(html).toContain("</html>");
  });

  it("escapes HTML entities in content", () => {
    const html = generateHtml({ name: "Test <script>" });
    expect(html).toContain("&lt;script&gt;");
  });
});
