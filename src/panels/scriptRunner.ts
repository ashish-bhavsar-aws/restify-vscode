/**
 * Script execution on the extension host (Node.js) using the `vm` module.
 *
 * The webview CSP blocks eval/Worker, so pre-request and post-response scripts
 * run here and report results back over postMessage. Kept in its own module so
 * the main panel stays within the maintainability line budget (F60). The
 * actual sandbox/`vm` work is delegated to `executeUserScript` (src/core/script.ts)
 * so the `pm` assertion API (F33) is consistent everywhere.
 */
import { executeUserScript } from "../core/script";

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
    responseTime: response?.duration ?? 0,
  };

  const result = await executeUserScript(script, {
    response: responseObj,
    headers: responseObj.headers,
    status: responseObj.status,
    statusText: responseObj.statusText,
  });

  ctx.post({ command: "scriptResult", tabId, result });
  ctx.appendActivity?.(
    result.success ? "Script completed" : "Script failed",
    [
      `Result: ${result.success ? "success" : "failed"}`,
      `Logs: ${result.logs.length}`,
      `Variables set: ${Object.keys(result.variables).length}`,
      ...(Object.keys(result.variables).length > 0
        ? [`Variable names: ${Object.keys(result.variables).join(", ")}`]
        : []),
      ...(!result.success && result.error ? [`Error: ${result.error}`] : []),
    ].join("\n"),
    result.success ? "info" : "error",
  );

  // Save extracted variables to the active environment (reuse existing logic).
  if (Object.keys(result.variables).length > 0) {
    await ctx.onSetVariables?.(result.variables);
  }
}
