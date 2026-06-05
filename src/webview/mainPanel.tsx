import React, { useState, useEffect, useRef, useCallback } from "react";
import "./MainPanel.css";

import { TopBar } from "./components/TopBar";
import { UrlBar } from "./components/UrlBar";
import { RequestPane } from "./components/RequestPane";
import { ResponsePane } from "./components/ResponsePane";
import { SaveModal } from "./components/SaveModal";
import { SettingsModal } from "./components/SettingsModal";
import { EnvManagerModal } from "./components/EnvManagerModal";

import {
  DEFAULT_REQUEST,
  DEFAULT_SETTINGS,
  KVItem,
  RequestState,
  ResponseState,
  Environment,
  Collection,
  SettingsState,
} from "./types";

export const MainPanel: React.FC = () => {
  /* ── State ───────────────────────────────────────── */
  const [request, setRequest] = useState<RequestState>(DEFAULT_REQUEST);
  const [response, setResponse] = useState<ResponseState | null>(null);
  const [requestInfo, setRequestInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [activeEnvId, setActiveEnvId] = useState<string | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [envManagerOpen, setEnvManagerOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [themeKind, setThemeKind] = useState<number>(2);
  const [savedCollectionName, setSavedCollectionName] = useState<string | null>(
    null,
  );
  const [savedGroupId, setSavedGroupId] = useState<string | undefined>(
    undefined,
  );
  const [isDirty, setIsDirty] = useState(false);

  const vscodeApi = useRef<any>(null);
  const requestRef = useRef<RequestState>(request);
  const savedCollectionNameRef = useRef<string | null>(null);
  const savedGroupIdRef = useRef<string | undefined>(undefined);
  const activeEnvIdRef = useRef<string | null>(null);

  /* ── VS Code API bootstrap ───────────────────────── */
  useEffect(() => {
    const applyThemeClass = (kind: number) => {
      document.body.classList.remove(
        "vscode-light",
        "vscode-dark",
        "vscode-high-contrast",
      );
      if (kind === 1 || kind === 4) document.body.classList.add("vscode-light");
      else if (kind === 3) document.body.classList.add("vscode-high-contrast");
      else document.body.classList.add("vscode-dark");
    };

    vscodeApi.current = (window as any).acquireVsCodeApi?.();

    const handler = (event: MessageEvent) => {
      const msg = event.data;
      try {
        // incoming message received
      } catch {
        /* empty */
      }
      switch (msg.command) {
        case "loadRequest": {
          const { _collectionName, _groupId, ...reqData } = msg.data;
          setRequest((prev: RequestState) => ({ ...prev, ...reqData }));
          setSavedCollectionName(_collectionName ?? null);
          setSavedGroupId(_groupId ?? undefined);
          setIsDirty(false);
          // If the request has an activeEnvironmentId, set that environment
          if (reqData.activeEnvironmentId) {
            setActiveEnvId(reqData.activeEnvironmentId);
            // Notify the extension that environment was changed
            post({
              command: "setActiveEnvironment",
              id: reqData.activeEnvironmentId,
            });
          }
          break;
        }
        case "setEnvironments":
          setEnvironments(msg.environments ?? []);
          setActiveEnvId(msg.activeEnvId ?? null);
          break;
        case "collections":
          setCollections(msg.data ?? []);
          break;
        case "loadSettings":
        case "setSettings":
          setSettings(msg.settings ?? DEFAULT_SETTINGS);
          break;
        case "requestStart":
          setLoading(true);
          setResponse(null);
          break;
        case "requestComplete":
          setLoading(false);
          setResponse(msg.response);
          setRequestInfo(msg.requestInfo);
          // If the current request has a post-response script, delegate to extension host
          try {
            const script = requestRef.current?.script;
            if (script && script.trim().length > 0) {
              // Mark script as running so the UI can show a spinner
              setRequestInfo((prev: any) => ({ ...prev, scriptRunning: true }));
              // Send script + response to extension host for CSP-free execution
              post({ command: "runScript", script, response: msg.response });
            }
          } catch {
            /* ignore */
          }
          break;
        case "scriptResult":
          // Result returned from extension host script execution
          setRequestInfo((prev: any) => ({
            ...prev,
            scriptRunning: false,
            scriptLogs: msg.result?.logs || [],
            scriptSuccess: msg.result?.success !== false,
            scriptError: msg.result?.error,
            scriptVariables: msg.result?.variables || {},
          }));
          break;
        case "requestError":
          setLoading(false);
          setResponse({
            status: 0,
            statusText: "Error",
            headers: {},
            body: msg.error ?? "Unknown error",
            duration: msg.duration ?? 0,
            size: 0,
          });
          break;
        case "setTheme":
          setThemeKind(msg.kind ?? 2);
          applyThemeClass(msg.kind ?? 2);
          break;
        case "debugLog":
          try {
            const ts = new Date().toLocaleTimeString();
            const entry = `${ts} — ${msg.data?.stage || "debug"}: ${JSON.stringify(msg.data?.info || {})}`;
            setRequestInfo((prev: any) => ({
              ...(prev || {}),
              scriptLogs: [...(prev?.scriptLogs || []), entry],
            }));
          } catch(e) {
            console.error("Failed to append debugLog", e);
          }
          break;
      }
    };

    window.addEventListener("message", handler);

    // Signal that the webview is ready to receive messages
    vscodeApi.current?.postMessage({ command: "webviewReady" });

    return () => window.removeEventListener("message", handler);
  }, []);

  // keep refs in sync with latest state for use in event handlers
  useEffect(() => {
    requestRef.current = request;
  }, [request]);
  useEffect(() => {
    savedCollectionNameRef.current = savedCollectionName;
  }, [savedCollectionName]);
  useEffect(() => {
    savedGroupIdRef.current = savedGroupId;
  }, [savedGroupId]);
  useEffect(() => {
    activeEnvIdRef.current = activeEnvId;
  }, [activeEnvId]);

  /* ── Helpers ─────────────────────────────────────── */
  const post = (message: any) => vscodeApi.current?.postMessage(message);

  const updateRequest = (updates: Partial<RequestState>) => {
    setRequest((prev: RequestState) => {
      const next = { ...prev, ...updates };
      if (updates.name) post({ command: "updateTitle", title: updates.name });
      return next;
    });
    setIsDirty(true);
  };

  /* Build the request object, injecting auth headers/params */
  const buildPayload = useCallback((): RequestState => {
    const headers = [...request.headers];
    const queryParams = [...request.queryParams];

    if (request.authType === "bearer" && request.authData.token) {
      headers.push({
        key: "Authorization",
        value: `Bearer ${request.authData.token}`,
        enabled: true,
      });
    } else if (request.authType === "basic" && request.authData.username) {
      const creds = btoa(
        `${request.authData.username}:${request.authData.password ?? ""}`,
      );
      headers.push({
        key: "Authorization",
        value: `Basic ${creds}`,
        enabled: true,
      });
    } else if (request.authType === "apikey" && request.authData.keyName) {
      const kv = {
        key: request.authData.keyName,
        value: request.authData.keyValue ?? "",
        enabled: true,
      };
      if (request.authData.addTo === "query") queryParams.push(kv);
      else headers.push(kv);
    }

    return { ...request, headers, queryParams };
  }, [request]);

  // Send the built payload (with injected auth headers) for execution
  const handleSend = useCallback(() => {
    post({
      command: "executeRequest",
      request: buildPayload(),
      savedRequest: request,
    });
  }, [buildPayload, request]);

  // Normal send handler
  const handleSendGuarded = handleSend;

  // Ctrl+S / Cmd+S — silent save if already in a collection, otherwise open SaveModal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        const colName = savedCollectionNameRef.current;
        if (colName) {
          vscodeApi.current?.postMessage({
            command: "saveToCollection",
            request: {
              ...requestRef.current,
              activeEnvironmentId: activeEnvIdRef.current,
            },
            collectionName: colName,
            groupId: savedGroupIdRef.current,
          });
          setIsDirty(false);
        } else {
          setSaveModalOpen(true);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSend]);

  // Safely decode a URI component, falling back to the raw string on malformed input
  const safeDecode = (s: string): string => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };

  // Sync query params from a typed URL back to the params tab
  const handleUrlChange = (rawUrl: string) => {
    // Auto-fill request name from URL when still at default
    if (request.name === "New Request" || request.name === "") {
      try {
        const urlObj = new URL(
          rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`,
        );
        const path = urlObj.pathname || "/";
        setRequest((prev: RequestState) => ({
          ...prev,
          name: `${prev.method} ${path}`,
        }));
      } catch {
        /* invalid URL — skip */
      }
    }
    const qIdx = rawUrl.indexOf("?");
    if (qIdx === -1) {
      // If the user removed the query string entirely from the URL input,
      // clear any active query params so they don't reappear when the
      // derived display URL is recalculated on blur.
      const disabledParams = request.queryParams.filter((p) => p.enabled === false);
      updateRequest({ url: rawUrl, queryParams: disabledParams });
      return;
    }
    const baseUrl = rawUrl.slice(0, qIdx);
    const queryString = rawUrl.slice(qIdx + 1);
    const parsedParams: KVItem[] = queryString
      .split("&")
      .filter((part) => part.length > 0)
      .map((part) => {
        const eqIdx = part.indexOf("=");
        return eqIdx === -1
          ? { key: safeDecode(part), value: "", enabled: true as const }
          : {
              key: safeDecode(part.slice(0, eqIdx)),
              value: safeDecode(part.slice(eqIdx + 1)),
              enabled: true as const,
            };
      });
    // Preserve any explicitly disabled params (they don't appear in the URL)
    const disabledParams = request.queryParams.filter(
      (p) => p.enabled === false,
    );
    updateRequest({
      url: baseUrl,
      queryParams: [...parsedParams, ...disabledParams],
    });
  };

  const handleSave = (
    reqName: string,
    collectionName: string,
    groupId?: string,
  ) => {
    post({
      command: "saveToCollection",
      request: { ...request, name: reqName, activeEnvironmentId: activeEnvId },
      collectionName,
      groupId,
    });
    setSavedCollectionName(collectionName);
    setSavedGroupId(groupId);
    updateRequest({ name: reqName });
    setIsDirty(false);
    setSaveModalOpen(false);
  };

  const handleEnvChange = (id: string | null) => {
    setActiveEnvId(id);
    post({ command: "setActiveEnvironment", id });
  };

  const handleSaveEnvironment = (env: Environment) => {
    post({ command: "saveEnvironment", data: env });
  };

  const handleDeleteEnvironment = (id: string) => {
    post({ command: "deleteEnvironment", id });
  };

  const handleSaveSettings = (newSettings: SettingsState) => {
    setSettings(newSettings);
    post({ command: "saveSettings", settings: newSettings });
    setSettingsModalOpen(false);
  };

  const handleDownloadFile = (payload: {
    fileName: string;
    mimeType: string;
    fileBase64: string;
  }) => {
    post({ command: "downloadFile", payload });
  };

  // script functionality removed

  /* ── Render ──────────────────────────────────────── */
  const activeEnvironment =
    environments.find((env) => env.id === activeEnvId) || null;

  // Compute which env variables are referenced in the current request
  const usedVars = React.useMemo(() => {
    if (!activeEnvironment) return null;
    const allVarKeys = new Set(activeEnvironment.variables.map((v) => v.key));
    const searchText = [
      request.url,
      request.body || "",
      ...(request.headers || []).map((h) => `${h.key} ${h.value}`),
      ...(request.queryParams || []).map((p) => `${p.key} ${p.value}`),
    ].join(" ");
    const matches = [...searchText.matchAll(/\{\{([^}]+)}}/g)].map((m) => m[1]);
    const unique = [...new Set(matches)];
    return unique.map((name) => ({ name, resolved: allVarKeys.has(name) }));
  }, [
    request.url,
    request.body,
    request.headers,
    request.queryParams,
    activeEnvironment,
  ]);

  return (
    <div className="restify-container">
      <TopBar
        name={request.name}
        isDirty={isDirty}
        environments={environments}
        activeEnvId={activeEnvId}
        onNameChange={(name) => updateRequest({ name })}
        onEnvChange={handleEnvChange}
        onManageEnvs={() => setEnvManagerOpen(true)}
        onOpenSettings={() => setSettingsModalOpen(true)}
      />

      {/* Animated loading bar */}
      <div className={`loading-bar ${loading ? "active" : ""}`} />

      <UrlBar
        method={request.method}
        url={request.url}
        loading={loading}
        queryParams={request.queryParams}
        environment={activeEnvironment}
        onMethodChange={(method) => updateRequest({ method })}
        onUrlChange={handleUrlChange}
        onSend={handleSendGuarded}
        onSave={() => setSaveModalOpen(true)}
      />

      {/* Per-request SSL setting */}
      <div className="ssl-row">
        <label title="Uncheck to allow self-signed or untrusted certificates for this request">
          <input
            type="checkbox"
            checked={request.rejectUnauthorized}
            onChange={(e) =>
              updateRequest({ rejectUnauthorized: e.target.checked })
            }
          />
          Verify SSL Certificate
        </label>
      </div>

      {/* Used environment variables strip */}
      {usedVars && usedVars.length > 0 && (
        <div className="used-vars-strip">
          <span className="used-vars-label">Vars:</span>
          {usedVars.map((v) => (
            <span
              key={v.name}
              className={`used-var-chip ${v.resolved ? "resolved" : "unresolved"}`}
              title={
                v.resolved
                  ? "Resolved in active environment"
                  : "Not found in active environment"
              }
            >
              {"{{"}
              {v.name}
              {"}}"}
            </span>
          ))}
        </div>
      )}

      {/* Split pane */}
      <div className="main-area">
        <div className="split-pane">
          <RequestPane
            request={request}
            onUpdate={updateRequest}
            themeKind={themeKind}
            environment={activeEnvironment}
          />
          <div className="resizer" />
          <ResponsePane
            response={response}
            loading={loading}
            request={requestInfo}
            onDownloadFile={handleDownloadFile}
            post={post}
          />
        </div>
      </div>

      <SaveModal
        open={saveModalOpen}
        requestName={request.name}
        collections={collections}
        onSave={handleSave}
        onClose={() => setSaveModalOpen(false)}
      />

      <SettingsModal
        open={settingsModalOpen}
        initialSettings={settings}
        onSave={handleSaveSettings}
        onClose={() => setSettingsModalOpen(false)}
      />

      <EnvManagerModal
        open={envManagerOpen}
        environments={environments}
        activeEnvId={activeEnvId}
        onClose={() => setEnvManagerOpen(false)}
        onSetActive={(id) => {
          handleEnvChange(id);
        }}
        onSave={handleSaveEnvironment}
        onDelete={handleDeleteEnvironment}
      />
    </div>
  );
};
