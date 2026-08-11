import { runScriptSequence, type ScriptContext, type ScriptResult } from "./script";

/** Collection-level scripts inherited by child requests. */
export interface CollectionScripts {
  preScript?: string;
  testScript?: string;
}

/** Minimal request surface a pre-request script pipeline needs. */
export interface PreScriptRequest {
  method?: string;
  url?: string;
  queryParams?: Array<{ key?: string; value?: string }>;
}

/** Side effects the host must provide so the pipeline can report outcomes. */
export interface PreScriptPipelineHost {
  postError: (error: string, duration: number) => void;
  appendActivity: (title: string, detail: string) => void;
  addFailedHistory: (error: string, duration: number) => Promise<unknown>;
  setScriptVariables: (variables: Record<string, any>) => Promise<void>;
}

export interface PreScriptRunResult {
  aborted: boolean;
  variables: Record<string, any>;
}

/**
 * Run the ordered pre-request script pipeline (collection-level then
 * request-level) for a single request. Extracted variables are persisted via
 * `host.setScriptVariables` whether or not every script succeeds. On failure
 * the host is notified so it can surface the error in the UI and history.
 */
export async function runPreScriptPipeline(
  host: PreScriptPipelineHost,
  scripts: string[],
  request: PreScriptRequest,
  startTime: number,
): Promise<PreScriptRunResult> {
  const result = await runScriptSequence(
    scripts,
    { request, params: request.queryParams },
    5000,
  );

  if (Object.keys(result.variables).length > 0) {
    await host.setScriptVariables(result.variables);
  }

  if (!result.success) {
    const error = `Pre-request script failed: ${result.error}`;
    const duration = Date.now() - startTime;
    host.postError(error, duration);
    host.appendActivity(
      "Pre-request script failed",
      [`Method: ${request.method || "GET"}`, `URL: ${request.url || ""}`, `Error: ${result.error}`].join("\n"),
    );
    await host.addFailedHistory(error, duration);
    return { aborted: true, variables: result.variables };
  }

  return { aborted: false, variables: result.variables };
}

/** Raw response surface fed to a collection-level test script. */
export interface CollectionTestResponse {
  status: number;
  statusText?: string;
  headers?: unknown;
  body?: string;
}

export interface CollectionTestRun {
  result: ScriptResult;
  context: ScriptContext;
}

/**
 * Run a collection-level test script against a response, exposing the same
 * globals the request-level scripts receive (`response`, `status`, `headers`,
 * `statusText`) with the body parsed as JSON when possible.
 */
export async function runCollectionTestScript(
  script: string,
  response: CollectionTestResponse,
  timeoutMs = 5000,
): Promise<CollectionTestRun> {
  let parsedBody: any = response.body ?? "";
  try {
    parsedBody = JSON.parse(parsedBody);
  } catch {
    /* keep raw string */
  }
  const context: ScriptContext = {
    response: {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body: parsedBody,
      rawBody: response.body ?? "",
    },
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  };
  const result = await runScriptSequence([script], context, timeoutMs);
  return { result, context };
}
