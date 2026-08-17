import React, { useState, useEffect, useRef, useCallback } from "react";
import styled, { css, keyframes } from "styled-components";

import { TopBar } from "./components/TopBar";
import TabBar from "./components/TabBar";
import { CodeGenModal } from "./components/CodeGenModal";
import { UrlBar } from "./components/UrlBar";
import { RequestPane } from "./components/RequestPane";
import { ResponsePane } from "./components/ResponsePane";
import { WebSocketClientView } from "./components/WebSocketClientView";
import { SaveModal } from "./components/SaveModal";
import { SettingsModal } from "./components/SettingsModal";
import { EnvManagerModal } from "./components/EnvManagerModal";
import { VariablesHelpModal } from "./components/VariablesHelpModal";
import { Icon, faShieldHalved, faArrowsRotate, faClock, faBolt } from "./components/FaIcon";

import {
  DEFAULT_REQUEST,
  DEFAULT_SETTINGS,
  KVItem,
  HeaderPreset,
  RequestState,
  ResponseState,
  Environment,
  Collection,
  SettingsState,
  ResponseViewerSettings,
  OAuth2ConfigPayload,
  WsSessionState,
} from "./types";
import {
  isDynamicVariableToken,
  previewDynamicVariable,
} from "../core/dynamicVarTokens";

const vscodeApi = (window as any).acquireVsCodeApi?.();

/**
 * Window session id for request chaining. Generated once per webview window and
 * set on `window`; script-extracted chain variables are scoped to it. The same
 * window chains across unlimited requests; a new window (new id) terminates the
 * scope.
 */
const SESSION_ID: string = (() => {
  const w = window as any;
  if (!w.__restifySessionId) {
    w.__restifySessionId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `session-${Math.random().toString(36).slice(2)}`;
  }
  return w.__restifySessionId as string;
})();

/**
 * Suggested display name for an unsaved request, derived from method + URL
 * path (used for the VS Code window title). Returns "" when no usable URL is
 * present.
 */
const suggestedRequestName = (req: RequestState): string => {
  if (!req.url) return "";
  try {
    const urlObj = new URL(
      req.url.startsWith("http") ? req.url : `https://${req.url}`,
    );
    return `${req.method} ${urlObj.pathname || "/"}`;
  } catch {
    return "";
  }
};

/** Short tab label without the method prefix — the TabBar shows a colored
 *  method chip instead, so the method is not repeated in the label. */
const tabLabelShort = (tab: TabState): string => {
  if (hasRealName(tab.request)) return tab.request.name!;
  return suggestedRequestName(tab.request).replace(/^[A-Z]+ /, "") || "New Request";
};

/** True when the request still carries its default placeholder name. */
const hasRealName = (req: RequestState): boolean => {
  const n = req.name?.trim();
  return Boolean(n) && n !== "New Request";
};

/** Per-tab editor state. Each tab carries its own request + response. */
interface TabState {
  id: string;
  request: RequestState;
  response: ResponseState | null;
  /** F26: previous response for diff comparison. */
  previousResponse: ResponseState | null;
  requestInfo: any | null;
  schemaValidation: any | null;
  loading: boolean;
  isDirty: boolean;
  savedCollectionName: string | null;
  savedGroupId?: string;
  oauthStatus: { state: 'success' | 'error' | 'none'; text?: string };
  /** F55: snapshot of request at last save time for rich diff. */
  savedSnapshot?: Partial<RequestState>;
}

const createTab = (requestData?: Partial<RequestState>): TabState => ({
  id: `tab-${Math.random().toString(36).slice(2, 10)}`,
  request: requestData
    ? { ...DEFAULT_REQUEST, ...requestData }
    : { ...DEFAULT_REQUEST },
  response: null,
  previousResponse: null,
  requestInfo: null,
  schemaValidation: null,
  loading: false,
  isDirty: false,
  savedCollectionName: null,
  savedGroupId: undefined,
  oauthStatus: { state: "none" },
});

/** Display label for a tab (real name, else suggested name, else placeholder). */
const tabLabel = (tab: TabState): string => {
  if (hasRealName(tab.request)) return tab.request.name!;
  return suggestedRequestName(tab.request) || "New Request";
};

/** True when a tab is untouched since creation (safe to replace on loadRequest). */
const isPristine = (t: TabState): boolean =>
  !t.isDirty &&
  !t.loading &&
  !t.response &&
  !t.request.url &&
  !hasRealName(t.request);

/** F55: Compute which fields changed between current request and last-saved snapshot. */
const DIFF_FIELDS: Array<{ key: keyof RequestState; label: string }> = [
  { key: "url", label: "URL" },
  { key: "method", label: "Method" },
  { key: "name", label: "Name" },
  { key: "body", label: "Body" },
  { key: "bodyType", label: "Body type" },
  { key: "headers", label: "Headers" },
  { key: "queryParams", label: "Query params" },
  { key: "urlencoded", label: "URL-encoded" },
  { key: "formData", label: "Form data" },
  { key: "authType", label: "Auth type" },
  { key: "authData", label: "Auth data" },
];
const computeDirtyFields = (current: RequestState, snapshot?: Partial<RequestState>): string[] => {
  if (!snapshot) return [];
  return DIFF_FIELDS
    .filter(({ key }) => {
      const cur = current[key];
      const sav = snapshot[key];
      return JSON.stringify(cur) !== JSON.stringify(sav);
    })
    .map(({ label }) => label);
};

/* ─── Styled Components ───────────────────────────────────── */

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: transparent;
`;

const loadingAnimation = keyframes`
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
`;

const LoadingBar = styled.div<{ $active: boolean }>`
  height: 2px;
  display: ${({ $active }) => ($active ? "block" : "none")};
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.accent},
    ${({ theme }) => theme.accent2},
    ${({ theme }) => theme.accent}
  );
  background-size: 200% 100%;
  animation: ${loadingAnimation} 1.2s linear infinite;
  flex-shrink: 0;
`;

const TypeToggleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: ${({ theme }) => theme.surface};
  border-bottom: 1px solid ${({ theme }) => theme.border};
  flex-shrink: 0;
`;

const TypeToggle = styled.div`
  display: inline-flex;
  padding: 2px;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 6px;
  background: ${({ theme }) => theme.surface2};
`;

const TypeSegment = styled.button<{ $active: boolean }>`
  padding: 3px 12px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  background: ${({ $active, theme }) => ($active ? theme.accent : "transparent")};
  color: ${({ $active, theme }) => ($active ? theme.accentFg : theme.muted)};
  &:hover:not(:disabled) {
    color: ${({ $active, theme }) => ($active ? theme.accentFg : theme.fg)};
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const SslRow = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 14px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
  background: ${({ theme }) => theme.surface};
  flex-shrink: 0;
  flex-wrap: wrap;

  label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    white-space: nowrap;
  }

  input[type="checkbox"] {
    accent-color: ${({ theme }) => theme.accent};
  }
`;

const RowDivider = styled.span`
  width: 1px;
  height: 14px;
  background: ${({ theme }) => theme.border};
  flex-shrink: 0;
`;

const OptionIcon = styled(Icon)`
  color: ${({ theme }) => theme.muted};
  flex-shrink: 0;
`;

const SslWarning = styled.span`
  font-size: 10px;
  font-weight: 600;
  color: ${({ theme }) => theme.error};
  background: color-mix(in srgb, ${({ theme }) => theme.error} 14%, transparent);
  border: 1px solid color-mix(in srgb, ${({ theme }) => theme.error} 35%, transparent);
  padding: 1px 6px;
  border-radius: 8px;
`;

const SslNote = styled.span`
  font-size: 10px;
  font-weight: 500;
  color: ${({ theme }) => theme.info};
  background: color-mix(in srgb, ${({ theme }) => theme.info} 12%, transparent);
  border: 1px solid color-mix(in srgb, ${({ theme }) => theme.info} 30%, transparent);
  padding: 1px 6px;
  border-radius: 8px;
`;

const TimeoutInput = styled.input`
  width: 72px;
  background: ${({ theme }) => theme.inputBg};
  border: 1px solid ${({ theme }) => theme.border};
  color: ${({ theme }) => theme.fg};
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  font-family: monospace;
  outline: none;

  &:focus {
    border-color: ${({ theme }) => theme.accent};
  }
`;

const UsedVarsStrip = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  padding: 3px 14px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background: color-mix(in srgb, ${({ theme }) => theme.surface} 92%, transparent);
  flex-shrink: 0;
`;

const VarsLabel = styled.span`
  font-size: 10px;
  opacity: 0.5;
  margin-right: 2px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const VarChip = styled.span<{ $resolved: boolean; $dynamic?: boolean }>`
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  font-family: monospace;
  user-select: none;
  cursor: default;

  ${({ $resolved, $dynamic, theme }) =>
    $dynamic
      ? css`
          background: color-mix(in srgb, ${theme.info} 18%, transparent);
          color: ${theme.info};
          border: 1px solid color-mix(in srgb, ${theme.info} 35%, transparent);
        `
      : $resolved
        ? css`
            background: ${theme.badgeBg};
            color: ${theme.badgeFg};
            border: 1px solid ${theme.badgeBg};
          `
        : css`
            background: color-mix(in srgb, ${theme.error} 18%, transparent);
            color: ${theme.error};
            border: 1px solid color-mix(in srgb, ${theme.error} 35%, transparent);
          `}
`;

const MainArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: transparent;
`;

const SplitPane = styled.div`
  flex: 1;
  display: flex;
  overflow: hidden;
`;

const Resizer = styled.div`
  width: 4px;
  cursor: col-resize;
  background: ${({ theme }) => theme.border};
  flex-shrink: 0;
  transition: background 0.15s;
  &:hover {
    background: ${({ theme }) => theme.accent};
  }
`;

/* ─── Component ───────────────────────────────────────────── */

export const MainPanel: React.FC = () => {
  /* ── State ───────────────────────────────────────── */
  const [tabs, setTabs] = useState<TabState[]>(() => [createTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].id);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [activeEnvId, setActiveEnvId] = useState<string | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [envManagerOpen, setEnvManagerOpen] = useState(false);
  const [editingEnvForModal, setEditingEnvForModal] = useState<Environment | null>(null);
  const [codeGenOpen, setCodeGenOpen] = useState(false);
  const [codeGenEnabled, setCodeGenEnabled] = useState(false);
  const [varsHelpOpen, setVarsHelpOpen] = useState(false);
  const [chainVars, setChainVars] = useState<Record<string, string>>({});
  const [oauthFetching, setOauthFetching] = useState(false);
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [themeKind, setThemeKind] = useState<number>(2);
  const headerPresets = settings.headerPresets;

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  const tabsRef = useRef(tabs);
  const activeTabRef = useRef(activeTab);
  const activeTabIdRef = useRef(activeTabId);
  const sendRef = useRef<() => void>(() => {});
  const activeEnvIdRef = useRef<string | null>(null);
  const pendingSecretResolves = useRef(new Map<string, (value: string) => void>());
  const [wsSessions, setWsSessions] = useState<Record<string, WsSessionState>>({});

  /* ── Helpers ─────────────────────────────────────── */
  const post = useCallback(
    (message: any) => vscodeApi?.postMessage({ ...message, sessionId: SESSION_ID }),
    [],
  );

  const patchTab = useCallback((id: string, mutator: (t: TabState) => TabState) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? mutator(t) : t)));
  }, []);

  const updateActiveRequest = (updates: Partial<RequestState>) => {
    const id = activeTabIdRef.current;
    setTabs((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, request: { ...t.request, ...updates }, isDirty: true }
          : t,
      ),
    );
    if (updates.name) post({ command: "updateTitle", title: updates.name, tabId: id });
  };

  const selectTab = (id: string) => {
    setActiveTabId(id);
    const t = tabsRef.current.find((x) => x.id === id);
    if (t) post({ command: "updateTitle", title: tabLabel(t), tabId: id });
  };

  const addTab = () => {
    const t = createTab();
    setTabs((prev) => [...prev, t]);
    setActiveTabId(t.id);
    post({ command: "updateTitle", title: tabLabel(t), tabId: t.id });
  };

  const closeTab = (id: string) => {
    if (tabsRef.current.length <= 1) return;
    const idx = tabsRef.current.findIndex((t) => t.id === id);
    const next = tabsRef.current.filter((t) => t.id !== id);
    setTabs(next);
    if (wsSessions[id]) {
      post({ command: "wsDisconnect", tabId: id });
      setWsSessions((prev) => {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      });
    }
    if (activeTabIdRef.current === id) {
      const neighbor = next[Math.max(0, idx - 1)] ?? next[0];
      setActiveTabId(neighbor.id);
      post({ command: "updateTitle", title: tabLabel(neighbor), tabId: neighbor.id });
    }
  };

  const handleTypeChange = (type: "rest" | "ws") => {
    const id = activeTabIdRef.current;
    const t = tabsRef.current.find((x) => x.id === id);
    if (t?.request.type === "ws" && type !== "ws" && wsSessions[id]) {
      post({ command: "wsDisconnect", tabId: id });
      setWsSessions((prev) => {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      });
    }
    updateActiveRequest({ type });
  };

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

    const handler = (event: MessageEvent) => {
      const msg = event.data;
      switch (msg.command) {
        case "loadRequest": {
          const { _collectionName, _groupId, ...reqData } = msg.data;
          const current = tabsRef.current.find((t) => t.id === activeTabIdRef.current);
          // Reuse the untouched initial tab so the first opened request
          // replaces the empty placeholder rather than stacking a second tab.
          const replace =
            tabsRef.current.length === 1 && current !== undefined && isPristine(current);
          if (replace) {
            const t: TabState = {
              ...createTab(reqData),
              id: current.id,
              savedCollectionName: _collectionName ?? null,
              savedGroupId: _groupId ?? undefined,
            };
            setTabs([t]);
            post({ command: "updateTitle", title: tabLabel(t), tabId: t.id });
          } else {
            const t = createTab(reqData);
            t.savedCollectionName = _collectionName ?? null;
            t.savedGroupId = _groupId ?? undefined;
            setTabs((prev) => [...prev, t]);
            setActiveTabId(t.id);
            post({ command: "updateTitle", title: tabLabel(t), tabId: t.id });
          }
          if (reqData.activeEnvironmentId) {
            setActiveEnvId(reqData.activeEnvironmentId);
            post({ command: "setActiveEnvironment", id: reqData.activeEnvironmentId });
          }
          break;
        }
        case "setEnvironments":
          setEnvironments(msg.environments ?? []);
          setActiveEnvId(msg.activeEnvId ?? null);
          break;
        case "envSecretValue": {
          const resolve = pendingSecretResolves.current.get(msg.id);
          if (resolve) {
            resolve(msg.value ?? "");
            pendingSecretResolves.current.delete(msg.id);
          }
          break;
        }
        case "collections":
          setCollections(msg.data ?? []);
          break;
        case "loadSettings":
        case "setSettings":
          setSettings(msg.settings ?? DEFAULT_SETTINGS);
          break;
        case "requestStart":
          patchTab(msg.tabId ?? activeTabIdRef.current, (t) => ({
            ...t,
            loading: true,
            response: null,
            schemaValidation: null,
            requestInfo: { networkLogs: [] },
          }));
          break;
        case "sessionChainVarsUpdated":
          setChainVars(msg.variables ?? {});
          break;
        case "oauthTokenResult": {
          setOauthFetching(false);
          const tid = msg.tabId ?? activeTabIdRef.current;
          if (msg.error) {
            patchTab(tid, (t) => ({ ...t, oauthStatus: { state: "error", text: msg.error } }));
            break;
          }
          patchTab(tid, (t) => ({
            ...t,
            request: {
              ...t.request,
              authData: {
                ...t.request.authData,
                accessToken: msg.accessToken,
                refreshToken: msg.refreshToken ?? t.request.authData.refreshToken,
                tokenExpiresAt: msg.expiresAt ?? t.request.authData.tokenExpiresAt,
                tokenType: msg.tokenType ?? t.request.authData.tokenType,
                tokenScope: msg.scope ?? t.request.authData.tokenScope,
              },
            },
            oauthStatus: {
              state: "success",
              text:
                msg.source === "cache"
                  ? "Using cached access token"
                  : msg.source === "refresh"
                    ? "Access token refreshed"
                    : "Access token obtained",
            },
          }));
          break;
        }
        case "streamStart": {
          const tid = msg.tabId ?? activeTabIdRef.current;
          setTabs((prev) =>
            prev.map((t) =>
              t.id === tid
                ? {
                    ...t,
                    loading: true,
                    response: {
                      status: msg.status || 0,
                      statusText: msg.statusText || "",
                      headers: msg.headers || {},
                      body: t.response?.body || "",
                      duration: 0,
                      size: 0,
                      isStreaming: true,
                    },
                  }
                : t,
            ),
          );
          break;
        }
        case "streamChunk": {
          const tid = msg.tabId ?? activeTabIdRef.current;
          setTabs((prev) =>
            prev.map((t) =>
              t.id === tid
                ? {
                    ...t,
                    loading: true,
                    response: {
                      status: t.response?.status ?? 0,
                      statusText: t.response?.statusText ?? "",
                      headers: t.response?.headers ?? {},
                      body: (t.response?.body || "") + (msg.chunk || ""),
                      size: (t.response?.size || 0) + (msg.size || 0),
                      duration: t.response?.duration ?? 0,
                      isStreaming: true,
                    },
                  }
                : t,
            ),
          );
          break;
        }
        case "requestComplete": {
          const tid = msg.tabId ?? activeTabIdRef.current;
          setTabs((prev) =>
            prev.map((t) =>
              t.id === tid
                ? {
                    ...t,
                    loading: false,
                    // F26: store the current response as previousResponse before setting the new one
                    previousResponse: t.response,
                    response: { ...msg.response, isStreaming: false },
                    schemaValidation: msg.schemaValidation ?? null,
                    requestInfo: {
                      ...(msg.requestInfo || {}),
                      networkLogs: t.requestInfo?.networkLogs || [],
                    },
                  }
                : t,
            ),
          );
          // If the current request has a post-response script, delegate to extension host
          try {
            const script = tabsRef.current.find((x) => x.id === tid)?.request?.script;
            if (script && script.trim().length > 0) {
              // Mark script as running so the UI can show a spinner
              patchTab(tid, (t) => ({
                ...t,
                requestInfo: { ...(t.requestInfo || {}), scriptRunning: true },
              }));
              // Send script + response to extension host for CSP-free execution
              post({ command: "runScript", script, response: msg.response, tabId: tid });
            }
          } catch {
            /* ignore */
          }
          break;
        }
        case "scriptResult": {
          const tid = msg.tabId ?? activeTabIdRef.current;
          // F40: merge rather than replace so request-level and collection-level
          // script results both accumulate on the same tab.
          patchTab(tid, (t) => ({
            ...t,
            requestInfo: {
              ...(t.requestInfo || {}),
              scriptRunning: false,
              scriptLogs: [
                ...(t.requestInfo?.scriptLogs || []),
                ...(msg.result?.logs || []),
              ],
              scriptSuccess: msg.result?.success !== false,
              scriptError: msg.result?.error,
              scriptVariables: {
                ...(t.requestInfo?.scriptVariables || {}),
                ...(msg.result?.variables || {}),
              },
              scriptTests: {
                ...(t.requestInfo?.scriptTests || {}),
                ...(msg.result?.tests || {}),
              },
              scriptTestMessages: {
                ...(t.requestInfo?.scriptTestMessages || {}),
                ...(msg.result?.testMessages || {}),
              },
            },
          }));
          break;
        }
        case "requestError": {
          const tid = msg.tabId ?? activeTabIdRef.current;
          patchTab(tid, (t) => ({
            ...t,
            loading: false,
            response: {
              status: 0,
              statusText: "Error",
              headers: {},
              body: msg.error ?? "Unknown error",
              duration: msg.duration ?? 0,
              size: 0,
            },
          }));
          break;
        }
        case "requestCancelled": {
          const tid = msg.tabId ?? activeTabIdRef.current;
          patchTab(tid, (t) => ({
            ...t,
            loading: false,
            response: {
              status: 0,
              statusText: "Cancelled",
              headers: {},
              body: "Request was cancelled",
              duration: msg.duration ?? 0,
              size: 0,
            },
          }));
          break;
        }
        case "setTheme":
          setThemeKind(msg.kind ?? 2);
          applyThemeClass(msg.kind ?? 2);
          break;
        case "getCurrentRequest":
          post({ command: "currentRequest", request: activeTabRef.current.request });
          break;
        case "triggerSendRequest":
          sendRef.current();
          break;
        case "debugLog": {
          const tid = msg.tabId ?? activeTabIdRef.current;
          try {
            const ts = new Date().toLocaleTimeString();
            const entry = `${ts} — ${msg.data?.stage || "debug"}: ${JSON.stringify(msg.data?.info || {})}`;
            patchTab(tid, (t) => ({
              ...t,
              requestInfo: {
                ...(t.requestInfo || {}),
                networkLogs: [...(t.requestInfo?.networkLogs || []), entry],
              },
            }));
          } catch (e) {
            console.error("Failed to append debugLog", e);
          }
          break;
        }
        case "wsStatus": {
          const tid = msg.tabId ?? activeTabIdRef.current;
          setWsSessions((prev) => ({
            ...prev,
            [tid]: {
              ...(prev[tid] || { status: "idle", log: [] }),
              status: msg.state ?? "idle",
              protocol: msg.protocol ?? prev[tid]?.protocol,
              error: msg.error ?? undefined,
            },
          }));
          break;
        }
        case "wsLog": {
          const tid = msg.tabId ?? activeTabIdRef.current;
          setWsSessions((prev) => ({
            ...prev,
            [tid]: {
              ...(prev[tid] || { status: "idle", log: [] }),
              log: [...(prev[tid]?.log || []), msg.entry],
            },
          }));
          break;
        }
        case "wsClear": {
          const tid = msg.tabId ?? activeTabIdRef.current;
          setWsSessions((prev) => ({
            ...prev,
            [tid]: { status: "idle", log: [] },
          }));
          break;
        }
      }
    };

    window.addEventListener("message", handler);

    // Signal that the webview is ready to receive messages
    post({ command: "webviewReady" });

    return () => window.removeEventListener("message", handler);
  }, [post, patchTab]);

  // keep refs in sync with latest state for use in event handlers
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);
  useEffect(() => {
    activeEnvIdRef.current = activeEnvId;
  }, [activeEnvId]);

  /* Build the request object, injecting auth headers/params */
  const buildPayload = useCallback((): RequestState => {
    // Auth headers (bearer/basic/apikey/oauth2/jwt/sigv4/hawk) are applied
    // host-side after variable resolution so `{{var}}` placeholders resolve
    // correctly and crypto-based schemes (JWT signing, SigV4) can run.
    return { ...activeTab.request };
  }, [activeTab]);

  // Send the built payload (with injected auth headers) for execution
  const handleSend = useCallback(() => {
    // enable code generation once a send occurs
    setCodeGenEnabled(true);
    post({
      command: "executeRequest",
      request: buildPayload(),
      savedRequest: activeTab.request,
      tabId: activeTab.id,
    });
  }, [buildPayload, activeTab, post]);

  // Ask the extension host to run an OAuth 2.0 flow and cache the token
  const handleGetOAuthToken = useCallback(
    (config: OAuth2ConfigPayload) => {
      setOauthFetching(true);
      patchTab(activeTabIdRef.current, (t) => ({ ...t, oauthStatus: { state: "none" } }));
      post({ command: "getOAuthToken", config, tabId: activeTabIdRef.current });
    },
    [post, patchTab],
  );

  // Normal send handler
  const handleSendGuarded = handleSend;

  useEffect(() => {
    sendRef.current = handleSend;
  }, [handleSend]);

  // Cancel the in-flight request
  const handleCancel = useCallback(() => {
    post({ command: "cancelRequest", tabId: activeTab.id });
  }, [activeTab.id, post]);

  // Ctrl+S / Cmd+S — silent save if already in a collection, otherwise open SaveModal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        const t = activeTabRef.current;
        if (t?.savedCollectionName) {
          post({
            command: "saveToCollection",
            request: { ...t.request, activeEnvironmentId: activeEnvIdRef.current },
            collectionName: t.savedCollectionName,
            groupId: t.savedGroupId,
            tabId: t.id,
          });
          patchTab(t.id, (tt) => ({ ...tt, isDirty: false, savedSnapshot: { ...tt.request } }));
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
  }, [handleSend, post, patchTab]);

  // Safely decode a URI component, falling back to the raw string on malformed input
  const safeDecode = (s: string): string => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };

  // Sync query params from a typed URL back to the params tab.
  // Note: typing a URL must NOT rename the request — the suggested name is
  // only shown (and applied) when the user saves the request.
  const handleUrlChange = (rawUrl: string) => {
    const qIdx = rawUrl.indexOf("?");
    if (qIdx === -1) {
      // If the user removed the query string entirely from the URL input,
      // clear any active query params so they don't reappear when the
      // derived display URL is recalculated on blur.
      const disabledParams = activeTab.request.queryParams.filter(
        (p) => p.enabled === false,
      );
      updateActiveRequest({ url: rawUrl, queryParams: disabledParams });
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
    const disabledParams = activeTab.request.queryParams.filter(
      (p) => p.enabled === false,
    );
    updateActiveRequest({
      url: baseUrl,
      queryParams: [...parsedParams, ...disabledParams],
    });
  };

  const handleSave = (
    reqName: string,
    collectionName: string,
    groupId?: string,
  ) => {
    const id = activeTabIdRef.current;
    post({
      command: "saveToCollection",
      request: { ...activeTab.request, name: reqName, activeEnvironmentId: activeEnvId },
      collectionName,
      groupId,
      tabId: id,
    });
    setTabs((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              savedCollectionName: collectionName,
              savedGroupId: groupId,
              request: { ...t.request, name: reqName },
              isDirty: false,
              savedSnapshot: { ...t.request, name: reqName },
            }
          : t,
      ),
    );
    post({ command: "updateTitle", title: reqName, tabId: id });
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

  const handleRevealSecret = useCallback(
    (envId: string, varKey: string) =>
      new Promise<string | undefined>((resolve) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        pendingSecretResolves.current.set(id, resolve);
        post({ command: "getEnvSecretValue", id, envId, varKey });
      }),
    [post],
  );

  const handleImportEnvironment = () => {
    post({ command: "importEnvironment" });
  };

  const handleExportEnvironment = (env: Environment) => {
    post({ command: "exportEnvironment", env });
  };

  const handleSaveSettings = (newSettings: SettingsState) => {
    const merged: SettingsState = {
      ...newSettings,
      headerPresets: settings.headerPresets,
      responseViewer: settings.responseViewer,
    };
    setSettings(merged);
    post({ command: "saveSettings", settings: merged });
    setSettingsModalOpen(false);
  };

  const handleViewerChange = (responseViewer: ResponseViewerSettings) => {
    const next: SettingsState = { ...settings, responseViewer };
    setSettings(next);
    post({ command: "saveSettings", settings: next });
  };

  const handleSaveHeaderPreset = (name: string, headers: KVItem[]) => {
    const preset: HeaderPreset = {
      id: `preset-${Date.now().toString(36)}`,
      name,
      headers,
    };
    const next: SettingsState = { ...settings, headerPresets: [...settings.headerPresets, preset] };
    setSettings(next);
    post({ command: "saveSettings", settings: next });
  };

  const handleDeleteHeaderPreset = (id: string) => {
    const next: SettingsState = {
      ...settings,
      headerPresets: settings.headerPresets.filter((p) => p.id !== id),
    };
    setSettings(next);
    post({ command: "saveSettings", settings: next });
  };

  const handleDownloadFile = (payload: {
    fileName: string;
    mimeType: string;
    fileBase64: string;
  }) => {
    post({ command: "downloadFile", payload });
  };

  const handleSaveResponse = (payload: {
    body: string;
    contentType?: string;
    suggestName?: string;
  }) => {
    post({ command: "saveResponseToFile", payload });
  };

  /* ── Render ──────────────────────────────────────── */
  const activeEnvironment =
    environments.find((env) => env.id === activeEnvId) || null;

  // Merge the active environment's variables with the collection's variables
  // (F42) and the window session's chain variables so `{{token}}` (script- or
  // collection-defined) renders resolved + hoverable.
  const displayVariables = React.useMemo(() => {
    const activeCol = collections.find(
      (c) => c.id === activeTab.request._collectionId,
    );
    const colVars = activeCol?.variables ?? [];
    const envVars = activeEnvironment?.variables ?? [];
    const chainEntries = Object.entries(chainVars).map(([key, value]) => ({
      key,
      value,
    }));
    return [...colVars, ...envVars, ...chainEntries];
  }, [collections, activeTab.request._collectionId, activeEnvironment, chainVars]);

  const displayEnvironment = React.useMemo(
    () =>
      activeEnvironment
        ? { ...activeEnvironment, variables: displayVariables }
        : { id: "chain-only", name: "", variables: displayVariables },
    [activeEnvironment, displayVariables],
  );

  // Compute which env variables are referenced in the current request
  const usedVars = React.useMemo(() => {
    const allVarKeys = new Set(
      (activeEnvironment?.variables ?? []).map((v) => v.key),
    );
    const activeCol = collections.find(
      (c) => c.id === activeTab.request._collectionId,
    );
    (activeCol?.variables ?? []).forEach((v) => allVarKeys.add(v.key));
    Object.keys(chainVars).forEach((k) => allVarKeys.add(k));
    const searchText = [
      activeTab.request.url,
      activeTab.request.body || "",
      ...(activeTab.request.headers || []).map((h) => `${h.key} ${h.value}`),
      ...(activeTab.request.queryParams || []).map((p) => `${p.key} ${p.value}`),
    ].join(" ");
    const matches = [...searchText.matchAll(/\{\{([^}]+)}}/g)].map(
      (m) => m[1],
    );
    const unique = [...new Set(matches)];
    return unique.map((rawName) => {
      const isDynamic = rawName.startsWith("$");
      const name = isDynamic ? rawName.slice(1) : rawName;
      const resolved = isDynamic
        ? isDynamicVariableToken(name)
        : allVarKeys.has(name);
      return { name: rawName, resolved, dynamic: isDynamic };
    });
  }, [
    activeTab.request.url,
    activeTab.request.body,
    activeTab.request.headers,
    activeTab.request.queryParams,
    activeTab.request._collectionId,
    collections,
    activeEnvironment,
    chainVars,
  ]);

  return (
    <Container>
      <TopBar
        name={activeTab.request.name}
        isDirty={activeTab.isDirty}
        dirtyFields={computeDirtyFields(activeTab.request, activeTab.savedSnapshot)}
        environments={environments}
        activeEnvId={activeEnvId}
        onNameChange={(name) => updateActiveRequest({ name })}
        onEnvChange={handleEnvChange}
        onManageEnvs={() => {
          setEditingEnvForModal(null);
          setEnvManagerOpen(true);
        }}
        onEditEnv={(env) => {
          setEditingEnvForModal(env);
          setEnvManagerOpen(true);
        }}
        onDeleteEnv={handleDeleteEnvironment}
        onAddEnv={() => {
          setEditingEnvForModal({ id: '', name: '', variables: [{ key: '', value: '' }] });
          setEnvManagerOpen(true);
        }}
        onOpenSettings={() => setSettingsModalOpen(true)}
        onOpenVarsHelp={() => setVarsHelpOpen(true)}
        onGenerateCode={() => setCodeGenOpen(true)}
        codegenEnabled={codeGenEnabled}
      />

      <TabBar
        tabs={tabs.map((t) => ({
          id: t.id,
          label: tabLabelShort(t),
          dirty: t.isDirty,
          active: t.id === activeTab.id,
          loading: t.loading,
          method: t.request.method,
        }))}
        onSelect={selectTab}
        onClose={closeTab}
        onAdd={addTab}
      />

      {/* Animated loading bar */}
      <LoadingBar $active={activeTab.loading} />

      <TypeToggleRow>
        <TypeToggle>
          <TypeSegment
            data-testid="type-toggle-rest"
            $active={activeTab.request.type !== "ws"}
            onClick={() => handleTypeChange("rest")}
          >
            REST
          </TypeSegment>
          <TypeSegment
            data-testid="type-toggle-ws"
            $active={activeTab.request.type === "ws"}
            onClick={() => handleTypeChange("ws")}
          >
            WebSocket
          </TypeSegment>
        </TypeToggle>
      </TypeToggleRow>

      {activeTab.request.type === "ws" ? (
        <MainArea>
          <WebSocketClientView
            tabId={activeTab.id}
            request={activeTab.request}
            session={wsSessions[activeTab.id] || { status: "idle", log: [] }}
            onUpdate={updateActiveRequest}
            onConnect={(url, token) =>
              post({ command: "wsConnect", tabId: activeTab.id, url, token })
            }
            onDisconnect={() =>
              post({ command: "wsDisconnect", tabId: activeTab.id })
            }
            onSend={(data, binary) =>
              post({ command: "wsSend", tabId: activeTab.id, data, binary })
            }
            onClear={() =>
              setWsSessions((prev) => ({
                ...prev,
                [activeTab.id]: { status: "idle", log: [] },
              }))
            }
          />
        </MainArea>
      ) : (
        <>
      <UrlBar
        method={activeTab.request.method}
        url={activeTab.request.url}
        loading={activeTab.loading}
        queryParams={activeTab.request.queryParams}
        environment={displayEnvironment}
        onMethodChange={(method) => updateActiveRequest({ method })}
        onUrlChange={handleUrlChange}
        onSend={handleSendGuarded}
        onCancel={handleCancel}
        onSave={() => setSaveModalOpen(true)}
      />

      {/* Per-request options */}
      <SslRow>
        <label
          title="Uncheck to allow self-signed or untrusted certificates for this request"
          data-testid="verify-ssl-toggle"
        >
          <OptionIcon icon={faShieldHalved} size={12} />
          <input
            type="checkbox"
            checked={activeTab.request.rejectUnauthorized !== false}
            onChange={(e) =>
              updateActiveRequest({ rejectUnauthorized: e.target.checked })
            }
          />
          Verify SSL Certificate
        </label>
        {activeTab.request.rejectUnauthorized === false && (
          <SslWarning>Insecure — TLS not verified</SslWarning>
        )}

        <label
          title="Automatically follow 3xx redirect responses (max 10 hops)"
          data-testid="follow-redirects-toggle"
        >
          <OptionIcon icon={faArrowsRotate} size={12} />
          <input
            type="checkbox"
            checked={activeTab.request.followRedirects !== false}
            onChange={(e) =>
              updateActiveRequest({ followRedirects: e.target.checked })
            }
          />
          Follow Redirects
        </label>

        <label
          title="Send over HTTP/2 (ALPN). HTTP/2 bypasses the configured proxy."
          data-testid="http2-toggle"
        >
          <OptionIcon icon={faBolt} size={12} />
          <input
            type="checkbox"
            checked={!!activeTab.request.useHttp2}
            onChange={(e) =>
              updateActiveRequest({ useHttp2: e.target.checked })
            }
          />
          HTTP/2
          {!!activeTab.request.useHttp2 && <SslNote>bypasses proxy</SslNote>}
        </label>

        <RowDivider />

        <label
          title="Request timeout in milliseconds. Leave empty to use the default from Settings."
        >
          <OptionIcon icon={faClock} size={12} />
          Timeout (ms)
          <TimeoutInput
            type="number"
            min={1}
            data-testid="timeout-input"
            placeholder={String(
              settings.defaultTimeout ?? DEFAULT_SETTINGS.defaultTimeout,
            )}
            value={activeTab.request.timeout ?? ""}
            onChange={(e) =>
              updateActiveRequest({
                timeout:
                  e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </label>
      </SslRow>

      {/* Used environment variables strip */}
      {usedVars && usedVars.length > 0 && (
        <UsedVarsStrip>
          <VarsLabel>Vars:</VarsLabel>
          {usedVars.map((v) => {
            const displayName = v.dynamic
              ? `{{$${v.name.slice(1)}}}`
              : `{{${v.name}}}`;
            return (
              <VarChip
                key={v.name}
                $resolved={v.resolved}
                $dynamic={v.dynamic}
                title={
                  v.dynamic
                    ? `${displayName} — dynamic variable, resolved fresh on each request (e.g. ${previewDynamicVariable(v.name.slice(1))})`
                    : v.resolved
                      ? "Resolved in active environment"
                      : "Not found in active environment"
                }
              >
                {displayName}
              </VarChip>
            );
          })}
        </UsedVarsStrip>
      )}

      {/* Split pane */}
      <MainArea>
        <SplitPane>
          <RequestPane
            request={activeTab.request}
            onUpdate={updateActiveRequest}
            themeKind={themeKind}
            environment={displayEnvironment}
            oauthFetching={oauthFetching}
            oauthStatus={activeTab.oauthStatus}
            onGetOAuthToken={handleGetOAuthToken}
            headerPresets={headerPresets}
            onSaveHeaderPreset={handleSaveHeaderPreset}
            onDeleteHeaderPreset={handleDeleteHeaderPreset}
          />
          <Resizer />
          <ResponsePane
            response={activeTab.response}
            previousResponse={activeTab.previousResponse}
            loading={activeTab.loading}
            request={activeTab.requestInfo}
            schemaValidation={activeTab.schemaValidation}
            onDownloadFile={handleDownloadFile}
            onSaveResponse={handleSaveResponse}
            post={post}
            viewer={settings.responseViewer}
            onViewerChange={handleViewerChange}
          />
        </SplitPane>
      </MainArea>
        </>
      )}

      <SaveModal
        open={saveModalOpen}
        requestName={
          hasRealName(activeTab.request)
            ? activeTab.request.name
            : suggestedRequestName(activeTab.request)
        }
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

      <VariablesHelpModal
        open={varsHelpOpen}
        onClose={() => setVarsHelpOpen(false)}
      />

      <EnvManagerModal
        open={envManagerOpen}
        environments={environments}
        activeEnvId={activeEnvId}
        initialEditingEnv={editingEnvForModal}
        onClose={() => {
          setEditingEnvForModal(null);
          setEnvManagerOpen(false);
        }}
        onSetActive={(id) => {
          handleEnvChange(id);
        }}
        onSave={handleSaveEnvironment}
        onDelete={handleDeleteEnvironment}
        onRevealSecret={handleRevealSecret}
        onImport={handleImportEnvironment}
        onExport={handleExportEnvironment}
      />

      <CodeGenModal
        open={codeGenOpen}
        request={buildPayload()}
        environment={displayEnvironment}
        defaultHeaders={settings.defaultHeaders}
        onClose={() => setCodeGenOpen(false)}
      />
    </Container>
  );
};
