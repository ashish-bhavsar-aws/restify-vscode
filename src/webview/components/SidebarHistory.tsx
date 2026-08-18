import React, { useState } from 'react';
import { Icon } from './FaIcon';
import {
  faMagnifyingGlass, faFloppyDisk, faTrash,
  faPaperPlane, faStar,
} from '@fortawesome/free-solid-svg-icons';
import { Collection, CollectionGroup, HistoryEntry, listNavKeyDown, relativeTime, METHOD_SHORT } from './sidebarTypes';
import {
  Empty,
  EmptyIcon,
  EmptySub,
  GhostButton,
  IconButton,
  Item,
  ItemActions,
  ItemContent,
  ItemMeta,
  ItemName,
  ItemRight,
  List,
  MethodBadge,
  ModalActions,
  ModalBox,
  ModalInput,
  ModalLabel,
  ModalOverlay,
  ModalSelect,
  PinBtn,
  PrimaryButton,
  SaveHistoryBtn,
  SearchIconWrapper,
  SearchInput,
  SearchWrapper,
  StatusDot,
  StatusRow,
  StatusText,
  Time,
  Toolbar,
} from './sidebarStyles';

interface HistoryPanelProps {
  history: HistoryEntry[]; search: string; collections: Collection[];
  onSearch(q: string): void; onLoad(id: string): void;
  onDelete(id: string): void; onClear(): void;
  onTogglePin(id: string): void;
  onSaveToCollection(id: string, collectionName: string, groupId?: string): void;
  onNewRequest(): void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({ history, search, collections, onSearch, onLoad, onDelete, onClear, onTogglePin, onSaveToCollection, onNewRequest: _onNewRequest }) => {
  const [saveTarget, setSaveTarget] = useState<HistoryEntry | null>(null);
  const [selectedCol, setSelectedCol] = useState('');
  const [newColName, setNewColName] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('__none__');
  const filtered = history
    .filter(h =>
      !search || (h.name||'').toLowerCase().includes(search.toLowerCase()) || (h.url||'').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));

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
              <Icon icon={faPaperPlane} size={28} style={{ opacity: 0.4 }} />
            </EmptyIcon>
            <div>No requests yet</div>
            <EmptySub>Execute a request to see it here</EmptySub>
          </Empty>
        : filtered.map(entry => {
            const sc = !entry.status || entry.status === 0 ? 'err' : entry.status < 300 ? 'ok' : entry.status < 400 ? 'warn' : 'err';
            return (
              <Item key={entry.id} data-testid="history-item" tabIndex={0} onClick={() => onLoad(entry.id)} onKeyDown={(e) => { if (e.key === 'Enter') onLoad(entry.id); }}>
                <MethodBadge $method={entry.method}>{METHOD_SHORT[entry.method] || entry.method}</MethodBadge>
                <ItemContent>
                  <ItemName title={entry.name || entry.url}>{entry.name || entry.url}</ItemName>
                  <ItemMeta>{relativeTime(entry.timestamp)}{entry.url !== entry.name && entry.url ? ` · ${entry.url}` : ''}</ItemMeta>
                </ItemContent>
                <ItemRight>
                  <StatusRow><StatusDot $status={sc} /><StatusText>{entry.status||'err'}</StatusText></StatusRow>
                  {entry.duration != null && <Time>{entry.duration}ms</Time>}
                </ItemRight>
                <ItemActions>
                  <PinBtn data-testid="history-pin" $active={!!entry.pinned} title={entry.pinned ? 'Unpin from history' : 'Pin to top of history'} onClick={e => { e.stopPropagation(); onTogglePin(entry.id); }}><Icon icon={faStar} size={12} /></PinBtn>
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
