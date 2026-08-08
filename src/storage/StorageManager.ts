import * as vscode from "vscode";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { resolveDynamicVariables } from "../core";
import {
  mergeVariableScopes,
  applyVariableMap,
  type ScopedVariables,
} from "../core/variableScope";
import type { OAuth2Token, AuthType, AuthDataLike } from "../core";
import type { HeaderPreset } from "../core/headerPresets";

export interface EnvVariable {
  key: string;
  value: string;
  timestamp?: number; // timestamp for script variables
  isSecret?: boolean; // true → value stored in SecretStorage, not globalState
}

export interface Environment {
  id: string;
  name: string;
  variables: EnvVariable[];
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  name: string;
  status: number;
  duration: number;
  request?: any;
  response?: any;
  error?: string;
  pinned?: boolean; // F57: pinned entries float to the top of history
  activeEnvironmentId?: string | null; // Environment used when this request was made
}

export interface CollectionGroup {
  id: string;
  name: string;
  requests?: any[];
  groups?: CollectionGroup[];
}

export interface Collection {
  id: string;
  name: string;
  requests?: any[];
  groups?: CollectionGroup[];
  /** F12: collection-level auth inherited by requests with authType "inherit". */
  auth?: {
    authType?: AuthType;
    authData?: AuthDataLike;
  };
  /** F42: collection-level variables inherited by every request in the collection. */
  variables?: EnvVariable[];
}

export interface CertEntry {
  hostname: string;
  certPath: string;
  keyPath: string;
  caPath: string;
}

export interface SoapSecurityEntry {
  hostname: string;
  username: string;
  password: string;
  /** Outgoing: inject a WS-Security UsernameToken. */
  useUsername?: boolean;
  /** Outgoing: XML-encrypt the request body. */
  encrypt?: boolean;
  /** Incoming: decrypt an encrypted response body. */
  decrypt?: boolean;
  /** Truststore: recipient certificate (PEM) — public key source for encryption. */
  certPath?: string;
  /** Keystore: private key file (PEM) for response decryption. */
  keyPath?: string;
  /** Keystore: PKCS#12 (.p12/.pfx) bundle with cert + private key. */
  p12Path?: string;
  p12Password?: string;
  /** For decryption: where the keystore private key comes from. */
  keystore?: "p12" | "pem";
}

export interface SettingsState {
  proxy: string;
  proxyAuthorization: string;
  noProxy: string;
  certificates: CertEntry[];
  showActivityLog: boolean;
  defaultTimeout: number;
  notifyOnLongRequest: boolean;
  longRequestThresholdMs: number;
  defaultHeaders: {
    userAgent: boolean;
    requestId: boolean;
    correlationId: boolean;
    date: boolean;
    custom: Array<{ key: string; value: string; enabled?: boolean }>;
  };
  soapSecurity: SoapSecurityEntry[];
  headerPresets: HeaderPreset[];
}

export class StorageManager {
  private listeners: Array<() => void> = [];
  private expansionStates: Record<string, boolean> = {};
  private housekeepingInterval: NodeJS.Timeout | null = null;
  private readonly SCRIPT_VAR_TTL = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
  private historyCache: HistoryEntry[] = [];
  private db: any | null = null;
  private writeQueue: Array<any> = [];
  private processingQueue = false;
  private BODY_FILE_DIR = "bodies";
  private BODY_INLINE_LIMIT = 4 * 1024; // keep bodies inline if <= 4KB
  private readonly DEFAULT_GLOBAL_ENV_ID = "global-environment";
  private readonly DEFAULT_GLOBAL_ENV_NAME = "Global";
  private readonly SECRET_KEY_PREFIX = "restify.env";
  private secretCache = new Map<string, string>();
  /** Per-window chain variables (Postman-style). Keyed by the window session id;
   *  a new window gets a new id → the previous scope is terminated. */
  private sessionChainVars = new Map<string, Record<string, string>>();

  // storageDir: optional file-system directory to persist history to a file
  constructor(
    private globalState: vscode.Memento,
    private storageDir?: string,
    private secretStorage?: vscode.SecretStorage,
  ) {
    this.expansionStates = this.getExpansionStates();

    // Ensure storage directory exists if provided
    if (this.storageDir) {
      try {
        fs.mkdirSync(this.storageDir, { recursive: true });
      } catch(e) {
        console.error("Failed to create storage directory:", e);
        this.storageDir = undefined;
      }
    }

    // Load history into in-memory cache: try LokiJS (pure JS DB) if available, else file, else globalState
    if (this.storageDir) {
      try {
        // Require lokijs at runtime to avoid adding it to the top-level compile-time imports
        // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
        const Loki: any = require("lokijs");

        const dbPath = path.join(this.storageDir, "restify-history.db");
        // Use structured adapter if available for safer file writes
        let adapter: any = undefined;
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
          const LokiFsStructuredAdapter = require("lokijs/src/loki-fs-structured-adapter");
          adapter = new LokiFsStructuredAdapter();
        } catch {
          /* empty */
        }

        this.db = new Loki(dbPath, {
          adapter,
          autosave: true,
          autosaveInterval: 1000,
          autoload: true,
          autoloadCallback: () => {
            const coll =
              this.db.getCollection("history") ||
              this.db.addCollection("history", { indices: ["timestamp"] });
            const rows = coll
              .chain()
              .simplesort("timestamp", true)
              .limit(25)
              .data();
            this.historyCache = rows.map((r: any) => ({ ...r }));
          },
        });
      } catch(e) {
        console.error("LokiJS not available or failed to initialize:", e);
        // Fallback to file/globalState
        const histFile = path.join(this.storageDir, "history.json");
        try {
          if (fs.existsSync(histFile)) {
            const txt = fs.readFileSync(histFile, "utf8");
            this.historyCache = JSON.parse(txt || "[]");
          } else {
            this.historyCache = this.globalState.get("restify.history", []);
            // Persist initial cache to file
            this.persistHistoryToFile().catch((err) =>
              console.error("Persist error:", err),
            );
          }
        } catch (e2) {
          console.error("Failed to load history file:", e2);
          this.historyCache = this.globalState.get("restify.history", []);
        }
      }
    } else {
      this.historyCache = this.globalState.get("restify.history", []);
    }

    this.startHousekeeping();
    this.ensureDefaultGlobalEnvironment();
  }

  private ensureDefaultGlobalEnvironment(): void {
    const environments = this.getEnvironments();
    let changed = false;

    if (!environments.some((env) => env.id === this.DEFAULT_GLOBAL_ENV_ID)) {
      environments.unshift({
        id: this.DEFAULT_GLOBAL_ENV_ID,
        name: this.DEFAULT_GLOBAL_ENV_NAME,
        variables: [],
      });
      changed = true;
    }

    const activeId = this.globalState.get("restify.activeEnv", null);
    if (!activeId || !environments.some((env) => env.id === activeId)) {
      this.globalState.update("restify.activeEnv", this.DEFAULT_GLOBAL_ENV_ID);
      changed = true;
    }

    if (changed) {
      this.globalState.update("restify.environments", environments);
      this.notifyChange();
    }
  }

  // Enqueue a write operation to be processed in background
  private enqueueOp(op: any) {
    this.writeQueue.push(op);
    if (!this.processingQueue) {
      this.processQueue();
    }
  }

  // Public API: save a body to a file (enqueued) and return filename
  saveBodyFile(filename: string, content: string): string {
    if (!this.storageDir) throw new Error("No storageDir configured");
    this.enqueueOp({ type: "writeBody", filename, content });
    return filename;
  }

  private async processQueue(): Promise<void> {
    this.processingQueue = true;
    while (this.writeQueue.length > 0) {
      const op = this.writeQueue.shift();
      try {
        if (!op) continue;
        switch (op.type) {
          case "writeBody": {
            const filePath = path.join(
              this.storageDir || ".",
              this.BODY_FILE_DIR,
              op.filename,
            );
            await fs.promises.mkdir(path.dirname(filePath), {
              recursive: true,
            });
            await fs.promises.writeFile(filePath, op.content, "utf8");
            break;
          }
          case "persistFile": {
            await this.persistHistoryToFile();
            break;
          }
          case "lokiInsert": {
            if (this.db) {
              try {
                const coll =
                  this.db.getCollection("history") ||
                  this.db.addCollection("history", { indices: ["timestamp"] });
                coll.insert(op.entry);
                this.db.saveDatabase((err: any) => {
                  if (err) console.error("Loki save error:", err);
                });
              } catch(e) {
                console.error("Loki insert error:", e);
              }
            }
            break;
          }
          default:
            break;
        }
      } catch (err) {
        console.error("Error processing write queue op:", err);
      }
    }
    this.processingQueue = false;
  }

  private async persistHistoryToFile(): Promise<void> {
    if (!this.storageDir) return Promise.resolve();
    const histFile = path.join(this.storageDir, "history.json");
    const tmpFile = histFile + ".tmp";
    try {
      await fs.promises.writeFile(
        tmpFile,
        JSON.stringify(this.historyCache, null, 2),
        "utf8",
      );
      await fs.promises.rename(tmpFile, histFile);
    } catch (err) {
      console.error("Failed to persist history to file:", err);
      try {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      } catch {
        /* empty */
      }
    }
  }

  // ─── Housekeeping ─────────────────────────────────────────
  /**
   * Start background housekeeping to clean old script variables every 30 minutes
   */
  private startHousekeeping(): void {
    // Only start housekeeping if in Node.js environment (not browser)
    if (typeof setInterval === "undefined") {
      return;
    }
    // Run housekeeping every 30 minutes
    this.housekeepingInterval = setInterval(
      () => {
        this.cleanExpiredScriptVariables();
      },
      30 * 60 * 1000,
    );
  }

  /**
   * Clean expired script variables (older than 2 hours)
   */
  private cleanExpiredScriptVariables(): void {
    const now = Date.now();
    const environments = this.getEnvironments();
    let hasChanges = false;

    environments.forEach((env) => {
      if (env.variables) {
        const beforeCount = env.variables.length;
        // Filter out variables that are older than 2 hours
        env.variables = env.variables.filter((v) => {
          // Keep variables without timestamp (manual variables)
          if (!v.timestamp) return true;
          // Keep variables that are still fresh
          return now - v.timestamp < this.SCRIPT_VAR_TTL;
        });
        // If any variables were removed, mark as changed
        if (env.variables.length < beforeCount) {
          hasChanges = true;
        }
      }
    });

    // Save changes if any variables were removed
    if (hasChanges) {
      this.globalState.update("restify.environments", environments);
      this.notifyChange();
    }
  }

  /**
   * Stop housekeeping (call on extension deactivate)
   */
  stopHousekeeping(): void {
    if (this.housekeepingInterval) {
      clearInterval(this.housekeepingInterval);
      this.housekeepingInterval = null;
    }
  }

  // ─── History ──────────────────────────────────────────────
  private createId(prefix = ""): string {
    try {
      return prefix ? `${prefix}-${randomUUID()}` : randomUUID();
    } catch {
      // Fallback for environments where randomUUID is unavailable.
      return `${prefix}${prefix ? "-" : ""}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  getHistory(): HistoryEntry[] {
    return this.historyCache;
  }

  addToHistory(entry: Omit<HistoryEntry, "id" | "timestamp">): HistoryEntry {
    // Operate on in-memory cache to prevent concurrency races when multiple requests
    // add to history at nearly the same time.
    const newEntry: HistoryEntry = {
      id: this.createId("history"),
      timestamp: new Date().toISOString(),
      ...entry,
    };

    // Offload large bodies to files to avoid serializing big strings repeatedly
    const preparedEntry = { ...newEntry } as any;
    // Handle response body
    if (
      preparedEntry.response &&
      typeof preparedEntry.response.body === "string"
    ) {
      const bodyStr: string = preparedEntry.response.body;
      if (bodyStr.length > this.BODY_INLINE_LIMIT && this.storageDir) {
        const filename = `${newEntry.id}.resp.txt`;
        preparedEntry.response.bodyFile = filename;
        delete preparedEntry.response.body;
        // enqueue body write
        this.enqueueOp({ type: "writeBody", filename, content: bodyStr });
      }
    }
    // Handle request body
    if (
      preparedEntry.request &&
      typeof preparedEntry.request.body === "string"
    ) {
      const bodyStr: string = preparedEntry.request.body;
      if (bodyStr.length > this.BODY_INLINE_LIMIT && this.storageDir) {
        const filename = `${newEntry.id}.req.txt`;
        preparedEntry.request.bodyFile = filename;
        delete preparedEntry.request.body;
        this.enqueueOp({ type: "writeBody", filename, content: bodyStr });
      }
    }

    // Insert into in-memory cache
    this.historyCache.unshift(preparedEntry);
    if (this.historyCache.length > 25) this.historyCache.splice(25);

    // Persist asynchronously to globalState and to file
    this.globalState.update("restify.history", this.historyCache).then(
      () => {},
      (err: any) =>
        console.error("Failed to persist history to globalState:", err),
    );
    if (this.storageDir) this.enqueueOp({ type: "persistFile" });

    // If using LokiJS, enqueue an insert (DB write happens in background)
    if (this.db && typeof this.db.getCollection === "function") {
      this.enqueueOp({ type: "lokiInsert", entry: preparedEntry });
    }

    // Notify listeners synchronously so UI updates immediately from cache
    this.notifyChange();
    return preparedEntry;
  }

  clearHistory(): void {
    const oldEntries = [...this.historyCache];
    this.historyCache = [];
    this.globalState.update("restify.history", []).then(
      () => {
        if (this.storageDir) {
          this.persistHistoryToFile().catch((err) =>
            console.error("Failed to persist history file after clear:", err),
          );
        }
        if (this.db && typeof this.db.getCollection === "function") {
          try {
            const coll = this.db.getCollection("history");
            if (coll) {
              if (typeof coll.clear === "function") {
                coll.clear();
              } else {
                // Fallback: remove all docs via chain
                const rows = coll.find();
                rows.forEach((r: any) => coll.remove(r));
              }
              this.db.saveDatabase((err: any) => {
                if (err) console.error("Loki save error:", err);
              });
            }
          } catch(e) {
            console.error("DB clear error:", e);
          }
        }
      },
      (err: any) => console.error("Failed to clear history:", err),
    );

    // Remove any persisted body files for the old entries
    try {
      if (this.storageDir && oldEntries && oldEntries.length) {
        for (const toDelete of oldEntries) {
          const respFile = toDelete.response?.bodyFile;
          const reqFile = toDelete.request?.bodyFile;
          if (respFile) {
            const fp = path.join(this.storageDir, this.BODY_FILE_DIR, respFile);
            fs.unlink(fp, () => {});
          }
          if (reqFile) {
            const fp = path.join(this.storageDir, this.BODY_FILE_DIR, reqFile);
            fs.unlink(fp, () => {});
          }
        }
      }
    } catch {
      // ignore
    }

    this.notifyChange();
  }

  deleteHistoryItem(id: string): void {
    const toDelete = this.historyCache.find((h) => h.id === id);
    this.historyCache = this.historyCache.filter((h) => h.id !== id);
    this.globalState.update("restify.history", this.historyCache).then(
      () => {
        if (this.storageDir) {
          this.persistHistoryToFile().catch((err) =>
            console.error("Failed to persist history after delete:", err),
          );
        }
      },
      (err: any) => console.error("Failed to delete history item:", err),
    );
    if (this.db && typeof this.db.getCollection === "function") {
      try {
        const coll = this.db.getCollection("history");
        if (coll) {
          const item = coll.findOne({ id });
          if (item) {
            coll.remove(item);
            this.db.saveDatabase((err: any) => {
              if (err) console.error("Loki save error:", err);
            });
          }
        }
      } catch(e) {
        console.error("DB delete error:", e);
      }
    }
    // Remove body files if present
    try {
      if (toDelete) {
        const respFile = toDelete.response?.bodyFile;
        const reqFile = toDelete.request?.bodyFile;
        if (respFile && this.storageDir) {
          const fp = path.join(this.storageDir, this.BODY_FILE_DIR, respFile);
          fs.unlink(fp, () => {});
        }
        if (reqFile && this.storageDir) {
          const fp = path.join(this.storageDir, this.BODY_FILE_DIR, reqFile);
          fs.unlink(fp, () => {});
        }
      }
    } catch {
      // ignore
    }
    this.notifyChange();
  }

  // F57: Toggle whether a history entry is pinned (pinned entries sort to the top).
  toggleHistoryPin(id: string): void {
    const entry = this.historyCache.find((h) => h.id === id);
    if (!entry) return;
    entry.pinned = !entry.pinned;

    this.globalState.update("restify.history", this.historyCache).then(
      () => {},
      (err: any) => console.error("Failed to persist history pin:", err),
    );
    if (this.storageDir) this.enqueueOp({ type: "persistFile" });

    if (this.db && typeof this.db.getCollection === "function") {
      try {
        const coll = this.db.getCollection("history");
        if (coll) {
          const item = coll.findOne({ id });
          if (item) {
            item.pinned = entry.pinned;
            coll.update(item);
            this.db.saveDatabase((err: any) => {
              if (err) console.error("Loki save error:", err);
            });
          }
        }
      } catch (e) {
        console.error("DB pin error:", e);
      }
    }
    this.notifyChange();
  }

  // Return the full history entry, hydrating body files if necessary
  getHistoryItem(id: string): HistoryEntry | null {
    const found = this.historyCache.find((h) => h.id === id);
    if (!found) return null;
    const clone: any = JSON.parse(JSON.stringify(found));
    try {
      if (clone.response && clone.response.bodyFile && this.storageDir) {
        const fp = path.join(
          this.storageDir,
          this.BODY_FILE_DIR,
          clone.response.bodyFile,
        );
        if (fs.existsSync(fp)) {
          clone.response.body = fs.readFileSync(fp, "utf8");
        }
      }
      if (clone.request && clone.request.bodyFile && this.storageDir) {
        const fp = path.join(
          this.storageDir,
          this.BODY_FILE_DIR,
          clone.request.bodyFile,
        );
        if (fs.existsSync(fp)) {
          clone.request.body = fs.readFileSync(fp, "utf8");
        }
      }
    } catch(e) {
      console.error("Failed to hydrate history item bodies:", e);
    }
    return clone;
  }

  // ─── Collections ──────────────────────────────────────────
  getCollections(): Collection[] {
    return this.globalState.get("restify.collections", []);
  }

  saveCollection(collection: Collection): void {
    const collections = this.getCollections();
    const newId = collection.id
      ? String(collection.id)
      : this.createId("collection");
    const idx = collections.findIndex((c) => String(c.id) === newId);
    const toSave = { ...collection, id: newId };
    if (idx >= 0) {
      collections[idx] = toSave;
    } else {
      collections.push(toSave);
    }
    this.globalState.update("restify.collections", collections);
    this.notifyChange();
  }

  deleteCollection(id: string): void {
    const collections = this.getCollections().filter(
      (c) => String(c.id) !== String(id),
    );
    this.globalState.update("restify.collections", collections);
    this.notifyChange();
  }

  addRequestToCollection(collectionId: string, request: any): void {
    const collections = this.getCollections();
    const col = collections.find((c) => c.id === collectionId);
    if (col) {
      if (!col.requests) col.requests = [];
      const reqId = request.id ? String(request.id) : this.createId("request");
      const existing = col.requests.findIndex((r) => String(r.id) === reqId);
      const toSaveReq = { ...request, id: reqId };
      if (existing >= 0) {
        col.requests[existing] = toSaveReq;
      } else {
        col.requests.push(toSaveReq);
      }
      this.globalState.update("restify.collections", collections);
      this.notifyChange();
    }
  }

  deleteRequestFromCollection(collectionId: string, requestId: string): void {
    const collections = this.getCollections();
    const col = collections.find((c) => c.id === collectionId);
    if (col) {
      col.requests = (col.requests || []).filter(
        (r) => String(r.id) !== String(requestId),
      );
      this.globalState.update("restify.collections", collections);
      this.notifyChange();
    }
  }

  // ─── Groups (folders within a collection) ─────────────────

  /** Upsert a group inside a collection. */
  saveGroup(
    collectionId: string,
    group: CollectionGroup,
    parentGroupId?: string,
  ): void {
    const collections = this.getCollections();
    const col = collections.find((c) => String(c.id) === String(collectionId));
    if (!col) return;
    const container = parentGroupId
      ? _findGroup(col.groups || [], parentGroupId)
      : col;
    if (!container) return;
    if (!container.groups) container.groups = [];
    const idx = container.groups.findIndex(
      (g) => String(g.id) === String(group.id),
    );
    if (idx >= 0) {
      container.groups[idx] = group;
    } else {
      container.groups.push(group);
    }
    this.globalState.update("restify.collections", collections);
    this.notifyChange();
  }

  /** Delete a group (and all its contents) from a collection. */
  deleteGroup(collectionId: string, groupId: string): void {
    const collections = this.getCollections();
    const col = collections.find((c) => String(c.id) === String(collectionId));
    if (!col) return;
    _removeGroup(col, groupId);
    this.globalState.update("restify.collections", collections);
    this.notifyChange();
  }

  /** Rename a group. */
  renameGroup(collectionId: string, groupId: string, name: string): void {
    const collections = this.getCollections();
    const col = collections.find((c) => String(c.id) === String(collectionId));
    if (!col) return;
    const grp = _findGroup(col.groups || [], groupId);
    if (grp && name.trim()) {
      grp.name = name.trim();
      this.globalState.update("restify.collections", collections);
      this.notifyChange();
    }
  }

  /** Add a request into a group inside a collection. */
  addRequestToGroup(collectionId: string, groupId: string, request: any): void {
    const collections = this.getCollections();
    const col = collections.find((c) => String(c.id) === String(collectionId));
    if (!col) return;
    const grp = _findGroup(col.groups || [], groupId);
    if (!grp) return;
    if (!grp.requests) grp.requests = [];
    const reqId = request.id ? String(request.id) : this.createId("request");
    const idx = grp.requests.findIndex((r: any) => String(r.id) === reqId);
    const toSave = { ...request, id: reqId };
    if (idx >= 0) {
      grp.requests[idx] = toSave;
    } else {
      grp.requests.push(toSave);
    }
    this.globalState.update("restify.collections", collections);
    this.notifyChange();
  }

  /** Delete a request from a group. */
  deleteRequestFromGroup(
    collectionId: string,
    groupId: string,
    requestId: string,
  ): void {
    const collections = this.getCollections();
    const col = collections.find((c) => String(c.id) === String(collectionId));
    if (!col) return;
    const grp = _findGroup(col.groups || [], groupId);
    if (!grp) return;
    grp.requests = (grp.requests || []).filter(
      (r: any) => String(r.id) !== String(requestId),
    );
    this.globalState.update("restify.collections", collections);
    this.notifyChange();
  }

  /**
   * Move a request from its current location (top-level or a group) into
   * another location (a group or back to top-level).
   * fromGroupId / toGroupId = null means the collection's top-level requests array.
   */
  moveRequestToGroup(
    collectionId: string,
    requestId: string,
    fromGroupId: string | null,
    toGroupId: string | null,
  ): void {
    if (fromGroupId === toGroupId) return;
    const collections = this.getCollections();
    const col = collections.find((c) => String(c.id) === String(collectionId));
    if (!col) return;

    // Remove from source
    let request: any;
    if (fromGroupId) {
      const src = _findGroup(col.groups || [], fromGroupId);
      if (!src?.requests) return;
      const idx = src.requests.findIndex(
        (r: any) => String(r.id) === String(requestId),
      );
      if (idx === -1) return;
      [request] = src.requests.splice(idx, 1);
    } else {
      if (!col.requests) return;
      const idx = col.requests.findIndex(
        (r) => String(r.id) === String(requestId),
      );
      if (idx === -1) return;
      [request] = col.requests.splice(idx, 1);
    }

    // Add to destination
    if (toGroupId) {
      const dst = _findGroup(col.groups || [], toGroupId);
      if (!dst) return;
      if (!dst.requests) dst.requests = [];
      dst.requests.push(request);
    } else {
      if (!col.requests) col.requests = [];
      col.requests.push(request);
    }

    this.globalState.update("restify.collections", collections);
    this.notifyChange();
  }

  /**
   * Move a request from one collection to another collection.
   * Removes the request from its source location and adds it to the destination.
   */
  moveRequestAcrossCollections(
    fromCollectionId: string,
    toCollectionId: string,
    requestId: string,
    fromGroupId: string | null,
    toGroupId: string | null,
  ): void {
    const collections = this.getCollections();

    // Find source and destination collections
    const fromCol = collections.find(
      (c) => String(c.id) === String(fromCollectionId),
    );
    const toCol = collections.find(
      (c) => String(c.id) === String(toCollectionId),
    );
    if (!fromCol || !toCol) return;

    // Remove from source
    let request: any;
    if (fromGroupId) {
      const src = _findGroup(fromCol.groups || [], fromGroupId);
      if (!src?.requests) return;
      const idx = src.requests.findIndex(
        (r: any) => String(r.id) === String(requestId),
      );
      if (idx === -1) return;
      [request] = src.requests.splice(idx, 1);
    } else {
      if (!fromCol.requests) return;
      const idx = fromCol.requests.findIndex(
        (r: any) => String(r.id) === String(requestId),
      );
      if (idx === -1) return;
      [request] = fromCol.requests.splice(idx, 1);
    }

    // Add to destination
    if (toGroupId) {
      const dst = _findGroup(toCol.groups || [], toGroupId);
      if (!dst) return;
      if (!dst.requests) dst.requests = [];
      dst.requests.push(request);
    } else {
      if (!toCol.requests) toCol.requests = [];
      toCol.requests.push(request);
    }

    this.globalState.update("restify.collections", collections);
    this.notifyChange();
  }

  // ─── Environments ─────────────────────────────────────────
  getEnvironments(): Environment[] {
    return this.globalState.get("restify.environments", []);
  }

  getActiveEnvironment(): Environment | null {
    const envs = this.getEnvironments();
    const activeId = this.globalState.get("restify.activeEnv", null);
    return envs.find((e) => e.id === activeId) || null;
  }

  setActiveEnvironment(id: string | null): void {
    this.globalState.update("restify.activeEnv", id);
    this.notifyChange();
  }

  // ─── Secrets (SecretStorage) ──────────────────────────────
  private _secretKey(envId: string, varKey: string): string {
    return `${this.SECRET_KEY_PREFIX}.${encodeURIComponent(envId)}.var.${encodeURIComponent(varKey)}`;
  }

  /**
   * Load all secret values from SecretStorage into the in-memory cache so
   * variable resolution can stay synchronous. Call once after construction.
   */
  async hydrateSecrets(): Promise<void> {
    if (!this.secretStorage) return;
    for (const env of this.getEnvironments()) {
      for (const v of env.variables || []) {
        if (v.isSecret && v.key) {
          try {
            const value = await this.secretStorage.get(this._secretKey(env.id, v.key));
            if (value !== undefined) {
              this.secretCache.set(this._secretKey(env.id, v.key), value);
            }
          } catch {
            /* ignore individual secret read failures */
          }
        }
      }
    }
  }

  /** Resolve a secret value from the cache (falls back to SecretStorage). */
  async getSecretValue(envId: string, varKey: string): Promise<string | undefined> {
    const key = this._secretKey(envId, varKey);
    const cached = this.secretCache.get(key);
    if (cached !== undefined) return cached;
    if (!this.secretStorage) return undefined;
    try {
      const value = await this.secretStorage.get(key);
      if (value !== undefined) this.secretCache.set(key, value);
      return value;
    } catch {
      return undefined;
    }
  }

  async saveEnvironment(env: Environment): Promise<void> {
    const environments = this.getEnvironments();
    const idx = environments.findIndex((e) => e.id === env.id);
    const envId = idx >= 0 ? environments[idx].id : env.id || this.createId("environment");

    // Track previously-secret keys so removed/un-toggled secrets are cleaned up.
    const oldVars = idx >= 0 ? environments[idx].variables || [] : [];

    const cleanVars: EnvVariable[] = [];
    for (const v of env.variables ?? []) {
      const entry = { ...v };
      if (entry.isSecret) {
        if (entry.value && entry.key) {
          if (this.secretStorage) {
            try {
              await this.secretStorage.store(this._secretKey(envId, entry.key), entry.value);
            } catch (e) {
              console.error("Failed to store secret variable", e);
            }
          }
          this.secretCache.set(this._secretKey(envId, entry.key), entry.value);
        }
        // Never persist the plaintext secret to globalState.
        entry.value = "";
        cleanVars.push(entry);
      } else {
        if (entry.key) {
          try {
            if (this.secretStorage) await this.secretStorage.delete(this._secretKey(envId, entry.key));
          } catch { /* ignore */ }
          this.secretCache.delete(this._secretKey(envId, entry.key));
        }
        cleanVars.push(entry);
      }
    }

    // Clean up secrets that no longer exist in the environment.
    const keptSecretKeys = new Set(cleanVars.filter((v) => v.isSecret && v.key).map((v) => v.key));
    for (const old of oldVars) {
      if (old.isSecret && old.key && !keptSecretKeys.has(old.key)) {
        try {
          if (this.secretStorage) await this.secretStorage.delete(this._secretKey(envId, old.key));
        } catch { /* ignore */ }
        this.secretCache.delete(this._secretKey(envId, old.key));
      }
    }

    const saved: Environment = { ...env, id: envId, variables: cleanVars };
    if (idx >= 0) {
      environments[idx] = saved;
    } else {
      environments.push(saved);
    }
    this.globalState.update("restify.environments", environments);
    this.notifyChange();
  }

  async deleteEnvironment(id: string): Promise<void> {
    if (id === this.DEFAULT_GLOBAL_ENV_ID) {
      return;
    }

    const env = this.getEnvironments().find((e) => e.id === id);
    if (env) {
      for (const v of env.variables || []) {
        if (v.isSecret && v.key) {
          try {
            if (this.secretStorage) await this.secretStorage.delete(this._secretKey(id, v.key));
          } catch { /* ignore */ }
          this.secretCache.delete(this._secretKey(id, v.key));
        }
      }
    }

    const environments = this.getEnvironments().filter((e) => e.id !== id);
    this.globalState.update("restify.environments", environments);
    if (this.globalState.get("restify.activeEnv") === id) {
      this.globalState.update("restify.activeEnv", this.DEFAULT_GLOBAL_ENV_ID);
    }
    this.notifyChange();
  }

  // ─── Expansion States ──────────────────────────────────────
  setCollectionExpansionState(id: string, isOpen: boolean): void {
    const states = this.globalState.get<Record<string, boolean>>(
      "restify.expansionStates",
      {},
    );
    states[id] = isOpen;
    this.globalState.update("restify.expansionStates", states);
  }

  getExpansionStates(): Record<string, boolean> {
    return this.globalState.get("restify.expansionStates", {});
  }

  // ─── OAuth 2.0 token cache ─────────────────────────────────
  private readonly oauthCachePrefix = "restify.oauth2.token.";

  getOAuthTokenCache(key: string): OAuth2Token | undefined {
    try {
      return this.globalState.get<OAuth2Token>(this.oauthCachePrefix + key);
    } catch {
      return undefined;
    }
  }

  setOAuthTokenCache(key: string, token: OAuth2Token): void {
    try {
      this.globalState.update(this.oauthCachePrefix + key, token);
    } catch {
      /* ignore persistence failures */
    }
  }

  // ─── Variable resolution ──────────────────────────────────
  /**
   * Resolve `{{var}}` tokens with F42 scope precedence (lowest → highest):
   * global env → collection vars → active environment → session/script vars.
   * Pass `collectionId` when resolving for a request that belongs to a
   * collection so its variables apply.
   */
  resolveVariables(text: string, sessionId?: string, collectionId?: string): string {
    const scopes: ScopedVariables[] = [];
    const globalEnv = this.getGlobalEnvironment();
    if (globalEnv) {
      scopes.push({ name: "global", values: this._envValueMap(globalEnv) });
    }
    const colVars = this.getCollectionVariables(collectionId);
    if (colVars.length > 0) {
      scopes.push({ name: "collection", values: this._plainValueMap(colVars) });
    }
    const activeEnv = this.getActiveEnvironment();
    if (activeEnv) {
      scopes.push({ name: "environment", values: this._envValueMap(activeEnv) });
    }
    if (sessionId) {
      const chainVars = this.sessionChainVars.get(sessionId);
      if (chainVars) {
        scopes.push({ name: "local", values: chainVars });
      }
    }
    let resolved = applyVariableMap(text, mergeVariableScopes(scopes));
    resolved = resolveDynamicVariables(resolved);
    return resolved;
  }

  /** The built-in Global environment (always present, lowest scope priority). */
  getGlobalEnvironment(): Environment | null {
    return (
      this.getEnvironments().find((e) => e.id === this.DEFAULT_GLOBAL_ENV_ID) ||
      null
    );
  }

  /** Variables defined on a collection (inherited by its requests). */
  getCollectionVariables(collectionId?: string): EnvVariable[] {
    if (!collectionId) return [];
    const col = this.getCollections().find(
      (c) => String(c.id) === String(collectionId),
    );
    return col?.variables ?? [];
  }

  private _envValueMap(env: Environment): Record<string, string> {
    const map: Record<string, string> = {};
    for (const v of env.variables || []) {
      if (!v.key) continue;
      map[v.key] = v.isSecret
        ? (this.secretCache.get(this._secretKey(env.id, v.key)) ?? "")
        : v.value;
    }
    return map;
  }

  private _plainValueMap(vars: EnvVariable[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const v of vars || []) {
      if (!v.key) continue;
      map[v.key] = v.value;
    }
    return map;
  }

  // ─── Request chaining (per-window session) ────────────────
  /** Store script-extracted variables for a window session. A single window
   *  chains across unlimited requests; a new window (new sessionId) starts
   *  with an empty scope. */
  setSessionChainVars(sessionId: string, variables: Record<string, unknown>): void {
    const current = this.sessionChainVars.get(sessionId) ?? {};
    for (const [key, value] of Object.entries(variables)) {
      if (!key) continue;
      current[key] = typeof value === "string" ? value : JSON.stringify(value);
    }
    this.sessionChainVars.set(sessionId, current);
  }

  getSessionChainVars(sessionId: string): Record<string, string> {
    return { ...(this.sessionChainVars.get(sessionId) ?? {}) };
  }

  /** Terminate a window session's chain scope (called when the window closes). */
  clearSessionChainVars(sessionId: string): void {
    this.sessionChainVars.delete(sessionId);
  }

  /**
   * Return a resolved name → value map of the active environment's variables,
   * including secret values from the secret cache (never persisted to state).
   * Global-environment variables are included as the lowest-priority fallback
   * (F42): an active environment's values override globals with the same key.
   */
  getActiveEnvironmentVariables(): Record<string, string> {
    const result: Record<string, string> = {};
    const globalEnv = this.getGlobalEnvironment();
    if (globalEnv) {
      Object.assign(result, this._envValueMap(globalEnv));
    }
    const activeEnv = this.getActiveEnvironment();
    if (activeEnv) {
      Object.assign(result, this._envValueMap(activeEnv));
    }
    return result;
  }

  // ─── Cookies (cookie jar) ─────────────────────────────────
  getCookies(): any[] {
    return this.globalState.get("restify.cookies", []);
  }

  saveCookies(cookies: any[]): void {
    this.globalState.update("restify.cookies", cookies);
    this.notifyChange();
  }

  clearCookies(): void {
    this.globalState.update("restify.cookies", []);
    this.notifyChange();
  }

  // ─── Settings ─────────────────────────────────────────────
  getSettings(): SettingsState {
    const saved = this.globalState.get<Partial<SettingsState>>(
      "restify.settings",
      {},
    );
    return {
      proxy: saved.proxy ?? "",
      proxyAuthorization: saved.proxyAuthorization ?? "",
      noProxy: saved.noProxy ?? "",
      certificates: saved.certificates ?? [],
      showActivityLog: saved.showActivityLog ?? true,
      defaultTimeout: saved.defaultTimeout ?? 30000,
      notifyOnLongRequest: saved.notifyOnLongRequest ?? true,
      longRequestThresholdMs: saved.longRequestThresholdMs ?? 5000,
      defaultHeaders: {
        userAgent: saved.defaultHeaders?.userAgent ?? false,
        requestId: saved.defaultHeaders?.requestId ?? false,
        correlationId: saved.defaultHeaders?.correlationId ?? false,
        date: saved.defaultHeaders?.date ?? false,
        custom: (saved.defaultHeaders?.custom ?? []).map((c) => ({
          key: c?.key ?? "",
          value: c?.value ?? "",
          enabled: c?.enabled !== false,
        })),
      },
      soapSecurity: (saved.soapSecurity ?? []).map((e) => {
        const type = (e as { type?: string })?.type;
        return {
          hostname: e?.hostname ?? "",
          username: e?.username ?? "",
          password: e?.password ?? "",
          // Migrate the legacy mutually-exclusive "type" field to independent
          // outgoing/incoming action toggles.
          useUsername:
            e?.useUsername ?? Boolean(type === "username" || type === "username-encrypt"),
          encrypt: e?.encrypt ?? (type === "encrypt" || type === "username-encrypt"),
          decrypt: e?.decrypt ?? type === "decrypt",
          certPath: e?.certPath ?? "",
          keyPath: e?.keyPath ?? "",
          p12Path: e?.p12Path ?? "",
          p12Password: e?.p12Password ?? "",
          keystore: e?.keystore ?? "p12",
        };
      }),
      headerPresets: (saved.headerPresets ?? []).map((p) => ({
        id: p?.id ?? "",
        name: p?.name ?? "",
        headers: (p?.headers ?? []).map((h) => ({
          key: h?.key ?? "",
          value: h?.value ?? "",
          enabled: h?.enabled !== false,
        })),
      })),
    };
  }

  saveSettings(settings: SettingsState): void {
    this.globalState.update("restify.settings", settings);
    this.notifyChange();
  }

  clearProxySettings(): void {
    const settings = this.getSettings();
    settings.proxy = "";
    settings.proxyAuthorization = "";
    settings.noProxy = "";
    this.globalState.update("restify.settings", settings);
    this.notifyChange();
  }

  // ─── Change listeners ─────────────────────────────────────
  onDidChange(cb: () => void): void {
    this.listeners.push(cb);
  }

  notifyChange(): void {
    this.listeners.forEach((cb) => cb());
  }
}

// ─── Module-level group tree helpers ──────────────────────────────────────────

export function _findGroup(
  groups: CollectionGroup[],
  id: string,
): CollectionGroup | undefined {
  for (const g of groups) {
    if (String(g.id) === String(id)) return g;
    if (g.groups?.length) {
      const found = _findGroup(g.groups, id);
      if (found) return found;
    }
  }
  return undefined;
}

function _removeGroup(
  container: { groups?: CollectionGroup[] },
  id: string,
): boolean {
  if (!container.groups) return false;
  const idx = container.groups.findIndex((g) => String(g.id) === String(id));
  if (idx >= 0) {
    container.groups.splice(idx, 1);
    return true;
  }
  for (const g of container.groups) {
    if (_removeGroup(g, id)) return true;
  }
  return false;
}
