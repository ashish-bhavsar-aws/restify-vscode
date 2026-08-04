import type { Context } from 'vm';

export interface ScriptResult {
  success: boolean;
  variables: Record<string, any>;
  logs: string[];
  tests?: Record<string, boolean>;
  error?: string;
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

  const sandbox = {
    ...context,
    vars: variables,
    variables,
    tests,
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

    return { success: true, variables, logs, tests };
  } catch (err: any) {
    return {
      success: false,
      variables,
      logs,
      tests,
      error: err?.message ?? String(err),
    };
  }
}
