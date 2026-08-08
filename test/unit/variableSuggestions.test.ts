import { describe, it, expect } from "vitest";
import {
  getVariableSuggestions,
  applyVariableSuggestion,
  tokenString,
} from "../../src/core/variableSuggestions";

const VARS = ["userToken", "API_KEY", "baseUrl", "userToken"];

describe("getVariableSuggestions", () => {
  it("returns env var names when typing {{<prefix>", () => {
    const result = getVariableSuggestions("https://x.com/{{user", VARS);
    expect(result).toEqual([
      { name: "userToken", token: "{{userToken}}", dynamic: false },
    ]);
  });

  it("matches case-insensitively", () => {
    const result = getVariableSuggestions("{{api", VARS);
    expect(result.map((s) => s.name)).toEqual(["API_KEY"]);
  });

  it("matches with no prefix typed", () => {
    const result = getVariableSuggestions("{{", VARS);
    expect(result.map((s) => s.name)).toEqual(["userToken", "API_KEY", "baseUrl"]);
  });

  it("dedupes repeated names", () => {
    const result = getVariableSuggestions("{{user", VARS);
    expect(result).toHaveLength(1);
  });

  it("suggests dynamic vars when prefix starts with $", () => {
    const result = getVariableSuggestions("{{$gui", VARS);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((s) => s.dynamic)).toBe(true);
    expect(result.map((s) => s.token)).toContain("{{$guid}}");
  });

  it("suggests processEnv with the NAME placeholder", () => {
    const result = getVariableSuggestions("{{$proc", VARS);
    expect(result.some((s) => s.token === "{{$processEnv:NAME}}")).toBe(true);
  });

  it("returns [] when no incomplete token is present", () => {
    expect(getVariableSuggestions("https://x.com", VARS)).toEqual([]);
    expect(getVariableSuggestions("{{complete}} rest", VARS)).toEqual([]);
  });

  it("returns [] for a closed token", () => {
    expect(getVariableSuggestions("{{userToken}}", VARS)).toEqual([]);
  });

  it("ignores empty var names", () => {
    expect(getVariableSuggestions("{{", ["", "  "])).toEqual([]);
  });
});

describe("applyVariableSuggestion", () => {
  it("replaces a trailing env var prefix", () => {
    expect(
      applyVariableSuggestion("url={{user", { token: "{{userToken}}" }),
    ).toBe("url={{userToken}}");
  });

  it("replaces a trailing dynamic var prefix", () => {
    expect(
      applyVariableSuggestion("id={{$gui", { token: "{{$guid}}" }),
    ).toBe("id={{$guid}}");
  });

  it("ignores closed tokens and returns text unchanged", () => {
    expect(
      applyVariableSuggestion("a={{x}} b", { token: "{{y}}" }),
    ).toBe("a={{x}} b");
  });

  it("targets the last incomplete token only", () => {
    expect(
      applyVariableSuggestion("a={{1}}&b={{us", { token: "{{userToken}}" }),
    ).toBe("a={{1}}&b={{userToken}}");
  });
});

describe("tokenString", () => {
  it("formats processEnv specially", () => {
    expect(tokenString("processEnv")).toBe("{{$processEnv:NAME}}");
  });

  it("formats other names", () => {
    expect(tokenString("guid")).toBe("{{$guid}}");
  });
});
