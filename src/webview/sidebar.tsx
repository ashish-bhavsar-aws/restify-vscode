import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Sidebar.css';
import { Icon } from './components/FaIcon';
import {
  faMagnifyingGlass, faFloppyDisk, faTrash, faPen,
  faFileExport, faCopy, faGripVertical,
  faFolder, faFolderOpen, faAnglesDown, faAnglesUp, faChevronRight, faFolderPlus,
} from '@fortawesome/free-solid-svg-icons';
interface HistoryEntry {
  id: string; method: string; url: string; status: number;
  duration?: number; name: string; timestamp?: string;
}
interface CollectionRequest { id?: string; method: string; url: string; name?: string; }
interface CollectionGroup { id: string; name: string; requests?: CollectionRequest[]; groups?: CollectionGroup[]; }
interface Collection { id: string; name: string; requests?: CollectionRequest[]; groups?: CollectionGroup[]; }
type SidebarType = 'history' | 'collections' | 'environments';
interface DragState { requestId: string; fromCollectionId: string; fromGroupId: string | null; }

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
  const [expansionStates, setExpansionStates] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [triggerNewCollection, setTriggerNewCollection] = useState(false);
  const vscodeApi = useRef<any>(null);
  const pendingToggleRef = useRef<{ id: string; state: boolean } | null>(null);

  useEffect(() => {
    const root = document.getElementById('root');
    setSidebarType((root?.getAttribute('data-type') || 'history') as SidebarType);
    vscodeApi.current = (window as any).acquireVsCodeApi?.();
    const handler = (event: MessageEvent) => {
      const d = event.data;
      if (d.command === 'openNewCollectionModal') { setTriggerNewCollection(true); }
      if (d.command === 'setData') {
        if (d.data.history)      setHistory(d.data.history);
        if (d.data.collections)  setCollections(d.data.collections);
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
          onSaveToCollection={(id, collectionName, groupId) => post({ command: 'saveHistoryToCollection', id, collectionName, groupId })} />
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
          onExportAllCollections={() => post({ command: 'exportAllCollections' })}
          onExportCollection={(id: string) => post({ command: 'exportCollection', id })}
          onSaveGroup={(cid, group, parentGroupId) => post({ command: 'saveGroup', collectionId: cid, group, parentGroupId })}
          onDeleteGroup={(cid, gid, groupName) => post({ command: 'deleteGroup', collectionId: cid, groupId: gid, groupName })}
          onRenameGroup={(cid, gid, name) => post({ command: 'renameGroup', collectionId: cid, groupId: gid, name })}
          onDeleteGroupRequest={(cid, gid, rid) => post({ command: 'deleteRequestFromGroup', collectionId: cid, groupId: gid, requestId: rid })}
          onMoveRequestToGroup={(cid, rid, fromGid, toGid, fromCollectionId) => {
            if (fromCollectionId && fromCollectionId !== cid) {
              post({ command: 'moveRequestAcrossCollections', fromCollectionId, toCollectionId: cid, requestId: rid, fromGroupId: fromGid, toGroupId: toGid });
            } else {
              post({ command: 'moveRequestToGroup', collectionId: cid, requestId: rid, fromGroupId: fromGid, toGroupId: toGid });
            }
          }}
          triggerNew={triggerNewCollection}
          onTriggerNewDone={() => setTriggerNewCollection(false)} />
      )}
    </div>
  );
};
/* ─── History ────────────────────────────────────────────── */
interface HistoryPanelProps {
  history: HistoryEntry[]; search: string; collections: Collection[];
  onSearch(q: string): void; onLoad(id: string): void;
  onDelete(id: string): void; onClear(): void;
  onSaveToCollection(id: string, collectionName: string, groupId?: string): void;
}
const HistoryPanel: React.FC<HistoryPanelProps> = ({ history, search, collections, onSearch, onLoad, onDelete, onClear, onSaveToCollection }) => {
  const [saveTarget, setSaveTarget] = useState<HistoryEntry | null>(null);
  const [selectedCol, setSelectedCol] = useState('');
  const [newColName, setNewColName] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('__none__');
  const filtered = history.filter(h =>
    !search || (h.name||'').toLowerCase().includes(search.toLowerCase()) || (h.url||'').toLowerCase().includes(search.toLowerCase()));

  const activeColl = collections.find((c) => c.name === selectedCol);
  const availableGroups: Array<{id: string; label: string}> = [];
  const flattenGroups = (groups: CollectionGroup[], prefix = '') => {
    for (const g of groups) {
      availableGroups.push({ id: g.id, label: `${prefix}${g.name}` });
      if (g.groups?.length) flattenGroups(g.groups, `${prefix}\u00a0\u00a0`);
    }
  };
  if (activeColl) flattenGroups(activeColl.groups || []);

  const handleSaveConfirm = () => {
    if (!saveTarget) return;
    const colName = selectedCol === '__new__' ? newColName.trim() : selectedCol;
    if (colName) {
      const groupId = selectedGroup !== '__none__' ? selectedGroup : undefined;
      onSaveToCollection(saveTarget.id, colName, groupId);
      setSaveTarget(null);
    }
  };

  return (<>
    <div className="toolbar">
      <div className="search-wrapper">
        <Icon icon={faMagnifyingGlass} size={13} className="search-icon" />
        <input className="search-input" type="text" placeholder="Filter history..." value={search} onChange={e => onSearch(e.target.value)} />
      </div>
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
                  <button className="btn-icon btn-save-history" title="Save to collection" onClick={e => { e.stopPropagation(); setSaveTarget(entry); setSelectedCol(collections[0]?.name || '__new__'); setNewColName(''); setSelectedGroup('__none__'); }}><Icon icon={faFloppyDisk} size={12} /></button>
                </div>
                <button className="btn-icon" title="Delete" onClick={e => { e.stopPropagation(); onDelete(entry.id); }}><Icon icon={faTrash} size={12} /></button>
              </div>);
          })}
    </div>
    {saveTarget && (
      <div className="modal-overlay open" onClick={() => setSaveTarget(null)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <h3>Save to Collection</h3>
          <div className="item-name" style={{ fontSize: 11, marginBottom: 8, color: 'var(--muted)' }}>{saveTarget.name || saveTarget.url}</div>
          <label className="modal-label">Collection</label>
          <select className="modal-input" value={selectedCol} onChange={e => { setSelectedCol(e.target.value); setSelectedGroup('__none__'); }}>
            {collections.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            <option value="__new__">+ New collection…</option>
          </select>
          {selectedCol === '__new__' && (
            <input className="modal-input" style={{ marginTop: 6 }} placeholder="Collection name" value={newColName} autoFocus
              onChange={e => setNewColName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveConfirm()} />
          )}
          {availableGroups.length > 0 && (
            <>
              <label className="modal-label" style={{ marginTop: 6 }}>Folder (optional)</label>
              <select className="modal-input" value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}>
                <option value="__none__">— Root (no folder) —</option>
                {availableGroups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
            </>
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
  onExportAllCollections(): void;
  onExportCollection(collectionId: string): void;
  onSaveGroup(collectionId: string, group: CollectionGroup, parentGroupId?: string): void;
  onDeleteGroup(collectionId: string, groupId: string, groupName: string): void;
  onRenameGroup(collectionId: string, groupId: string, name: string): void;
  onDeleteGroupRequest(collectionId: string, groupId: string, requestId: string): void;
  onMoveRequestToGroup(collectionId: string, requestId: string, fromGroupId: string | null, toGroupId: string | null, fromCollectionId?: string): void;
  triggerNew?: boolean;
  onTriggerNewDone?(): void;
}

// ─── Recursive request row ────────────────────────────────
interface RequestRowProps {
  req: CollectionRequest;
  collectionName: string;
  editing: boolean;
  onLoad(): void;
  onDelete(): void;
  onCopy(): void;
  onRename(): void;
  onCommitRename(name: string): void;
  onCancelRename(): void;
  onDragStart?(e: React.DragEvent): void;
  onDragEnd?(e: React.DragEvent): void;
}
const RequestRow: React.FC<RequestRowProps> = ({ req, collectionName: _collectionName, editing, onLoad, onDelete, onCopy, onRename, onCommitRename, onCancelRename, onDragStart, onDragEnd }) => (
  <div className="sub-item" tabIndex={0} draggable
    onClick={onLoad} onKeyDown={e => { if (e.key === 'Enter') onLoad(); }}
    onDragStart={onDragStart} onDragEnd={onDragEnd}>
    <span className="drag-handle"><Icon icon={faGripVertical} size={11} /></span>
    <span className={`method-badge method-${req.method}`}>{req.method}</span>
    {editing
      ? <input className="inline-rename" autoFocus defaultValue={req.name || ''}
          onBlur={e => { if (e.target.value.trim()) onCommitRename(e.target.value.trim()); else onCancelRename(); }}
          onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) onCommitRename((e.target as HTMLInputElement).value.trim()); if (e.key === 'Escape') onCancelRename(); }}
          onClick={e => e.stopPropagation()} />
      : <span className="sub-name" title={req.name || req.url || 'Untitled'}
          onDoubleClick={e => { e.stopPropagation(); onRename(); }}>
          {req.name || req.url || 'Untitled'}
        </span>
    }
    <button className="btn-icon btn-copy" title="Copy request" onClick={e => { e.stopPropagation(); onCopy(); }}><Icon icon={faCopy} size={12} /></button>
    <button className="btn-icon btn-rename-req" title="Rename" onClick={e => { e.stopPropagation(); onRename(); }}><Icon icon={faPen} size={12} /></button>
    <button className="btn-icon" title="Delete" onClick={e => { e.stopPropagation(); onDelete(); }}><Icon icon={faTrash} size={12} /></button>
  </div>
);

// ─── Recursive group tree ─────────────────────────────────
interface GroupTreeProps {
  group: CollectionGroup;
  collectionId: string;
  collectionName: string;
  depth: number;
  search: string;
  expansionStates: Record<string, boolean>;
  editingRequest: { groupId: string; requestId: string } | null;
  dragRef: React.MutableRefObject<DragState | null>;
  onToggle(id: string, open: boolean): void;
  onLoad(req: CollectionRequest): void;
  onDeleteRequest(groupId: string, requestId: string): void;
  onCopyRequest(requestId: string): void;
  onStartRenameRequest(groupId: string, requestId: string): void;
  onCommitRenameRequest(groupId: string, requestId: string, name: string): void;
  onCancelRenameRequest(): void;
  onSaveGroup(group: CollectionGroup, parentGroupId?: string): void;
  onDeleteGroup(groupId: string, groupName: string): void;
  onRenameGroup(groupId: string, name: string): void;
  onMoveRequestToGroup(requestId: string, fromGroupId: string | null, toGroupId: string, fromCollectionId?: string): void;
}
const GroupTree: React.FC<GroupTreeProps> = ({
  group, collectionId, collectionName, depth, search, expansionStates,
  editingRequest, dragRef, onToggle, onLoad, onDeleteRequest, onCopyRequest,
  onStartRenameRequest, onCommitRenameRequest, onCancelRenameRequest,
  onSaveGroup, onDeleteGroup, onRenameGroup, onMoveRequestToGroup
}) => {
  const [renamingGroup, setRenamingGroup] = useState(false);
  const [renameVal, setRenameVal] = useState(group.name);
  const [showNewSubGroup, setShowNewSubGroup] = useState(false);
  const [newSubGroupName, setNewSubGroupName] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const autoExpandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOpen = !!expansionStates[group.id];
  const indent = depth * 12;

  const reqs = group.requests || [];
  const subGroups = group.groups || [];

  // search filter
  const matchesSearch = (r: CollectionRequest) =>
    !search || (r.name||r.url||'').toLowerCase().includes(search.toLowerCase());
  const groupMatchesSearch = !search ||
    group.name.toLowerCase().includes(search.toLowerCase()) ||
    reqs.some(matchesSearch) ||
    subGroups.some(sg => sg.name.toLowerCase().includes(search.toLowerCase()));

  if (!groupMatchesSearch) return null;

  const handleCreateSubGroup = () => {
    if (!newSubGroupName.trim()) return;
    onSaveGroup({
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      name: newSubGroupName.trim(),
      requests: [],
      groups: [],
    }, group.id);
    setNewSubGroupName('');
    setShowNewSubGroup(false);
  };

  const clearAutoExpand = () => {
    if (autoExpandTimer.current) { clearTimeout(autoExpandTimer.current); autoExpandTimer.current = null; }
  };

  const handleGroupDragOver = (e: React.DragEvent) => {
    const d = dragRef.current;
    if (!d || d.fromGroupId === group.id) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
    if (!autoExpandTimer.current) {
      autoExpandTimer.current = setTimeout(() => { onToggle(group.id, true); autoExpandTimer.current = null; }, 650);
    }
  };

  const handleGroupDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
      clearAutoExpand();
    }
  };

  const handleGroupDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    clearAutoExpand();
    const d = dragRef.current;
    if (!d || d.fromGroupId === group.id) return;
    // Support both same-collection and cross-collection moves
    if (d.fromCollectionId === collectionId) {
      onMoveRequestToGroup(d.requestId, d.fromGroupId, group.id);
    } else {
      // Cross-collection move
      onMoveRequestToGroup(d.requestId, d.fromGroupId, group.id, d.fromCollectionId);
    }
    dragRef.current = null;
  };

  return (
    <div className={`group-tree${isDragOver ? ' drag-over' : ''}`} style={{ marginLeft: indent }}
      onDragOver={handleGroupDragOver}
      onDragLeave={handleGroupDragLeave}
      onDrop={handleGroupDrop}>
      <div className="group-header" tabIndex={0}
        onClick={() => onToggle(group.id, !isOpen)}
        onKeyDown={e => { if (e.key === 'Enter') onToggle(group.id, !isOpen); }}>
        <span className={`caret ${isOpen ? 'open' : ''}`}><Icon icon={faChevronRight} size={10} /></span>
        <span className="group-folder-icon"><Icon icon={isOpen ? faFolderOpen : faFolder} size={12} /></span>
        {renamingGroup
          ? <input className="inline-rename" autoFocus value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onBlur={() => { if (renameVal.trim()) onRenameGroup(group.id, renameVal.trim()); setRenamingGroup(false); }}
              onKeyDown={e => { if (e.key === 'Enter' && renameVal.trim()) { onRenameGroup(group.id, renameVal.trim()); setRenamingGroup(false); } if (e.key === 'Escape') setRenamingGroup(false); }}
              onClick={e => e.stopPropagation()} />
          : <span className="group-name" title={group.name}
              onDoubleClick={e => { e.stopPropagation(); setRenamingGroup(true); setRenameVal(group.name); }}>
              {group.name}
            </span>
        }
        <span className="collection-count">{reqs.length}</span>
        <button className="btn-icon btn-add-group" title="New sub-folder"
          onClick={e => { e.stopPropagation(); setShowNewSubGroup(true); onToggle(group.id, true); }}>
          <Icon icon={faFolderPlus} size={11} />
        </button>
        <button className="btn-icon btn-rename-col" title="Rename folder"
          onClick={e => { e.stopPropagation(); setRenamingGroup(true); setRenameVal(group.name); }}>
          <Icon icon={faPen} size={11} />
        </button>
        <button className="btn-icon" title="Delete folder"
          onClick={e => { e.stopPropagation(); onDeleteGroup(group.id, group.name); }}>
          <Icon icon={faTrash} size={11} />
        </button>
      </div>
      {isOpen && (
        <div className="group-body">
          {/* Sub-groups */}
          {subGroups.map(sg => (
            <GroupTree key={sg.id} group={sg} collectionId={collectionId} collectionName={collectionName}
              depth={0} search={search} expansionStates={expansionStates}
              editingRequest={editingRequest} dragRef={dragRef}
              onToggle={onToggle} onLoad={onLoad}
              onDeleteRequest={onDeleteRequest} onCopyRequest={onCopyRequest}
              onStartRenameRequest={onStartRenameRequest}
              onCommitRenameRequest={onCommitRenameRequest}
              onCancelRenameRequest={onCancelRenameRequest}
              onSaveGroup={(g, pId) => onSaveGroup(g, pId ?? sg.id)}
              onDeleteGroup={onDeleteGroup}
              onRenameGroup={onRenameGroup}
              onMoveRequestToGroup={onMoveRequestToGroup} />
          ))}
          {/* New sub-group input */}
          {showNewSubGroup && (
            <div className="new-group-inline">
              <input className="inline-rename" autoFocus placeholder="Folder name"
                value={newSubGroupName} onChange={e => setNewSubGroupName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateSubGroup(); if (e.key === 'Escape') { setShowNewSubGroup(false); setNewSubGroupName(''); } }}
                onBlur={() => { if (newSubGroupName.trim()) handleCreateSubGroup(); else { setShowNewSubGroup(false); setNewSubGroupName(''); } }} />
            </div>
          )}
          {/* Requests */}
          {reqs.filter(matchesSearch).map(req => (
            <RequestRow key={req.id} req={req} collectionName={collectionName}
              editing={editingRequest?.groupId === group.id && editingRequest?.requestId === req.id}
              onLoad={() => onLoad(req)}
              onDelete={() => onDeleteRequest(group.id, req.id!)}
              onCopy={() => onCopyRequest(req.id!)}
              onRename={() => onStartRenameRequest(group.id, req.id!)}
              onCommitRename={name => onCommitRenameRequest(group.id, req.id!, name)}
              onCancelRename={onCancelRenameRequest}
              onDragStart={e => { dragRef.current = { requestId: req.id!, fromCollectionId: collectionId, fromGroupId: group.id }; e.dataTransfer.effectAllowed = 'move'; (e.currentTarget as HTMLElement).classList.add('dragging'); }}
              onDragEnd={e => { (e.currentTarget as HTMLElement).classList.remove('dragging'); }} />
          ))}
          {reqs.length === 0 && subGroups.length === 0 && !showNewSubGroup && (
            <div className="sub-empty">Empty folder</div>
          )}
        </div>
      )}
    </div>
  );
};

const CollectionsPanel: React.FC<CollectionsPanelProps> = ({
  collections, search, expansionStates, onSearch, onToggle, onLoad, onNewCollection, onDeleteCollection, onDeleteRequest,
  onCopyRequest, onMoveRequest: _onMoveRequest, onReorderRequest: _onReorderRequest, onRenameCollection, onRenameRequest,
  onExportAllCollections, onExportCollection,
  onSaveGroup, onDeleteGroup, onRenameGroup, onDeleteGroupRequest, onMoveRequestToGroup,
  triggerNew, onTriggerNewDone
}) => {
  const [showNew, setShowNew] = useState(false);
  useEffect(() => { if (triggerNew) { setShowNew(true); onTriggerNewDone?.(); } }, [triggerNew, onTriggerNewDone]);
  const [newName, setNewName] = useState('');
  const [editingCollection, setEditingCollection] = useState<{ id: string; name: string } | null>(null);
  // top-level request rename (outside groups)
  const [editingRequest, setEditingRequest] = useState<{ collectionId: string; requestId: string } | null>(null);
  // group request rename  
  const [editingGroupRequest, setEditingGroupRequest] = useState<{ groupId: string; requestId: string } | null>(null);
  const [showNewGroupFor, setShowNewGroupFor] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  // Shared drag state across the whole panel
  const dragRef = useRef<DragState | null>(null);
  const [topLevelDropTarget, setTopLevelDropTarget] = useState<string | null>(null); // collectionId being hovered

  const filtered = collections.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.requests||[]).some(r => (r.name||r.url||'').toLowerCase().includes(search.toLowerCase())) ||
    (c.groups||[]).some(g => g.name.toLowerCase().includes(search.toLowerCase())));
  const handleCreate = () => { if (newName.trim()) { onNewCollection(newName.trim()); setNewName(''); setShowNew(false); } };
  const allOpen = filtered.length > 0 && filtered.every(c => !!expansionStates[c.id]);
  const toggleAll = () => filtered.forEach(c => onToggle(c.id, !allOpen));

  const handleCreateGroup = (collectionId: string) => {
    if (!newGroupName.trim()) return;
    onSaveGroup(collectionId, {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      name: newGroupName.trim(),
      requests: [],
      groups: [],
    });
    setNewGroupName('');
    setShowNewGroupFor(null);
  };

  return (<>
    <div className="toolbar">
      <div className="search-wrapper">
        <Icon icon={faMagnifyingGlass} size={13} className="search-icon" />
        <input className="search-input" type="text" placeholder="Filter..." value={search} onChange={e => onSearch(e.target.value)} />
      </div>
      <div className="toolbar-icons">
        <button className="btn-icon toolbar-expand" title={allOpen ? 'Collapse all' : 'Expand all'} onClick={toggleAll}><Icon icon={allOpen ? faAnglesUp : faAnglesDown} size={13} /></button>
        <button className="btn-icon toolbar-expand" title="Export all collections" onClick={onExportAllCollections}><Icon icon={faFileExport} size={13} /></button>
      </div>
    </div>
    <div className="list" onKeyDown={listNavKeyDown}>
      {filtered.length === 0
        ? <div className="empty"><div className="empty-icon"><Icon icon={faFolder} size={28} style={{ opacity: 0.4 }} /></div><div>No collections</div><div className="empty-sub">Save requests to organize them</div></div>
        : filtered.map(col => {
            const topReqs = col.requests || [];
            const groups = col.groups || [];
            const isOpen = !!expansionStates[col.id];
            const countRequests = (grps: CollectionGroup[]): number => grps.reduce((s, g) => s + (g.requests?.length || 0) + countRequests(g.groups || []), 0);
            const totalCount = topReqs.length + countRequests(groups);
            const filteredTopReqs = search ? topReqs.filter(r => (r.name||r.url||'').toLowerCase().includes(search.toLowerCase())) : topReqs;

            return (
              <div key={col.id} className={`collection-group${topLevelDropTarget === col.id ? ' drag-over' : ''}`}>
                <div className="collection-header" tabIndex={0}
                  onClick={() => onToggle(col.id, !isOpen)}
                  onKeyDown={e => { if (e.key === 'Enter') onToggle(col.id, !isOpen); }}
                  onDragOver={e => {
                    const d = dragRef.current;
                    if (!d || d.fromCollectionId === col.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setTopLevelDropTarget(col.id);
                  }}
                  onDragLeave={e => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setTopLevelDropTarget(null);
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setTopLevelDropTarget(null);
                    const d = dragRef.current;
                    if (!d || d.fromCollectionId === col.id) return;
                    // Drop to top-level of this collection
                    onMoveRequestToGroup(col.id, d.requestId, d.fromGroupId, null, d.fromCollectionId);
                    dragRef.current = null;
                  }}>
                  <span className={`caret ${isOpen ? 'open' : ''}`}><Icon icon={faChevronRight} size={10} /></span>
                  {editingCollection?.id === col.id
                    ? <input className="inline-rename" autoFocus value={editingCollection.name}
                        onChange={e => setEditingCollection({ ...editingCollection, name: e.target.value })}
                        onBlur={() => { if (editingCollection.name.trim()) onRenameCollection(col.id, editingCollection.name.trim()); setEditingCollection(null); }}
                        onKeyDown={e => { if (e.key === 'Enter') { if (editingCollection.name.trim()) onRenameCollection(col.id, editingCollection.name.trim()); setEditingCollection(null); } if (e.key === 'Escape') setEditingCollection(null); }}
                        onClick={e => e.stopPropagation()} />
                    : <span className="collection-name" title={col.name}
                        onDoubleClick={e => { e.stopPropagation(); setEditingCollection({ id: col.id, name: col.name }); }}>
                        {col.name}
                      </span>
                  }
                  <span className="collection-count">{totalCount}</span>
                  <button className="btn-icon btn-add-group" title="New folder"
                    onClick={e => { e.stopPropagation(); setShowNewGroupFor(col.id); setNewGroupName(''); onToggle(col.id, true); }}>
                    <Icon icon={faFolderPlus} size={12} />
                  </button>
                  <button className="btn-icon btn-rename-col" title="Rename" onClick={e => { e.stopPropagation(); setEditingCollection({ id: col.id, name: col.name }); }}><Icon icon={faPen} size={12} /></button>
                  <button className="btn-icon btn-export" title="Export collection" onClick={e => { e.stopPropagation(); onExportCollection(col.id); }}><Icon icon={faFileExport} size={12} /></button>
                  <button className="btn-icon" title="Delete" onClick={e => { e.stopPropagation(); onDeleteCollection(col.id); }}><Icon icon={faTrash} size={12} /></button>
                </div>
                {isOpen && (
                  <div className={`collection-requests open${topLevelDropTarget === col.id ? ' drag-over-toplevel' : ''}`}
                    onDragOver={e => {
                      const d = dragRef.current;
                      if (!d) return;
                      // Allow drops if it's from a different collection or different location in same collection
                      if (d.fromCollectionId === col.id && d.fromGroupId === null) return; // Same top-level, skip
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setTopLevelDropTarget(col.id);
                    }}
                    onDragLeave={e => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) setTopLevelDropTarget(null);
                    }}
                    onDrop={e => {
                      setTopLevelDropTarget(null);
                      const d = dragRef.current;
                      if (!d) return;
                      // Allow drops if it's from a different collection or different location in same collection
                      if (d.fromCollectionId === col.id && d.fromGroupId === null) return; // Same top-level, skip
                      e.preventDefault();
                      // Support both same-collection and cross-collection moves
                      if (d.fromCollectionId === col.id) {
                        onMoveRequestToGroup(col.id, d.requestId, d.fromGroupId, null);
                      } else {
                        // Cross-collection move (from different collection)
                        onMoveRequestToGroup(col.id, d.requestId, d.fromGroupId, null, d.fromCollectionId);
                      }
                      dragRef.current = null;
                    }}>
                    {/* Groups (folders) */}
                    {groups.map(grp => (
                      <GroupTree key={grp.id}
                        group={grp}
                        collectionId={col.id}
                        collectionName={col.name}
                        depth={1}
                        search={search}
                        expansionStates={expansionStates}
                        editingRequest={editingGroupRequest}
                        dragRef={dragRef}
                        onToggle={onToggle}
                        onLoad={req => onLoad(req, col.name)}
                        onDeleteRequest={(gid, rid) => onDeleteGroupRequest(col.id, gid, rid)}
                        onCopyRequest={rid => onCopyRequest(col.id, rid)}
                        onStartRenameRequest={(gid, rid) => setEditingGroupRequest({ groupId: gid, requestId: rid })}
                        onCommitRenameRequest={(gid, rid, name) => {
                          setEditingGroupRequest(null);
                          (window as any).acquireVsCodeApi?.()?.postMessage?.({ command: 'renameGroupRequest', collectionId: col.id, groupId: gid, requestId: rid, name });
                        }}
                        onCancelRenameRequest={() => setEditingGroupRequest(null)}
                        onSaveGroup={(g, pId) => onSaveGroup(col.id, g, pId ?? grp.id)}
                        onDeleteGroup={(gid, gname) => onDeleteGroup(col.id, gid, gname)}
                        onRenameGroup={(gid, name) => onRenameGroup(col.id, gid, name)}
                        onMoveRequestToGroup={(rid, fromGid, toGid, fromCollectionId) => {
                          if (fromCollectionId && fromCollectionId !== col.id) {
                            onMoveRequestToGroup(col.id, rid, fromGid, toGid, fromCollectionId);
                          } else {
                            onMoveRequestToGroup(col.id, rid, fromGid, toGid);
                          }
                        }}
                      />
                    ))}
                    {/* New group inline input */}
                    {showNewGroupFor === col.id && (
                      <div className="new-group-inline" style={{ paddingLeft: 12 }}>
                        <Icon icon={faFolder} size={11} style={{ color: 'var(--muted)', marginRight: 4 }} />
                        <input className="inline-rename" autoFocus placeholder="Folder name"
                          value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleCreateGroup(col.id); if (e.key === 'Escape') { setShowNewGroupFor(null); setNewGroupName(''); } }}
                          onBlur={() => { if (newGroupName.trim()) handleCreateGroup(col.id); else { setShowNewGroupFor(null); setNewGroupName(''); } }} />
                      </div>
                    )}
                    {/* Top-level (ungrouped) requests */}
                    {filteredTopReqs.map((req) => (
                      <div key={req.id} className="sub-item" tabIndex={0} draggable
                        onClick={() => onLoad(req, col.name)}
                        onKeyDown={e => { if (e.key === 'Enter') onLoad(req, col.name); }}
                        onDragStart={e => { dragRef.current = { requestId: req.id!, fromCollectionId: col.id, fromGroupId: null }; e.dataTransfer.effectAllowed = 'move'; (e.currentTarget as HTMLElement).classList.add('dragging'); }}
                        onDragEnd={e => { (e.currentTarget as HTMLElement).classList.remove('dragging'); }}>
                        <span className="drag-handle"><Icon icon={faGripVertical} size={11} /></span>
                        <span className={`method-badge method-${req.method}`}>{req.method}</span>
                        {editingRequest?.collectionId === col.id && editingRequest.requestId === req.id
                          ? <input className="inline-rename" autoFocus defaultValue={req.name || ''}
                              onBlur={e => { if (e.target.value.trim()) onRenameRequest(col.id, req.id!, e.target.value.trim()); setEditingRequest(null); }}
                              onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) { onRenameRequest(col.id, req.id!, (e.target as HTMLInputElement).value.trim()); setEditingRequest(null); } if (e.key === 'Escape') setEditingRequest(null); }}
                              onClick={e => e.stopPropagation()} />
                          : <span className="sub-name" title={req.name || req.url || 'Untitled'}
                              onDoubleClick={e => { e.stopPropagation(); setEditingRequest({ collectionId: col.id, requestId: req.id! }); }}>
                              {req.name || req.url || 'Untitled'}
                            </span>
                        }
                        <button className="btn-icon btn-copy" title="Copy request" onClick={e => { e.stopPropagation(); onCopyRequest(col.id, req.id!); }}><Icon icon={faCopy} size={12} /></button>
                        <button className="btn-icon btn-rename-req" title="Rename" onClick={e => { e.stopPropagation(); setEditingRequest({ collectionId: col.id, requestId: req.id! }); }}><Icon icon={faPen} size={12} /></button>
                        <button className="btn-icon" title="Delete" onClick={e => { e.stopPropagation(); onDeleteRequest(col.id, req.id!); }}><Icon icon={faTrash} size={12} /></button>
                      </div>
                    ))}
                    {topReqs.length === 0 && groups.length === 0 && !showNewGroupFor && (
                      <div className="sub-empty">No requests saved</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
    </div>
    {showNew && (
      <div className="modal-overlay open" onClick={() => setShowNew(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <h3>New Collection</h3>
          <label className="modal-label">Name</label>
          <input className="modal-input" placeholder="My Collection" value={newName} autoFocus
            onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreate()} />
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
            <button className="btn" onClick={handleCreate}>Create</button>
          </div>
        </div>
      </div>
    )}
  </>);
};

