import { describe, it, expect } from "vitest";
import {
  createPmSandbox,
  deepEqual,
  getByPath,
  PmAssertionError,
  type PmSandboxState,
} from "../../src/core/pm";
import { executeUserScript, runScriptSequence } from "../../src/core/script";

const RESPONSE = {
  status: 200,
  statusText: "OK",
  headers: { "content-type": "application/json", "x-total": "42" },
  body: { data: { items: [{ id: 1, name: "a" }, { id: 2 }] }, ok: true },
  rawBody: '{"data":{"items":[{"id":1,"name":"a"},{"id":2}]},"ok":true}',
  responseTime: 120,
};

function sandbox(overrides: Partial<PmSandboxState> = {}): PmSandboxState {
  return {
    tests: {},
    testMessages: {},
    variables: {},
    response: RESPONSE,
    ...overrides,
  };
}

describe("deepEqual", () => {
  it("compares primitives, arrays, and objects deeply", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual([1, { a: 2 }], [1, { a: 2 }])).toBe(true);
    expect(deepEqual({ a: [1, 2] }, { a: [1, 2] })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });
});

describe("getByPath", () => {
  it("resolves dot and bracket paths", () => {
    const body = { data: { items: [{ id: 1 }] } };
    expect(getByPath(body, "data.items[0].id")).toBe(1);
    expect(getByPath(body, "data.items[0]")).toEqual({ id: 1 });
    expect(getByPath(body, "missing.path")).toBeUndefined();
    expect(getByPath(null, "a.b")).toBeUndefined();
  });
});

describe("pm.expect matchers", () => {
  const state = sandbox();
  const pm = createPmSandbox(state) as any;

  it("equal / not equal", () => {
    expect(() => pm.expect(42).to.equal(42)).not.toThrow();
    expect(() => pm.expect(42).to.equal(41)).toThrow(PmAssertionError);
    expect(() => pm.expect(42).to.not.equal(41)).not.toThrow();
    expect(() => pm.expect(42).to.not.equal(42)).toThrow(PmAssertionError);
  });

  it("eql does deep comparison", () => {
    expect(() => pm.expect({ a: [1, 2] }).to.eql({ a: [1, 2] })).not.toThrow();
    expect(() => pm.expect({ a: [1, 2] }).to.eql({ a: [1, 3] })).toThrow(PmAssertionError);
  });

  it("include works on strings, arrays, and object keys", () => {
    expect(() => pm.expect("hello world").to.include("world")).not.toThrow();
    expect(() => pm.expect([1, 2, 3]).to.include(2)).not.toThrow();
    expect(() => pm.expect({ a: 1 }).to.include("a")).not.toThrow();
    expect(() => pm.expect([{ id: 1 }]).to.include({ id: 1 })).not.toThrow();
    expect(() => pm.expect([1]).to.include(9)).toThrow(PmAssertionError);
    expect(() => pm.expect("abc").to.not.include("z")).not.toThrow();
  });

  it("match against regex", () => {
    expect(() => pm.expect("123abc").to.match(/^\d+abc$/)).not.toThrow();
    expect(() => pm.expect("xyz").to.match(/^\d+$/)).toThrow(PmAssertionError);
  });

  it("be assertions", () => {
    expect(() => pm.expect(true).to.be.true()).not.toThrow();
    expect(() => pm.expect(false).to.be.false()).not.toThrow();
    expect(() => pm.expect(null).to.be.null()).not.toThrow();
    expect(() => pm.expect(undefined).to.be.undefined()).not.toThrow();
    expect(() => pm.expect("x").to.be.ok()).not.toThrow();
    expect(() => pm.expect(0).to.not.be.ok()).not.toThrow();
    expect(() => pm.expect([]).to.be.empty()).not.toThrow();
    expect(() => pm.expect([1]).to.not.be.empty()).not.toThrow();
    expect(() => pm.expect("str").to.be.a("string")).not.toThrow();
    expect(() => pm.expect([1]).to.be.an("array")).not.toThrow();
    expect(() => pm.expect(10).to.be.greaterThan(5)).not.toThrow();
    expect(() => pm.expect(3).to.be.lessThan(5)).not.toThrow();
    expect(() => pm.expect(5).to.be.above(1)).not.toThrow();
    expect(() => pm.expect(5).to.be.below(10)).not.toThrow();
    expect(() => pm.expect("str").to.be.a("number")).toThrow(PmAssertionError);
  });

  it("have.length / have.property", () => {
    expect(() => pm.expect([1, 2, 3]).to.have.length(3)).not.toThrow();
    expect(() => pm.expect("abc").to.have.length(3)).not.toThrow();
    expect(() => pm.expect({ a: 1 }).to.have.property("a")).not.toThrow();
    expect(() => pm.expect({ a: 1 }).to.have.property("a", 1)).not.toThrow();
    expect(() => pm.expect({ a: 1 }).to.have.property("a", 2)).toThrow(PmAssertionError);
    expect(() => pm.expect({}).to.not.have.property("a")).not.toThrow();
  });

  it("oneOf", () => {
    expect(() => pm.expect("b").to.oneOf(["a", "b", "c"])).not.toThrow();
    expect(() => pm.expect("z").to.oneOf(["a", "b"])).toThrow(PmAssertionError);
  });

  it("failure messages are descriptive", () => {
    try {
      pm.expect(41).to.equal(42);
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toBe("expected 41 to equal 42");
    }
  });
});

describe("pm.test", () => {
  it("records pass/fail with failure messages", async () => {
    const state = sandbox();
    const pm = createPmSandbox(state) as any;

    await pm.test("status is 200", () => pm.expect(pm.response.to.have.status(200)));
    await pm.test("items count", () => pm.expect(pm.response.json().data.items).to.have.length(2));
    await pm.test("fails", () => pm.expect(1).to.equal(2));

    expect(state.tests).toEqual({ "status is 200": true, "items count": true, fails: false });
    expect(state.testMessages.fails).toContain("expected 1 to equal 2");
    expect(state.testMessages["status is 200"]).toBeUndefined();
  });

  it("a thrown non-assertion error is captured with its message", async () => {
    const state = sandbox();
    const pm = createPmSandbox(state) as any;
    await pm.test("throws", () => {
      throw new Error("boom");
    });
    expect(state.tests.throws).toBe(false);
    expect(state.testMessages.throws).toBe("boom");
  });
});

describe("pm.response facade", () => {
  const state = sandbox();
  const pm = createPmSandbox(state) as any;

  it("exposes code, status, statusText, responseTime, headers", () => {
    expect(pm.response.code).toBe(200);
    expect(pm.response.status).toBe(200);
    expect(pm.response.statusText).toBe("OK");
    expect(pm.response.responseTime).toBe(120);
    expect(pm.response.headers["content-type"]).toBe("application/json");
  });

  it("json() returns the parsed body, text() the raw string, body the raw text", () => {
    expect(pm.response.json().data.items).toHaveLength(2);
    expect(typeof pm.response.text()).toBe("string");
    expect(pm.response.text()).toContain('"ok":true');
    expect(pm.response.body).toBe(RESPONSE.rawBody);
  });

  it("to.have.status / statusText", () => {
    expect(() => pm.response.to.have.status(200)).not.toThrow();
    expect(() => pm.response.to.have.status(404)).toThrow(/expected status 200 to be 404/);
    expect(() => pm.response.to.have.statusText("OK")).not.toThrow();
  });

  it("to.have.header", () => {
    expect(() => pm.response.to.have.header("content-type")).not.toThrow();
    expect(() => pm.response.to.have.header("content-type", "application/json")).not.toThrow();
    expect(() => pm.response.to.have.header("x-missing")).toThrow(/x-missing/);
    expect(() => pm.response.to.have.header("x-total", "99")).toThrow(/x-total/);
  });

  it("to.have.body", () => {
    expect(() => pm.response.to.have.body(RESPONSE.rawBody)).not.toThrow();
    expect(() => pm.response.to.have.body("nope")).toThrow(PmAssertionError);
  });

  it("to.have.jsonBody with and without value", () => {
    expect(() => pm.response.to.have.jsonBody("ok", true)).not.toThrow();
    expect(() => pm.response.to.have.jsonBody("data.items[0].name", "a")).not.toThrow();
    expect(() => pm.response.to.have.jsonBody("data.missing")).toThrow(/data.missing/);
    expect(() => pm.response.to.have.jsonBody("ok", false)).toThrow(PmAssertionError);
  });
});

describe("pm.environment / pm.variables", () => {
  it("get/set/unset/has map to script variables", () => {
    const state = sandbox();
    const pm = createPmSandbox(state) as any;
    pm.environment.set("token", "abc");
    expect(pm.environment.get("token")).toBe("abc");
    expect(pm.environment.has("token")).toBe(true);
    expect(state.variables.token).toBe("abc");
    pm.variables.set("x", 1);
    expect(pm.environment.get("x")).toBe(1);
    pm.environment.unset("token");
    expect(pm.environment.has("token")).toBe(false);
  });
});

describe("pm via executeUserScript (end to end)", () => {
  it("runs pm.test assertions and reports testMessages", async () => {
    const result = await executeUserScript(
      `pm.test("status ok", () => pm.expect(response.status).to.equal(200));
       pm.test("json body", () => pm.response.to.have.jsonBody("data.items", [
         { id: 1, name: "a" },
         { id: 2 },
       ]));
       pm.test("wrong", () => pm.expect(response.status).to.equal(201));
       tests["legacy"] = response.status === 200;`,
      { response: RESPONSE },
    );

    expect(result.success).toBe(true);
    expect(result.tests).toEqual({
      "status ok": true,
      "json body": true,
      wrong: false,
      legacy: true,
    });
    expect(result.testMessages?.wrong).toContain("expected 200 to equal 201");
    expect(result.testMessages?.["status ok"]).toBeUndefined();
  });

  it("extracts variables via pm.environment", async () => {
    const result = await executeUserScript(
      `pm.environment.set("token", pm.response.json().data.items[0].name);`,
      { response: RESPONSE },
    );
    expect(result.variables.token).toBe("a");
  });

  it("works with async assertion bodies when awaited", async () => {
    const result = await executeUserScript(
      `await pm.test("async ok", async () => {
         await new Promise(r => setTimeout(r, 5));
         pm.expect(response.status).to.equal(200);
       });`,
      { response: RESPONSE },
    );
    expect(result.tests?.["async ok"]).toBe(true);
  });

  it("merges testMessages across a script sequence", async () => {
    const result = await runScriptSequence(
      [
        `pm.test("one", () => pm.expect(1).to.equal(1));`,
        `pm.test("two", () => pm.expect(1).to.equal(2));`,
      ],
      { response: RESPONSE },
    );
    expect(result.tests).toEqual({ one: true, two: false });
    expect(result.testMessages?.two).toContain("expected 1 to equal 2");
  });

  it("a failing pm.test does not abort the script", async () => {
    const result = await executeUserScript(
      `pm.test("fails", () => pm.expect(1).to.equal(2));
       tests["ran after"] = true;`,
      { response: RESPONSE },
    );
    expect(result.success).toBe(true);
    expect(result.tests).toEqual({ fails: false, "ran after": true });
  });
});
