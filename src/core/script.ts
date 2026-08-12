import type { Context } from 'vm';
import { createPmSandbox } from './pm';

export interface ScriptResult {
  success: boolean;
  variables: Record<string, any>;
  logs: string[];
  tests?: Record<string, boolean>;
  /** F33: per-test failure messages (from `pm.test` assertion errors). */
  testMessages?: Record<string, string>;
  error?: string;
}

/** Context object passed into a user script's sandbox as globals. */
export interface ScriptContext {
  request?: Record<string, any>;
  params?: Array<{ key?: string; value?: string }>;
  response?: Record<string, any>;
  headers?: unknown;
  status?: number;
  statusText?: string;
  [key: string]: unknown;
}

export type ScriptSequenceResult = ScriptResult & {
  tests: Record<string, boolean>;
};

/**
 * Run a sequence of user scripts against the same context (e.g. collection-level
 * then request-level). Stops at the first failure. Extracted variables and
 * assertions from each script are merged into a single result, so later scripts
 * in the sequence see earlier ones' `set()` values as `{{key}}` after the run.
 */
export async function runScriptSequence(
  scripts: string[],
  context: ScriptContext = {},
  timeoutMs = 5000,
): Promise<ScriptSequenceResult> {
  const logs: string[] = [];
  let variables: Record<string, any> = {};
  let tests: Record<string, boolean> = {};
  let testMessages: Record<string, string> = {};

  for (const script of scripts) {
    if (!(script || "").trim()) continue;
    const result = await executeUserScript(script, context, timeoutMs);
    logs.push(...result.logs);
    if (!result.success) {
      return {
        success: false,
        variables: { ...variables, ...result.variables },
        logs,
        tests: { ...tests, ...result.tests },
        testMessages: { ...testMessages, ...result.testMessages },
        error: result.error,
      };
    }
    variables = { ...variables, ...result.variables };
    tests = { ...tests, ...result.tests };
    testMessages = { ...testMessages, ...result.testMessages };
  }

  return { success: true, variables, logs, tests, testMessages };
}

export async function executeUserScript(
  script: string,
  context: Record<string, unknown>,
  timeoutMs = 5000,
): Promise<ScriptResult> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const vm = require('vm') as typeof import('vm');

  const logs: string[] = [];
  const variables: Record<string, any> = {};
  const tests: Record<string, boolean> = {};
  const testMessages: Record<string, string> = {};

  const log = (...args: any[]): void => {
    logs.push(
      args
        .map((a) => {
          try {
            return typeof a === 'string' ? a : JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(' '),
    );
  };

  const set = (key: string, value: any): void => {
    variables[String(key)] = value;
  };

  // F33: Postman-style `pm` assertion API (pm.test / pm.expect / pm.response).
  const pm = createPmSandbox({
    tests,
    testMessages,
    variables,
    response: (context.response as any) ?? undefined,
  });

  // Timers for async scripts. Tracked so pending timers can be cleared when the
  // script settles (they must not keep the host process alive after a run).
  const timerHandles = new Set<ReturnType<typeof setTimeout>>();
  const sandboxSetTimeout = (fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timerHandles.add(id);
    return id;
  };
  const sandboxClearTimeout = (id: ReturnType<typeof setTimeout>) => {
    timerHandles.delete(id);
    clearTimeout(id);
  };

  const sandbox = {
    ...context,
    vars: variables,
    variables,
    tests,
    testMessages,
    pm,
    setTimeout: sandboxSetTimeout,
    clearTimeout: sandboxClearTimeout,
    set,
    log,
    console: { log, warn: log, error: log, info: log },
  };

  const scriptWrapper = `(async function(){
${script}
})();`;

  try {
    const vmContext = vm.createContext(sandbox as Context);
    const resultPromise = vm.runInContext(scriptWrapper, vmContext, {
      timeout: timeoutMs,
    });

    if (resultPromise && typeof (resultPromise as any).then === 'function') {
      await Promise.race([
        resultPromise,
        new Promise<void>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Script timed out after ${timeoutMs}ms`)),
            timeoutMs,
          ),
        ),
      ]);
    }

    for (const id of timerHandles) clearTimeout(id);
    timerHandles.clear();

    return { success: true, variables, logs, tests, testMessages };
  } catch (err: any) {
    for (const id of timerHandles) clearTimeout(id);
    timerHandles.clear();
    return {
      success: false,
      variables,
      logs,
      tests,
      testMessages,
      error: err?.message ?? String(err),
    };
  }
}
