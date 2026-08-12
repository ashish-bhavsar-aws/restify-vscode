/**
 * F33 — Postman-style assertion API (`pm`) exposed to test scripts.
 *
 * Pure module (no `vm`, no I/O) so it is trivially unit-testable. The sandbox
 * in `src/core/script.ts` builds a `pm` object with this and injects it into
 * user scripts alongside the existing `tests`/`set`/`vars` globals.
 *
 * Supported surface (Postman-compatible subset):
 *   pm.test(name, fn)                       — records pass/fail + failure message
 *   pm.expect(actual)                       — chai-style matchers (.to.equal, ...)
 *   pm.response.to.have.status/header/...   — response assertions
 *   pm.response.json() / .text() / .code    — response accessors
 *   pm.environment.get/set/unset/has        — maps to script variables
 *   pm.variables.get/set/unset              — alias of environment
 *
 * Backwards compatible: plain `tests["name"] = bool` assignments keep working.
 */

export class PmAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
  }
}

/** Response surface a test script can assert against. */
export interface PmResponseLike {
  status?: number;
  statusText?: string;
  headers?: unknown;
  /** Parsed body — JSON already decoded when possible. */
  body?: unknown;
  /** Raw body string. */
  rawBody?: unknown;
  /** Total request duration in ms (informational). */
  responseTime?: number;
}

export interface PmSandboxState {
  tests: Record<string, boolean>;
  testMessages: Record<string, string>;
  variables: Record<string, any>;
  response?: PmResponseLike;
}

function fmt(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v);
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object") return a === b;
  const arrA = Array.isArray(a);
  const arrB = Array.isArray(b);
  if (arrA !== arrB) return false;
  if (arrA) {
    const la = a as unknown[];
    const lb = b as unknown[];
    if (la.length !== lb.length) return false;
    return la.every((x, i) => deepEqual(x, lb[i]));
  }
  const oa = a as Record<string, unknown>;
  const ob = b as Record<string, unknown>;
  const ka = Object.keys(oa);
  const kb = Object.keys(ob);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(oa[k], ob[k]));
}

/** Resolve `a.b[0].c` paths against a parsed JSON body (dot + bracket). */
export function getByPath(body: unknown, path: string): unknown {
  const parts = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean);
  let cur: unknown = body;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function lookupHeader(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  const entries = Object.entries(headers as Record<string, unknown>);
  const hit = entries.find(([k]) => k.toLowerCase() === name.toLowerCase());
  if (!hit) return undefined;
  return String(hit[1]);
}

function fail(negated: boolean, actual: unknown, verb: string, expected?: unknown): never {
  const exp = expected === undefined ? "" : ` ${fmt(expected)}`;
  throw new PmAssertionError(
    `expected ${fmt(actual)} to ${negated ? "not " : ""}${verb}${exp}`,
  );
}

/** Chai-style matchers. `negated` inverts every assertion (`.not` chain). */
function matchers(actual: unknown, negated: boolean) {
  const check = (ok: boolean, verb: string, expected?: unknown) => {
    if (ok === negated) fail(negated, actual, verb, expected);
  };
  const be = {
    true: () => check(actual === true, "be true"),
    false: () => check(actual === false, "be false"),
    null: () => check(actual === null, "be null"),
    undefined: () => check(actual === undefined, "be undefined"),
    ok: () => check(Boolean(actual), "be truthy"),
    empty: () => {
      const len =
        (actual as any)?.length ??
        (actual && typeof actual === "object" ? Object.keys(actual).length : 0);
      check(len === 0, "be empty");
    },
    a: (type: string) => check(typeOf(actual) === type, `be a ${type}`),
    an: (type: string) => check(typeOf(actual) === type, `be an ${type}`),
    greaterThan: (n: number) => check((actual as number) > n, "be greater than", n),
    lessThan: (n: number) => check((actual as number) < n, "be less than", n),
    above: (n: number) => check((actual as number) > n, "be above", n),
    below: (n: number) => check((actual as number) < n, "be below", n),
  };
  return {
    equal: (exp: unknown) => check(actual === exp, "equal", exp),
    eql: (exp: unknown) => check(deepEqual(actual, exp), "deeply equal", exp),
    include: (item: unknown) => {
      let ok = false;
      if (typeof actual === "string") ok = (actual as string).includes(String(item));
      else if (Array.isArray(actual)) ok = (actual as unknown[]).some((x) => deepEqual(x, item));
      else if (actual && typeof actual === "object") ok = String(item) in (actual as Record<string, unknown>);
      check(ok, "include", item);
    },
    contain: (item: unknown) => matchers(actual, negated).include(item),
    match: (re: RegExp) => check(re.test(String(actual)), "match", re.toString()),
    oneOf: (list: unknown[]) => check(list.some((x) => deepEqual(x, actual)), "be one of", list),
    have: {
      length: (n: number) => check((actual as any)?.length === n, "have length", n),
      property: (key: string, val?: unknown) => {
        const obj = actual as Record<string, unknown> | null;
        const has = obj !== null && typeof obj === "object" && key in obj;
        check(has, `have property ${key}`);
        if (val !== undefined) {
          check(deepEqual(obj?.[key], val), `have property ${key} equal to`, val);
        }
      },
    },
    be,
    a: (type: string) => check(typeOf(actual) === type, `be a ${type}`),
    an: (type: string) => check(typeOf(actual) === type, `be an ${type}`),
  };
}

export interface PmExpectChain {
  to: ReturnType<typeof matchers> & { not: ReturnType<typeof matchers> };
}

function makeExpect(actual: unknown): PmExpectChain {
  return {
    to: Object.assign(matchers(actual, false), { not: matchers(actual, true) }),
  };
}

/** Response assertions: `pm.response.to.have.status(200)` etc. */
function responseAssertions(res: PmResponseLike, negated = false) {
  const failWith = (msg: string): never => {
    throw new PmAssertionError(negated ? `expected NOT ${msg}` : msg);
  };
  const check = (ok: boolean, passMsg: string, failMsg: string) => {
    if (ok === negated) failWith(failMsg);
    return passMsg;
  };
  return {
    status: (code: number) =>
      check(
        res.status === code,
        `status is ${code}`,
        `expected status ${res.status ?? "unknown"} to ${negated ? "not " : ""}be ${code}`,
      ),
    statusText: (text: string) =>
      check(
        res.statusText === text,
        `statusText is ${text}`,
        `expected statusText ${fmt(res.statusText)} to ${negated ? "not " : ""}equal ${fmt(text)}`,
      ),
    header: (name: string, val?: string) => {
      const got = lookupHeader(res.headers, name);
      if (got === undefined) {
        if (!negated) throw new PmAssertionError(`expected header "${name}" to be present`);
        return;
      }
      if (val !== undefined) {
        const ok = String(got) === String(val);
        if (ok === negated) {
          throw new PmAssertionError(
            `expected header "${name}" to ${negated ? "not " : ""}equal ${fmt(val)} but got ${fmt(got)}`,
          );
        }
      }
    },
    body: (text: string) =>
      check(
        String(res.rawBody ?? "") === text,
        "body matches",
        `expected body to ${negated ? "not " : ""}equal ${fmt(text)}`,
      ),
    jsonBody: (path: string, val?: unknown) => {
      const at = getByPath(res.body, path);
      if (at === undefined) {
        if (!negated) throw new PmAssertionError(`expected JSON body to have path "${path}"`);
        return;
      }
      if (val !== undefined && deepEqual(at, val) === negated) {
        throw new PmAssertionError(
          `expected "${path}" to ${negated ? "not " : ""}equal ${fmt(val)} but got ${fmt(at)}`,
        );
      }
    },
  };
}

/**
 * Build the `pm` object exposed to a user script. Mutates `state.tests` /
 * `state.testMessages` / `state.variables` as the script runs.
 */
export function createPmSandbox(state: PmSandboxState): Record<string, unknown> {
  const { tests, testMessages, variables } = state;

  // Normalize body/rawBody: callers pass either a raw string or a parsed value.
  const rawBody =
    typeof state.response?.rawBody === "string"
      ? state.response.rawBody
      : typeof state.response?.body === "string"
        ? state.response.body
        : state.response?.body !== undefined
          ? JSON.stringify(state.response.body)
          : "";
  let parsedBody = state.response?.body;
  if (typeof parsedBody === "string") {
    try {
      parsedBody = JSON.parse(parsedBody);
    } catch {
      /* keep raw string */
    }
  }
  const response: PmResponseLike = {
    ...(state.response ?? {}),
    body: parsedBody,
    rawBody,
  };

  const test = async (name: string, fn: () => void | Promise<void>): Promise<boolean> => {
    try {
      await fn();
      tests[name] = true;
      return true;
    } catch (err: any) {
      tests[name] = false;
      testMessages[name] = err?.message ?? String(err);
      return false;
    }
  };

  const envStore = {
    get: (key: string) => variables[key],
    set: (key: string, value: unknown) => {
      variables[String(key)] = value;
    },
    unset: (key: string) => {
      delete variables[String(key)];
    },
    has: (key: string) => Object.prototype.hasOwnProperty.call(variables, key),
  };

  return {
    test,
    expect: makeExpect,
    response: {
      ...response,
      to: { have: responseAssertions(response) },
      json: () => response.body,
      text: () => String(response.rawBody ?? ""),
      code: response.status,
      status: response.status,
      statusText: response.statusText,
      responseTime: response.responseTime,
      headers: response.headers,
      body: response.rawBody,
    },
    environment: envStore,
    variables: envStore,
  };
}
