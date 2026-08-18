import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './FaIcon';
import {
  faMagnifyingGlass, faTrash, faPen,
  faFileExport, faFileImport, faCopy, faGripVertical,
  faFolder, faFolderOpen, faAnglesDown, faAnglesUp, faChevronRight, faFolderPlus,
  faPlay, faListUl, faCode,
} from '@fortawesome/free-solid-svg-icons';
import {
  Collection, CollectionGroup, CollectionRequest, CollectionVar, DragState,
  listNavKeyDown, METHOD_SHORT, vscodeApi,
} from './sidebarTypes';
import {
  AddGroupBtn,
  Caret,
  CollectionCount,
  CollectionGroup as CollectionGroupStyle,
  CollectionHeader,
  CollectionName,
  CollectionRequests,
  CopyBtn,
  DragHandle,
  Empty,
  EmptyIcon,
  EmptySub,
  GhostButton,
  GroupBody,
  GroupFolderIcon,
  GroupHeader,
  GroupName,
  GroupTreeWrapper,
  IconButton,
  InlineRename,
  List,
  MethodBadge,
  ModalActions,
  ModalBox,
  ModalInput,
  ModalLabel,
  ModalOverlay,
  NewGroupInline,
  PrimaryButton,
  RenameColBtn,
  RenameReqBtn,
  RunBtn,
  SearchIconWrapper,
  SearchInput,
  SearchWrapper,
  SubEmpty,
  SubItem,
  SubName,
  Toolbar,
  ToolbarExpand,
  ToolbarIcons,
} from './sidebarStyles';
import { CollectionScriptsModal, CollectionVarsModal } from './SidebarRunner';

/* ─── Recursive request row ──────────────────────────────── */

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
    <MethodBadge $method={req.method}>{METHOD_SHORT[req.method] || req.method}</MethodBadge>
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

/* ─── Recursive group tree ───────────────────────────────── */

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
  onRunGroup(groupId: string): void;
}

const GroupTree: React.FC<GroupTreeProps> = ({
  group, collectionId, collectionName, depth, search, expansionStates,
  editingRequest, dragRef, onToggle, onLoad, onDeleteRequest, onCopyRequest,
  onStartRenameRequest, onCommitRenameRequest, onCancelRenameRequest,
  onSaveGroup, onDeleteGroup, onRenameGroup, onMoveRequestToGroup, onRunGroup
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
        <RunBtn title="Run folder" data-testid="run-group-btn"
          onClick={e => { e.stopPropagation(); onRunGroup(group.id); }}>
          <Icon icon={faPlay} size={10} />
        </RunBtn>
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
              onMoveRequestToGroup={onMoveRequestToGroup}
              onRunGroup={onRunGroup} />
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

/* ─── Collections panel ──────────────────────────────────── */

interface CollectionsPanelProps {
  collections: Collection[]; search: string; expansionStates: Record<string,boolean>;
  onSearch(q: string): void; onToggle(id: string, open: boolean): void; onLoad(req: CollectionRequest, collectionName: string, collectionId?: string): void;
  onNewCollection(name: string): void; onDeleteCollection(id: string): void; onDeleteRequest(cid: string, rid: string): void;
  onCopyRequest(collectionId: string, requestId: string): void;
  onMoveRequest(requestId: string, fromCollectionId: string, toCollectionId: string): void;
  onReorderRequest(collectionId: string, requestId: string, toIndex: number): void;
  onRenameCollection(id: string, name: string): void;
  onRenameRequest(collectionId: string, requestId: string, name: string): void;
  onExportAllCollections(): void;
  onExportCollection(collectionId: string): void;
  onImport(): void;
  onSaveGroup(collectionId: string, group: CollectionGroup, parentGroupId?: string): void;
  onDeleteGroup(collectionId: string, groupId: string, groupName: string): void;
  onRenameGroup(collectionId: string, groupId: string, name: string): void;
  onDeleteGroupRequest(collectionId: string, groupId: string, requestId: string): void;
  onMoveRequestToGroup(collectionId: string, requestId: string, fromGroupId: string | null, toGroupId: string | null, fromCollectionId?: string): void;
  onRunCollection(collectionId: string): void;
  onRunGroup(collectionId: string, groupId: string): void;
  onSaveCollectionVariables(collectionId: string, variables: CollectionVar[]): void;
  onSaveCollectionScripts(collectionId: string, preScript: string, testScript: string): void;
  triggerNew?: boolean;
  onTriggerNewDone?(): void;
}

export const CollectionsPanel: React.FC<CollectionsPanelProps> = ({
  collections, search, expansionStates, onSearch, onToggle, onLoad, onNewCollection, onDeleteCollection, onDeleteRequest,
  onCopyRequest, onMoveRequest: _onMoveRequest, onReorderRequest: _onReorderRequest,   onRenameCollection, onRenameRequest,
  onExportAllCollections, onExportCollection, onImport,
  onSaveGroup, onDeleteGroup, onRenameGroup, onDeleteGroupRequest, onMoveRequestToGroup,
  onRunCollection, onRunGroup, onSaveCollectionVariables, onSaveCollectionScripts, triggerNew, onTriggerNewDone
}) => {
  const [showNew, setShowNew] = useState(false);
  useEffect(() => { if (triggerNew) { setShowNew(true); onTriggerNewDone?.(); } }, [triggerNew, onTriggerNewDone]);
  const [newName, setNewName] = useState('');
  const [editingCollection, setEditingCollection] = useState<{ id: string; name: string } | null>(null);
  const [editingRequest, setEditingRequest] = useState<{ collectionId: string; requestId: string } | null>(null);
  const [editingGroupRequest, setEditingGroupRequest] = useState<{ groupId: string; requestId: string } | null>(null);
  const [showNewGroupFor, setShowNewGroupFor] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingVarsFor, setEditingVarsFor] = useState<{ id: string; name: string; variables: CollectionVar[] } | null>(null);
  const [editingScriptsFor, setEditingScriptsFor] = useState<{ id: string; name: string; preScript: string; testScript: string } | null>(null);
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
        <ToolbarExpand title="Import collection" onClick={onImport}><Icon icon={faFileImport} size={13} /></ToolbarExpand>
        <ToolbarExpand title="Export all collections" onClick={onExportAllCollections}><Icon icon={faFileExport} size={13} /></ToolbarExpand>
      </ToolbarIcons>
    </Toolbar>
    <List onKeyDown={listNavKeyDown}>
      {filtered.length === 0
        ? <Empty>
            <EmptyIcon><Icon icon={faFolder} size={28} style={{ opacity: 0.4 }} /></EmptyIcon>
            <div>No collections</div>
            <EmptySub>Save requests to organize them</EmptySub>
          </Empty>
        : filtered.map(col => {
            const topReqs = col.requests || [];
            const groups = col.groups || [];
            const isOpen = !!expansionStates[col.id];
            const countRequests = (grps: CollectionGroup[]): number => grps.reduce((s, g) => s + (g.requests?.length || 0) + countRequests(g.groups || []), 0);
            const totalCount = topReqs.length + countRequests(groups);
            const filteredTopReqs = search ? topReqs.filter(r => (r.name||r.url||'').toLowerCase().includes(search.toLowerCase())) : topReqs;

            return (
              <CollectionGroupStyle key={col.id} $isDragOver={topLevelDropTarget === col.id}>
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
                  <RunBtn title="Run collection" data-testid="run-collection-btn"
                    onClick={e => { e.stopPropagation(); onRunCollection(col.id); }}>
                    <Icon icon={faPlay} size={11} />
                  </RunBtn>
                  <AddGroupBtn title="New folder"
                    onClick={e => { e.stopPropagation(); setShowNewGroupFor(col.id); setNewGroupName(''); onToggle(col.id, true); }}>
                    <Icon icon={faFolderPlus} size={12} />
                  </AddGroupBtn>
                  <RenameColBtn title="Rename" onClick={e => { e.stopPropagation(); setEditingCollection({ id: col.id, name: col.name }); }}><Icon icon={faPen} size={12} /></RenameColBtn>
                  <IconButton title="Variables" data-testid="collection-vars-btn"
                    onClick={e => { e.stopPropagation(); setEditingVarsFor({ id: col.id, name: col.name, variables: (col.variables || []).map(v => ({ key: v.key, value: v.value })) }); }}>
                    <Icon icon={faListUl} size={12} />
                  </IconButton>
                  <IconButton title="Scripts" data-testid="collection-scripts-btn"
                    onClick={e => { e.stopPropagation(); setEditingScriptsFor({ id: col.id, name: col.name, preScript: col.preScript || '', testScript: col.testScript || '' }); }}>
                    <Icon icon={faCode} size={12} />
                  </IconButton>
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
                      onLoad={req => onLoad(req, col.name, col.id)}
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
                      onRunGroup={gid => onRunGroup(col.id, gid)}
                    />
                  ))}
                  {showNewGroupFor === col.id && (
                    <NewGroupInline style={{ paddingLeft: 12 }}>
                      <Icon icon={faFolder} size={11} style={{ color: 'var(--muted)' }} />
                      <InlineRename autoFocus placeholder="Folder name"
                        value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateGroup(col.id); if (e.key === 'Escape') { setShowNewGroupFor(null); setNewGroupName(''); } }}
                        onBlur={() => { if (newGroupName.trim()) handleCreateGroup(col.id); else { setShowNewGroupFor(null); setNewGroupName(''); } }} />
                    </NewGroupInline>
                  )}
                  {filteredTopReqs.map((req) => (
                    <SubItem key={req.id} tabIndex={0} draggable data-testid="collection-request"
                      onClick={() => onLoad(req, col.name, col.id)}
                      onKeyDown={e => { if (e.key === 'Enter') onLoad(req, col.name, col.id); }}
                      onDragStart={e => { dragRef.current = { requestId: req.id!, fromCollectionId: col.id, fromGroupId: null }; e.dataTransfer.effectAllowed = 'move'; (e.currentTarget as HTMLElement).setAttribute('data-dragging', ''); }}
                      onDragEnd={e => { (e.currentTarget as HTMLElement).removeAttribute('data-dragging'); }}>
                      <DragHandle><Icon icon={faGripVertical} size={11} /></DragHandle>
                      <MethodBadge $method={req.method}>{METHOD_SHORT[req.method] || req.method}</MethodBadge>
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
              </CollectionGroupStyle>
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
    {editingVarsFor && (
      <CollectionVarsModal
        title={editingVarsFor.name}
        variables={editingVarsFor.variables}
        onChange={(variables) => setEditingVarsFor({ ...editingVarsFor, variables })}
        onCancel={() => setEditingVarsFor(null)}
        onSave={(variables) => {
          onSaveCollectionVariables(editingVarsFor.id, variables);
          setEditingVarsFor(null);
        }}
      />
    )}
    {editingScriptsFor && (
      <CollectionScriptsModal
        title={editingScriptsFor.name}
        preScript={editingScriptsFor.preScript}
        testScript={editingScriptsFor.testScript}
        onChange={(preScript, testScript) => setEditingScriptsFor({ ...editingScriptsFor, preScript, testScript })}
        onCancel={() => setEditingScriptsFor(null)}
        onSave={(preScript, testScript) => {
          onSaveCollectionScripts(editingScriptsFor.id, preScript, testScript);
          setEditingScriptsFor(null);
        }}
      />
    )}
  </>);
};
