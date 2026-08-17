import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Collection, HistoryEntry, RunEntry, RunState, SidebarType, vscodeApi,
} from './components/sidebarTypes';
import { Container } from './components/sidebarStyles';
import { HistoryPanel } from './components/SidebarHistory';
import { CollectionsPanel } from './components/SidebarCollections';
import { RunnerResultsModal } from './components/SidebarRunner';
import { OpenApiPanel } from './components/SidebarOpenApi';

export const Sidebar: React.FC = () => {
  const [sidebarType, setSidebarType] = useState<SidebarType>('history');
  const [history, setHistory]           = useState<HistoryEntry[]>([]);
  const [collections, setCollections]   = useState<Collection[]>([]);
  const [expansionStates, setExpansionStates] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [triggerNewCollection, setTriggerNewCollection] = useState(false);
  const [runState, setRunState] = useState<RunState | null>(null);
  const pendingToggleRef = useRef<{ id: string; state: boolean } | null>(null);

  useEffect(() => {
    const root = document.getElementById('root');
    setSidebarType((root?.getAttribute('data-type') || 'history') as SidebarType);
    const handler = (event: MessageEvent) => {
      const d = event.data;
      if (d.command === 'openNewCollectionModal') { setTriggerNewCollection(true); }
      if (d.command === 'searchCollections') {
        setSidebarType('collections');
        setSearch(d.query || '');
      }
      if (d.command === 'setData') {
        if (d.data.history)      setHistory(d.data.history);
        if (d.data.collections)  setCollections(d.data.collections);
        if (typeof d.data.search === 'string') setSearch(d.data.search);
        if (d.data.expansionStates && !pendingToggleRef.current) {
          setExpansionStates(d.data.expansionStates);
        }
        if (pendingToggleRef.current) {
          pendingToggleRef.current = null;
        }
      }
      if (d.command === 'collectionRunStarted') {
        setRunState({
          running: true,
          total: d.total ?? 0,
          collectionId: d.collectionId,
          groupId: d.groupId,
          entries: [],
        });
      }
      if (d.command === 'collectionRunProgress') {
        setRunState((prev) => {
          if (!prev) return prev;
          const entries = [...prev.entries];
          const idx = entries.findIndex((e) => e.requestId === d.entry?.requestId);
          if (idx >= 0) entries[idx] = d.entry;
          else entries.push(d.entry);
          return { ...prev, entries };
        });
      }
      if (d.command === 'collectionRunComplete') {
        setRunState((prev) => ({
          running: false,
          total: prev?.total ?? d.results?.length ?? 0,
          collectionId: d.collectionId,
          groupId: d.groupId,
          entries: (d.results ?? prev?.entries ?? []) as RunEntry[],
          cancelled: !!d.cancelled,
          error: d.error,
        }));
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
          onTogglePin={(id) => post({ command: 'toggleHistoryPin', id })}
          onSaveToCollection={(id, collectionName, groupId) => post({ command: 'saveHistoryToCollection', id, collectionName, groupId })}
          onNewRequest={() => post({ command: 'newRequest' })} />
      )}
      {sidebarType === 'collections' && (
        <CollectionsPanel collections={collections} search={search}
          expansionStates={expansionStates} onSearch={setSearch}
          onToggle={handleToggleCollection}
          onLoad={(req, collectionName, collectionId) => post({ command: 'loadRequest', data: { ...req, _collectionId: collectionId }, collectionName })}
          onNewCollection={(name) => post({ command: 'saveCollection', data: { name, requests: [] } })}
          onDeleteCollection={(id) => post({ command: 'deleteCollection', id })}
          onDeleteRequest={(cid, rid) => post({ command: 'deleteCollectionRequest', collectionId: cid, requestId: rid })}
          onCopyRequest={(cid, rid) => post({ command: 'copyCollectionRequest', collectionId: cid, requestId: rid })}
          onMoveRequest={(rid, fromCid, toCid) => post({ command: 'moveCollectionRequest', requestId: rid, fromCollectionId: fromCid, toCollectionId: toCid })}
          onReorderRequest={(cid, rid, toIndex) => post({ command: 'reorderCollectionRequest', collectionId: cid, requestId: rid, toIndex })}
          onRenameCollection={(id, name) => post({ command: 'renameCollection', id, name })}
          onRenameRequest={(cid, rid, name) => post({ command: 'renameCollectionRequest', collectionId: cid, requestId: rid, name })}
          onImport={() => post({ command: 'importCollections' })}
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
          onTriggerNewDone={() => setTriggerNewCollection(false)}
          onRunCollection={(id) => { post({ command: 'runCollection', collectionId: id }); setRunState(null); }}
          onRunGroup={(id, gid) => { post({ command: 'runCollection', collectionId: id, groupId: gid }); setRunState(null); }}
          onSaveCollectionVariables={(id, variables) => {
            const col = collections.find((c) => c.id === id);
            if (col) post({ command: 'saveCollection', data: { ...col, variables: variables.filter(v => v.key.trim()) } });
          }}
          onSaveCollectionScripts={(id, preScript, testScript) => {
            const col = collections.find((c) => c.id === id);
            if (col) post({ command: 'saveCollection', data: { ...col, preScript, testScript } });
          }} />
      )}
      {sidebarType === 'openapi' && (
        <OpenApiPanel />
      )}
      <RunnerResultsModal runState={runState}
        onCancel={() => post({ command: 'cancelCollectionRun' })}
        onClose={() => setRunState(null)} />
    </Container>
  );
};
