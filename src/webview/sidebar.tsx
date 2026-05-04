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

function relativeTime(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff)) return '';
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
function listNavKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const items = Array.from<HTMLElement>(e.currentTarget.querySelectorAll('[tabindex="0"]'));
  const idx = items.indexOf(document.activeElement as HTMLElement);
  if (idx === -1) { items[0]?.focus(); return; }
  e.preventDefault();
  if (e.key === 'ArrowDown') items[Math.min(idx + 1, items.length - 1)]?.focus();
  else items[Math.max(0, idx - 1)]?.focus();
}
export const Sidebar: React.FC = () => {
  const [sidebarType, setSidebarType] = useState<SidebarType>('history');
  const [history, setHistory]           = useState<HistoryEntry[]>([]);
  const [collections, setCollections]   = useState<Collection[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [activeEnvId, setActiveEnvId]   = useState<string | null>(null);
  const [expansionStates, setExpansionStates] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [triggerNewCollection, setTriggerNewCollection] = useState(false);
  const [triggerNewEnvironment, setTriggerNewEnvironment] = useState(false);
  const vscodeApi = useRef<any>(null);
  const pendingToggleRef = useRef<{ id: string; state: boolean } | null>(null);

  useEffect(() => {
    const root = document.getElementById('root');
    setSidebarType((root?.getAttribute('data-type') || 'history') as SidebarType);
    vscodeApi.current = (window as any).acquireVsCodeApi?.();
    const handler = (event: MessageEvent) => {
      const d = event.data;
      if (d.command === 'openNewCollectionModal') { setTriggerNewCollection(true); }
      if (d.command === 'openNewEnvironmentModal') { setTriggerNewEnvironment(true); }
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
          collections={collections}
          onLoad={(id) => post({ command: 'loadHistoryItem', id })}
          onDelete={(id) => post({ command: 'deleteHistoryItem', id })}
          onClear={() => post({ command: 'clearHistory' })}
          onSaveToCollection={(id, collectionName) => post({ command: 'saveHistoryToCollection', id, collectionName })} />
      )}
      {sidebarType === 'collections' && (
        <CollectionsPanel collections={collections} search={search}
          expansionStates={expansionStates} onSearch={setSearch}
          onToggle={handleToggleCollection}
          onLoad={(req, collectionName) => post({ command: 'loadRequest', data: req, collectionName })}
          onNewCollection={(name) => post({ command: 'saveCollection', data: { name, requests: [] } })}
          onDeleteCollection={(id) => post({ command: 'deleteCollection', id })}
          onDeleteRequest={(cid, rid) => post({ command: 'deleteCollectionRequest', collectionId: cid, requestId: rid })}
          onCopyRequest={(cid, rid) => post({ command: 'copyCollectionRequest', collectionId: cid, requestId: rid })}
          onMoveRequest={(rid, fromCid, toCid) => post({ command: 'moveCollectionRequest', requestId: rid, fromCollectionId: fromCid, toCollectionId: toCid })}
          onReorderRequest={(cid, rid, toIndex) => post({ command: 'reorderCollectionRequest', collectionId: cid, requestId: rid, toIndex })}
          onRenameCollection={(id, name) => post({ command: 'renameCollection', id, name })}
          onRenameRequest={(cid, rid, name) => post({ command: 'renameCollectionRequest', collectionId: cid, requestId: rid, name })}
          onImportCollections={() => post({ command: 'importCollections' })}
          onExportCollections={() => post({ command: 'exportCollections' })}
          triggerNew={triggerNewCollection}
          onTriggerNewDone={() => setTriggerNewCollection(false)} />
      )}
      {sidebarType === 'environments' && (
        <EnvironmentsPanel environments={environments} activeEnvId={activeEnvId}
          onSetActive={(id) => { setActiveEnvId(id); post({ command: 'setActiveEnvironment', id }); }}
          onSave={(env) => post({ command: 'saveEnvironment', data: env })}
          onDelete={(id) => post({ command: 'deleteEnvironment', id })}
          triggerNew={triggerNewEnvironment}
          onTriggerNewDone={() => setTriggerNewEnvironment(false)} />
      )}
    </div>
  );
};
/* ─── History ────────────────────────────────────────────── */
interface HistoryPanelProps {
  history: HistoryEntry[]; search: string; collections: Collection[];
  onSearch(q: string): void; onLoad(id: string): void;
  onDelete(id: string): void; onClear(): void;
  onSaveToCollection(id: string, collectionName: string): void;
}
const HistoryPanel: React.FC<HistoryPanelProps> = ({ history, search, collections, onSearch, onLoad, onDelete, onClear, onSaveToCollection }) => {
  const [saveTarget, setSaveTarget] = useState<HistoryEntry | null>(null);
  const [selectedCol, setSelectedCol] = useState('');
  const [newColName, setNewColName] = useState('');
  const filtered = history.filter(h =>
    !search || (h.name||'').toLowerCase().includes(search.toLowerCase()) || (h.url||'').toLowerCase().includes(search.toLowerCase()));

  const handleSaveConfirm = () => {
    if (!saveTarget) return;
    const colName = selectedCol === '__new__' ? newColName.trim() : selectedCol;
    if (colName) { onSaveToCollection(saveTarget.id, colName); setSaveTarget(null); }
  };

  return (<>
    <div className="toolbar">
      <input className="search-input" type="text" placeholder="Filter history..." value={search} onChange={e => onSearch(e.target.value)} />
      {history.length > 0 && <button className="btn-ghost" onClick={onClear}>Clear</button>}
    </div>
    <div className="list" onKeyDown={listNavKeyDown}>
      {filtered.length === 0
        ? <div className="empty">
            <div className="empty-icon">
              <img src={(window as any).restifyMedia?.sidebarIcon || ''} alt="Restify" />
            </div>
            <div>No requests yet</div>
            <div className="empty-sub">Execute a request to see it here</div>
          </div>
        : filtered.map(entry => {
            const sc = !entry.status || entry.status === 0 ? 'status-err' : entry.status < 300 ? 'status-ok' : entry.status < 400 ? 'status-warn' : 'status-err';
            return (
              <div key={entry.id} className="item" tabIndex={0} onClick={() => onLoad(entry.id)} onKeyDown={(e) => { if (e.key === 'Enter') onLoad(entry.id); }}>
                <span className={`method-badge method-${entry.method}`}>{entry.method}</span>
                <div className="item-content">
                  <div className="item-name" title={entry.name || entry.url}>{entry.name || entry.url}</div>
                  <div className="item-meta">{relativeTime(entry.timestamp)}{entry.url !== entry.name && entry.url ? ` · ${entry.url}` : ''}</div>
                </div>
                <div className="item-right">
                  <div className="status-row"><span className={`status-dot ${sc}`} /><span className="status-text">{entry.status||'err'}</span></div>
                  {entry.duration != null && <span className="time">{entry.duration}ms</span>}
                </div>
                <div className="item-actions">
                  <button className="btn-icon btn-save-history" title="Save to collection" onClick={e => { e.stopPropagation(); setSaveTarget(entry); setSelectedCol(collections[0]?.name || '__new__'); setNewColName(''); }}>+</button>
                </div>
                <button className="btn-icon" title="Delete" onClick={e => { e.stopPropagation(); onDelete(entry.id); }}>×</button>
              </div>);
          })}
    </div>
    {saveTarget && (
      <div className="modal-overlay open" onClick={() => setSaveTarget(null)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <h3>Save to Collection</h3>
          <div className="item-name" style={{ fontSize: 11, marginBottom: 8, color: 'var(--muted)' }}>{saveTarget.name || saveTarget.url}</div>
          <label className="modal-label">Collection</label>
          <select className="modal-input" value={selectedCol} onChange={e => setSelectedCol(e.target.value)}>
            {collections.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            <option value="__new__">+ New collection…</option>
          </select>
          {selectedCol === '__new__' && (
            <input className="modal-input" style={{ marginTop: 6 }} placeholder="Collection name" value={newColName} autoFocus
              onChange={e => setNewColName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveConfirm()} />
          )}
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => setSaveTarget(null)}>Cancel</button>
            <button className="btn" onClick={handleSaveConfirm}>Save</button>
          </div>
        </div>
      </div>
    )}
  </>);
};
/* ─── Collections ────────────────────────────────────────── */
interface CollectionsPanelProps {
  collections: Collection[]; search: string; expansionStates: Record<string,boolean>;
  onSearch(q: string): void; onToggle(id: string, open: boolean): void; onLoad(req: CollectionRequest, collectionName: string): void;
  onNewCollection(name: string): void; onDeleteCollection(id: string): void; onDeleteRequest(cid: string, rid: string): void;
  onCopyRequest(collectionId: string, requestId: string): void;
  onMoveRequest(requestId: string, fromCollectionId: string, toCollectionId: string): void;
  onReorderRequest(collectionId: string, requestId: string, toIndex: number): void;
  onRenameCollection(id: string, name: string): void;
  onRenameRequest(collectionId: string, requestId: string, name: string): void;
  onImportCollections(): void;
  onExportCollections(): void;
  triggerNew?: boolean;
  onTriggerNewDone?(): void;
}
const CollectionsPanel: React.FC<CollectionsPanelProps> = ({
  collections, search, expansionStates, onSearch, onToggle, onLoad, onNewCollection, onDeleteCollection, onDeleteRequest,
  onCopyRequest, onMoveRequest, onReorderRequest, onRenameCollection, onRenameRequest,
  onImportCollections, onExportCollections, triggerNew, onTriggerNewDone
}) => {
  const [showNew, setShowNew] = useState(false);
  useEffect(() => { if (triggerNew) { setShowNew(true); onTriggerNewDone?.(); } }, [triggerNew]);
  const [newName, setNewName] = useState('');
  const [dragOverCollectionId, setDragOverCollectionId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ collectionId: string; insertIndex: number } | null>(null);
  const [editingCollection, setEditingCollection] = useState<{ id: string; name: string } | null>(null);
  const [editingRequest, setEditingRequest] = useState<{ collectionId: string; requestId: string; name: string } | null>(null);
  const dragRef = useRef<{ requestId: string; fromCollectionId: string } | null>(null);
  const filtered = collections.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.requests||[]).some(r => (r.name||r.url||'').toLowerCase().includes(search.toLowerCase())));
  const handleCreate = () => { if (newName.trim()) { onNewCollection(newName.trim()); setNewName(''); setShowNew(false); } };
  const clearDragState = () => { dragRef.current = null; setDragOverCollectionId(null); setDropIndicator(null); };
  const allOpen = filtered.length > 0 && filtered.every(c => !!expansionStates[c.id]);
  const toggleAll = () => filtered.forEach(c => onToggle(c.id, !allOpen));
  return (<>
    <div className="toolbar">
      <input className="search-input" type="text" placeholder="Filter..." value={search} onChange={e => onSearch(e.target.value)} />
      <div className="toolbar-icons">
        <button className="btn-icon toolbar-expand" title={allOpen ? 'Collapse all' : 'Expand all'} onClick={toggleAll}>{allOpen ? '⊟' : '⊞'}</button>
        <button className="btn-icon toolbar-expand" title="Import collections from JSON" onClick={onImportCollections}>📥</button>
        <button className="btn-icon toolbar-expand" title="Export collections to JSON" onClick={onExportCollections}>📤</button>
      </div>
    </div>
    <div className="list" onKeyDown={listNavKeyDown}>
      {filtered.length === 0
        ? <div className="empty"><div className="empty-icon">📁</div><div>No collections</div><div className="empty-sub">Save requests to organize them</div></div>
        : filtered.map(col => { // eslint-disable-line
            const reqs = col.requests || [];
            const filteredReqs = search
              ? reqs.filter(r => (r.name||r.url||'').toLowerCase().includes(search.toLowerCase()))
              : reqs;
            const isOpen = !!expansionStates[col.id];
            const isDragOver = dragOverCollectionId === col.id;
            return (
              <div key={col.id}
                className={`collection-group${isDragOver ? ' drag-over' : ''}`}
                onDragOver={(e) => {
                  if (dragRef.current && dragRef.current.fromCollectionId !== col.id) {
                    e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverCollectionId(col.id);
                  }
                }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setDragOverCollectionId(null); setDropIndicator(null); } }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragRef.current && dragRef.current.fromCollectionId !== col.id) {
                    onMoveRequest(dragRef.current.requestId, dragRef.current.fromCollectionId, col.id);
                  }
                  clearDragState();
                }}
              >
                <div className="collection-header" tabIndex={0} onClick={() => onToggle(col.id, !isOpen)} onKeyDown={(e) => { if (e.key === 'Enter') onToggle(col.id, !isOpen); }}>
                  <span className={`caret ${isOpen ? 'open':''}`}>▶</span>
                  {editingCollection?.id === col.id
                    ? <input className="inline-rename" autoFocus value={editingCollection.name}
                        onChange={e => setEditingCollection({ ...editingCollection, name: e.target.value })}
                        onBlur={() => { if (editingCollection.name.trim()) onRenameCollection(col.id, editingCollection.name.trim()); setEditingCollection(null); }}
                        onKeyDown={e => { if (e.key === 'Enter') { if (editingCollection.name.trim()) onRenameCollection(col.id, editingCollection.name.trim()); setEditingCollection(null); } if (e.key === 'Escape') setEditingCollection(null); }}
                        onClick={e => e.stopPropagation()} />
                    : <span className="collection-name" title={col.name} onDoubleClick={e => { e.stopPropagation(); setEditingCollection({ id: col.id, name: col.name }); }}>{col.name}</span>
                  }
                  <span className="collection-count">{search ? `${filteredReqs.length}/` : ''}{reqs.length}</span>
                  <button className="btn-icon btn-rename-col" title="Rename" onClick={e => { e.stopPropagation(); setEditingCollection({ id: col.id, name: col.name }); }}>✎</button>
                  <button className="btn-icon" title="Delete" onClick={e => { e.stopPropagation(); onDeleteCollection(col.id); }}>×</button>
                </div>
                {isOpen && (
                  <div className="collection-requests open">
                    {filteredReqs.length === 0
                      ? <div className="sub-empty">{search ? 'No matching requests' : 'No requests saved'}</div>
                      : filteredReqs.map((req, idx) => (
                          <React.Fragment key={req.id}>
                            {dropIndicator?.collectionId === col.id && dropIndicator.insertIndex === idx && (
                              <div className="drop-indicator" />
                            )}
                            <div className="sub-item"
                              draggable
                              onDragStart={(e) => { dragRef.current = { requestId: req.id!, fromCollectionId: col.id }; e.dataTransfer.effectAllowed = 'move'; (e.currentTarget as HTMLElement).classList.add('dragging'); }}
                              onDragEnd={(e) => { (e.currentTarget as HTMLElement).classList.remove('dragging'); clearDragState(); }}
                              onDragOver={(e) => {
                                if (!dragRef.current || dragRef.current.fromCollectionId !== col.id) return;
                                e.preventDefault(); e.stopPropagation();
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                setDropIndicator({ collectionId: col.id, insertIndex: e.clientY < rect.top + rect.height / 2 ? idx : idx + 1 });
                              }}
                              onDrop={(e) => {
                                if (!dragRef.current || dragRef.current.fromCollectionId !== col.id) return;
                                e.preventDefault(); e.stopPropagation();
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                onReorderRequest(col.id, dragRef.current.requestId, e.clientY < rect.top + rect.height / 2 ? idx : idx + 1);
                                clearDragState();
                              }}
                              tabIndex={0}
                              onClick={() => onLoad(req, col.name)}
                              onKeyDown={(e) => { if (e.key === 'Enter') onLoad(req, col.name); }}>
                              <span className="drag-handle">⠿</span>
                              <span className={`method-badge method-${req.method}`}>{req.method}</span>
                              {editingRequest?.collectionId === col.id && editingRequest.requestId === req.id
                                ? <input className="inline-rename" autoFocus value={editingRequest.name}
                                    onChange={e => setEditingRequest({ ...editingRequest, name: e.target.value })}
                                    onBlur={() => { if (editingRequest.name.trim()) onRenameRequest(col.id, req.id!, editingRequest.name.trim()); setEditingRequest(null); }}
                                    onKeyDown={e => { if (e.key === 'Enter') { if (editingRequest.name.trim()) onRenameRequest(col.id, req.id!, editingRequest.name.trim()); setEditingRequest(null); } if (e.key === 'Escape') setEditingRequest(null); }}
                                    onClick={e => e.stopPropagation()} />
                                : <span className="sub-name" title={req.name || req.url || 'Untitled'}
                                    onDoubleClick={e => { e.stopPropagation(); setEditingRequest({ collectionId: col.id, requestId: req.id!, name: req.name || '' }); }}>
                                    {req.name || req.url || 'Untitled'}
                                  </span>
                              }
                              <button className="btn-icon btn-copy" title="Copy request" onClick={e => { e.stopPropagation(); onCopyRequest(col.id, req.id!); }}>⎘</button>
                              <button className="btn-icon btn-rename-req" title="Rename" onClick={e => { e.stopPropagation(); setEditingRequest({ collectionId: col.id, requestId: req.id!, name: req.name || '' }); }}>✎</button>
                              <button className="btn-icon" title="Delete" onClick={e => { e.stopPropagation(); onDeleteRequest(col.id, req.id!); }}>×</button>
                            </div>
                            {dropIndicator?.collectionId === col.id && dropIndicator.insertIndex === reqs.length && idx === reqs.length - 1 && (
                              <div className="drop-indicator" />
                            )}
                          </React.Fragment>))}
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
  triggerNew?: boolean;
  onTriggerNewDone?(): void;
}
const EnvironmentsPanel: React.FC<EnvironmentsPanelProps> = ({ environments, activeEnvId, onSetActive, onSave, onDelete, triggerNew, onTriggerNewDone }) => {
  const [editingEnv, setEditingEnv] = useState<Environment | null>(null);
  const openNew = () => setEditingEnv({ id: '', name: '', variables: [{ key: '', value: '' }] });
  useEffect(() => { if (triggerNew) { openNew(); onTriggerNewDone?.(); } }, [triggerNew]);
  const activeEnv = environments.find(e => e.id === activeEnvId);
  return (<>
    <div className="toolbar">
      {activeEnv && (
        <span className="active-env-chip" title={`Active: ${activeEnv.name}`}>
          ● {activeEnv.name}
        </span>
      )}
    </div>
    <div className="list">
      {environments.length === 0
        ? <div className="empty"><div className="empty-icon">🌍</div><div>No environments</div><div className="empty-sub">{'Use {{variable}} in requests'}</div></div>
            : environments.map(env => {
            const visibleVars = (env.variables || []).filter(v => (v.key||'').trim() !== '' || (v.value||'').trim() !== '');
            return (
            <div key={env.id} className="env-item" onClick={() => onSetActive(env.id)}>
              <div className={`env-radio ${env.id === activeEnvId ? 'active' : ''}`} />
              <div className="env-info">
                <div className="env-name">{env.name}</div>
                <div className="env-count">{visibleVars.length} variable{visibleVars.length!==1?'s':''}</div>
              </div>
              <button className="btn-icon" title="Edit" onClick={e => { e.stopPropagation(); setEditingEnv({ ...env }); }}>✎</button>
              <button className="btn-icon" title="Delete" onClick={e => { e.stopPropagation(); onDelete(env.id); }}>×</button>
            </div>)} )}
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
