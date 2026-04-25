class StorageManager {
  constructor(globalState) {
    this.globalState = globalState;
    this.listeners = [];
    this.expansionStates = {};
  }

setCollectionExpansionState(id, isOpen) {
  const states = this.globalState.get('restify.expansionStates', {});
  states[id] = isOpen;
  this.globalState.update('restify.expansionStates', states);
}

getExpansionStates() {
  return this.globalState.get('restify.expansionStates', {});
}

  // ─── History ──────────────────────────────────────────────
  getHistory() {
    return this.globalState.get('restify.history', []);
  }

  addToHistory(entry) {
    const history = this.getHistory();
    const newEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      ...entry
    };
    history.unshift(newEntry);
    // Keep last 200 entries
    if (history.length > 200) history.splice(200);
    this.globalState.update('restify.history', history);
    this.notifyChange();
    return newEntry;
  }

  clearHistory() {
    this.globalState.update('restify.history', []);
    this.notifyChange();
  }

  deleteHistoryItem(id) {
    const history = this.getHistory().filter(h => h.id !== id);
    this.globalState.update('restify.history', history);
    this.notifyChange();
  }

  // ─── Collections ──────────────────────────────────────────
  getCollections() {
    return this.globalState.get('restify.collections', []);
  }

  saveCollection(collection) {
    const collections = this.getCollections();
    const idx = collections.findIndex(c => c.id === collection.id);
    if (idx >= 0) {
      collections[idx] = collection;
    } else {
      collections.push({ id: Date.now().toString(), ...collection });
    }
    this.globalState.update('restify.collections', collections);
    this.notifyChange();
  }

  deleteCollection(id) {
    const collections = this.getCollections().filter(c => c.id !== id);
    this.globalState.update('restify.collections', collections);
    this.notifyChange();
  }

  addRequestToCollection(collectionId, request) {
    const collections = this.getCollections();
    const col = collections.find(c => c.id === collectionId);
    if (col) {
      if (!col.requests) col.requests = [];
      const existing = col.requests.findIndex(r => r.id === request.id);
      if (existing >= 0) {
        col.requests[existing] = request;
      } else {
        col.requests.push({ id: Date.now().toString(), ...request });
      }
      this.globalState.update('restify.collections', collections);
      this.notifyChange();
    }
  }

  deleteRequestFromCollection(collectionId, requestId) {
    const collections = this.getCollections();
    const col = collections.find(c => c.id === collectionId);
    if (col) {
      col.requests = (col.requests || []).filter(r => r.id !== requestId);
      this.globalState.update('restify.collections', collections);
      this.notifyChange();
    }
  }

  // ─── Environments ─────────────────────────────────────────
  getEnvironments() {
    return this.globalState.get('restify.environments', []);
  }

  getActiveEnvironment() {
    const envs = this.getEnvironments();
    const activeId = this.globalState.get('restify.activeEnv', null);
    return envs.find(e => e.id === activeId) || null;
  }

  setActiveEnvironment(id) {
    this.globalState.update('restify.activeEnv', id);
    this.notifyChange();
  }

  saveEnvironment(env) {
    const environments = this.getEnvironments();
    const idx = environments.findIndex(e => e.id === env.id);
    if (idx >= 0) {
      environments[idx] = env;
    } else {
      environments.push({ id: Date.now().toString(), variables: [], ...env });
    }
    this.globalState.update('restify.environments', environments);
    this.notifyChange();
  }

  deleteEnvironment(id) {
    const environments = this.getEnvironments().filter(e => e.id !== id);
    this.globalState.update('restify.environments', environments);
    if (this.globalState.get('restify.activeEnv') === id) {
      this.globalState.update('restify.activeEnv', null);
    }
    this.notifyChange();
  }

  // ─── Variable resolution ──────────────────────────────────
  resolveVariables(text) {
    const activeEnv = this.getActiveEnvironment();
    if (!activeEnv || !activeEnv.variables) return text;
    let resolved = text;
    for (const v of activeEnv.variables) {
      resolved = resolved.replace(new RegExp(`\\{\\{${v.key}\\}\\}`, 'g'), v.value);
    }
    return resolved;
  }

  // ─── Change listeners ─────────────────────────────────────
  onDidChange(cb) {
    this.listeners.push(cb);
  }

  notifyChange() {
    this.listeners.forEach(cb => cb());
  }
}

module.exports = { StorageManager };
