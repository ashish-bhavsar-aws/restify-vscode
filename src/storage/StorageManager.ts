import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface Environment {
  id: string;
  name: string;
  variables: { key: string; value: string; timestamp?: number }[]; // timestamp for script variables
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
  activeEnvironmentId?: string | null; // Environment used when this request was made
}

export interface Collection {
  id: string;
  name: string;
  requests?: any[];
}

export interface CertEntry {
  hostname: string;
  certPath: string;
  keyPath: string;
  caPath: string;
}

export interface SettingsState {
  proxy: string;
  proxyAuthorization: string;
  noProxy: string;
  certificates: CertEntry[];
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
  private BODY_FILE_DIR = 'bodies';
  private BODY_INLINE_LIMIT = 4 * 1024; // keep bodies inline if <= 4KB

  // storageDir: optional file-system directory to persist history to a file
  constructor(private globalState: vscode.Memento, private storageDir?: string) {
    this.expansionStates = this.getExpansionStates();

    // Ensure storage directory exists if provided
    if (this.storageDir) {
      try {
        fs.mkdirSync(this.storageDir, { recursive: true });
      } catch (e) {
        console.error('Failed to create storage directory:', e);
        this.storageDir = undefined;
      }
    }

    // Load history into in-memory cache: try LokiJS (pure JS DB) if available, else file, else globalState
    if (this.storageDir) {
      try {
        // Require lokijs at runtime to avoid adding it to the top-level compile-time imports
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Loki: any = require('lokijs');

        const dbPath = path.join(this.storageDir, 'restify-history.db');
        // Use structured adapter if available for safer file writes
        let adapter: any = undefined;
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const LokiFsStructuredAdapter = require('lokijs/src/loki-fs-structured-adapter');
          adapter = new LokiFsStructuredAdapter();
        } catch {}

        this.db = new Loki(dbPath, {
          adapter,
          autosave: true,
          autosaveInterval: 1000,
          autoload: true,
          autoloadCallback: () => {
            const coll = this.db.getCollection('history') || this.db.addCollection('history', { indices: ['timestamp'] });
            const rows = coll.chain().simplesort('timestamp', true).limit(25).data();
            this.historyCache = rows.map((r: any) => ({ ...r }));
          },
        });
      } catch (e) {
        console.error('LokiJS not available or failed to initialize:', e);
        // Fallback to file/globalState
        const histFile = path.join(this.storageDir, 'history.json');
        try {
          if (fs.existsSync(histFile)) {
            const txt = fs.readFileSync(histFile, 'utf8');
            this.historyCache = JSON.parse(txt || '[]');
          } else {
            this.historyCache = this.globalState.get('restify.history', []);
            // Persist initial cache to file
            this.persistHistoryToFile().catch((err) => console.error('Persist error:', err));
          }
        } catch (e2) {
          console.error('Failed to load history file:', e2);
          this.historyCache = this.globalState.get('restify.history', []);
        }
      }
    } else {
      this.historyCache = this.globalState.get('restify.history', []);
    }

    this.startHousekeeping();
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
    if (!this.storageDir) throw new Error('No storageDir configured');
    this.enqueueOp({ type: 'writeBody', filename, content });
    return filename;
  }

  private async processQueue(): Promise<void> {
    this.processingQueue = true;
    while (this.writeQueue.length > 0) {
      const op = this.writeQueue.shift();
      try {
        if (!op) continue;
        switch (op.type) {
          case 'writeBody': {
            const filePath = path.join(this.storageDir || '.', this.BODY_FILE_DIR, op.filename);
            await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
            await fs.promises.writeFile(filePath, op.content, 'utf8');
            break;
          }
          case 'persistFile': {
            await this.persistHistoryToFile();
            break;
          }
          case 'lokiInsert': {
            if (this.db) {
              try {
                const coll = this.db.getCollection('history') || this.db.addCollection('history', { indices: ['timestamp'] });
                coll.insert(op.entry);
                this.db.saveDatabase((err: any) => { if (err) console.error('Loki save error:', err); });
              } catch (e) {
                console.error('Loki insert error:', e);
              }
            }
            break;
          }
          default:
            break;
        }
      } catch (err) {
        console.error('Error processing write queue op:', err);
      }
    }
    this.processingQueue = false;
  }

  private async persistHistoryToFile(): Promise<void> {
    if (!this.storageDir) return Promise.resolve();
    const histFile = path.join(this.storageDir, 'history.json');
    const tmpFile = histFile + '.tmp';
    try {
      await fs.promises.writeFile(tmpFile, JSON.stringify(this.historyCache, null, 2), 'utf8');
      await fs.promises.rename(tmpFile, histFile);
    } catch (err) {
      console.error('Failed to persist history to file:', err);
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
    }
  }

  // ─── Housekeeping ─────────────────────────────────────────
  /**
   * Start background housekeeping to clean old script variables every 30 minutes
   */
  private startHousekeeping(): void {
    // Only start housekeeping if in Node.js environment (not browser)
    if (typeof setInterval === 'undefined') {
      return;
    }
    // Run housekeeping every 30 minutes
    this.housekeepingInterval = setInterval(() => {
      this.cleanExpiredScriptVariables();
    }, 30 * 60 * 1000);
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
      this.globalState.update('restify.environments', environments);
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
  private createId(prefix = ''): string {
    try {
      return prefix ? `${prefix}-${randomUUID()}` : randomUUID();
    } catch {
      // Fallback for environments where randomUUID is unavailable.
      return `${prefix}${prefix ? '-' : ''}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }


  getHistory(): HistoryEntry[] {
    return this.historyCache;
  }

  addToHistory(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): HistoryEntry {
    // Operate on in-memory cache to prevent concurrency races when multiple requests
    // add to history at nearly the same time.
    const newEntry: HistoryEntry = {
      id: this.createId('history'),
      timestamp: new Date().toISOString(),
      ...entry,
    };

    // Offload large bodies to files to avoid serializing big strings repeatedly
    const preparedEntry = { ...newEntry } as any;
    // Handle response body
    if (preparedEntry.response && typeof preparedEntry.response.body === 'string') {
      const bodyStr: string = preparedEntry.response.body;
      if (bodyStr.length > this.BODY_INLINE_LIMIT && this.storageDir) {
        const filename = `${newEntry.id}.resp.txt`;
        preparedEntry.response.bodyFile = filename;
        delete preparedEntry.response.body;
        // enqueue body write
        this.enqueueOp({ type: 'writeBody', filename, content: bodyStr });
      }
    }
    // Handle request body
    if (preparedEntry.request && typeof preparedEntry.request.body === 'string') {
      const bodyStr: string = preparedEntry.request.body;
      if (bodyStr.length > this.BODY_INLINE_LIMIT && this.storageDir) {
        const filename = `${newEntry.id}.req.txt`;
        preparedEntry.request.bodyFile = filename;
        delete preparedEntry.request.body;
        this.enqueueOp({ type: 'writeBody', filename, content: bodyStr });
      }
    }

    // Insert into in-memory cache
    this.historyCache.unshift(preparedEntry);
    if (this.historyCache.length > 25) this.historyCache.splice(25);

    // Persist asynchronously to globalState and to file
    this.globalState.update('restify.history', this.historyCache).then(() => {}, (err: any) => console.error('Failed to persist history to globalState:', err));
    if (this.storageDir) this.enqueueOp({ type: 'persistFile' });

    // If using LokiJS, enqueue an insert (DB write happens in background)
    if (this.db && typeof this.db.getCollection === 'function') {
      this.enqueueOp({ type: 'lokiInsert', entry: preparedEntry });
    }

    // Notify listeners synchronously so UI updates immediately from cache
    this.notifyChange();
    return preparedEntry;
  }


  clearHistory(): void {
    const oldEntries = [...this.historyCache];
    this.historyCache = [];
    this.globalState.update('restify.history', []).then(() => {
      if (this.storageDir) {
        this.persistHistoryToFile().catch((err) => console.error('Failed to persist history file after clear:', err));
      }
      if (this.db && typeof this.db.getCollection === 'function') {
        try {
          const coll = this.db.getCollection('history');
          if (coll) {
            if (typeof coll.clear === 'function') {
              coll.clear();
            } else {
              // Fallback: remove all docs via chain
              const rows = coll.find();
              rows.forEach((r: any) => coll.remove(r));
            }
            this.db.saveDatabase((err: any) => { if (err) console.error('Loki save error:', err); });
          }
        } catch (e) {
          console.error('DB clear error:', e);
        }
      }
    }, (err: any) => console.error('Failed to clear history:', err));

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
    } catch (e) {
      // ignore
    }

    this.notifyChange();
  }

  deleteHistoryItem(id: string): void {
    const toDelete = this.historyCache.find((h) => h.id === id);
    this.historyCache = this.historyCache.filter((h) => h.id !== id);
    this.globalState.update('restify.history', this.historyCache).then(() => {
      if (this.storageDir) {
        this.persistHistoryToFile().catch((err) => console.error('Failed to persist history after delete:', err));
      }
    }, (err: any) => console.error('Failed to delete history item:', err));
    if (this.db && typeof this.db.getCollection === 'function') {
      try {
        const coll = this.db.getCollection('history');
        if (coll) {
          const item = coll.findOne({ id });
          if (item) {
            coll.remove(item);
            this.db.saveDatabase((err: any) => { if (err) console.error('Loki save error:', err); });
          }
        }
      } catch (e) {
        console.error('DB delete error:', e);
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
    } catch (e) {
      // ignore
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
        const fp = path.join(this.storageDir, this.BODY_FILE_DIR, clone.response.bodyFile);
        if (fs.existsSync(fp)) {
          clone.response.body = fs.readFileSync(fp, 'utf8');
        }
      }
      if (clone.request && clone.request.bodyFile && this.storageDir) {
        const fp = path.join(this.storageDir, this.BODY_FILE_DIR, clone.request.bodyFile);
        if (fs.existsSync(fp)) {
          clone.request.body = fs.readFileSync(fp, 'utf8');
        }
      }
    } catch (e) {
      console.error('Failed to hydrate history item bodies:', e);
    }
    return clone;
  }

  // ─── Collections ──────────────────────────────────────────
  getCollections(): Collection[] {
    return this.globalState.get('restify.collections', []);
  }

  saveCollection(collection: Collection): void {
    const collections = this.getCollections();
    const newId = collection.id ? String(collection.id) : this.createId('collection');
    const idx = collections.findIndex((c) => String(c.id) === newId);
    const toSave = { ...collection, id: newId };
    if (idx >= 0) {
      collections[idx] = toSave;
    } else {
      collections.push(toSave);
    }
    this.globalState.update('restify.collections', collections);
    this.notifyChange();
  }

  deleteCollection(id: string): void {
    const collections = this.getCollections().filter((c) => String(c.id) !== String(id));
    this.globalState.update('restify.collections', collections);
    this.notifyChange();
  }

  addRequestToCollection(collectionId: string, request: any): void {
    const collections = this.getCollections();
    const col = collections.find((c) => c.id === collectionId);
    if (col) {
      if (!col.requests) col.requests = [];
      const reqId = request.id ? String(request.id) : this.createId('request');
      const existing = col.requests.findIndex((r) => String(r.id) === reqId);
      const toSaveReq = { ...request, id: reqId };
      if (existing >= 0) {
        col.requests[existing] = toSaveReq;
      } else {
        col.requests.push(toSaveReq);
      }
      this.globalState.update('restify.collections', collections);
      this.notifyChange();
    }
  }

  deleteRequestFromCollection(collectionId: string, requestId: string): void {
    const collections = this.getCollections();
    const col = collections.find((c) => c.id === collectionId);
    if (col) {
      col.requests = (col.requests || []).filter((r) => String(r.id) !== String(requestId));
      this.globalState.update('restify.collections', collections);
      this.notifyChange();
    }
  }

  // ─── Environments ─────────────────────────────────────────
  getEnvironments(): Environment[] {
    return this.globalState.get('restify.environments', []);
  }

  getActiveEnvironment(): Environment | null {
    const envs = this.getEnvironments();
    const activeId = this.globalState.get('restify.activeEnv', null);
    return envs.find((e) => e.id === activeId) || null;
  }

  setActiveEnvironment(id: string | null): void {
    this.globalState.update('restify.activeEnv', id);
    this.notifyChange();
  }

  saveEnvironment(env: Environment): void {
    const environments = this.getEnvironments();
    const idx = environments.findIndex((e) => e.id === env.id);
    if (idx >= 0) {
      environments[idx] = env;
    } else {
      const newEnv: Environment = { ...env, id: env.id || this.createId('environment'), variables: env.variables ?? [] };
      environments.push(newEnv);
    }
    this.globalState.update('restify.environments', environments);
    this.notifyChange();
  }

  deleteEnvironment(id: string): void {
    const environments = this.getEnvironments().filter((e) => e.id !== id);
    this.globalState.update('restify.environments', environments);
    if (this.globalState.get('restify.activeEnv') === id) {
      this.globalState.update('restify.activeEnv', null);
    }
    this.notifyChange();
  }

  // ─── Expansion States ──────────────────────────────────────
  setCollectionExpansionState(id: string, isOpen: boolean): void {
    const states = this.globalState.get<Record<string, boolean>>('restify.expansionStates', {});
    states[id] = isOpen;
    this.globalState.update('restify.expansionStates', states);
  }

  getExpansionStates(): Record<string, boolean> {
    return this.globalState.get('restify.expansionStates', {});
  }

  // ─── Variable resolution ──────────────────────────────────
  resolveVariables(text: string): string {
    const activeEnv = this.getActiveEnvironment();
    if (!activeEnv || !activeEnv.variables) return text;
    let resolved = text;
    for (const v of activeEnv.variables) {
      resolved = resolved.replace(
        new RegExp(`\\{\\{${v.key}\\}\\}`, 'g'),
        v.value
      );
    }
    return resolved;
  }

  // ─── Settings ─────────────────────────────────────────────
  getSettings(): SettingsState {
    return this.globalState.get('restify.settings', {
      proxy: '',
      proxyAuthorization: '',
      noProxy: '',
      certificates: [],
    });
  }

  saveSettings(settings: SettingsState): void {
    this.globalState.update('restify.settings', settings);
    this.notifyChange();
  }

  clearProxySettings(): void {
    const settings = this.getSettings();
    settings.proxy = '';
    settings.proxyAuthorization = '';
    settings.noProxy = '';
    this.globalState.update('restify.settings', settings);
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
