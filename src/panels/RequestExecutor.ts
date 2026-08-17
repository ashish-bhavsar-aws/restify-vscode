import * as fs from "fs";
import * as path from "path";
import { URL } from "url";
import { StorageManager } from "../storage/StorageManager";
import { ActivityProvider } from "./ActivityProvider";
import { RequestData } from "./requestTypes";
import {
  DEFAULT_MAX_REDIRECTS,
  DEFAULT_TIMEOUT_MS,
  applyDefaultHeaders,
  applyHeadersToRequest,
  applyQueryParams,
  getHeaderValue,
  getHeaderArray,
  getCookieHeader,
  hasHeader,
  isRedirectStatus,
  removeHeader,
  resolveRedirectUrl,
  serializeRequestBody,
  setHeader,
  shouldSendBodyOnRedirect,
  shouldStripAuthorization,
  getRedirectMethod,
  isEventStreamContentType,
  isRequestCompression,
  compressRequestBody,
  contentEncodingHeader,
  errorMsg,
  performRequest,
  applyWsseSecurity,
  decryptSoapMessage,
  looksEncrypted,
  resolveSoapSecurity,
  applyAuthHeaders,
  resolveAuthForRequest,
  buildRequestResult,
  validateResponseIfEnabled,
  runPreScriptPipeline,
  runCollectionTestScript,
  buildRequestInterceptors,
  runInterceptorPipeline,
  cacheKeyFor,
  cacheEntryFromResult,
  isCacheableResult,
  isCacheFresh,
  requestResultFromCache,
  pruneCache,
  type InterceptorRequest,
  type RequestInterceptor,
  type CoreRequestForBody,
  type ResolvedSoapSecurity,
  type RequestResult,
  type AuthType,
  type HttpStreamCallbacks,
  type StreamEvent,
  type CachedResponse,
} from "../core";
import {
  buildChallengeCredentials,
  retryWithChallengeAuth,
} from "../core/authChallenge";
import { createStreamForwarder } from "./streamForward";
import {
  captureCookies,
  formatBytes,
  formatRequestBodySummary,
  getCertificatesForHost,
  historyName,
  notifyRequestComplete,
  redactProxyUrl,
  resolveCollectionAuth,
  shouldUseProxy,
} from "./restifyPanelUtils";

export interface RequestExecutorDeps {
  postMessage: (message: any) => void;
  storage: StorageManager;
  activity?: ActivityProvider;
  extensionVersion: string;
  getSessionId: () => string;
  onSetVariables: (variables: any) => void;
  /** F50: sink for the HTTP-log interceptor (output channel). */
  logLine?: (line: string) => void;
}

export class RequestExecutor {
  private activeController: AbortController | null = null;
  private tabControllers = new Map<string, AbortController>();

  constructor(private deps: RequestExecutorDeps) {}

  cancelActive(): void {
    const controller = this.activeController;
    if (controller && !controller.signal.aborted) {
      controller.abort();
    }
  }

  abortTab(tabId: string): void {
    this.tabControllers.get(tabId)?.abort();
  }

  private debugLog(
    stage: string,
    info: Record<string, unknown>,
    tabId?: string,
  ): void {
    try {
      this.deps.postMessage({
        command: "debugLog",
        ...(tabId ? { tabId } : {}),
        data: { stage, info },
      });
    } catch {
      /* ignore postMessage failures for debug */
    }
  }

  async execute(
    req: RequestData,
    savedReq?: RequestData,
    tabId = "tab-1",
  ): Promise<void> {
    // savedReq is the original request state without injected auth headers.
    // Use it when persisting to history so reloading doesn't re-duplicate auth headers.
    const historyReq = savedReq || req;
    const startTime = Date.now();
    const timings: any = { start: startTime };
    const resolveVars = (s: string | undefined) =>
      this.deps.storage.resolveVariables(
        s || "",
        this.deps.getSessionId(),
        req._collectionId,
      );

    const executionReq: RequestData = {
      ...req,
      headers: Array.isArray(req.headers)
        ? req.headers.map((h) => ({ ...h }))
        : [],
      queryParams: Array.isArray(req.queryParams)
        ? req.queryParams.map((p) => ({ ...p }))
        : [],
      formData: Array.isArray(req.formData)
        ? req.formData.map((f) => ({ ...f }))
        : [],
      urlencoded: Array.isArray(req.urlencoded)
        ? req.urlencoded.map((u) => ({ ...u }))
        : [],
      authData: { ...req.authData },
    };

    const requestData = executionReq;
    // F40: collection-level pre-request script runs first, then the request's own.
    const colScripts = this.deps.storage.getCollectionScripts(req._collectionId);
    const preScripts = [colScripts.preScript, requestData.preScript].filter((s) => (s || "").trim()) as string[];

    if (preScripts.length > 0) {
      const pre = await runPreScriptPipeline(
        {
          postError: (error, duration) => this.deps.postMessage({ command: "requestError", tabId, error, duration }),
          appendActivity: (title, detail) => this.deps.activity?.append(title, detail, "error"),
          addFailedHistory: async (error, duration) => this.deps.storage.addToHistory({
            method: req.method || "GET", url: req.url || "", name: historyName(historyReq, req.method || "GET", req.url || ""),
            status: 0, error, duration, request: historyReq, activeEnvironmentId: this.deps.storage.getActiveEnvironment()?.id || null,
          }),
          setScriptVariables: async (variables) => this.deps.onSetVariables(variables),
        },
        preScripts,
        requestData,
        startTime,
      );
      if (pre.aborted) return;
    }

    const rawUrl = resolveVars(requestData.url);
    const method = requestData.method || "GET";
    const headers: Record<string, string> = {};

    // Use requestData.headers (the clone the pre-script can mutate), so that
    // header changes made by a pre-request script are actually sent.
    (requestData.headers || []).forEach((h) => {
      if (h.key && h.enabled !== false) {
        headers[resolveVars(h.key)] = resolveVars(h.value);
      }
    });

    let body: string | Buffer | undefined = undefined;
    const serialized = serializeRequestBody(
      requestData as CoreRequestForBody,
      resolveVars,
    );
    if (serialized.body !== undefined) {
      body = serialized.body;
    }
    applyHeadersToRequest(headers, serialized.headers, serialized.forceHeaders);

    // WS-Security: inject UsernameToken credentials and/or encrypt the body
    // host-side only (Node crypto is unavailable in the webview).
    let resolvedWs: ResolvedSoapSecurity | null = null;
    try {
      resolvedWs = resolveSoapSecurity(
        rawUrl,
        this.deps.storage.getSettings().soapSecurity || [],
        (certPath) => fs.readFileSync(certPath),
        resolveVars,
      );
    } catch (wsseLoadErr) {
      this.deps.activity?.append(
        "WS-Security key load failed",
        errorMsg(wsseLoadErr),
        "error",
      );
    }
    if (resolvedWs && typeof body === "string") {
      try {
        const wsse = applyWsseSecurity(body, {
          username: resolvedWs.username,
          password: resolvedWs.password,
          encrypt: resolvedWs.encrypt,
          publicKeyPem: resolvedWs.publicKeyPem,
        });
        body = wsse.xml;
        if (wsse.encrypted) {
          setHeader(headers, "Content-Type", "text/xml; charset=utf-8");
        }
      } catch (wsseErr) {
        this.deps.activity?.append(
          "WS-Security failed",
          `Error: ${errorMsg(wsseErr)}`,
          "error",
        );
      }
    }

    // Ask the server for compressed responses only when we can decode them.
    if (!hasHeader(headers, "Accept-Encoding")) {
      setHeader(headers, "Accept-Encoding", "gzip, deflate, br");
    }

    let finalUrl = rawUrl;
    const withParams = applyQueryParams(rawUrl, requestData.queryParams, resolveVars);
    if (withParams === null) {
      this.deps.activity?.append(
        "Invalid request URL",
        [
          `Method: ${method}`,
          `URL: ${rawUrl || "(empty)"}`,
          "Error: URL must include a valid protocol and host.",
        ].join("\n"),
        "error",
      );
      this.deps.postMessage({
        command: "requestError", tabId,
        error: "Invalid URL",
        duration: 0,
      });
      return;
    }
    finalUrl = withParams;
    const parsedUrl = new URL(finalUrl);

    const settings = this.deps.storage.getSettings();
    applyDefaultHeaders(headers, settings.defaultHeaders, this.deps.extensionVersion, undefined, resolveVars);

    // F50: request/response interceptors from settings (retry + HTTP log).
    const interceptors = buildRequestInterceptors(settings, {
      log: this.deps.logLine,
    });

    // F49: compress the request body (gzip/deflate/br) when enabled. Applied
    // before auth so payload-based signatures (e.g. SigV4) hash what is sent.
    const compression = requestData.compressRequest;
    if (
      isRequestCompression(compression) &&
      body !== undefined &&
      body.length > 0 &&
      !hasHeader(headers, "content-encoding")
    ) {
      try {
        const compressed = compressRequestBody(body, compression);
        if (compressed.length > 0) {
          body = compressed;
          setHeader(headers, "Content-Encoding", contentEncodingHeader(compression));
          setHeader(headers, "Content-Length", String(compressed.length));
        }
      } catch (compressErr) {
        this.deps.activity?.append(
          "Request compression failed",
          errorMsg(compressErr),
          "warning",
        );
      }
    }

    // Apply auth host-side (F12); digest/NTLM headers are computed after a 401 round-trip.
    let authTypeToApply = (requestData.authType || "none") as AuthType;
    let authDataToApply = requestData.authData || {};
    if (authTypeToApply === "inherit") {
      const resolved = resolveAuthForRequest("inherit", {}, resolveCollectionAuth(this.deps.storage, requestData._collectionId));
      authTypeToApply = resolved.authType;
      authDataToApply = resolved.authData;
    }
    const challengeCreds = buildChallengeCredentials(
      authTypeToApply,
      authDataToApply,
      { method, url: finalUrl, body },
      resolveVars,
    );
    if (!challengeCreds) {
      const applied = applyAuthHeaders(headers, authTypeToApply, authDataToApply, {
        resolve: resolveVars, method, url: finalUrl, body, headers,
      });
      if (applied.url) finalUrl = applied.url;
    }
    let proxyOpts: { proxy: string; auth?: string } | null = null;

    if (settings.proxy) {
      // Parse no-proxy list - filter out empty strings
      const noProxyArray = settings.noProxy
        ? settings.noProxy
            .split(",")
            .map((h) => h.trim())
            .filter((h) => h.length > 0)
        : [];

      // Log for debugging
      // eslint-disable-next-line no-console
      console.log("Proxy check:", {
        proxyConfigured: !!settings.proxy,
        hostname: parsedUrl.hostname.toLowerCase(),
        noProxyList: noProxyArray,
        shouldUseProxy: shouldUseProxy(
          parsedUrl.hostname.toLowerCase(),
          noProxyArray,
        ),
      });

      if (
        shouldUseProxy(parsedUrl.hostname.toLowerCase(), noProxyArray)
      ) {
        proxyOpts = {
          proxy: settings.proxy,
          auth: settings.proxyAuthorization,
        };
        // eslint-disable-next-line no-console
        console.log("✓ Proxy is ENABLED for this request");
      } else {
        // eslint-disable-next-line no-console
        console.log("✗ Proxy is DISABLED (hostname in noProxy list)");
      }
    } else {
      // eslint-disable-next-line no-console
      console.log("⚠ No proxy configured in settings");
    }

    // Send a debug log to the webview so the UI can surface diagnostic steps
    this.debugLog("preparedRequest", {
      method,
      url: finalUrl,
      headers: Object.keys(headers).slice(0, 10),
      hasBody: !!body,
    });

    const verifySsl = requestData.rejectUnauthorized !== false;
    const timeoutMs = requestData.timeout ?? settings.defaultTimeout ?? DEFAULT_TIMEOUT_MS;

    this.deps.activity?.append(
      "Request started",
      [
        `Method: ${method}`,
        `URL: ${finalUrl}`,
        `Headers: ${Object.keys(headers).length}`,
        `Body: ${formatRequestBodySummary(body, requestData.bodyType)}`,
        `SSL verification: ${verifySsl ? "enabled" : "disabled"}`,
        `Follow redirects: ${requestData.followRedirects === false ? "off" : "on (${DEFAULT_MAX_REDIRECTS} max)"}`,
        `Timeout: ${timeoutMs}ms`,
        `Proxy: ${proxyOpts ? redactProxyUrl(proxyOpts.proxy) : "not used"}`,
      ].join("\n"),
      "info",
    );
    this.deps.postMessage({ command: "requestStart", tabId });

    const controller = new AbortController();
    this.activeController = controller;
    this.tabControllers.set(tabId, controller);

    const requestOptions = {
      followRedirects: req.followRedirects !== false,
      maxRedirects: DEFAULT_MAX_REDIRECTS,
      timeout: timeoutMs,
      signal: controller.signal,
      useHttp2: req.useHttp2 === true,
    };

    // F29: response cache — check for a fresh cached entry before making a network request.
    const cacheConfig = settings.responseCache;
    const cacheKey = cacheKeyFor(method, finalUrl, headers, body);
    let servedFromCache = false;
    let cachedResult: RequestResult | null = null;

    if (cacheConfig.enabled) {
      const cachedEntries = this.deps.storage.getResponseCache();
      const ttlMs = cacheConfig.ttlSeconds * 1000;
      const freshEntry = cachedEntries.find(
        (e: CachedResponse) => e.key === cacheKey && isCacheFresh(e, ttlMs),
      );
      if (freshEntry) {
        servedFromCache = true;
        cachedResult = requestResultFromCache(freshEntry);
        this.debugLog("cacheHit", { key: cacheKey, url: finalUrl }, tabId);
      }
    }

    try {
      const netStart = Date.now();
      // F28: forward event-stream headers/body to the webview as they arrive.
      const onStreamEvent = createStreamForwarder(tabId, (message) =>
        this.deps.postMessage(message),
      );

      // F29: use cached result if available, otherwise make a network request.
      let result: RequestResult;
      if (cachedResult) {
        result = cachedResult;
      } else {
        result = await this.doRequest(
          method,
          finalUrl,
          headers,
          body,
          verifySsl,
          proxyOpts,
          requestOptions,
          onStreamEvent,
          interceptors,
        );
      }

      // HTTP Digest (RFC 7616) and NTLM (challenge-response): the first attempt
      // gets a 401 challenge, then we compute the Authorization header and retry.
      const finalResult =
        challengeCreds && result.status === 401
          ? await retryWithChallengeAuth(
              result,
              challengeCreds,
              headers,
              (opts) =>
                this.doRequest(
                  method,
                  finalUrl,
                  headers,
                  body,
                  verifySsl,
                  proxyOpts,
                  opts,
                  onStreamEvent,
                  interceptors,
                ),
              requestOptions,
              this.deps.activity ?? undefined,
            )
          : result;
      this.debugLog(
        "receivedResponse",
        {
          status: finalResult.status,
          size:
            finalResult.bodySize ||
            Buffer.byteLength(finalResult.body || "", "utf8"),
        },
        tabId,
      );
      timings.network = Date.now() - netStart;

      const duration = Date.now() - startTime;
      // WS-Security: decrypt an encrypted SOAP response when a matching
      // settings entry provides a private key; otherwise show it as-is.
      let responseBody = finalResult.body;
      let decrypted = false;
      if (
        resolvedWs?.decrypt &&
        resolvedWs?.privateKeyPem &&
        typeof finalResult.body === "string"
      ) {
        try {
          if (looksEncrypted(finalResult.body)) {
            const plain = decryptSoapMessage(finalResult.body, resolvedWs.privateKeyPem);
            if (plain) {
              responseBody = plain;
              decrypted = true;
            }
          }
        } catch (wsseErr) {
          this.deps.activity?.append(
            "WS-Security decrypt failed",
            errorMsg(wsseErr),
            "error",
          );
        }
      }
      if (
        !decrypted &&
        typeof finalResult.body === "string" &&
        looksEncrypted(finalResult.body)
      ) {
        this.deps.activity?.append(
          "Encrypted response",
          "Response body is WS-Security encrypted; configure a decrypt keystore for this host in Settings → SOAP Security to view it decrypted.",
          "warning",
        );
      }
      const responseData = {
        status: finalResult.status,
        statusText: finalResult.statusText,
        headers: finalResult.headers,
        body: responseBody,
        duration,
        size: finalResult.bodySize || Buffer.byteLength(String(responseBody || ""), "utf8"),
        isFileResponse: finalResult.isFileResponse,
        fileDetectionSource: finalResult.fileDetectionSource,
        fileName: finalResult.fileName,
        fileMimeType: finalResult.fileMimeType,
        fileBase64: finalResult.fileBase64,
        filePreviewType: finalResult.filePreviewType,
        timings: finalResult.timings,
        servedFromCache,
      };

      // F29: store successful responses in cache (skip if already served from cache or streaming).
      if (
        cacheConfig.enabled &&
        !servedFromCache &&
        !finalResult.isFileResponse &&
        isCacheableResult(finalResult) &&
        !onStreamEvent
      ) {
        const entries = this.deps.storage.getResponseCache();
        const newEntry = cacheEntryFromResult(cacheKey, method, finalUrl, finalResult);
        const updatedEntries = pruneCache(
          [...entries.filter((e: CachedResponse) => e.key !== cacheKey), newEntry],
          cacheConfig.ttlSeconds * 1000,
        );
        this.deps.storage.saveResponseCache(updatedEntries);
      }

      const schemaValidation = validateResponseIfEnabled(req, responseBody);

      // Detect mTLS usage
      const mtlsCerts = getCertificatesForHost(this.deps.storage, parsedUrl.hostname);

      // Build resolved headers array for display
      const resolvedHeaders = (requestData.headers || []).map((h) => ({
        ...h,
        key: resolveVars(h.key),
        value: resolveVars(h.value),
      }));

      // Build curl command
      let curlCommand = `curl -X ${method}`;

      const isFormData = requestData.bodyType === "form" && Array.isArray(requestData.formData) && requestData.formData.length > 0;

      // Add headers (omit Content-Type for multipart form-data so curl sets boundary)
      resolvedHeaders.forEach((h) => {
        if (h.enabled === false) return;
        if (isFormData && h.key && h.key.toLowerCase() === "content-type") return;
        curlCommand += ` -H "${h.key}: ${h.value}"`;
      });

      // Form-data: produce -F entries using actual file paths when present
      if (isFormData) {
        (req.formData || []).forEach((field) => {
          if (!field.key || field.enabled === false) return;
          const name = resolveVars(field.key);
          const fieldType = field.formType || "text";
          if (fieldType === "file") {
            const candidatePath = field.fileName || "";
            const contentType = field.contentType || "application/octet-stream";
            if (candidatePath && path.isAbsolute(candidatePath)) {
              const safePath = candidatePath.replace(/"/g, '\\"');
              curlCommand += ` -F "${name}=@${safePath};type=${contentType}"`;
            } else if (candidatePath) {
              // Not absolute — include as-is (user may have relative path)
              const safePath = candidatePath.replace(/"/g, '\\"');
              curlCommand += ` -F "${name}=@${safePath};type=${contentType}"`;
            } else {
              // No path available: include a placeholder path so command is executable after user adjusts
              curlCommand += ` -F "${name}=@/path/to/${field.fileName || 'file'};type=${contentType}"`;
            }
          } else {
            const val = resolveVars(field.value || "");
            const escaped = String(val).replace(/"/g, '\\"');
            if (field.contentType) {
              curlCommand += ` -F "${name}=${escaped};type=${field.contentType}"`;
            } else {
              curlCommand += ` -F "${name}=${escaped}"`;
            }
          }
        });
      } else {
        // Non-form bodies: prefer minified JSON when possible
        if (body) {
          if (typeof body === "string") {
            let outBody = body;
            const contentTypeHeader = Object.keys(headers).find((k) => k.toLowerCase() === "content-type");
            const contentType = contentTypeHeader ? headers[contentTypeHeader] : "";
            const looksLikeJson = (req.bodyType === "json") || (typeof contentType === "string" && contentType.toLowerCase().includes("application/json"));
            if (looksLikeJson) {
              try {
                outBody = JSON.stringify(JSON.parse(outBody));
              } catch {
                // leave as-is if parse fails
              }
            }
            curlCommand += ` -d '${outBody.replace(/'/g, "'\\''")}'`;
          } else {
            // Buffer bodies: include as --data-binary @file placeholder (no temp files)
            curlCommand += ` --data-binary @/path/to/body.bin`;
          }
        }
      }

      // Add URL
      curlCommand += ` "${finalUrl}"`;

      // Offload large bodies to file storage (async) to keep postMessage small
      const safeResponse = { ...responseData } as any;
      const safeRequestInfo: any = {
        method,
        url: finalUrl,
        proxyUsed: !!proxyOpts,
        proxyUrl: proxyOpts?.proxy || null,
        hasProxyAuth: !!proxyOpts?.auth,
        mtlsUsed: !!mtlsCerts,
        mtlsHostname: mtlsCerts ? parsedUrl.hostname : null,
        headers: resolvedHeaders,
        queryParams: req.queryParams,
        body: req.body,
        rejectUnauthorized: req.rejectUnauthorized !== false,
        curlCommand,
      };

      // NOTE: We intentionally do NOT offload the response body to a file for
      // postMessage (it would blank JsonPrettyViewer); file offloading is only
      // done inside addToHistory for the persistence layer.

      // Measure postMessage serialization time and size
      try {
        const pmStart = Date.now();
        // measure approximate size
        let size = 0;
        try {
          size = Buffer.byteLength(
            JSON.stringify({
              response: safeResponse,
              requestInfo: safeRequestInfo,
            }),
            "utf8",
          );
        } catch {
          /* empty */
        }
        this.deps.postMessage({
          command: "requestComplete", tabId,
          response: safeResponse,
          requestInfo: safeRequestInfo,
          schemaValidation,
        });
        timings.postMessageMs = Date.now() - pmStart;
        timings.postMessageSize = size;
      } catch {
        /* empty */
      }

      notifyRequestComplete(this.deps.storage, { method, url: finalUrl, status: finalResult.status, durationMs: duration });

      // F40: run the collection-level test script host-side and merge its
      // assertions with any request-level script results already reported.
      if ((colScripts.testScript || "").trim()) {
        try {
          const { result: testResult } = await runCollectionTestScript(
            colScripts.testScript as string,
            { ...responseData, responseTime: duration },
          );
          this.deps.postMessage({ command: "scriptResult", tabId, result: testResult });
          if (Object.keys(testResult.variables).length > 0) {
            await this.deps.onSetVariables(testResult.variables);
          }
        } catch (colTestErr) {
          this.deps.activity?.append(
            "Collection test script failed",
            errorMsg(colTestErr),
            "error",
          );
        }
      }

      // Measure history add time
      try {
        const hStart = Date.now();
        this.deps.storage.addToHistory({
          method,
          url: finalUrl,
          name: historyName(historyReq, method, finalUrl),
          status: finalResult.status,
          duration,
          request: historyReq,
          response: responseData,
          activeEnvironmentId:
            this.deps.storage.getActiveEnvironment()?.id || null,
        });
        timings.addHistoryMs = Date.now() - hStart;
      } catch (hErr) {
        console.error("addToHistory failed:", hErr);
      }

      this.deps.activity?.append(
        "Request completed",
        [
          `Method: ${method}`,
          `URL: ${finalUrl}`,
          `Status: ${finalResult.status} ${finalResult.statusText || "OK"}`,
          `Duration: ${duration}ms`,
          `Network: ${timings.network ?? 0}ms`,
          `Size: ${formatBytes(responseData.size)}`,
          `Content-Type: ${getHeaderValue(finalResult.headers, "content-type") || "unknown"}`,
          `Proxy: ${proxyOpts ? redactProxyUrl(proxyOpts.proxy) : "not used"}`,
          `mTLS: ${mtlsCerts ? `enabled for ${parsedUrl.hostname}` : "not used"}`,
        ].join("\n"),
        finalResult.status >= 400 ? "warning" : "info",
      );

      // Log timings for diagnostics
      // eslint-disable-next-line no-console
      console.log("Restify: request timings", {
        url: finalUrl,
        status: finalResult.status,
        timings,
      });
    } catch (err: any) {
      if (controller.signal.aborted) {
        const duration = Date.now() - startTime;
        this.debugLog("requestCancelled", { duration }, tabId);
        this.deps.activity?.append(
          "Request cancelled",
          [
            `Method: ${method}`,
            `URL: ${finalUrl}`,
            `Duration: ${duration}ms`,
            "Cancelled by user.",
          ].join("\n"),
          "warning",
        );
        this.deps.postMessage({
          command: "requestCancelled", tabId,
          duration,
        });
        this.deps.storage.addToHistory({
          method,
          url: finalUrl,
          name: historyName(historyReq, method, finalUrl),
          status: 0,
          error: "Cancelled",
          duration,
          request: historyReq,
          activeEnvironmentId:
            this.deps.storage.getActiveEnvironment()?.id || null,
        });
        return;
      }
      this.debugLog(
        "requestError",
        { message: err?.message || String(err) },
        tabId,
      );
      const duration = Date.now() - startTime;

      // F29: replay from cache on network error when enabled.
      if (
        cacheConfig.enabled &&
        cacheConfig.replayOnNetworkError &&
        !controller.signal.aborted
      ) {
        const cachedEntries = this.deps.storage.getResponseCache();
        const ttlMs = cacheConfig.ttlSeconds * 1000;
        const freshEntry = cachedEntries.find(
          (e: CachedResponse) => e.key === cacheKey && isCacheFresh(e, ttlMs),
        );
        if (freshEntry) {
          const cachedResult = requestResultFromCache(freshEntry);
          servedFromCache = true;
          this.debugLog("cacheReplay", { key: cacheKey, url: finalUrl }, tabId);
          this.deps.activity?.append(
            "Replayed from cache",
            [
              `Method: ${method}`,
              `URL: ${finalUrl}`,
              `Original error: ${err?.message || String(err)}`,
              `Cache status: ${cachedResult.status}`,
            ].join("\n"),
            "info",
          );
          const replayResponseBody = cachedResult.body;
          const replayResponseData = {
            status: cachedResult.status,
            statusText: cachedResult.statusText,
            headers: cachedResult.headers,
            body: replayResponseBody,
            duration,
            size: cachedResult.bodySize || Buffer.byteLength(String(replayResponseBody || ""), "utf8"),
            isFileResponse: cachedResult.isFileResponse,
            fileDetectionSource: cachedResult.fileDetectionSource,
            fileName: cachedResult.fileName,
            fileMimeType: cachedResult.fileMimeType,
            fileBase64: cachedResult.fileBase64,
            filePreviewType: cachedResult.filePreviewType,
            timings: cachedResult.timings,
            servedFromCache: true,
          };
          this.deps.postMessage({
            command: "response",
            tabId,
            response: replayResponseData,
            duration,
          });
          notifyRequestComplete(this.deps.storage, { method, url: finalUrl, status: cachedResult.status, durationMs: duration });
          this.deps.storage.addToHistory({
            method,
            url: finalUrl,
            name: historyName(historyReq, method, finalUrl),
            status: cachedResult.status,
            duration,
            request: historyReq,
            activeEnvironmentId: this.deps.storage.getActiveEnvironment()?.id || null,
          });
          return;
        }
      }

      this.deps.activity?.append(
        "Request failed",
        [
          `Method: ${method}`,
          `URL: ${finalUrl}`,
          `Duration: ${duration}ms`,
          `Proxy: ${proxyOpts ? redactProxyUrl(proxyOpts.proxy) : "not used"}`,
          `Error: ${err?.message || String(err)}`,
        ].join("\n"),
        "error",
      );
      this.deps.postMessage({
        command: "requestError", tabId,
        error: err.message,
        duration,
      });
      notifyRequestComplete(this.deps.storage, { method, url: finalUrl, status: 0, durationMs: duration });
      this.deps.storage.addToHistory({
        method,
        url: finalUrl,
        name: historyName(historyReq, method, finalUrl),
        status: 0,
        error: err.message,
        duration,
        request: historyReq,
        activeEnvironmentId:
          this.deps.storage.getActiveEnvironment()?.id || null,
      });
    } finally {
      if (this.activeController === controller) {
        this.activeController = null;
      }
      if (this.tabControllers.get(tabId) === controller) {
        this.tabControllers.delete(tabId);
      }
    }
  }

  private async doRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | Buffer | undefined,
    rejectUnauthorized: boolean,
    proxyOpts: { proxy: string; auth?: string } | null,
    options: {
      followRedirects?: boolean;
      maxRedirects?: number;
      timeout?: number;
      signal?: AbortSignal;
      /** F48: use the HTTP/2 transport for this request. */
      useHttp2?: boolean;
    } = {},
    onStreamEvent?: (event: StreamEvent) => void,
    interceptors: RequestInterceptor[] = [],
  ): Promise<RequestResult> {
    const maxRedirects =
      options.followRedirects === false
        ? 0
        : options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;

    let currentMethod = method;
    let currentUrl = url;
    let currentHeaders = { ...headers };
    let currentBody = body;

    for (let hop = 0; hop <= maxRedirects; hop++) {
      const result = await this.doRequestOnce(
        currentMethod,
        currentUrl,
        currentHeaders,
        currentBody,
        rejectUnauthorized,
        proxyOpts,
        timeoutMs,
        options.signal,
        onStreamEvent,
        options.useHttp2,
        interceptors,
      );

      // Capture Set-Cookie from every hop so redirects accumulate cookies too.
      captureCookies(this.deps.storage, result.headers, currentUrl);

      if (hop >= maxRedirects || !isRedirectStatus(result.status)) {
        return result;
      }

      const locations = getHeaderArray(result.headers, "location");
      const nextUrl = resolveRedirectUrl(currentUrl, locations[0]);
      if (!nextUrl) {
        return result;
      }

      const nextMethod = getRedirectMethod(currentMethod, result.status);
      const sendBody = shouldSendBodyOnRedirect(currentMethod, result.status);

      const nextHeaders = { ...currentHeaders };
      if (shouldStripAuthorization(currentUrl, nextUrl)) {
        removeHeader(nextHeaders, "authorization");
        removeHeader(nextHeaders, "proxy-authorization");
      }
      if (!sendBody) {
        removeHeader(nextHeaders, "content-length");
        removeHeader(nextHeaders, "content-type");
        removeHeader(nextHeaders, "transfer-encoding");
      }
      // Content-Length no longer matches if we keep the body.
      if (sendBody && currentBody !== undefined) {
        removeHeader(nextHeaders, "content-length");
        if (Buffer.isBuffer(currentBody)) {
          setHeader(nextHeaders, "Content-Length", String(currentBody.length));
        } else {
          setHeader(
            nextHeaders,
            "Content-Length",
            String(Buffer.byteLength(currentBody, "utf8")),
          );
        }
      }

      this.debugLog("redirect", {
        from: currentUrl,
        to: nextUrl,
        status: result.status,
        method: nextMethod,
      });

      currentMethod = nextMethod;
      currentUrl = nextUrl;
      currentHeaders = nextHeaders;
      currentBody = sendBody ? currentBody : undefined;
    }

    // Unreachable: loop bounded by maxRedirects above.
    return this.doRequestOnce(
      currentMethod,
      currentUrl,
      currentHeaders,
      currentBody,
      rejectUnauthorized,
      proxyOpts,
      timeoutMs,
      options.signal,
      onStreamEvent,
      options.useHttp2,
      interceptors,
    );
  }

  private async doRequestOnce(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | Buffer | undefined,
    rejectUnauthorized: boolean,
    proxyOpts: { proxy: string; auth?: string } | null,
    timeoutMs: number,
    signal?: AbortSignal,
    onStreamEvent?: (event: StreamEvent) => void,
    useHttp2?: boolean,
    interceptors: RequestInterceptor[] = [],
  ): Promise<RequestResult> {
    const parsedUrl = new URL(url);

    // F28: forward event-stream headers/body chunks so the response renders
    // incrementally instead of after the stream ends.
    const stream: HttpStreamCallbacks = {
      onResponse: (event) => {
        if (isEventStreamContentType(event.headers["content-type"])) {
          onStreamEvent?.(event);
        }
      },
      onChunk: (event) => {
        if (isEventStreamContentType(event.headers["content-type"])) {
          onStreamEvent?.(event);
        }
      },
    };

    // Inject matching cookies from the jar unless the user supplied their own.
    if (!hasHeader(headers, "cookie")) {
      const cookieHeader = getCookieHeader(
        this.deps.storage.getCookies(),
        url,
      );
      if (cookieHeader) setHeader(headers, "Cookie", cookieHeader);
    }

    const baseHeaders = { ...headers };
    // F50: run the interceptor pipeline (retry / HTTP log) around the
    // transport call. Each attempt rebuilds transport options from the
    // (possibly interceptor-mutated) request snapshot.
    const raw = await runInterceptorPipeline({
      request: { url, method, headers: baseHeaders, body },
      interceptors,
      signal,
      perform: (req: InterceptorRequest) =>
        performRequest({
          url: req.url,
          method: req.method,
          headers: req.headers,
          body: req.body,
          rejectUnauthorized,
          timeoutMs,
          signal,
          useHttp2,
          tls:
            parsedUrl.protocol === "https:"
              ? (getCertificatesForHost(this.deps.storage, parsedUrl.hostname) ?? undefined)
              : undefined,
          stream,
          onStage: (stage, info) => this.debugLog(stage, info),
          proxy: proxyOpts ?? undefined,
        }),
    });
    return buildRequestResult(
      raw.status,
      raw.statusText,
      raw.headers,
      raw.data,
      url,
      raw.timings,
    );
  }
}
