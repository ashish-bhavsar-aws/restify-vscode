import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Sidebar.css';
interface KVItem { key: string; value: string; }
interface HistoryEntry {
  id: string; method: string; url: string; status: number;
  duration?: number; name: string; timestamp?: string;
}
interface CollectionRequest { id?: string; method: string; url: string; name?: string; }
interface Collection { id: string; name: string; requests?: CollectionRequest[]; }
interface Environment { id: string; name: string; variables: KVItem[]; }
type SidebarType = 'history' | 'collections' | 'environments';
export const Sidebar: React.FC = () => {
  const [sidebarType, setSidebarType] = useState<SidebarType>('history');
  const [history, setHistory]           = useState<HistoryEntry[]>([]);
  const [collections, setCollections]   = useState<Collection[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [activeEnvId, setActiveEnvId]   = useState<string | null>(null);
  const [expansionStates, setExpansionStates] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const vscodeApi = useRef<any>(null);
  const pendingToggleRef = useRef<{ id: string; state: boolean } | null>(null);

  useEffect(() => {
    const root = document.getElementById('root');
    setSidebarType((root?.getAttribute('data-type') || 'history') as SidebarType);
    vscodeApi.current = (window as any).acquireVsCodeApi?.();
    const handler = (event: MessageEvent) => {
      const d = event.data;
      if (d.command === 'setData') {
        if (d.data.history)      setHistory(d.data.history);
        if (d.data.collections)  setCollections(d.data.collections);
        if (d.data.environments) setEnvironments(d.data.environments);
        if (d.data.activeEnvId !== undefined) setActiveEnvId(d.data.activeEnvId);
        // Only update expansion states if there's no pending toggle
        if (d.data.expansionStates && !pendingToggleRef.current) {
          setExpansionStates(d.data.expansionStates);
        }
        // Clear pending toggle after processing
        if (pendingToggleRef.current) {
          pendingToggleRef.current = null;
        }
      }
    };
    window.addEventListener('message', handler);
    vscodeApi.current?.postMessage({ command: 'requestData' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const post = useCallback((msg: any) => vscodeApi.current?.postMessage(msg), []);

  const handleToggleCollection = useCallback((id: string, isOpen: boolean) => {
    // Mark this as a pending toggle so backend updates don't overwrite it
    pendingToggleRef.current = { id, state: isOpen };
    setExpansionStates(p => ({ ...p, [id]: isOpen }));
    post({ command: 'toggleCollectionState', id, isOpen });
  }, [post]);

  return (
    <div className="sidebar-container">
      {sidebarType === 'history' && (
        <HistoryPanel history={history} search={search} onSearch={setSearch}
          onLoad={(id) => post({ command: 'loadHistoryItem', id })}
          onDelete={(id) => post({ command: 'deleteHistoryItem', id })}
          onClear={() => post({ command: 'clearHistory' })} />
      )}
      {sidebarType === 'collections' && (
        <CollectionsPanel collections={collections} search={search}
          expansionStates={expansionStates} onSearch={setSearch}
          onToggle={handleToggleCollection}
          onLoad={(req) => post({ command: 'loadRequest', data: req })}
          onNewCollection={(name) => post({ command: 'saveCollection', data: { name, requests: [] } })}
          onDeleteCollection={(id) => post({ command: 'deleteCollection', id })}
          onDeleteRequest={(cid, rid) => post({ command: 'deleteCollectionRequest', collectionId: cid, requestId: rid })} />
      )}
      {sidebarType === 'environments' && (
        <EnvironmentsPanel environments={environments} activeEnvId={activeEnvId}
          onSetActive={(id) => { setActiveEnvId(id); post({ command: 'setActiveEnvironment', id }); }}
          onSave={(env) => post({ command: 'saveEnvironment', data: env })}
          onDelete={(id) => post({ command: 'deleteEnvironment', id })} />
      )}
    </div>
  );
};
/* ─── History ────────────────────────────────────────────── */
interface HistoryPanelProps {
  history: HistoryEntry[]; search: string;
  onSearch(q: string): void; onLoad(id: string): void;
  onDelete(id: string): void; onClear(): void;
}
const HistoryPanel: React.FC<HistoryPanelProps> = ({ history, search, onSearch, onLoad, onDelete, onClear }) => {
  const filtered = history.filter(h =>
    !search || (h.name||'').toLowerCase().includes(search.toLowerCase()) || (h.url||'').toLowerCase().includes(search.toLowerCase()));
  return (<>
    <div className="toolbar">
      <input className="search-input" type="text" placeholder="Filter history..." value={search} onChange={e => onSearch(e.target.value)} />
      <button className="btn-ghost" onClick={onClear}>Clear</button>
    </div>
    <div className="list">
      {filtered.length === 0
        ? <div className="empty"><div className="empty-icon">⚡</div><div>No requests yet</div><div className="empty-sub">Execute a request to see it here</div></div>
        : filtered.map(entry => {
            const sc = !entry.status || entry.status === 0 ? 'status-err' : entry.status < 300 ? 'status-ok' : entry.status < 400 ? 'status-warn' : 'status-err';
            return (
              <div key={entry.id} className="item" onClick={() => onLoad(entry.id)}>
                <span className={`method-badge method-${entry.method}`}>{entry.method}</span>
                <div className="item-content">
                  <div className="item-name">{entry.name || entry.url}</div>
                  <div className="item-meta">{entry.url}</div>
                </div>
                <div className="item-right">
                  <div className="status-row"><span className={`status-dot ${sc}`} /><span className="status-text">{entry.status||'err'}</span></div>
                  {entry.duration != null && <span className="time">{entry.duration}ms</span>}
                </div>
                <button className="btn-icon" title="Delete" onClick={e => { e.stopPropagation(); onDelete(entry.id); }}>×</button>
              </div>);
          })}
    </div>
  </>);
};
/* ─── Collections ────────────────────────────────────────── */
interface CollectionsPanelProps {
  collections: Collection[]; search: string; expansionStates: Record<string,boolean>;
  onSearch(q: string): void; onToggle(id: string, open: boolean): void; onLoad(req: CollectionRequest): void;
  onNewCollection(name: string): void; onDeleteCollection(id: string): void; onDeleteRequest(cid: string, rid: string): void;
}
const CollectionsPanel: React.FC<CollectionsPanelProps> = ({
  collections, search, expansionStates, onSearch, onToggle, onLoad, onNewCollection, onDeleteCollection, onDeleteRequest
}) => {
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const filtered = collections.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()));
  const handleCreate = () => { if (newName.trim()) { onNewCollection(newName.trim()); setNewName(''); setShowNew(false); } };
  return (<>
    <div className="toolbar">
      <input className="search-input" type="text" placeholder="Filter..." value={search} onChange={e => onSearch(e.target.value)} />
      <button className="btn" onClick={() => setShowNew(true)}>+ New</button>
    </div>
    <div className="list">
      {filtered.length === 0
        ? <div className="empty"><div className="empty-icon">📁</div><div>No collections</div><div className="empty-sub">Save requests to organize them</div></div>
        : filtered.map(col => {
            const reqs = col.requests || [];
            const isOpen = !!expansionStates[col.id];
            return (
              <div key={col.id} className="collection-group">
                <div className="collection-header" onClick={() => onToggle(col.id, !isOpen)}>
                  <span className={`caret ${isOpen ? 'open':''}`}>▶</span>
                  <span className="collection-name">{col.name}</span>
                  <span className="collection-count">{reqs.length}</span>
                  <button className="btn-icon" title="Delete" onClick={e => { e.stopPropagation(); onDeleteCollection(col.id); }}>×</button>
                </div>
                {isOpen && (
                  <div className="collection-requests open">
                    {reqs.length === 0
                      ? <div className="sub-empty">No requests saved</div>
                      : reqs.map(req => (
                          <div key={req.id} className="sub-item" onClick={() => onLoad(req)}>
                            <span className={`method-badge method-${req.method}`}>{req.method}</span>
                            <span className="sub-name">{req.name || req.url || 'Untitled'}</span>
                            <button className="btn-icon" title="Delete" onClick={e => { e.stopPropagation(); onDeleteRequest(col.id, req.id!); }}>×</button>
                          </div>))}
                  </div>)}
              </div>);
          })}
    </div>
    {showNew && (
      <div className="modal-overlay open" onClick={() => setShowNew(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <h3>New Collection</h3>
          <label className="modal-label">Name</label>
          <input className="modal-input" placeholder="My Collection" value={newName} autoFocus
            onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key==='Enter' && handleCreate()} />
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
            <button className="btn" onClick={handleCreate}>Create</button>
          </div>
        </div>
      </div>)}
  </>);
};
/* ─── Environments ───────────────────────────────────────── */
interface EnvironmentsPanelProps {
  environments: Environment[]; activeEnvId: string | null;
  onSetActive(id: string): void; onSave(env: Environment): void; onDelete(id: string): void;
}
const EnvironmentsPanel: React.FC<EnvironmentsPanelProps> = ({ environments, activeEnvId, onSetActive, onSave, onDelete }) => {
  const [editingEnv, setEditingEnv] = useState<Environment | null>(null);
  const openNew = () => setEditingEnv({ id: '', name: '', variables: [{ key: '', value: '' }] });
  return (<>
    <div className="toolbar">
      <span className="toolbar-label">Active environment</span>
      <button className="btn" onClick={openNew}>+ New</button>
    </div>
    <div className="list">
      {environments.length === 0
        ? <div className="empty"><div className="empty-icon">🌍</div><div>No environments</div><div className="empty-sub">{'Use {{variable}} in requests'}</div></div>
        : environments.map(env => (
            <div key={env.id} className="env-item" onClick={() => onSetActive(env.id)}>
              <div className={`env-radio ${env.id === activeEnvId ? 'active' : ''}`} />
              <div className="env-info">
                <div className="env-name">{env.name}</div>
                <div className="env-count">{(env.variables||[]).length} variable{(env.variables||[]).length!==1?'s':''}</div>
              </div>
              <button className="btn-icon" title="Edit" onClick={e => { e.stopPropagation(); setEditingEnv({ ...env }); }}>✎</button>
              <button className="btn-icon" title="Delete" onClick={e => { e.stopPropagation(); onDelete(env.id); }}>×</button>
            </div>))}
    </div>
    {editingEnv && <EnvModal env={editingEnv} onChange={setEditingEnv}
      onSave={() => { onSave(editingEnv); setEditingEnv(null); }} onClose={() => setEditingEnv(null)} />}
  </>);
};
/* ─── Env Modal ──────────────────────────────────────────── */
interface EnvModalProps {
  env: Environment; onChange(env: Environment): void; onSave(): void; onClose(): void;
}
const EnvModal: React.FC<EnvModalProps> = ({ env, onChange, onSave, onClose }) => {
  const updateVar = (i: number, field: 'key'|'value', val: string) => {
    const vars = env.variables.map((v, idx) => idx === i ? { ...v, [field]: val } : v);
    onChange({ ...env, variables: vars });
  };
  const addVar = () => onChange({ ...env, variables: [...env.variables, { key: '', value: '' }] });
  const removeVar = (i: number) => onChange({ ...env, variables: env.variables.filter((_, idx) => idx !== i) });
  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{env.id ? 'Edit' : 'New'} Environment</h3>
        <label className="modal-label">Name</label>
        <input className="modal-input" placeholder="Production" value={env.name} autoFocus
          onChange={e => onChange({ ...env, name: e.target.value })} />
        <label className="modal-label" style={{ marginTop: 10 }}>Variables</label>
        <table className="vars-table">
          <thead><tr><th>Key</th><th>Value</th><th /></tr></thead>
          <tbody>
            {env.variables.map((v, i) => (
              <tr key={i}>
                <td><input className="var-input" placeholder="key" value={v.key} onChange={e => updateVar(i,'key',e.target.value)} /></td>
                <td><input className="var-input" placeholder="value" value={v.value} onChange={e => updateVar(i,'value',e.target.value)} /></td>
                <td><button className="btn-icon" onClick={() => removeVar(i)}>×</button></td>
              </tr>))}
          </tbody>
        </table>
        <button className="add-var-btn" onClick={addVar}>+ Add Variable</button>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={onSave}>Save</button>
        </div>
      </div>
    </div>);
};
