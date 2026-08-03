import { describe, it, expect } from "vitest";
import { resolveDynamicVariables } from "../../src/core/dynamicVars";

const GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("resolveDynamicVariables", () => {
  it("returns the input unchanged when there are no dynamic vars", () => {
    expect(resolveDynamicVariables("GET https://api.example.com/endpoint")).toBe(
      "GET https://api.example.com/endpoint",
    );
    expect(resolveDynamicVariables("")).toBe("");
  });

  it("replaces {{$guid}} with a UUID v4", () => {
    const out = resolveDynamicVariables("id={{$guid}}");
    expect(out.startsWith("id=")).toBe(true);
    expect(GUID_RE.test(out.slice(3))).toBe(true);
  });

  it("replaces {{$timestamp}} with epoch milliseconds", () => {
    const before = Date.now();
    const out = resolveDynamicVariables("t={{$timestamp}}");
    const after = Date.now();
    const value = Number(out.slice(2));
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(after);
  });

  it("replaces {{$randomInt}} with an integer in [0, 1000]", () => {
    for (let i = 0; i < 20; i++) {
      const out = resolveDynamicVariables("{{$randomInt}}");
      const value = Number(out);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1000);
    }
  });

  it("replaces {{$randomAlpha}} with a 5-letter string", () => {
    const out = resolveDynamicVariables("{{$randomAlpha}}");
    expect(/^[a-z]{5}$/.test(out)).toBe(true);
  });

  it("replaces {{$randomHex}} with a 24-character hex string", () => {
    const out = resolveDynamicVariables("{{$randomHex}}");
    expect(/^[0-9a-f]{24}$/.test(out)).toBe(true);
  });

  it("replaces {{$localDateTime}} with YYYY-MM-DD HH:MM:SS", () => {
    const out = resolveDynamicVariables("{{$localDateTime}}");
    expect(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(out)).toBe(true);
  });

  it("resolves {{$processEnv:NAME}} from the environment", () => {
    const original = process.env.RESTIFY_TEST_DYNAMIC_VAR;
    process.env.RESTIFY_TEST_DYNAMIC_VAR = "secret-value";
    try {
      expect(
        resolveDynamicVariables("{{$processEnv:RESTIFY_TEST_DYNAMIC_VAR}}"),
      ).toBe("secret-value");
    } finally {
      if (original === undefined) {
        delete process.env.RESTIFY_TEST_DYNAMIC_VAR;
      } else {
        process.env.RESTIFY_TEST_DYNAMIC_VAR = original;
      }
    }
  });

  it("leaves an unset {{$processEnv:NAME}} unchanged", () => {
    const out = resolveDynamicVariables("{{$processEnv:RESTIFY_VAR_DOES_NOT_EXIST}}");
    expect(out).toBe("{{$processEnv:RESTIFY_VAR_DOES_NOT_EXIST}}");
  });

  it("resolves multiple dynamic vars in one string", () => {
    const out = resolveDynamicVariables(
      "{{$guid}}|{{$randomInt}}|{{$timestamp}}",
    );
    const [guid, int, ts] = out.split("|");
    expect(GUID_RE.test(guid)).toBe(true);
    expect(Number.isInteger(Number(int))).toBe(true);
    expect(Number.isInteger(Number(ts))).toBe(true);
  });

  it("leaves unknown {{$...}} tokens unchanged", () => {
    expect(resolveDynamicVariables("{{$notAToken}}")).toBe("{{$notAToken}}");
  });
});
