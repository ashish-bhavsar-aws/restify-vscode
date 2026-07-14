import React, { useState, useEffect, useRef, useCallback } from 'react';
import styled, { css } from 'styled-components';
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

const METHOD_COLORS: Record<string, string> = {
  GET: 'var(--tag-get)',
  POST: 'var(--tag-post)',
  PUT: 'var(--tag-put)',
  DELETE: 'var(--tag-delete)',
  PATCH: 'var(--tag-patch)',
  HEAD: 'var(--tag-head)',
  OPTIONS: 'var(--muted)',
};

const STATUS_COLORS: Record<string, string> = {
  ok: 'var(--success)',
  warn: 'var(--tag-patch)',
  err: 'var(--error)',
};

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
const vscodeApi = (window as any).acquireVsCodeApi?.();

/* ─── Styled Components ──────────────────────────────────── */

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background: color-mix(in srgb, ${({ theme }) => theme.surface} 92%, transparent);
  flex-shrink: 0;
  overflow: hidden;
`;

const SearchWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
`;

const SearchIconWrapper = styled.div`
  position: absolute;
  left: 7px;
  top: 50%;
  transform: translateY(-50%);
  color: ${({ theme }) => theme.muted};
  pointer-events: none;
  font-size: 11px;
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 0;
  width: 100%;
  background: ${({ theme }) => theme.inputBg};
  border: 1px solid ${({ theme }) => theme.border};
  color: ${({ theme }) => theme.fg};
  padding: 4px 8px 4px 26px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 11px;
  outline: none;
  font-family: inherit;

  &:focus {
    border-color: ${({ theme }) => theme.accent};
  }

  &::placeholder {
    color: ${({ theme }) => theme.muted};
  }
`;

const PrimaryButton = styled.button`
  background: ${({ theme }) => theme.accent};
  color: ${({ theme }) => theme.accentFg};
  border: none;
  padding: 4px 10px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  flex-shrink: 0;
  transition: opacity 0.15s, transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 1px 0 ${({ theme }) => theme.innerHighlight} inset;

  &:hover {
    opacity: 0.85;
  }
`;

const GhostButton = styled.button`
  background: transparent;
  color: ${({ theme }) => theme.muted};
  border: 1px solid ${({ theme }) => theme.border};
  padding: 4px 10px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.15s;

  &:hover {
    color: ${({ theme }) => theme.fg};
    background: ${({ theme }) => theme.hover};
  }
`;

const IconButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.muted};
  cursor: pointer;
  padding: 2px 5px;
  font-size: 14px;
  border-radius: 3px;
  flex-shrink: 0;
  transition: color 0.1s;
  line-height: 1;

  &:hover {
    color: ${({ theme }) => theme.error};
  }
`;

const SaveHistoryBtn = styled(IconButton)`
  font-size: 13px;
  font-weight: 700;

  &:hover {
    color: ${({ theme }) => theme.accent} !important;
  }
`;

const CopyBtn = styled(IconButton)`
  opacity: 0;
  transition: opacity 0.15s;

  &:hover {
    color: ${({ theme }) => theme.accent} !important;
  }
`;

const AddGroupBtn = styled(IconButton)`
  opacity: 0;
  transition: opacity 0.15s;

  &:hover {
    color: ${({ theme }) => theme.accent} !important;
  }
`;

const RenameColBtn = styled(IconButton)`
  opacity: 0;
  transition: opacity 0.15s;

  &:hover {
    color: ${({ theme }) => theme.accent} !important;
  }
`;

const RenameReqBtn = styled(IconButton)`
  opacity: 0;
  transition: opacity 0.15s;

  &:hover {
    color: ${({ theme }) => theme.accent} !important;
  }
`;

const DragHandle = styled.span`
  color: ${({ theme }) => theme.muted};
  font-size: 13px;
  cursor: grab;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
  line-height: 1;
  padding: 0 1px;
  user-select: none;
  width: 14px;
  text-align: center;
`;

const SubItem = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 5px 8px;
  border-bottom: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 30%, transparent);
  cursor: pointer;
  transition: background 0.1s;

  &:hover {
    background: ${({ theme }) => theme.hover};

    ${DragHandle} {
      opacity: 1;
    }

    ${CopyBtn} {
      opacity: 1;
    }

    ${RenameReqBtn} {
      opacity: 1;
    }
  }

  &[data-dragging] {
    opacity: 0.4;
  }
`;

const SubName = styled.span`
  flex: 1;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const SubEmpty = styled.div`
  padding: 8px 24px;
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
`;

const ItemActions = styled.div`
  display: none;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
`;

const ItemContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const ItemName = styled.div`
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ItemMeta = styled.div`
  font-size: 10px;
  color: ${({ theme }) => theme.muted};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
`;

const ItemRight = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
`;

const StatusRow = styled.div`
  display: flex;
  align-items: center;
  gap: 3px;
`;

const StatusDot = styled.span<{ $status: string }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $status }) => STATUS_COLORS[$status] || 'var(--error)'};
`;

const StatusText = styled.span`
  font-size: 10px;
  color: ${({ theme }) => theme.muted};
`;

const Time = styled.span`
  font-size: 9px;
  color: ${({ theme }) => theme.muted};
`;

const MethodBadge = styled.span<{ $method: string }>`
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
  letter-spacing: 0.5px;
  background: color-mix(in srgb, currentColor 15%, transparent);
  color: ${({ $method }) => METHOD_COLORS[$method] || 'var(--muted)'};
`;

const Item = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 50%, transparent);
  cursor: pointer;
  transition: background 0.1s, transform 0.1s;

  &:hover {
    background: ${({ theme }) => theme.hover};

    ${ItemActions} {
      display: flex;
    }

    ${SaveHistoryBtn} {
      color: ${({ theme }) => theme.accent} !important;
    }
  }
`;

const List = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.border};
    border-radius: 2px;
  }
`;

const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  color: ${({ theme }) => theme.muted};
  gap: 6px;
  text-align: center;
`;

const EmptyIcon = styled.div`
  font-size: 28px;
  opacity: 0.4;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 28px;
    height: 28px;
    object-fit: contain;
    display: block;
  }
`;

const EmptySub = styled.div`
  font-size: 10px;
  opacity: 0.6;
`;

const Caret = styled.span<{ $open: boolean }>`
  font-size: 10px;
  transition: transform 0.2s;
  color: ${({ theme }) => theme.muted};
  display: inline-block;
  transform: ${({ $open }) => ($open ? 'rotate(90deg)' : 'none')};
`;

const CollectionName = styled.span`
  flex: 1;
  font-weight: 600;
  font-size: 12px;
`;

const CollectionCount = styled.span`
  color: ${({ theme }) => theme.muted};
  font-size: 10px;
`;

const CollectionRequests = styled.div<{ $open: boolean; $isDragOver: boolean }>`
  display: ${({ $open }) => ($open ? 'block' : 'none')};
  ${({ $isDragOver, theme }) => $isDragOver && css`
    outline: 1px dashed ${theme.accent};
    background: color-mix(in srgb, ${theme.accent} 8%, transparent);
  `}
`;

const CollectionHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  cursor: pointer;
  background: color-mix(in srgb, ${({ theme }) => theme.hover} 45%, transparent);
  user-select: none;
  transition: background 0.1s;

  &:hover {
    background: ${({ theme }) => theme.hover};

    ${AddGroupBtn} {
      opacity: 1;
    }

    ${RenameColBtn} {
      opacity: 1;
    }
  }
`;

const CollectionGroup = styled.div<{ $isDragOver: boolean }>`
  border-bottom: 1px solid ${({ theme }) => theme.border};

  ${({ $isDragOver, theme }) => $isDragOver && css`
    & > ${CollectionHeader} {
      background: color-mix(in srgb, ${theme.accent} 18%, transparent);
      outline: 1px dashed ${theme.accent};
    }
  `}
`;

const InlineRename = styled.input`
  flex: 1;
  background: ${({ theme }) => theme.inputBg};
  border: 1px solid ${({ theme }) => theme.accent};
  color: ${({ theme }) => theme.fg};
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  min-width: 0;
`;

const NewGroupInline = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 4px 20px;
`;

const GroupFolderIcon = styled.span`
  color: ${({ theme }) => theme.muted};
  flex-shrink: 0;
  opacity: 0.8;
`;

const GroupName = styled.span`
  flex: 1;
  font-size: 11px;
  font-weight: 600;
  color: ${({ theme }) => theme.fg};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const GroupBody = styled.div``;

const GroupHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  cursor: pointer;
  transition: background 0.1s;
  user-select: none;

  &:hover {
    background: ${({ theme }) => theme.hover};

    ${AddGroupBtn} {
      opacity: 1;
    }

    ${RenameColBtn} {
      opacity: 1;
    }
  }
`;

const GroupTreeWrapper = styled.div<{ $isDragOver: boolean }>`
  border-left: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 60%, transparent);
  margin-left: 12px;

  ${({ $isDragOver, theme }) => $isDragOver && css`
    & > ${GroupHeader} {
      background: color-mix(in srgb, ${theme.accent} 18%, transparent);
      outline: 1px dashed ${theme.accent};
      border-radius: 3px;
    }
  `}
`;

const ToolbarIcons = styled.div`
  display: flex;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
`;

const ToolbarExpand = styled(IconButton)`
  font-size: 14px;
  padding: 2px 3px;
  opacity: 0.7;

  &:hover {
    color: ${({ theme }) => theme.accent} !important;
    opacity: 1;
  }
`;

const ModalOverlay = styled.div<{ $open: boolean }>`
  display: ${({ $open }) => ($open ? 'flex' : 'none')};
  position: fixed;
  inset: 0;
  background: ${({ theme }) => theme.overlayBg};
  z-index: 100;
  align-items: center;
  justify-content: center;
`;

const ModalBox = styled.div`
  background: ${({ theme }) => theme.bg};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 16px;
  width: 90%;
  max-width: 320px;
  box-shadow: 0 20px 48px ${({ theme }) => theme.shadowMd};

  h3 {
    font-size: 13px;
    margin-bottom: 12px;
    color: ${({ theme }) => theme.fg};
  }
`;

const ModalLabel = styled.label`
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
  display: block;
  margin-bottom: 4px;
  margin-top: 8px;
`;

const ModalInput = styled.input`
  width: 100%;
  background: ${({ theme }) => theme.inputBg};
  border: 1px solid ${({ theme }) => theme.border};
  color: ${({ theme }) => theme.fg};
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
  font-family: inherit;

  &:focus {
    border-color: ${({ theme }) => theme.accent};
  }
`;

const ModalSelect = styled.select`
  width: 100%;
  background: ${({ theme }) => theme.inputBg};
  border: 1px solid ${({ theme }) => theme.border};
  color: ${({ theme }) => theme.fg};
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
  font-family: inherit;

  &:focus {
    border-color: ${({ theme }) => theme.accent};
  }
`;

const ModalActions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 12px;
  justify-content: flex-end;
`;

/* ─── Sidebar ────────────────────────────────────────────── */
export const Sidebar: React.FC = () => {
  const [sidebarType, setSidebarType] = useState<SidebarType>('history');
  const [history, setHistory]           = useState<HistoryEntry[]>([]);
  const [collections, setCollections]   = useState<Collection[]>([]);
  const [expansionStates, setExpansionStates] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [triggerNewCollection, setTriggerNewCollection] = useState(false);
  const pendingToggleRef = useRef<{ id: string; state: boolean } | null>(null);

  useEffect(() => {
    const root = document.getElementById('root');
    setSidebarType((root?.getAttribute('data-type') || 'history') as SidebarType);
    const handler = (event: MessageEvent) => {
      const d = event.data;
      if (d.command === 'openNewCollectionModal') { setTriggerNewCollection(true); }
      if (d.command === 'setData') {
        if (d.data.history)      setHistory(d.data.history);
        if (d.data.collections)  setCollections(d.data.collections);
        if (d.data.expansionStates && !pendingToggleRef.current) {
          setExpansionStates(d.data.expansionStates);
        }
        if (pendingToggleRef.current) {
          pendingToggleRef.current = null;
        }
      }
    };
    window.addEventListener('message', handler);
    vscodeApi?.postMessage({ command: 'requestData' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const post = useCallback((msg: any) => vscodeApi?.postMessage(msg), []);

  const handleToggleCollection = useCallback((id: string, isOpen: boolean) => {
    pendingToggleRef.current = { id, state: isOpen };
    setExpansionStates(p => ({ ...p, [id]: isOpen }));
    post({ command: 'toggleCollectionState', id, isOpen });
  }, [post]);

  return (
    <Container>
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
    </Container>
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
    <Toolbar>
      <SearchWrapper>
        <SearchIconWrapper>
          <Icon icon={faMagnifyingGlass} size={13} />
        </SearchIconWrapper>
        <SearchInput type="text" placeholder="Filter history..." value={search} onChange={e => onSearch(e.target.value)} />
      </SearchWrapper>
      {history.length > 0 && <GhostButton onClick={onClear}>Clear</GhostButton>}
    </Toolbar>
    <List onKeyDown={listNavKeyDown}>
      {filtered.length === 0
        ? <Empty>
            <EmptyIcon>
              <img src={(window as any).restifyMedia?.sidebarIcon || ''} alt="Restify" />
            </EmptyIcon>
            <div>No requests yet</div>
            <EmptySub>Execute a request to see it here</EmptySub>
          </Empty>
        : filtered.map(entry => {
            const sc = !entry.status || entry.status === 0 ? 'err' : entry.status < 300 ? 'ok' : entry.status < 400 ? 'warn' : 'err';
            return (
              <Item key={entry.id} tabIndex={0} onClick={() => onLoad(entry.id)} onKeyDown={(e) => { if (e.key === 'Enter') onLoad(entry.id); }}>
                <MethodBadge $method={entry.method}>{entry.method}</MethodBadge>
                <ItemContent>
                  <ItemName title={entry.name || entry.url}>{entry.name || entry.url}</ItemName>
                  <ItemMeta>{relativeTime(entry.timestamp)}{entry.url !== entry.name && entry.url ? ` · ${entry.url}` : ''}</ItemMeta>
                </ItemContent>
                <ItemRight>
                  <StatusRow><StatusDot $status={sc} /><StatusText>{entry.status||'err'}</StatusText></StatusRow>
                  {entry.duration != null && <Time>{entry.duration}ms</Time>}
                </ItemRight>
                <ItemActions>
                  <SaveHistoryBtn title="Save to collection" onClick={e => { e.stopPropagation(); setSaveTarget(entry); setSelectedCol(collections[0]?.name || '__new__'); setNewColName(''); setSelectedGroup('__none__'); }}><Icon icon={faFloppyDisk} size={12} /></SaveHistoryBtn>
                </ItemActions>
                <IconButton title="Delete" onClick={e => { e.stopPropagation(); onDelete(entry.id); }}><Icon icon={faTrash} size={12} /></IconButton>
              </Item>);
          })}
    </List>
    {saveTarget && (
      <ModalOverlay $open onClick={() => setSaveTarget(null)}>
        <ModalBox onClick={e => e.stopPropagation()}>
          <h3>Save to Collection</h3>
          <ItemName style={{ fontSize: 11, marginBottom: 8, color: 'var(--muted)' }}>{saveTarget.name || saveTarget.url}</ItemName>
          <ModalLabel>Collection</ModalLabel>
          <ModalSelect value={selectedCol} onChange={e => { setSelectedCol(e.target.value); setSelectedGroup('__none__'); }}>
            {collections.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            <option value="__new__">+ New collection…</option>
          </ModalSelect>
          {selectedCol === '__new__' && (
            <ModalInput style={{ marginTop: 6 }} placeholder="Collection name" value={newColName} autoFocus
              onChange={e => setNewColName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveConfirm()} />
          )}
          {availableGroups.length > 0 && (
            <>
              <ModalLabel style={{ marginTop: 6 }}>Folder (optional)</ModalLabel>
              <ModalSelect value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}>
                <option value="__none__">— Root (no folder) —</option>
                {availableGroups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
              </ModalSelect>
            </>
          )}
          <ModalActions>
            <GhostButton onClick={() => setSaveTarget(null)}>Cancel</GhostButton>
            <PrimaryButton onClick={handleSaveConfirm}>Save</PrimaryButton>
          </ModalActions>
        </ModalBox>
      </ModalOverlay>
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
  <SubItem tabIndex={0} draggable data-testid="collection-request"
    onClick={onLoad} onKeyDown={e => { if (e.key === 'Enter') onLoad(); }}
    onDragStart={onDragStart} onDragEnd={onDragEnd}>
    <DragHandle><Icon icon={faGripVertical} size={11} /></DragHandle>
    <MethodBadge $method={req.method}>{req.method}</MethodBadge>
    {editing
      ? <InlineRename autoFocus defaultValue={req.name || ''}
          onBlur={e => { if (e.target.value.trim()) onCommitRename(e.target.value.trim()); else onCancelRename(); }}
          onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) onCommitRename((e.target as HTMLInputElement).value.trim()); if (e.key === 'Escape') onCancelRename(); }}
          onClick={e => e.stopPropagation()} />
      : <SubName title={req.name || req.url || 'Untitled'}
          onDoubleClick={e => { e.stopPropagation(); onRename(); }}>
          {req.name || req.url || 'Untitled'}
        </SubName>
    }
    <CopyBtn title="Copy request" onClick={e => { e.stopPropagation(); onCopy(); }}><Icon icon={faCopy} size={12} /></CopyBtn>
    <RenameReqBtn title="Rename" onClick={e => { e.stopPropagation(); onRename(); }}><Icon icon={faPen} size={12} /></RenameReqBtn>
    <IconButton title="Delete" onClick={e => { e.stopPropagation(); onDelete(); }}><Icon icon={faTrash} size={12} /></IconButton>
  </SubItem>
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
    if (d.fromCollectionId === collectionId) {
      onMoveRequestToGroup(d.requestId, d.fromGroupId, group.id);
    } else {
      onMoveRequestToGroup(d.requestId, d.fromGroupId, group.id, d.fromCollectionId);
    }
    dragRef.current = null;
  };

  return (
    <GroupTreeWrapper $isDragOver={isDragOver} style={{ marginLeft: indent }}
      onDragOver={handleGroupDragOver}
      onDragLeave={handleGroupDragLeave}
      onDrop={handleGroupDrop}>
      <GroupHeader tabIndex={0} data-testid="group-header"
        onClick={() => onToggle(group.id, !isOpen)}
        onKeyDown={e => { if (e.key === 'Enter') onToggle(group.id, !isOpen); }}>
        <Caret $open={isOpen}><Icon icon={faChevronRight} size={10} /></Caret>
        <GroupFolderIcon><Icon icon={isOpen ? faFolderOpen : faFolder} size={12} /></GroupFolderIcon>
        {renamingGroup
          ? <InlineRename autoFocus value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onBlur={() => { if (renameVal.trim()) onRenameGroup(group.id, renameVal.trim()); setRenamingGroup(false); }}
              onKeyDown={e => { if (e.key === 'Enter' && renameVal.trim()) { onRenameGroup(group.id, renameVal.trim()); setRenamingGroup(false); } if (e.key === 'Escape') setRenamingGroup(false); }}
              onClick={e => e.stopPropagation()} />
          : <GroupName title={group.name}
              onDoubleClick={e => { e.stopPropagation(); setRenamingGroup(true); setRenameVal(group.name); }}>
              {group.name}
            </GroupName>
        }
        <CollectionCount>{reqs.length}</CollectionCount>
        <AddGroupBtn title="New sub-folder"
          onClick={e => { e.stopPropagation(); setShowNewSubGroup(true); onToggle(group.id, true); }}>
          <Icon icon={faFolderPlus} size={11} />
        </AddGroupBtn>
        <RenameColBtn title="Rename folder"
          onClick={e => { e.stopPropagation(); setRenamingGroup(true); setRenameVal(group.name); }}>
          <Icon icon={faPen} size={11} />
        </RenameColBtn>
        <IconButton title="Delete folder"
          onClick={e => { e.stopPropagation(); onDeleteGroup(group.id, group.name); }}>
          <Icon icon={faTrash} size={11} />
        </IconButton>
      </GroupHeader>
      {isOpen && (
        <GroupBody>
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
          {showNewSubGroup && (
            <NewGroupInline>
              <InlineRename autoFocus placeholder="Folder name"
                value={newSubGroupName} onChange={e => setNewSubGroupName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateSubGroup(); if (e.key === 'Escape') { setShowNewSubGroup(false); setNewSubGroupName(''); } }}
                onBlur={() => { if (newSubGroupName.trim()) handleCreateSubGroup(); else { setShowNewSubGroup(false); setNewSubGroupName(''); } }} />
            </NewGroupInline>
          )}
          {reqs.filter(matchesSearch).map(req => (
            <RequestRow key={req.id} req={req} collectionName={collectionName}
              editing={editingRequest?.groupId === group.id && editingRequest?.requestId === req.id}
              onLoad={() => onLoad(req)}
              onDelete={() => onDeleteRequest(group.id, req.id!)}
              onCopy={() => onCopyRequest(req.id!)}
              onRename={() => onStartRenameRequest(group.id, req.id!)}
              onCommitRename={name => onCommitRenameRequest(group.id, req.id!, name)}
              onCancelRename={onCancelRenameRequest}
              onDragStart={e => { dragRef.current = { requestId: req.id!, fromCollectionId: collectionId, fromGroupId: group.id }; e.dataTransfer.effectAllowed = 'move'; (e.currentTarget as HTMLElement).setAttribute('data-dragging', ''); }}
              onDragEnd={e => { (e.currentTarget as HTMLElement).removeAttribute('data-dragging'); }} />
          ))}
          {reqs.length === 0 && subGroups.length === 0 && !showNewSubGroup && (
            <SubEmpty>Empty folder</SubEmpty>
          )}
        </GroupBody>
      )}
    </GroupTreeWrapper>
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
  const [editingRequest, setEditingRequest] = useState<{ collectionId: string; requestId: string } | null>(null);
  const [editingGroupRequest, setEditingGroupRequest] = useState<{ groupId: string; requestId: string } | null>(null);
  const [showNewGroupFor, setShowNewGroupFor] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const dragRef = useRef<DragState | null>(null);
  const [topLevelDropTarget, setTopLevelDropTarget] = useState<string | null>(null);

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
    <Toolbar>
      <SearchWrapper>
        <SearchIconWrapper>
          <Icon icon={faMagnifyingGlass} size={13} />
        </SearchIconWrapper>
        <SearchInput type="text" placeholder="Filter..." value={search} onChange={e => onSearch(e.target.value)} />
      </SearchWrapper>
      <ToolbarIcons>
        <ToolbarExpand title={allOpen ? 'Collapse all' : 'Expand all'} onClick={toggleAll}><Icon icon={allOpen ? faAnglesUp : faAnglesDown} size={13} /></ToolbarExpand>
        <ToolbarExpand title="Export all collections" onClick={onExportAllCollections}><Icon icon={faFileExport} size={13} /></ToolbarExpand>
      </ToolbarIcons>
    </Toolbar>
    <List onKeyDown={listNavKeyDown}>
      {filtered.length === 0
        ? <Empty><EmptyIcon><Icon icon={faFolder} size={28} style={{ opacity: 0.4 }} /></EmptyIcon><div>No collections</div><EmptySub>Save requests to organize them</EmptySub></Empty>
        : filtered.map(col => {
            const topReqs = col.requests || [];
            const groups = col.groups || [];
            const isOpen = !!expansionStates[col.id];
            const countRequests = (grps: CollectionGroup[]): number => grps.reduce((s, g) => s + (g.requests?.length || 0) + countRequests(g.groups || []), 0);
            const totalCount = topReqs.length + countRequests(groups);
            const filteredTopReqs = search ? topReqs.filter(r => (r.name||r.url||'').toLowerCase().includes(search.toLowerCase())) : topReqs;

            return (
              <CollectionGroup key={col.id} $isDragOver={topLevelDropTarget === col.id}>
                <CollectionHeader tabIndex={0} data-testid="collection-header"
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
                    onMoveRequestToGroup(col.id, d.requestId, d.fromGroupId, null, d.fromCollectionId);
                    dragRef.current = null;
                  }}>
                  <Caret $open={isOpen}><Icon icon={faChevronRight} size={10} /></Caret>
                  {editingCollection?.id === col.id
                    ? <InlineRename autoFocus value={editingCollection.name}
                        onChange={e => setEditingCollection({ ...editingCollection, name: e.target.value })}
                        onBlur={() => { if (editingCollection.name.trim()) onRenameCollection(col.id, editingCollection.name.trim()); setEditingCollection(null); }}
                        onKeyDown={e => { if (e.key === 'Enter') { if (editingCollection.name.trim()) onRenameCollection(col.id, editingCollection.name.trim()); setEditingCollection(null); } if (e.key === 'Escape') setEditingCollection(null); }}
                        onClick={e => e.stopPropagation()} />
                    : <CollectionName title={col.name}
                        onDoubleClick={e => { e.stopPropagation(); setEditingCollection({ id: col.id, name: col.name }); }}>
                        {col.name}
                      </CollectionName>
                  }
                  <CollectionCount>{totalCount}</CollectionCount>
                  <AddGroupBtn title="New folder"
                    onClick={e => { e.stopPropagation(); setShowNewGroupFor(col.id); setNewGroupName(''); onToggle(col.id, true); }}>
                    <Icon icon={faFolderPlus} size={12} />
                  </AddGroupBtn>
                  <RenameColBtn title="Rename" onClick={e => { e.stopPropagation(); setEditingCollection({ id: col.id, name: col.name }); }}><Icon icon={faPen} size={12} /></RenameColBtn>
                  <IconButton title="Export collection" onClick={e => { e.stopPropagation(); onExportCollection(col.id); }}><Icon icon={faFileExport} size={12} /></IconButton>
                  <IconButton title="Delete" onClick={e => { e.stopPropagation(); onDeleteCollection(col.id); }}><Icon icon={faTrash} size={12} /></IconButton>
                </CollectionHeader>
                <CollectionRequests $open={isOpen} $isDragOver={topLevelDropTarget === col.id}
                  onDragOver={e => {
                    const d = dragRef.current;
                    if (!d) return;
                    if (d.fromCollectionId === col.id && d.fromGroupId === null) return;
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
                    if (d.fromCollectionId === col.id && d.fromGroupId === null) return;
                    e.preventDefault();
                    if (d.fromCollectionId === col.id) {
                      onMoveRequestToGroup(col.id, d.requestId, d.fromGroupId, null);
                    } else {
                      onMoveRequestToGroup(col.id, d.requestId, d.fromGroupId, null, d.fromCollectionId);
                    }
                    dragRef.current = null;
                  }}>
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
                        vscodeApi?.postMessage?.({ command: 'renameGroupRequest', collectionId: col.id, groupId: gid, requestId: rid, name });
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
                  {showNewGroupFor === col.id && (
                    <NewGroupInline style={{ paddingLeft: 12 }}>
                      <Icon icon={faFolder} size={11} style={{ color: 'var(--muted)', marginRight: 4 }} />
                      <InlineRename autoFocus placeholder="Folder name"
                        value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateGroup(col.id); if (e.key === 'Escape') { setShowNewGroupFor(null); setNewGroupName(''); } }}
                        onBlur={() => { if (newGroupName.trim()) handleCreateGroup(col.id); else { setShowNewGroupFor(null); setNewGroupName(''); } }} />
                    </NewGroupInline>
                  )}
                  {filteredTopReqs.map((req) => (
                    <SubItem key={req.id} tabIndex={0} draggable data-testid="collection-request"
                      onClick={() => onLoad(req, col.name)}
                      onKeyDown={e => { if (e.key === 'Enter') onLoad(req, col.name); }}
                      onDragStart={e => { dragRef.current = { requestId: req.id!, fromCollectionId: col.id, fromGroupId: null }; e.dataTransfer.effectAllowed = 'move'; (e.currentTarget as HTMLElement).setAttribute('data-dragging', ''); }}
                      onDragEnd={e => { (e.currentTarget as HTMLElement).removeAttribute('data-dragging'); }}>
                      <DragHandle><Icon icon={faGripVertical} size={11} /></DragHandle>
                      <MethodBadge $method={req.method}>{req.method}</MethodBadge>
                      {editingRequest?.collectionId === col.id && editingRequest.requestId === req.id
                        ? <InlineRename autoFocus defaultValue={req.name || ''}
                            onBlur={e => { if (e.target.value.trim()) onRenameRequest(col.id, req.id!, e.target.value.trim()); setEditingRequest(null); }}
                            onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) { onRenameRequest(col.id, req.id!, (e.target as HTMLInputElement).value.trim()); setEditingRequest(null); } if (e.key === 'Escape') setEditingRequest(null); }}
                            onClick={e => e.stopPropagation()} />
                        : <SubName title={req.name || req.url || 'Untitled'}
                            onDoubleClick={e => { e.stopPropagation(); setEditingRequest({ collectionId: col.id, requestId: req.id! }); }}>
                            {req.name || req.url || 'Untitled'}
                          </SubName>
                      }
                      <CopyBtn title="Copy request" onClick={e => { e.stopPropagation(); onCopyRequest(col.id, req.id!); }}><Icon icon={faCopy} size={12} /></CopyBtn>
                      <RenameReqBtn title="Rename" onClick={e => { e.stopPropagation(); setEditingRequest({ collectionId: col.id, requestId: req.id! }); }}><Icon icon={faPen} size={12} /></RenameReqBtn>
                      <IconButton title="Delete" onClick={e => { e.stopPropagation(); onDeleteRequest(col.id, req.id!); }}><Icon icon={faTrash} size={12} /></IconButton>
                    </SubItem>
                  ))}
                  {topReqs.length === 0 && groups.length === 0 && !showNewGroupFor && (
                    <SubEmpty>No requests saved</SubEmpty>
                  )}
                </CollectionRequests>
              </CollectionGroup>
            );
          })}
    </List>
    {showNew && (
      <ModalOverlay $open onClick={() => setShowNew(false)}>
        <ModalBox onClick={e => e.stopPropagation()}>
          <h3>New Collection</h3>
          <ModalLabel>Name</ModalLabel>
          <ModalInput placeholder="My Collection" value={newName} autoFocus
            onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreate()} />
          <ModalActions>
            <GhostButton onClick={() => setShowNew(false)}>Cancel</GhostButton>
            <PrimaryButton onClick={handleCreate}>Create</PrimaryButton>
          </ModalActions>
        </ModalBox>
      </ModalOverlay>
    )}
  </>);
};
