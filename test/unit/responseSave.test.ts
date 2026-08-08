import { describe, expect, it } from "vitest";
import {
  extensionForContentType,
  sanitizeFileName,
  suggestResponseFilename,
} from "../../src/core/responseSave";

describe("extensionForContentType", () => {
  it("maps common content types to extensions", () => {
    expect(extensionForContentType("application/json")).toBe("json");
    expect(extensionForContentType("text/html; charset=utf-8")).toBe("html");
    expect(extensionForContentType("application/xml")).toBe("xml");
    expect(extensionForContentType("text/csv")).toBe("csv");
    expect(extensionForContentType("application/pdf")).toBe("pdf");
    expect(extensionForContentType("text/javascript")).toBe("js");
    expect(extensionForContentType("text/css")).toBe("css");
    expect(extensionForContentType("application/yaml")).toBe("yml");
    expect(extensionForContentType("application/octet-stream")).toBe("bin");
  });

  it("maps spreadsheet/excel types to xlsx", () => {
    expect(extensionForContentType("application/vnd.ms-excel")).toBe("xlsx");
    expect(extensionForContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("xlsx");
  });

  it("is case-insensitive", () => {
    expect(extensionForContentType("APPLICATION/JSON")).toBe("json");
  });

  it("defaults to txt for unknown or empty types", () => {
    expect(extensionForContentType("application/unknown-format")).toBe("txt");
    expect(extensionForContentType("")).toBe("txt");
    expect(extensionForContentType(undefined)).toBe("txt");
  });
});

describe("sanitizeFileName", () => {
  it("replaces path separators and invalid characters", () => {
    expect(sanitizeFileName("a/b:c*d?e\"f<g>h|i")).toBe("a_b_c_d_e_f_g_h_i");
  });

  it("collapses whitespace runs into a single underscore", () => {
    expect(sanitizeFileName("my  file name")).toBe("my_file_name");
  });

  it("strips trailing dots", () => {
    expect(sanitizeFileName("file...")).toBe("file");
  });

  it("handles empty input", () => {
    expect(sanitizeFileName("")).toBe("");
    expect(sanitizeFileName(undefined as unknown as string)).toBe("");
  });
});

describe("suggestResponseFilename", () => {
  it("appends the content-type extension", () => {
    expect(suggestResponseFilename("users", "application/json")).toBe("users.json");
    expect(suggestResponseFilename("report", "application/pdf")).toBe("report.pdf");
  });

  it("defaults name to response", () => {
    expect(suggestResponseFilename("", "text/html")).toBe("response.html");
    expect(suggestResponseFilename(undefined, "text/html")).toBe("response.html");
  });

  it("does not double-append a known extension", () => {
    expect(suggestResponseFilename("users.json", "application/json")).toBe("users.json");
    expect(suggestResponseFilename("users.JSON", "application/json")).toBe("users.json");
  });

  it("sanitizes the suggested name", () => {
    expect(suggestResponseFilename("a/b.json", "application/json")).toBe("a_b.json");
  });
});
