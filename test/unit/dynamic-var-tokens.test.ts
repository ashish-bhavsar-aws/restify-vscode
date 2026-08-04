import { describe, it, expect } from "vitest";
import {
  DYNAMIC_VARIABLES,
  isDynamicVariableToken,
  previewDynamicVariable,
} from "../../src/core/dynamicVarTokens";
import {
  getDynamicVarSuggestions,
  applyDynamicVarSuggestion,
} from "../../src/webview/utils/dynamicVarSuggestions";

describe("DYNAMIC_VARIABLES", () => {
  it("lists all supported dynamic variables", () => {
    const names = DYNAMIC_VARIABLES.map((d) => d.name);
    expect(names).toEqual([
      "guid",
      "timestamp",
      "randomInt",
      "randomAlpha",
      "randomHex",
      "processEnv",
      "localDateTime",
    ]);
  });
});

describe("isDynamicVariableToken", () => {
  it("recognizes known dynamic tokens", () => {
    expect(isDynamicVariableToken("guid")).toBe(true);
    expect(isDynamicVariableToken("timestamp")).toBe(true);
    expect(isDynamicVariableToken("randomInt")).toBe(true);
    expect(isDynamicVariableToken("localDateTime")).toBe(true);
  });

  it("recognizes processEnv with an argument", () => {
    expect(isDynamicVariableToken("processEnv")).toBe(true);
    expect(isDynamicVariableToken("processEnv:HOME")).toBe(true);
  });

  it("rejects unknown and plain env tokens", () => {
    expect(isDynamicVariableToken("guid:extra")).toBe(false);
    expect(isDynamicVariableToken("myVar")).toBe(false);
    expect(isDynamicVariableToken("base_url")).toBe(false);
  });
});

describe("previewDynamicVariable", () => {
  it("generates a UUID v4 for guid", () => {
    const re =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    for (let i = 0; i < 10; i++) {
      expect(re.test(previewDynamicVariable("guid"))).toBe(true);
    }
  });

  it("generates a fresh value on each call for guid", () => {
    const a = previewDynamicVariable("guid");
    const b = previewDynamicVariable("guid");
    expect(a).not.toBe(b);
  });

  it("generates an epoch-millisecond timestamp", () => {
    const before = Date.now();
    const out = Number(previewDynamicVariable("timestamp"));
    expect(Number.isInteger(out)).toBe(true);
    expect(out).toBeGreaterThanOrEqual(before);
    expect(out).toBeLessThanOrEqual(Date.now());
  });

  it("generates an integer in [0, 1000] for randomInt", () => {
    for (let i = 0; i < 20; i++) {
      const out = Number(previewDynamicVariable("randomInt"));
      expect(Number.isInteger(out)).toBe(true);
      expect(out).toBeGreaterThanOrEqual(0);
      expect(out).toBeLessThanOrEqual(1000);
    }
  });

  it("generates 5 lowercase letters for randomAlpha", () => {
    expect(/^[a-z]{5}$/.test(previewDynamicVariable("randomAlpha"))).toBe(true);
  });

  it("generates 24 hex chars for randomHex", () => {
    expect(/^[0-9a-f]{24}$/.test(previewDynamicVariable("randomHex"))).toBe(true);
  });

  it("formats localDateTime as YYYY-MM-DD HH:MM:SS", () => {
    expect(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(
        previewDynamicVariable("localDateTime"),
      ),
    ).toBe(true);
  });

  it("resolves processEnv from the host environment when set", () => {
    const original = process.env.RESTIFY_TEST_PREVIEW_VAR;
    process.env.RESTIFY_TEST_PREVIEW_VAR = "hello";
    try {
      expect(
        previewDynamicVariable("processEnv:RESTIFY_TEST_PREVIEW_VAR"),
      ).toBe("hello");
    } finally {
      if (original === undefined) delete process.env.RESTIFY_TEST_PREVIEW_VAR;
      else process.env.RESTIFY_TEST_PREVIEW_VAR = original;
    }
  });

  it("returns a placeholder for an unset processEnv", () => {
    expect(
      previewDynamicVariable("processEnv:RESTIFY_VAR_NOT_SET_ANYWHERE"),
    ).toBe("(value of RESTIFY_VAR_NOT_SET_ANYWHERE)");
  });
});

describe("dynamic variable suggestions", () => {
  it("returns no suggestions when the token is complete", () => {
    expect(getDynamicVarSuggestions("{{$guid}}")).toEqual([]);
    expect(getDynamicVarSuggestions("https://api.com/")).toEqual([]);
  });

  it("suggests all tokens for a bare {{$", () => {
    const suggestions = getDynamicVarSuggestions("https://api.com/{{$");
    expect(suggestions).toContain("{{$guid}}");
    expect(suggestions).toContain("{{$timestamp}}");
    expect(suggestions).toContain("{{$processEnv:NAME}}");
  });

  it("filters by the typed prefix", () => {
    const suggestions = getDynamicVarSuggestions("x={{$ran");
    expect(suggestions).toEqual(
      expect.arrayContaining(["{{$randomInt}}", "{{$randomAlpha}}", "{{$randomHex}}"]),
    );
    expect(suggestions).not.toContain("{{$guid}}");
  });

  it("applies a suggestion by replacing the trailing fragment", () => {
    expect(applyDynamicVarSuggestion("id={{$", "{{$guid}}")).toBe("id={{$guid}}");
    expect(applyDynamicVarSuggestion("id={{$gui", "{{$guid}}")).toBe("id={{$guid}}");
  });

  it("leaves text without an incomplete token unchanged on apply", () => {
    expect(applyDynamicVarSuggestion("{{$guid}}", "{{$timestamp}}")).toBe("{{$guid}}");
  });
});
