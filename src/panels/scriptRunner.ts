/**
 * Script execution on the extension host (Node.js) using the `vm` module.
 *
 * The webview CSP blocks eval/Worker, so pre-request and post-response scripts
 * run here and report results back over postMessage. Kept in its own module so
 * the main panel stays within the maintainability line budget (F60).
 */
interface ScriptReportContext {
  post: (message: any) => void;
  appendActivity?: (title: string, detail?: string, level?: "info" | "warning" | "error") => void;
  onSetVariables?: (variables: Record<string, any>) => Promise<void>;
}

export async function runScriptAndReport(
  script: string,
  response: any,
  tabId: string,
  ctx: ScriptReportContext,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const vm = require("vm") as typeof import("vm");
  const logs: string[] = [];
  const variables: Record<string, any> = {};
  const tests: Record<string, boolean> = {};
  const vars = variables;

  const log = (...args: any[]) =>
    logs.push(
      args
        .map((a) => {
          try {
            return typeof a === "string" ? a : JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(" "),
    );
  const set = (k: string, v: any) => {
    variables[String(k)] = v;
  };

  let parsedBody: any = response?.body ?? "";
  try {
    parsedBody = JSON.parse(parsedBody);
  } catch {
    /* keep raw string */
  }

  const responseObj = {
    status: response?.status ?? 0,
    statusText: response?.statusText ?? "",
    headers: response?.headers ?? {},
    body: parsedBody,
    rawBody: response?.body ?? "",
  };

  try {
    const context = vm.createContext({
      response: responseObj,
      headers: responseObj.headers,
      status: responseObj.status,
      statusText: responseObj.statusText,
      set,
      log,
      vars,
      variables,
      tests,
      console: { log, warn: log, error: log, info: log },
    });

    const wrapped = "(async function(){" + script + "})();";
    // vm.runInContext with timeout only covers synchronous part; we race the promise
    const resultPromise = vm.runInContext(wrapped, context, {
      timeout: 5000,
    });

    if (resultPromise && typeof (resultPromise as any).then === "function") {
      await Promise.race([
        resultPromise,
        new Promise<void>((_, reject) =>
          setTimeout(
            () => reject(new Error("Script timed out after 5s")),
            5000,
          ),
        ),
      ]);
    }

    ctx.post({
      command: "scriptResult",
      tabId,
      result: { success: true, variables, logs, tests },
    });
    ctx.appendActivity?.(
      "Script completed",
      [
        "Result: success",
        `Logs: ${logs.length}`,
        `Variables set: ${Object.keys(variables).length}`,
        ...(Object.keys(variables).length > 0
          ? [`Variable names: ${Object.keys(variables).join(", ")}`]
          : []),
      ].join("\n"),
      "info",
    );

    // Save extracted variables to the active environment (reuse existing logic).
    if (Object.keys(variables).length > 0) {
      await ctx.onSetVariables?.(variables);
    }
  } catch (err: any) {
    ctx.post({
      command: "scriptResult",
      tabId,
      result: {
        success: false,
        variables,
        logs,
        tests,
        error: err?.message ?? String(err),
      },
    });
    ctx.appendActivity?.(
      "Script failed",
      [
        "Result: failed",
        `Logs before error: ${logs.length}`,
        `Variables set: ${Object.keys(variables).length}`,
        `Error: ${err?.message ?? String(err)}`,
      ].join("\n"),
      "error",
    );
  }
}
