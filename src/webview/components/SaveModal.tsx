import React, { useState, useEffect } from 'react';
import { Collection, CollectionGroup } from '../types';

interface SaveModalProps {
  open: boolean;
  requestName: string;
  collections: Collection[];
  onSave: (requestName: string, collectionName: string, groupId?: string) => void;
  onClose: () => void;
}

/** Flatten nested groups into a list with indented label for display. */
function flattenGroups(groups: CollectionGroup[], prefix = ''): Array<{ id: string; label: string }> {
  const result: Array<{ id: string; label: string }> = [];
  for (const g of groups) {
    result.push({ id: g.id, label: `${prefix}${g.name}` });
    if (g.groups?.length) {
      result.push(...flattenGroups(g.groups, `${prefix}\u00a0\u00a0`));
    }
  }
  return result;
}

export const SaveModal: React.FC<SaveModalProps> = ({
  open,
  requestName,
  collections,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState(requestName);
  const [selectedCollection, setSelectedCollection] = useState('__new__');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('__none__');

  /* sync name when prop changes */
  useEffect(() => { setName(requestName); }, [requestName]);

  /* reset group when collection changes */
  useEffect(() => { setSelectedGroup('__none__'); }, [selectedCollection]);

  if (!open) return null;

  const activeColl = collections.find((c) => c.name === selectedCollection);
  const availableGroups = activeColl ? flattenGroups(activeColl.groups || []) : [];

  const handleSave = () => {
    const collectionName =
      selectedCollection === '__new__' ? newCollectionName.trim() : selectedCollection;
    if (!collectionName) return;
    const groupId = selectedGroup !== '__none__' ? selectedGroup : undefined;
    onSave(name.trim() || 'Untitled Request', collectionName, groupId);
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Save to Collection</h3>

        <label className="modal-label">Request Name</label>
        <input
          className="modal-input"
          placeholder="My Request"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label className="modal-label">Collection</label>
        <select
          className="modal-input"
          value={selectedCollection}
          onChange={(e) => setSelectedCollection(e.target.value)}
        >
          <option value="__new__">+ New Collection</option>
          {collections.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>

        {selectedCollection === '__new__' && (
          <>
            <label className="modal-label">New Collection Name</label>
            <input
              className="modal-input"
              placeholder="My Collection"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
            />
          </>
        )}

        {availableGroups.length > 0 && (
          <>
            <label className="modal-label">Folder (optional)</label>
            <select
              className="modal-input"
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
            >
              <option value="__none__">— Root (no folder) —</option>
              {availableGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </>
        )}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

